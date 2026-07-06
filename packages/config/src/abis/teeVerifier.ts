export const TEE_VERIFIER_ABI = [
  "function domainSeparator() view returns (bytes32)",
  "function registeredSigner() view returns (address)",
  "function maxProofAgeSeconds() view returns (uint256)",
  "function owner() view returns (address)",
  "function ADMIN_DELAY() view returns (uint256)",
  "function cleanExpiredProofs(bytes32[] proofNonces)",
  "function verifyTransferValidity((tuple(bytes32 dataHash,bytes targetPubkey,uint256 nonce,bytes proof,uint256 validUntil) accessProof,tuple(uint8 oracleType,bytes32 dataHash,bytes sealedKey,bytes targetPubkey,uint256 nonce,bytes proof,uint256 validUntil) ownershipProof)[] proofs, address to, address nft) returns (tuple(bytes32 dataHash,bytes sealedKey,bytes targetPubkey,bytes wantedKey,address accessAssistant,uint256 accessProofNonce,uint256 ownershipProofNonce)[])",
] as const;