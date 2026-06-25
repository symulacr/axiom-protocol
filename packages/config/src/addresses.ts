import { validateHex } from "./types/hex.js";

export const DEPLOYED_ADDRESSES = {
  agentNft:         validateHex((process.env.AXIOM_AGENT_NFT_ADDRESS || process.env.AGENT_NFT_ADDRESS || "0x9A83812008b62E6A94e5063db4d9B3B9bAbC938E") as string, "AXIOM_AGENT_NFT_ADDRESS"),
  strategyVault:    validateHex((process.env.AXIOM_STRATEGY_VAULT_ADDRESS || process.env.VAULT_ADDRESS || "0x6CEb5641945b0d554aA6987fC0354eF65F210Bd5") as string, "AXIOM_STRATEGY_VAULT_ADDRESS"),
  teeVerifier:      validateHex((process.env.AXIOM_TEE_VERIFIER_ADDRESS || process.env.AXIOM_TEE_VERIFIER || "0x50e9239EaDc2344394B8B6597A349C8b02b678EE") as string, "AXIOM_TEE_VERIFIER_ADDRESS"),
  paymentProcessor: validateHex((process.env.AXIOM_PAYMENT_PROCESSOR_ADDRESS || process.env.PAYMENT_PROCESSOR_ADDRESS || process.env.AXIOM_PAYMENT_PROCESSOR || "0x6B73E4f74E3A966b97468A2EA5C9B5b7C3Dfc6E8") as string, "AXIOM_PAYMENT_PROCESSOR_ADDRESS"),
  mockUsdc:         validateHex((process.env.AXIOM_MOCK_USDC_ADDRESS || process.env.AXIOM_PAYMENT_TOKEN || "0x354CA53bAB51C0666964fa050628d8351f8A7d19") as string, "AXIOM_MOCK_USDC_ADDRESS"),
} as const;
