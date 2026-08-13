// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import {IAxiomAgentNFT} from "./interfaces/IAxiomAgentNFT.sol";

/// @title AxiomStrategyVault — per-token vault; only the NFT owner sets strategy/withdraws, while `execute()` verifies each action against the Merkle root and enforces a daily limit. Non-upgradeable (holds user funds).
contract AxiomStrategyVault is Initializable, OwnableUpgradeable, PausableUpgradeable, ReentrancyGuard {
    error NotTokenOwner();
    error InvalidMerkleProof();
    error DailyLimitExceeded();
    error NoStrategySet();
    error ZeroAmount();
    error ZeroAddress();
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
        uint256 balance;
        bytes32 strategyRoot;
        uint128 dailyLimit;
        uint128 dailySpent;
        uint64 resetDay;
        uint64 validUntilDay; // last valid UTC day inclusive; 0 sentinel means no expiry
    }

    mapping(uint256 => Vault) public vaults;

    /// @notice One-shot action leaves: same actionHash cannot be re-executed for a tokenId
    mapping(uint256 => mapping(bytes32 => bool)) public usedActions;

    /// @notice Sum of all per-token tracked balances (for excess-native recovery)
    uint256 public totalTrackedBalance;

    IAxiomAgentNFT public nft;
    uint256[49] private __gap;

    modifier onlyTokenOwner(
        uint256 tokenId
    ) {
        if (nft.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        _;
    }

    constructor() {
        _disableInitializers();
    }
    function initialize(IAxiomAgentNFT _nft, address _owner) external initializer {
        require(address(_nft) != address(0), "Zero nft");
        __Ownable_init(_owner);
        __Pausable_init();
        nft = _nft;
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
        // CEI ordering: state update precedes the external call to prevent reentrancy
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

    function setStrategy(
        uint256 tokenId,
        bytes32 root,
        uint256 dailyLimit,
        uint64 validUntilDay
    ) external whenNotPaused onlyTokenOwner(tokenId) {
        if (dailyLimit > type(uint128).max) revert LimitOverflow();
        Vault storage v = vaults[tokenId];
        v.strategyRoot = root;
        v.dailyLimit = uint128(dailyLimit);
        v.dailySpent = 0;
        v.resetDay = uint64(block.timestamp / 1 days);
        v.validUntilDay = validUntilDay;
        emit StrategySet(tokenId, root, dailyLimit, validUntilDay);
    }

    /// @notice One-tx deposit + setStrategy: funds the vault and installs/refreshes the strategy in a single call (2 txs -> 1).
    function depositAndSetStrategy(
        uint256 tokenId,
        bytes32 root,
        uint256 dailyLimit,
        uint64 validUntilDay
    ) external payable whenNotPaused onlyTokenOwner(tokenId) {
        if (msg.value == 0) revert ZeroAmount();
        vaults[tokenId].balance += msg.value;
        totalTrackedBalance += msg.value;
        emit Deposited(tokenId, msg.sender, address(0), msg.value);

        if (dailyLimit > type(uint128).max) revert LimitOverflow();
        Vault storage v = vaults[tokenId];
        v.strategyRoot = root;
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

    /// @dev Permissionless — use private relays when ordering matters (MEV); state debits precede the external call so a reverting target rolls back atomically, though gas-heavy targets can grief.
    function execute(
        uint256 tokenId,
        address target,
        uint256 value,
        bytes calldata data,
        bytes32[] calldata merkleProof
    ) external nonReentrant whenNotPaused returns (bytes memory) {
        Vault storage v = vaults[tokenId];
        if (v.strategyRoot == bytes32(0)) revert NoStrategySet();
        uint256 balance = v.balance;
        if (value > balance) revert ZeroAmount();
        if (target == address(0)) revert ZeroAddress();

        uint64 today = uint64(block.timestamp / 1 days);
        if (v.validUntilDay != 0 && today > v.validUntilDay) revert StrategyExpired();

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

        usedActions[tokenId][actionHash] = true;
        v.balance = balance - value;
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
