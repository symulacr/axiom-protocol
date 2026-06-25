import { validateHex } from "./types/hex.js";

export const DEPLOYED_ADDRESSES = {
  agentNft:         validateHex((process.env.AXIOM_AGENT_NFT_ADDRESS || process.env.AGENT_NFT_ADDRESS || "0x5a89B0a41b2d9E7b661d2a4b1b06e43211b59379") as string, "AXIOM_AGENT_NFT_ADDRESS"),
  strategyVault:    validateHex((process.env.AXIOM_STRATEGY_VAULT_ADDRESS || process.env.VAULT_ADDRESS || "0xE3f3Af712B379e2DE19ffB3a7375A15D1FC31979") as string, "AXIOM_STRATEGY_VAULT_ADDRESS"),
  teeVerifier:      validateHex((process.env.AXIOM_TEE_VERIFIER_ADDRESS || process.env.AXIOM_TEE_VERIFIER || "0xB27c73aD01f61Ec1FDC302dF2350326228F14c11") as string, "AXIOM_TEE_VERIFIER_ADDRESS"),
  paymentProcessor: validateHex((process.env.AXIOM_PAYMENT_PROCESSOR_ADDRESS || process.env.PAYMENT_PROCESSOR_ADDRESS || process.env.AXIOM_PAYMENT_PROCESSOR || "0xe14F3d2f927E197916284B8399ade5FfFF12CB0c") as string, "AXIOM_PAYMENT_PROCESSOR_ADDRESS"),
  mockUsdc:         validateHex((process.env.AXIOM_MOCK_USDC_ADDRESS || process.env.AXIOM_PAYMENT_TOKEN || "0x354CA53bAB51C0666964fa050628d8351f8A7d19") as string, "AXIOM_MOCK_USDC_ADDRESS"),
} as const;
