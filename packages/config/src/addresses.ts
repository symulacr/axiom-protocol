import { validateHex } from "./types/hex.js";

export const DEPLOYED_ADDRESSES = {
  agentNft:         validateHex((process.env.AXIOM_AGENT_NFT_ADDRESS || process.env.AGENT_NFT_ADDRESS || "0xf12F158a20c36a351b056FD60b3a7377ce4F1e09") as string, "AXIOM_AGENT_NFT_ADDRESS"),
  strategyVault:    validateHex((process.env.AXIOM_STRATEGY_VAULT_ADDRESS || process.env.VAULT_ADDRESS || "0xb7F89e50D5A3039Da7d39528436B820371572874") as string, "AXIOM_STRATEGY_VAULT_ADDRESS"),
  teeVerifier:      validateHex((process.env.AXIOM_TEE_VERIFIER_ADDRESS || process.env.AXIOM_TEE_VERIFIER || "0x24f725198d64A3b03A8386cD8fa12BD7c591734A") as string, "AXIOM_TEE_VERIFIER_ADDRESS"),
  paymentProcessor: validateHex((process.env.AXIOM_PAYMENT_PROCESSOR_ADDRESS || process.env.PAYMENT_PROCESSOR_ADDRESS || process.env.AXIOM_PAYMENT_PROCESSOR || "0x096203fB54681b66dD8ab9bA47aaB462aA8C4A5f") as string, "AXIOM_PAYMENT_PROCESSOR_ADDRESS"),
  mockUsdc:         validateHex((process.env.AXIOM_MOCK_USDC_ADDRESS || process.env.AXIOM_PAYMENT_TOKEN || "0xeA13E136E59c6e919BeF2221f6ecDE2cBCEb0Dbf") as string, "AXIOM_MOCK_USDC_ADDRESS"),
} as const;
