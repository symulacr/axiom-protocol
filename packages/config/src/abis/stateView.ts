export const STATE_VIEW_ABI = [
  "function BPS_DENOMINATOR() view returns (uint256)",
  "function agentEarningsOf(address creator) view returns (uint256)",
  "function computeRatioMax() view returns (uint256)",
  "function effectiveRoyaltyBpsOf(uint256 tokenId) view returns (uint256 royaltyBps, bool isSet, uint256 protocolFeeBps)",
  "function nft() view returns (address)",
  "function paymentSnapshot(address payer, uint256 tokenId) view returns (uint256 maxPayCap, uint256 computeRatioMax, uint256 agentBalance, uint256 payerAllowance, address paymentToken)",
  "function pendingPayCap() view returns (uint256)",
  "function processor() view returns (address)",
  "function royaltyRecipientOf(uint256 tokenId) view returns (address recipient)",
  "function vault() view returns (address)",
  "function vaultHealthOf(uint256 tokenId) view returns (uint256 balance, bytes32 strategyRoot, uint128 dailyLimit, uint128 dailySpent, uint64 resetDay, uint64 validUntilDay, bool expired)",
  "function verifyPayloadOf(uint256 tokenId, uint256 dataIndex, bytes payload) view returns (bool)",
  "error NoValue()",
  "error ZeroAddress()"
] as const;
