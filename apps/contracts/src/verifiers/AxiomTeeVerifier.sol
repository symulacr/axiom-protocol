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
/// @dev Registered signer is an Intel TDX/AMD SEV TEE in production; for buildathon it is the TS signer service (apps/oracle), registered via proposeSigner + executeSigner.
/// @dev Signer rotation is Ownable + 1-day timelock; deployed non-upgradeable but upgrade-safe so the same bytecode can move behind a proxy later.
contract AxiomTeeVerifier is Initializable, BaseVerifier, OwnableUpgradeable, UUPSUpgradeable {
    error AxiomInvalidSigner();
    error AxiomInvalidOwnershipProof();
    error AxiomInvalidAccessProof();
    error ZeroAddress();
    error NoPendingProposal();
    error ProofFieldMismatch();
    error AxiomProofExpired(uint256 validUntil, uint256 blockTimestamp);
    /// @dev Thrown when `validUntil` is too far ahead — guards against long-lived TEE proofs and overflow attacks (validUntil = type(uint256).max).
    error AxiomValidUntilTooFar(uint256 validUntil, uint256 blockTimestamp, uint256 maxProofAgeSeconds);

    event SignerProposed(address indexed newSigner, uint256 executableAt);
    event SignerExecuted(address indexed oldSigner, address indexed newSigner);
    event SignerProposalCancelled(address indexed cancelledSigner);


    uint256 public maxProofAgeSeconds;
    address public registeredSigner;
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
        __Ownable_init(_owner);
        maxProofAgeSeconds = _maxProofAge;
        registeredSigner = _signer;
    }

    function proposeSigner(
        address newSigner
    ) external onlyOwner {
        if (newSigner == address(0)) revert ZeroAddress();
        _signerTimelock.propose(newSigner);
        emit SignerProposed(newSigner, block.timestamp + 1 days);
    }

    function executeSigner() external onlyOwner {
        address newSigner = _signerTimelock.execute();
        address old = registeredSigner;
        registeredSigner = newSigner;
        emit SignerExecuted(old, newSigner);
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
    function verifyTransferValidity(
        TransferValidityProof[] calldata proofs,
        address to,
        address nft
    ) external override returns (TransferValidityProofOutput[] memory outputs) {
        address expectedSigner = registeredSigner;
        uint256 maxAge = maxProofAgeSeconds;
        uint256 nowTs = block.timestamp;
        outputs = new TransferValidityProofOutput[](proofs.length);

        bytes32 domainSep = _domainSeparator();

        for (uint256 i = 0; i < proofs.length; i++) {
            outputs[i] = _verifyTransferValidityProof(
                proofs[i],
                to,
                nft,
                expectedSigner,
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
        address expectedSigner,
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
            if (recovered != expectedSigner) revert AxiomInvalidOwnershipProof();

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
