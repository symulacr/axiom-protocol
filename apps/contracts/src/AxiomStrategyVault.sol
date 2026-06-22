// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
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
    using SafeERC20 for IERC20;

    // ─── Custom errors ────────────────────────────────────────────
    error NotTokenOwner();
    error InvalidMerkleProof();
    error DailyLimitExceeded();
    error NoStrategySet();
    error ZeroAmount();
    error ZeroAddress();
    error TokenNotInRegistry();

    // ─── Events ──────────────────────────────────────────────────
    event Deposited(uint256 indexed tokenId, address indexed from, address indexed asset, uint256 amount);
    event Withdrawn(uint256 indexed tokenId, address indexed to, address indexed asset, uint256 amount);
    event StrategySet(uint256 indexed tokenId, bytes32 strategyRoot, uint256 dailyLimit, uint64 validUntilDay);
    event Executed(
        uint256 indexed tokenId,
        bytes32 indexed actionHash,
        address indexed target,
        uint256 value,
        bytes result
    );
    event RegistryUpdated(address indexed nft);

    /// @custom:storage-location erc7201:agent.storage.AxiomStrategyVault
    struct Vault {
        uint256 balance;        // native (OG) balance
        uint256 dailyLimit;     // max value executable per UTC day
        uint256 dailySpent;     // running spend in current day
        uint64 resetDay;        // day number of last reset
        bytes32 strategyRoot;   // Merkle root of approved action hashes
    }

    // keccak256(abi.encode(uint256(keccak256("agent.storage.AxiomStrategyVault")) - 1)) & ~bytes32(uint256(0xff))
    // Canonical ERC-7201 formula (OZ v5). Computed with `cast`:
    //   cast keccak $(cast abi-encode "f(uint256)" 0x3f569b10bfacf538d8245d30364cc2a6b8e3f5c2c9baf685016c5d1a465df58c)
    //   → 0x2c850096...4ca138, masked to 0x2c850096...4ca100
    bytes32 private constant STORAGE_LOCATION = 0x2c8500969106113efc78631b1915a4e278f67bc66ee84f8db9954bdec44ca100;

    function _getVaults() private pure returns (mapping(uint256 => Vault) storage $) {
        assembly {
            $.slot := STORAGE_LOCATION
        }
    }

    /// @notice The AxiomAgentNFT contract whose tokens are vaults
    IAxiomAgentNFT public nft;

    modifier onlyTokenOwner(uint256 tokenId) {
        if (nft.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        _;
    }

    constructor(address nftAddr, address initialOwner) Ownable(initialOwner) {
        if (nftAddr == address(0)) revert ZeroAddress();
        nft = IAxiomAgentNFT(nftAddr);
    }

    /// @notice Rotate the NFT contract (onlyOwner; e.g. after an upgrade)
    function setNFT(address newNft) external onlyOwner {
        if (newNft == address(0)) revert ZeroAddress();
        nft = IAxiomAgentNFT(newNft);
        emit RegistryUpdated(newNft);
    }

    // ─── Deposit / Withdraw (native 0G) ──────────────────────────
    function deposit(uint256 tokenId) external payable whenNotPaused onlyTokenOwner(tokenId) {
        if (msg.value == 0) revert ZeroAmount();
        _getVaults()[tokenId].balance += msg.value;
        emit Deposited(tokenId, msg.sender, address(0), msg.value);
    }

    function withdraw(uint256 tokenId, uint256 amount) external nonReentrant onlyTokenOwner(tokenId) {
        if (amount == 0) revert ZeroAmount();
        Vault storage v = _getVaults()[tokenId];
        if (v.balance < amount) revert ZeroAmount();
        // CEI: state update first, then external call
        v.balance -= amount;
        emit Withdrawn(tokenId, msg.sender, address(0), amount);
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "Transfer failed");
    }

    function balanceOf(uint256 tokenId) external view returns (uint256) {
        return _getVaults()[tokenId].balance;
    }

    // ─── Strategy ────────────────────────────────────────────────
    /// @notice Set the Merkle root of approved actions + daily value limit
    /// @param tokenId The vault's NFT token ID
    /// @param root Merkle root of approved action hashes
    /// @param dailyLimit Max total value (in wei) that can be executed per UTC day
    function setStrategy(uint256 tokenId, bytes32 root, uint256 dailyLimit) external whenNotPaused onlyTokenOwner(tokenId) {
        Vault storage v = _getVaults()[tokenId];
        v.strategyRoot = root;
        v.dailyLimit = dailyLimit;
        v.dailySpent = 0;
        v.resetDay = uint64(block.timestamp / 1 days);
        emit StrategySet(tokenId, root, dailyLimit, v.resetDay);
    }

    function strategyOf(uint256 tokenId) external view returns (bytes32 root, uint256 dailyLimit, uint256 dailySpent, uint64 resetDay) {
        Vault storage v = _getVaults()[tokenId];
        return (v.strategyRoot, v.dailyLimit, v.dailySpent, v.resetDay);
    }

    // ─── Execution ──────────────────────────────────────────────
    /// @notice Execute an action whose hash is in the strategy Merkle tree
    /// @param tokenId The vault's NFT token ID
    /// @param target Address to call / send value to
    /// @param value Native value to send
    /// @param data Calldata (empty for simple value transfer)
    /// @param merkleProof Merkle proof that keccak256(target, value, keccak256(data)) is in the strategy root
    function execute(
        uint256 tokenId,
        address target,
        uint256 value,
        bytes calldata data,
        bytes32[] calldata merkleProof
    ) external payable nonReentrant whenNotPaused returns (bytes memory) {
        Vault storage v = _getVaults()[tokenId];
        if (v.strategyRoot == bytes32(0)) revert NoStrategySet();
        if (value > v.balance) revert ZeroAmount();
        if (target == address(0)) revert ZeroAddress();

        // Daily-limit accounting with auto-reset on day rollover
        uint64 today = uint64(block.timestamp / 1 days);
        if (today != v.resetDay) {
            v.dailySpent = 0;
            v.resetDay = today;
        }
        if (v.dailySpent + value > v.dailyLimit) revert DailyLimitExceeded();

        // Verify the action hash is in the strategy tree
        bytes32 actionHash = keccak256(abi.encode(target, value, keccak256(data)));
        if (!MerkleProof.verify(merkleProof, v.strategyRoot, actionHash)) revert InvalidMerkleProof();

        // CEI: state update first
        v.balance -= value;
        v.dailySpent += value;

        // External call
        bytes memory result;
        bool ok;
        if (data.length == 0) {
            (ok, ) = target.call{value: value}("");
        } else {
            (ok, result) = target.call{value: value}(data);
        }
        require(ok, "Call failed");

        emit Executed(tokenId, actionHash, target, value, result);
        return result;
    }

    /// @notice Pause / unpause (onlyOwner)
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
