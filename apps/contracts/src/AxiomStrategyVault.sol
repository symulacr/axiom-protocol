// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import {IAxiomAgentNFT} from "./interfaces/IAxiomAgentNFT.sol";

/// @title AxiomStrategyVault
/// @notice Per-token vault that holds agent-controlled funds and executes Merkle-verified strategies
/// @dev Only the owner of the underlying AxiomAgentNFT token can setStrategy/withdraw
///      The agent itself executes the actions via `execute()`, which verifies each action
///      against the current strategy root and enforces a daily value limit
/// @dev Standalone, non-upgradeable (holds user funds)
contract AxiomStrategyVault is Ownable, Pausable, ReentrancyGuard {
    error NotTokenOwner();
    error InvalidMerkleProof();
    error DailyLimitExceeded();
    error NoStrategySet();
    error ZeroAmount();
    error ZeroAddress();
    error TokenNotInRegistry();
    error UseDeposit();
    error StrategyExpired();
    error LimitOverflow();
    error TransferFailed();
    error CallFailed();
    error ActionAlreadyUsed();

    event Deposited(uint256 indexed tokenId, address indexed from, address indexed asset, uint256 amount);
    event Withdrawn(uint256 indexed tokenId, address indexed to, address indexed asset, uint256 amount);
    event StrategySet(uint256 indexed tokenId, bytes32 strategyRoot, uint256 dailyLimit, uint64 validUntilDay);
    event Executed(
        uint256 indexed tokenId, bytes32 indexed actionHash, address indexed target, uint256 value, bytes result
    );

    struct Vault {
        uint256 balance; // native (OG) balance
        bytes32 strategyRoot; // Merkle root of approved action hashes
        uint128 dailyLimit; // max value executable per UTC day
        uint128 dailySpent; // running spend in current day
        uint64 resetDay; // day number of last reset
        uint64 validUntilDay; // last UTC day (inclusive) strategy remains valid; 0 = no expiry
    }

    mapping(uint256 => Vault) public vaults;

    /// @notice One-shot action leaves: same actionHash cannot be re-executed for a tokenId
    mapping(uint256 => mapping(bytes32 => bool)) public usedActions;

    /// @notice Sum of all per-token tracked balances (for excess-native recovery)
    uint256 public totalTrackedBalance;

    /// @notice The AxiomAgentNFT contract whose tokens are vaults (immutable at deploy)
    IAxiomAgentNFT public immutable nft;

    modifier onlyTokenOwner(
        uint256 tokenId
    ) {
        if (nft.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        _;
    }

    constructor(
        address nftAddr,
        address initialOwner
    ) Ownable(initialOwner) {
        if (nftAddr == address(0)) revert ZeroAddress();
        nft = IAxiomAgentNFT(nftAddr);
    }

    /// @notice Reject direct native transfers; funds must enter via `deposit()`
    receive() external payable {
        revert UseDeposit();
    }

    function deposit(
        uint256 tokenId
    ) external payable whenNotPaused onlyTokenOwner(tokenId) {
        if (msg.value == 0) revert ZeroAmount();
        vaults[tokenId].balance += msg.value;
        totalTrackedBalance += msg.value;
        emit Deposited(tokenId, msg.sender, address(0), msg.value);
    }

    function withdraw(
        uint256 tokenId,
        uint256 amount
    ) external nonReentrant onlyTokenOwner(tokenId) {
        if (amount == 0) revert ZeroAmount();
        Vault storage v = vaults[tokenId];
        if (v.balance < amount) revert ZeroAmount();
        // CEI: state update first, then external call
        v.balance -= amount;
        totalTrackedBalance -= amount;
        emit Withdrawn(tokenId, msg.sender, address(0), amount);
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function balanceOf(
        uint256 tokenId
    ) external view returns (uint256) {
        return vaults[tokenId].balance;
    }

    /// @notice Set strategy Merkle root, daily limit, and optional expiry day
    /// @param validUntilDay Last UTC day (inclusive) the strategy may execute; 0 = no expiry
    function setStrategy(
        uint256 tokenId,
        bytes32 root,
        uint256 dailyLimit,
        uint64 validUntilDay
    ) external whenNotPaused onlyTokenOwner(tokenId) {
        if (dailyLimit > type(uint128).max) revert LimitOverflow();
        Vault storage v = vaults[tokenId];
        v.strategyRoot = root;
        require(dailyLimit <= type(uint128).max, "dailyLimit overflows uint128");
        v.dailyLimit = uint128(dailyLimit);
        v.dailySpent = 0;
        v.resetDay = uint64(block.timestamp / 1 days);
        v.validUntilDay = validUntilDay;
        emit StrategySet(tokenId, root, dailyLimit, validUntilDay);
    }

    function strategyOf(
        uint256 tokenId
    )
        external
        view
        returns (bytes32 root, uint256 dailyLimit, uint256 dailySpent, uint64 resetDay, uint64 validUntilDay)
    {
        Vault storage v = vaults[tokenId];
        return (v.strategyRoot, v.dailyLimit, v.dailySpent, v.resetDay, v.validUntilDay);
    }

    /// @notice Execute an action whose hash is in the strategy Merkle tree
    /// @dev Permissionless: any caller may invoke; relayers or adversaries can front-run public
    ///      mempool submissions (MEV). Use private relays or ordered execution when ordering matters.
    /// @dev Liveness: state debits occur before the external call; a reverting target rolls back the
    ///      entire transaction (no partial debit), but griefing via gas-heavy revert targets is possible.
    function execute(
        uint256 tokenId,
        address target,
        uint256 value,
        bytes calldata data,
        bytes32[] calldata merkleProof
    ) external nonReentrant whenNotPaused returns (bytes memory) {
        Vault storage v = vaults[tokenId];
        if (v.strategyRoot == bytes32(0)) revert NoStrategySet();
        if (value > v.balance) revert ZeroAmount();
        if (target == address(0)) revert ZeroAddress();

        uint64 today = uint64(block.timestamp / 1 days);
        if (v.validUntilDay != 0 && today > v.validUntilDay) revert StrategyExpired();

        // Auto-reset daily spend on day rollover
        if (today != v.resetDay) {
            v.dailySpent = 0;
            v.resetDay = today;
        }
        if (value > type(uint128).max) revert LimitOverflow();
        uint128 spend = uint128(value);
        if (uint256(v.dailySpent) + uint256(spend) > uint256(v.dailyLimit)) revert DailyLimitExceeded();

        bytes32 actionHash = keccak256(abi.encode(target, value, keccak256(data)));
        if (!MerkleProof.verify(merkleProof, v.strategyRoot, actionHash)) revert InvalidMerkleProof();
        if (usedActions[tokenId][actionHash]) revert ActionAlreadyUsed();

        // CEI: state update first
        usedActions[tokenId][actionHash] = true;
        v.balance -= value;
        v.dailySpent += spend;
        totalTrackedBalance -= value;

        bytes memory result;
        bool ok;
        if (data.length == 0) {
            (ok,) = target.call{value: value}("");
        } else {
            (ok, result) = target.call{value: value}(data);
        }
        if (!ok) revert CallFailed();

        emit Executed(tokenId, actionHash, target, value, result);
        return result;
    }

    /// @notice Sweep native OG that was sent without `deposit()` (excess over tracked balances)
    function recoverExcessNative(
        address to
    ) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        uint256 excess = address(this).balance - totalTrackedBalance;
        if (excess == 0) revert ZeroAmount();
        (bool ok,) = payable(to).call{value: excess}("");
        if (!ok) revert TransferFailed();
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
