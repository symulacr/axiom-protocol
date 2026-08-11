// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IERC7857DataVerifier — verifier interface validating TransferValidityProofs; called by the NFT during iTransferFrom / iCloneFrom

enum OracleType {
    TEE,
    ZKP
}

/// @notice Signed by the receiver (or their access assistant) via EIP-712 signTypedData_v4: digest = keccak256("\x19\x01" || domainSeparator || keccak256(ACCESS_PROOF_TYPEHASH, dataHash, targetPubkey, to, nft, nonce, validUntil)); domain binds name="AxiomTeeVerifier", version="1", chainId, verifyingContract.
struct AccessProof {
    bytes32 dataHash;
    bytes targetPubkey; // 64-byte raw uncompressed point X||Y — no leading 0x04 prefix byte
    bytes nonce;
    bytes proof;
    uint256 validUntil;
}

/// @notice Signed by the TEE/ZKP oracle via EIP-712 (OWNERSHIP_PROOF_TYPEHASH over dataHash, sealedKey, targetPubkey, to, nft, nonce, validUntil); validUntil is enforced on-chain — expired or more than maxProofAgeSeconds ahead is rejected.
struct OwnershipProof {
    OracleType oracleType;
    bytes32 dataHash;
    bytes sealedKey; // Sealed encryption key bound to the receiver's public key via ECIES
    bytes targetPubkey;
    bytes nonce;
    bytes proof;
    uint256 validUntil;
}

/// @notice A pair of proofs required to transfer: accessProof signed by the receiver (or assistant) via signTypedData_v4, ownershipProof by the registered TEE/ZKP oracle; both legs verified by raw ECDSA recovery.
struct TransferValidityProof {
    AccessProof accessProof;
    OwnershipProof ownershipProof;
}

struct TransferValidityProofOutput {
    bytes32 dataHash;
    bytes sealedKey;
    bytes targetPubkey;
    /// @dev wantedKey intentionally always empty — the wanted-key flow is unused by design; empty means the receiver has no preference.
    bytes wantedKey;
    address accessAssistant;
    bytes accessProofNonce;
    bytes ownershipProofNonce;
}

interface IERC7857DataVerifier {
    /// @notice Verify a batch of transfer validity proofs (one per token data item), returning one output per proof
    function verifyTransferValidity(
        TransferValidityProof[] calldata _proofs,
        address _to,
        address _nft
    ) external returns (TransferValidityProofOutput[] memory outputs);
}
