// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {TimelockManager} from "../libraries/TimelockManager.sol";
using TimelockManager for TimelockManager.State;
import {BaseVerifier} from "./BaseVerifier.sol";
import {
    IERC7857DataVerifier,
    TransferValidityProof,
    TransferValidityProofOutput
} from "../interfaces/IERC7857DataVerifier.sol";

/// @title AxiomTeeVerifier — TEE-based verifier for ERC-7857 transfer validity proofs (0G reference, MIT)
/// @dev Registered signers form a small allowlist (k-of-1 quorum: any allowlisted signer verifies); for buildathon it is the TS signer service (apps/oracle), seeded via initialize.
/// @dev k-of-1 RESIDUAL RISK: a single allowlisted TEE key that verifies transfers carries total transfer-forgery power over all agents if it leaks. Containment is IMMEDIATE revocation (revokeSigner, no timelock) — a compromised key is blocked the same block the compromise is detected; the 1-day propose/execute delay applies only to adds. Deliberately NOT k-of-n (product decision, V3 wave 1B): quorum would multiply TEE infrastructure for a buildathon-scale deployment without changing the containment story.
/// @dev ADDING a signer keeps the proven 1-day timelock (proposeSigner + executeSigner); REVOKING is immediate (revokeSigner) so a compromised signer key can be contained without waiting out the delay from the same owner key. Signer management is Ownable. See ADR-004 §1.4.
/// @dev Deployed non-upgradeable-but-behind-proxy: UUPS machinery is intentionally kept because every deploy script proxies this contract; posture is "committed proxy" (ADR-004 §1.4).
contract AxiomTeeVerifier is Initializable, BaseVerifier, OwnableUpgradeable, UUPSUpgradeable {
    error AxiomInvalidSigner();
    error AxiomInvalidOwnershipProof();
    error AxiomInvalidAccessProof();
    error ZeroAddress();
    error NoPendingProposal();
    error SignerNotAllowlisted();
    error SignerAlreadyAllowlisted();
    error SignerAllowlistEmpty();
    error SignerAllowlistFull();
    /// @dev Thrown when a caller other than the NFT named in the proof digests invokes
    ///      verifyTransferValidity directly. Blocks the proof-nonce-burning front-run (F-1):
    ///      a bystander replaying an in-flight iTransferFrom's proofs against the verifier
    ///      would burn the nonce (_checkAndMarkProof) and make the genuine transfer revert
    ///      with ProofAlreadyUsed. The NFT (ERC7857Upgradeable._proofCheck) is the only
    ///      legitimate consumer of the verifier's outputs.
    error UnauthorizedVerifierCaller(address caller, address nft);
    error ProofFieldMismatch();
    error AxiomProofExpired(uint256 validUntil, uint256 blockTimestamp);
    /// @dev Thrown when `validUntil` is too far ahead — guards against long-lived TEE proofs and overflow attacks (validUntil = type(uint256).max).
    error AxiomValidUntilTooFar(uint256 validUntil, uint256 blockTimestamp, uint256 maxProofAgeSeconds);

    event SignerProposed(address indexed newSigner, uint256 executableAt);
    event SignerExecuted(address indexed oldSigner, address indexed newSigner);
    event SignerProposalCancelled(address indexed cancelledSigner);
    event SignerRevoked(address indexed revokedSigner);

    /// @dev Allowlist size cap (LOW finding): bounds gas growth of swap-and-pop scans and
    ///      keeps the k-of-1 trust surface explicit.
    uint256 private constant MAX_SIGNERS = 5;


    uint256 public maxProofAgeSeconds;
    /// @dev Append-only allowlist per ADR-004 §1.4 storage rule: entries are only added (timelocked) or removed (immediate revoke); never re-purposed.
    address[] private _signers;
    mapping(address => bool) private _isSigner;
    TimelockManager.State private _signerTimelock;

    /// @dev Domain separator binds signatures to this instance and chain, preventing cross-contract/cross-chain replay; signTypedData_v4 yields raw ECDSA over the digest.
    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant OWNERSHIP_PROOF_TYPEHASH = keccak256(
        "OwnershipProof(bytes32 dataHash,bytes sealedKey,bytes targetPubkey,address to,address nft,bytes nonce,uint256 validUntil)"
    );
    bytes32 private constant ACCESS_PROOF_TYPEHASH = keccak256(
        "AccessProof(bytes32 dataHash,bytes targetPubkey,address to,address nft,bytes nonce,uint256 validUntil)"
    );

    constructor() {
        _disableInitializers();
    }

    /// @notice Replaces the constructor for proxy deployments; sets owner, initial TEE signer, and max proof age.
    function initialize(address _owner, address _signer, uint256 _maxProofAge) external initializer {
        require(_signer != address(0), "Zero signer");
        require(_maxProofAge > 0, "Zero max proof age");
        __Ownable_init(_owner);
        maxProofAgeSeconds = _maxProofAge;
        _signers.push(_signer);
        _isSigner[_signer] = true;
    }

    /// @notice Backward-compat view: the CURRENT FIRST allowlist entry. External consumers
    ///     (backend e2e coverage.ts, matrix.ts) read this. NOTE: the first entry can CHANGE
    ///     under swap-and-pop revocation — removing `_signers[0]` moves the last entry into
    ///     slot 0 (see test_revokeSigner_firstEntry_shiftsView), so this value is not pinned
    ///     to the deployment seed. Prefer `allowlistedSigners()` / `isAllowlistedSigner()`
    ///     for allowlist enumeration and membership checks.
    function registeredSigner() external view returns (address) {
        return _signers[0];
    }

    /// @notice Number of currently allowlisted signers (k-of-1 quorum: count >= 1 is enforced by revoke).
    function signerCount() external view returns (uint256) {
        return _signers.length;
    }

    /// @notice Full allowlist (frontends/oracles enumerate; order matches add sequence, [0] = registeredSigner).
    function allowlistedSigners() external view returns (address[] memory) {
        return _signers;
    }

    /// @notice Whether an address is currently allowlisted to sign ownership proofs.
    function isAllowlistedSigner(address signer) external view returns (bool) {
        return _isSigner[signer];
    }

    /// @notice Adds a signer after the 1-day timelock; appends to the allowlist (does not replace — existing entries stay valid).
    /// @dev Reverts SignerAllowlistFull once MAX_SIGNERS (5) entries are live.
    function executeSigner() external onlyOwner {
        if (_signers.length >= MAX_SIGNERS) revert SignerAllowlistFull();
        address newSigner = _signerTimelock.execute();
        address old = _signers[0];
        _signers.push(newSigner);
        _isSigner[newSigner] = true;
        emit SignerExecuted(old, newSigner);
    }

    /// @notice Immediate revocation — a compromised signer key is blocked the same block, no 1-day propose/execute cycle (ADR-004 §1.4 containment rationale).
    /// @dev Reverts when removing the last entry: the allowlist must never be empty or every transfer would fail verification.
    function revokeSigner(address signer) external onlyOwner {
        if (!_isSigner[signer]) revert SignerNotAllowlisted();
        if (_signers.length == 1) revert SignerAllowlistEmpty();
        _isSigner[signer] = false;
        // Swap-and-pop keeps the list dense; [0] always holds a live signer because length > 1 here.
        uint256 len = _signers.length;
        for (uint256 i = 0; i < len; i++) {
            if (_signers[i] == signer) {
                _signers[i] = _signers[len - 1];
                _signers.pop();
                break;
            }
        }
        emit SignerRevoked(signer);
    }

    function proposeSigner(
        address newSigner
    ) external onlyOwner {
        if (newSigner == address(0)) revert ZeroAddress();
        if (_isSigner[newSigner]) revert SignerAlreadyAllowlisted();
        _signerTimelock.propose(newSigner);
        emit SignerProposed(newSigner, block.timestamp + 1 days);
    }

    function cancelSignerProposal() external onlyOwner {
        if (_signerTimelock.proposed == address(0)) revert NoPendingProposal();
        address cancelled = _signerTimelock.proposed;
        _signerTimelock.cancel();
        emit SignerProposalCancelled(cancelled);
    }

    function pendingSigner() external view returns (address) {
        return _signerTimelock.proposed;
    }

    /// @dev ERC-7857 leaves the freshness window to the implementation; the 0G reference uses 7-day expiry, but replay protection is enforced via `usedProofs` regardless.
    function _getMaxProofAge() internal view override returns (uint256) {
        return maxProofAgeSeconds;
    }

    /// @dev Both proof legs are EIP-712 typed-data digests; signTypedData_v4 yields raw ECDSA, so no EIP-191 prefix is applied off-chain.
    function _recoverSigner(
        bytes32 messageHash,
        bytes memory signature
    ) internal pure returns (address) {
        if (signature.length != 65) revert AxiomInvalidSigner();
        address recovered = ECDSA.recover(messageHash, signature);
        if (recovered == address(0)) revert AxiomInvalidSigner();
        return recovered;
    }

    /// @dev Off-chain signers MUST compute keccak256("\x19\x01" || domainSeparator() || structHash) to match.
    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH, keccak256("AxiomTeeVerifier"), keccak256("1"), block.chainid, address(this)
            )
        );
    }

    function domainSeparator() public view returns (bytes32) {
        return _domainSeparator();
    }

    /// @inheritdoc IERC7857DataVerifier
    /// @dev Per proof: enforce both validUntil deadlines (expiry + maxProofAgeSeconds),
    ///      verify OwnershipProof (TEE) then AccessProof (receiver) EIP-712 digests,
    ///      mark the nonce used (replay protection), populate the output.
    /// @dev Caller gate (F-1 fix): only the NFT contract named in the proof digests may
    ///      invoke this (zero storage — the `nft` param already flows through the EIP-712
    ///      struct hashes). Direct calls from any other address revert before any signature
    ///      work, so bystanders cannot burn proof nonces by replaying an in-flight
    ///      iTransferFrom's proofs. Does NOT affect proof validity: proofs signed for
    ///      nft=X still fail at signature recovery if submitted with a different `nft`.
    function verifyTransferValidity(
        TransferValidityProof[] calldata proofs,
        address to,
        address nft
    ) external override returns (TransferValidityProofOutput[] memory outputs) {
        if (msg.sender != nft) revert UnauthorizedVerifierCaller(msg.sender, nft);
        uint256 maxAge = maxProofAgeSeconds;
        uint256 nowTs = block.timestamp;
        outputs = new TransferValidityProofOutput[](proofs.length);

        bytes32 domainSep = _domainSeparator();

        for (uint256 i = 0; i < proofs.length; i++) {
            outputs[i] = _verifyTransferValidityProof(
                proofs[i],
                to,
                nft,
                domainSep,
                nowTs,
                maxAge
            );
        }
    }

    /// @dev Single-proof verification body, extracted so the classic (non-via_ir) pipeline
    ///      gets a fresh stack frame per proof — the inline loop exceeded the 16-slot limit.
    function _verifyTransferValidityProof(
        TransferValidityProof calldata p,
        address to,
        address nft,
        bytes32 domainSep,
        uint256 nowTs,
        uint256 maxAge
    ) internal returns (TransferValidityProofOutput memory) {

            // Timestamp gate: validUntil must be future and within maxAge; validUntil >= now keeps the subtraction overflow-safe.
            _checkValidUntil(p.ownershipProof.validUntil, nowTs, maxAge);
            _checkValidUntil(p.accessProof.validUntil, nowTs, maxAge);

            // Pre-hash variable-length calldata fields once, reused in the checks below
            bytes32 accessTargetPubkeyHash = keccak256(p.accessProof.targetPubkey);
            bytes32 ownershipTargetPubkeyHash = keccak256(p.ownershipProof.targetPubkey);
            bytes32 accessNonceHash = keccak256(p.accessProof.nonce);
            bytes32 ownershipNonceHash = keccak256(p.ownershipProof.nonce);
            bytes32 sealedKeyHash = keccak256(p.ownershipProof.sealedKey);

            // Cross-proof consistency: TEE and receiver legs must agree on every shared field.
            if (
                p.accessProof.dataHash != p.ownershipProof.dataHash
                    || accessTargetPubkeyHash != ownershipTargetPubkeyHash
                    || accessNonceHash != ownershipNonceHash
                    || p.accessProof.validUntil != p.ownershipProof.validUntil
            ) {
                revert ProofFieldMismatch();
            }

            // Verify OwnershipProof (TEE oracle): bytes fields pre-hashed per EIP-712 hashstruct so signTypedData_v4 digests match.
            // Struct hash computed separately to keep the loop's stack depth under the classic-pipeline limit.
            bytes32 ownershipStructHash = keccak256(
                abi.encode(
                    OWNERSHIP_PROOF_TYPEHASH,
                    p.ownershipProof.dataHash,
                    sealedKeyHash,
                    ownershipTargetPubkeyHash,
                    to,
                    nft,
                    ownershipNonceHash,
                    p.ownershipProof.validUntil
                )
            );
            bytes32 ownershipMessage = keccak256(
                abi.encodePacked("\x19\x01", domainSep, ownershipStructHash)
            );
            address recovered = _recoverSigner(ownershipMessage, p.ownershipProof.proof);
            // k-of-1 quorum: any allowlisted signer verifies (ADR-004 §1.4).
            if (!_isSigner[recovered]) revert AxiomInvalidOwnershipProof();

            // Verify AccessProof (receiver via signTypedData_v4); recovered signer must equal `to`.
            bytes32 accessStructHash = keccak256(
                abi.encode(
                    ACCESS_PROOF_TYPEHASH,
                    p.accessProof.dataHash,
                    accessTargetPubkeyHash,
                    to,
                    nft,
                    accessNonceHash,
                    p.accessProof.validUntil
                )
            );
            bytes32 accessMessage = keccak256(
                abi.encodePacked("\x19\x01", domainSep, accessStructHash)
            );
            address accessSigner = _recoverSigner(accessMessage, p.accessProof.proof);
            if (accessSigner == address(0) || accessSigner != to) revert AxiomInvalidAccessProof();

            // Mark nonce used (replay protection); the consistency check lets us derive it from the accessProof side.
            bytes32 proofNonce = keccak256(
                abi.encode(
                    p.accessProof.dataHash,
                    p.accessProof.targetPubkey,
                    p.ownershipProof.sealedKey,
                    p.accessProof.nonce,
                    p.accessProof.validUntil
                )
            );
            _checkAndMarkProof(proofNonce);

            return
                TransferValidityProofOutput({
                    dataHash: p.ownershipProof.dataHash,
                    sealedKey: p.ownershipProof.sealedKey,
                    targetPubkey: p.ownershipProof.targetPubkey,
                    wantedKey: "",
                    accessAssistant: accessSigner,
                    accessProofNonce: p.accessProof.nonce,
                    ownershipProofNonce: p.ownershipProof.nonce
                });
    }

    /// @dev Enforce the EIP-712 deadline, overflow-safe: expired if validUntil < now; too far if validUntil - now > maxAge (covers type(uint256).max).
    function _checkValidUntil(
        uint256 validUntil,
        uint256 nowTs,
        uint256 maxAge
    ) private pure {
        if (validUntil < nowTs) {
            revert AxiomProofExpired(validUntil, nowTs);
        }
        if (validUntil - nowTs > maxAge) {
            revert AxiomValidUntilTooFar(validUntil, nowTs, maxAge);
        }
    }
    /// @dev UUPS upgrade gate: only the owner may authorize an upgrade.
    function _authorizeUpgrade(address) internal override onlyOwner {}

    uint256[50] private __gap;
}
