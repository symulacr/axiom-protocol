import { getEnvWithAlias } from "./env.js";
import { validateHex } from "./types/hex.js";

// ── Canonical deployed addresses (Wave E-5, 2026-06-16) ──────────
// All addresses read from env vars with deployed defaults as fallback.
// To use a different deployment, set any of:
//   AXIOM_AGENT_NFT_ADDRESS
//   AXIOM_STRATEGY_VAULT_ADDRESS
//   AXIOM_TEE_VERIFIER_ADDRESS
//   AXIOM_PAYMENT_PROCESSOR_ADDRESS
//   AXIOM_MOCK_USDC_ADDRESS

const WAVE_E5: Record<string, `0x${string}`> = {
  agentNft:           "0xf12F158a20c36a351b056FD60b3a7377ce4F1e09",
  strategyVault:      "0xb7F89e50D5A3039Da7d39528436B820371572874",
  teeVerifier:        "0x24f725198d64A3b03A8386cD8fa12BD7c591734A",
  paymentProcessor:   "0x096203fB54681b66dD8ab9bA47aaB462aA8C4A5f",
  mockUsdc:           "0xeA13E136E59c6e919BeF2221f6ecDE2cBCEb0Dbf",
} as const;

export const DEPLOYED_ADDRESSES = {
  agentNft:         validateHex(getEnvWithAlias("AXIOM_AGENT_NFT_ADDRESS",    ["AGENT_NFT_ADDRESS"],  WAVE_E5.agentNft), "AXIOM_AGENT_NFT_ADDRESS"),
  strategyVault:    validateHex(getEnvWithAlias("AXIOM_STRATEGY_VAULT_ADDRESS", ["VAULT_ADDRESS"],     WAVE_E5.strategyVault), "AXIOM_STRATEGY_VAULT_ADDRESS"),
  teeVerifier:      validateHex(getEnvWithAlias("AXIOM_TEE_VERIFIER_ADDRESS", ["AXIOM_TEE_VERIFIER"], WAVE_E5.teeVerifier), "AXIOM_TEE_VERIFIER_ADDRESS"),
  paymentProcessor: validateHex(getEnvWithAlias("AXIOM_PAYMENT_PROCESSOR_ADDRESS", ["PAYMENT_PROCESSOR_ADDRESS", "AXIOM_PAYMENT_PROCESSOR"], WAVE_E5.paymentProcessor), "AXIOM_PAYMENT_PROCESSOR_ADDRESS"),
  mockUsdc:         validateHex(getEnvWithAlias("AXIOM_MOCK_USDC_ADDRESS",    ["AXIOM_PAYMENT_TOKEN"], WAVE_E5.mockUsdc), "AXIOM_MOCK_USDC_ADDRESS"),
} as const;
