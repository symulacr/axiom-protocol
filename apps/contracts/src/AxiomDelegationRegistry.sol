// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import {IAxiomAgentNFT} from "./interfaces/IAxiomAgentNFT.sol";

/// @title AxiomDelegationRegistry — EIP-712 owner-signed, capped, expiring execution delegation per agent token.
/// @dev Non-upgradeable, execution-carried: the registry holds NO funds; `delegatedExecute` forwards
///      the delegate's native `msg.value` to whitelisted targets (AxiomStrategyVault.execute,
///      AxiomPaymentProcessor.payForAgent, ...). Target/selector restriction is the Merkle root —
///      it MUST be non-zero, otherwise the delegate could call arbitrary contracts.
/// @dev Signer model: the recovered EIP-712 signer must equal `nft.ownerOf(agentTokenId)` live at
///      install time; revoke is owner-only and immediate (same containment philosophy as
///      AxiomTeeVerifier.revokeSigner). Delegate authorization is msg.sender == delegate (an
///      on-chain accountable address), NOT a per-call delegate signature — a captured signature
///      would add replay surface without adding trust, and the delegate is the paying account.
/// @dev Window accounting reuses the vault's day-window pattern (AxiomStrategyVault.vaults
///      dailySpent/resetDay) generalized to a per-delegation `windowSeconds` window id.
contract AxiomDelegationRegistry is Ownable, Pausable, ReentrancyGuard {
    error NoActiveDelegation();
    error DelegationExpired();
    error CapExceeded();
    error WindowExceeded();
    error SelectorNotAllowed();
    error DelegationNonceUsed();
    error NotDelegate();
    error NotTokenOwner();
    error InvalidMerkleProof();
    error ZeroAddress();
    error InvalidWindowConfig();
    error ValueMismatch(uint256 value, uint256 msgValue);
    error CallFailed();

    event DelegationInstalled(
        uint256 indexed agentTokenId, address indexed delegate, uint64 expiresAt, uint256 perTxCap, uint256 windowCap
    );
    event DelegationRevoked(uint256 indexed agentTokenId);
    event DelegatedExecuted(
        uint256 indexed agentTokenId,
        address indexed delegate,
        address indexed target,
        uint256 value,
        bytes32 actionHash
    );

    struct AgentDelegation {
        uint256 agentTokenId;
        address delegate;
        uint256 perTxCap; // per delegated call value cap
        uint256 windowCap; // rolling-window value cap
        uint64 windowSeconds;
        uint64 expiresAt; // hard expiry
        bytes32 allowedSelectorsRoot; // Merkle root of permitted (target,selector) leaves; REQUIRED non-zero
        uint256 nonce; // consumed on install
    }

    /// @dev Rolling-window spend state per token, mirroring the vault's dailySpent/resetDay shape.
    struct WindowState {
        uint128 spent;
        uint64 windowId; // block.timestamp / windowSeconds at last debit
    }

    IAxiomAgentNFT public immutable nft;

    /// @dev Domain separator binds install signatures to this instance and chain, preventing
    ///      cross-contract/cross-chain replay; cached in the constructor (chainId and
    ///      verifyingContract are immutable for a non-upgradeable deployment).
    bytes32 public immutable domainSeparator;

    /// @dev One active delegation per token — installing replaces (a replacement needs a fresh
    ///      owner signature and unused nonce by construction).
    mapping(uint256 agentTokenId => AgentDelegation) internal _delegations;
    mapping(uint256 agentTokenId => mapping(uint256 nonce => bool used)) public usedNonces;
    mapping(uint256 agentTokenId => WindowState) public windows;

    bytes32 private constant DELEGATION_TYPEHASH = keccak256(
        "AgentDelegation(uint256 agentTokenId,address delegate,uint256 perTxCap,uint256 windowCap,uint64 windowSeconds,uint64 expiresAt,bytes32 allowedSelectorsRoot,uint256 nonce)"
    );

    constructor(
        IAxiomAgentNFT _nft,
        address _owner
    ) Ownable(_owner) {
        if (address(_nft) == address(0) || _owner == address(0)) revert ZeroAddress();
        nft = _nft;
        domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("AxiomDelegationRegistry"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }

    /// @notice Installs (or replaces) the active delegation for `d.agentTokenId`; the EIP-712
    ///         signer MUST be the current NFT owner. Nonce is single-use.
    /// @dev Fail-fast at install: a zero selector root would let the delegate execute against
    ///      arbitrary contracts, so it is rejected here rather than silently at execute time.
    function installDelegation(
        AgentDelegation calldata d,
        bytes calldata ownerSig
    ) external {
        if (d.delegate == address(0)) revert ZeroAddress();
        if (d.allowedSelectorsRoot == bytes32(0)) revert SelectorNotAllowed();
        // Consistent window config: window cap and window length are set together or not at all.
        if ((d.windowCap == 0) != (d.windowSeconds == 0)) revert InvalidWindowConfig();
        if (usedNonces[d.agentTokenId][d.nonce]) revert DelegationNonceUsed();

        // Expiry is the owner's floor; reject installing an already-expired delegation.
        if (d.expiresAt <= block.timestamp) revert DelegationExpired();

        bytes32 structHash = keccak256(
            abi.encode(
                DELEGATION_TYPEHASH,
                d.agentTokenId,
                d.delegate,
                d.perTxCap,
                d.windowCap,
                d.windowSeconds,
                d.expiresAt,
                d.allowedSelectorsRoot,
                d.nonce
            )
        );
        bytes32 message = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        if (ECDSA.recover(message, ownerSig) != nft.ownerOf(d.agentTokenId)) revert NotTokenOwner();

        // Mark the nonce used only after all validation passes, so a reverted install never burns it.
        usedNonces[d.agentTokenId][d.nonce] = true;
        _delegations[d.agentTokenId] = d;
        emit DelegationInstalled(d.agentTokenId, d.delegate, d.expiresAt, d.perTxCap, d.windowCap);
    }

    /// @notice Immediate owner-only revocation — a compromised delegate key is blocked the same
    ///         block (mirrors AxiomTeeVerifier.revokeSigner containment). The current NFT owner
    ///         (read live) may revoke, so a transfer also strips the seller's delegate.
    function revokeDelegation(
        uint256 agentTokenId
    ) external {
        if (nft.ownerOf(agentTokenId) != msg.sender) revert NotTokenOwner();
        delete _delegations[agentTokenId];
        emit DelegationRevoked(agentTokenId);
    }

    /// @notice Executes `data` on `target` with `value` native from the delegate, under the
    ///         delegation's caps, expiry, and (target,selector) Merkle allowlist.
    /// @dev Registry holds no funds: `msg.value` must equal `value` and is forwarded in full.
    ///      For vault.execute leg the vault spends its own tracked balance under its own
    ///      daily limit — the registry cap and the vault limit are independent layers.
    function delegatedExecute(
        uint256 agentTokenId,
        address target,
        uint256 value,
        bytes calldata data,
        bytes32[] calldata merkleProof
    ) external payable nonReentrant whenNotPaused returns (bytes memory) {
        AgentDelegation storage del = _delegations[agentTokenId];
        if (del.delegate == address(0)) revert NoActiveDelegation();
        if (del.allowedSelectorsRoot == bytes32(0)) revert SelectorNotAllowed(); // defense-in-depth: zero root would mean unrestricted targets
        if (msg.sender != del.delegate) revert NotDelegate();
        if (block.timestamp > del.expiresAt) revert DelegationExpired();
        if (target == address(0)) revert ZeroAddress();
        if (value != msg.value) revert ValueMismatch(value, msg.value);
        if (data.length < 4) revert SelectorNotAllowed();

        if (value > del.perTxCap) revert CapExceeded();

        // Rolling-window accounting (vault dailySpent/resetDay pattern, generalized window id).
        if (del.windowSeconds != 0) {
            WindowState storage w = windows[agentTokenId];
            uint64 windowId = uint64(block.timestamp / del.windowSeconds);
            if (w.windowId != windowId) {
                w.spent = 0;
                w.windowId = windowId;
            }
            if (uint256(w.spent) + value > del.windowCap) revert WindowExceeded();
            w.spent = uint128(uint256(w.spent) + value);
        }

        // Leaf encoding matches AxiomStrategyVault.execute (single-hash fixed-abi leaf).
        bytes32 leaf = keccak256(abi.encode(target, bytes4(data[:4])));
        if (!MerkleProof.verify(merkleProof, del.allowedSelectorsRoot, leaf)) revert InvalidMerkleProof();

        // CEI: all state (nonce on install, window debit) precedes the external call; a failing
        // target rolls the whole tx back atomically.
        (bool ok, bytes memory result) = target.call{value: value}(data);
        if (!ok) revert CallFailed();

        // The registry holds no funds: native returned by the target (e.g. a vault.execute
        // payout lands on msg.sender == this registry) is forwarded to the delegate same-tx.
        uint256 leftover = address(this).balance;
        if (leftover != 0) {
            (bool fwd,) = payable(msg.sender).call{value: leftover}("");
            if (!fwd) revert CallFailed();
        }

        bytes32 actionHash = keccak256(abi.encode(target, value, keccak256(data)));
        emit DelegatedExecuted(agentTokenId, del.delegate, target, value, actionHash);
        return result;
    }

    function getDelegation(
        uint256 agentTokenId
    ) external view returns (AgentDelegation memory) {
        return _delegations[agentTokenId];
    }

    function isDelegationActive(
        uint256 agentTokenId
    ) external view returns (bool) {
        AgentDelegation storage del = _delegations[agentTokenId];
        return del.delegate != address(0) && block.timestamp <= del.expiresAt;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
