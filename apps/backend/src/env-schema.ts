import { z } from "zod";
import { hexString } from "@axiom/config/types/schemas";

export const backendEnvSchema = z.object({
  AXIOM_EVM_RPC: z.string().url(),
  AXIOM_ORACLE_URL: z.string().url(),
  AXIOM_STORAGE_RPC: z.string().url().optional(),
  AXIOM_CHAIN_ID: z.coerce.number().int().positive(),
  AXIOM_COMPUTE_API_KEY: z.string().optional(),
  AXIOM_COMPUTE_DIRECT_KEY: z.string().optional(),
  AXIOM_TEE_SIGNER_PK: hexString,
  OG_COMPUTE_BASE_URL: z.string().url().optional(),
  DEPLOYER_PK: hexString,
  PORT: z.coerce.number().int().positive().default(3000),
  BIND: z.string().default("127.0.0.1"),
  AXIOM_FRONTEND_URL: z.string().url().optional(),
  AXIOM_COMPUTE_MODEL: z.string().optional(),
  AGENT_NFT_ADDRESS: z.string().optional(),
  VAULT_ADDRESS: z.string().optional(),
  AXIOM_TEE_VERIFIER: z.string().optional(),
  PAYMENT_PROCESSOR_ADDRESS: z.string().optional(),
});
export type BackendEnv = z.infer<typeof backendEnvSchema>;
