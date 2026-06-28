import { z } from "zod";
import { hexString } from "@axiom/config/types/schemas";
import { sharedEnvSchema } from "@axiom/config/env-schema";

export const backendEnvSchema = sharedEnvSchema.merge(z.object({
  AXIOM_EVM_RPC: z.string().url(),
  AXIOM_ORACLE_URL: z.string().url(),
  AXIOM_STORAGE_RPC: z.string().url().optional(),
  AXIOM_COMPUTE_API_KEY: z.string().optional(),
  AXIOM_COMPUTE_DIRECT_KEY: z.string().optional(),
  AXIOM_COMPUTE_VERIFY_TEE: z.string().optional(),
  OG_COMPUTE_API_KEY: z.string().optional(),
  AXIOM_TEE_SIGNER_PK: hexString,
  DEPLOYER_PK: hexString,
  AXIOM_COMPUTE_MODEL: z.string().optional(),
  AXIOM_PORT: z.coerce.number().int().positive().default(3000),
  PORT: z.coerce.number().int().positive().optional(),
  AXIOM_BIND: z.string().default("0.0.0.0"),
  // Canonical names (preferred — match .env.example)
  AXIOM_AGENT_NFT_ADDRESS: z.string().optional(),
  AXIOM_STRATEGY_VAULT_ADDRESS: z.string().optional(),
  AXIOM_TEE_VERIFIER_ADDRESS: z.string().optional(),
  AXIOM_PAYMENT_PROCESSOR_ADDRESS: z.string().optional(),
  // Deprecated aliases (fallback)
  AGENT_NFT_ADDRESS: z.string().optional(),
  VAULT_ADDRESS: z.string().optional(),
  AXIOM_TEE_VERIFIER: z.string().optional(),
  PAYMENT_PROCESSOR_ADDRESS: z.string().optional(),
}));
export type BackendEnv = z.infer<typeof backendEnvSchema>;
