// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IERC7857DataVerifier
/// @notice Interface for the verifier contract that validates TransferValidityProofs
/// @dev Reference: https://eips.ethereum.org/EIPS/eip-7857
/// @dev This is the interface that the NFT contract calls during iTransferFrom / iCloneFrom

/// @notice The type of oracle that signed the OwnershipProof
enum OracleType {
    TEE,
    ZKP
}

/// @notice Signed by the receiver (or their access assistant) via EIP-712 typed data
/// @dev The receiver signs via signTypedData_v4 (browser wallet) or the equivalent
///      raw-ECDSA-over-EIP-712-digest path (backend). The signed digest is:
///          keccak256(abi.encodePacked("\x19\x01", domainSeparator,
///              keccak256(abi.encode(ACCESS_PROOF_TYPEHASH,
///                  dataHash, targetPubkey, to, nft, nonce, validUntil))))
///      where ACCESS_PROOF_TYPEHASH =
///          keccak256("AccessProof(bytes32 dataHash,bytes targetPubkey,address to,address nft,uint256 nonce,uint256 validUntil)")
///      and the domain separator binds to (name="AxiomTeeVerifier", version="1",
///      chainId, verifyingContract). Reference: https://eips.ethereum.org/EIPS/eip-712
struct AccessProof {
    bytes32 dataHash;
    bytes targetPubkey; // 64-byte raw uncompressed X||Y (no 0x04 prefix)
    uint256 nonce;
    bytes proof; // raw ECDSA signature over the EIP-712 digest
    uint256 validUntil; // unix-seconds deadline; proof is invalid once block.timestamp > validUntil
}

/// @notice Signed by the TEE/ZKP oracle via EIP-712 typed data
/// @dev Per EIP-712 (https://eips.ethereum.org/EIPS/eip-712), the signed digest is:
///          keccak256(abi.encodePacked("\x19\x01", domainSeparator,
///              keccak256(abi.encode(OWNERSHIP_PROOF_TYPEHASH,
///                  dataHash, sealedKey, targetPubkey, to, nft, nonce, validUntil))))
///      where OWNERSHIP_PROOF_TYPEHASH =
///          keccak256("OwnershipProof(bytes32 dataHash,bytes sealedKey,bytes targetPubkey,address to,address nft,uint256 nonce,uint256 validUntil)")
///      The `validUntil` deadline field is enforced on-chain: the verifier rejects
///      any proof where `block.timestamp > validUntil` (expired) or
///      `validUntil - block.timestamp > maxProofAgeSeconds` (too far future).
struct OwnershipProof {
    OracleType oracleType;
    bytes32 dataHash;
    bytes sealedKey; // Encryption key sealed for receiver (ECIES)
    bytes targetPubkey; // 64-byte raw uncompressed X||Y
    uint256 nonce;
    bytes proof; // raw ECDSA signature over the EIP-712 digest
    uint256 validUntil; // unix-seconds deadline; proof is invalid once block.timestamp > validUntil
}

/// @notice A pair of proofs required to transfer a token
/// @dev The accessProof is signed by the receiver (or their delegated
///      access assistant) via EIP-712 signTypedData_v4. The ownershipProof is
///      signed by the registered TEE/ZKP oracle using raw ECDSA over the
///      EIP-712 digest. The verifier recovers raw ECDSA signatures for both legs.
struct TransferValidityProof {
    AccessProof accessProof; // Signed by receiver (or access assistant)
    OwnershipProof ownershipProof; // Signed by TEE/ZKP oracle
}

/// @notice Output of verifyTransferValidity, consumed by the NFT contract
struct TransferValidityProofOutput {
    bytes32 dataHash;
    bytes sealedKey;
    bytes targetPubkey;
    bytes wantedKey; // empty if receiver has no preference
    address accessAssistant; // recovered from AccessProof.signature
    uint256 accessProofNonce;
    uint256 ownershipProofNonce;
}

interface IERC7857DataVerifier {
    /// @notice Verify a batch of transfer validity proofs
    /// @param _proofs Array of proofs (one per data item in the token)
    /// @param to The intended receiver address (binds proof to one recipient, preventing MEV replay)
    /// @param nft The NFT contract address (binds proof to one contract, preventing cross-contract replay)
    /// @return outputs Array of proof outputs (one per proof)
    function verifyTransferValidity(
        TransferValidityProof[] calldata _proofs,
        address to,
        address nft
    ) external returns (TransferValidityProofOutput[] memory outputs);
}
