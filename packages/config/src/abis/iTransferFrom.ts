export const ITRANSFER_FROM_ABI = [
  "function iTransferFrom(address from, address to, uint256 tokenId, tuple(tuple(bytes32 dataHash, bytes targetPubkey, uint256 nonce, bytes proof, uint256 validUntil) accessProof, tuple(uint8 oracleType, bytes32 dataHash, bytes sealedKey, bytes targetPubkey, uint256 nonce, bytes proof, uint256 validUntil) ownershipProof)[] proofs)",
] as const;
