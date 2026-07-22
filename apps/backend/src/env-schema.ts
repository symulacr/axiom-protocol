import { z } from "zod";
import { hexString } from "@axiom/config/types/hex";
import { sharedEnvSchema } from "@axiom/config/env-schema";

export const backendEnvSchema = sharedEnvSchema.merge(
  z.object({
    AXIOM_ORACLE_URL: z.string().url(),
    AXIOM_INDEXER_API_KEY: z.string().optional(),
    AXIOM_EVM_RPC: z.string().url(),
    AXIOM_SENTRY_DSN: z.string().optional(),
    AXIOM_STORAGE_RPC: z.string().url().optional(),
    INDEXER_POLL_WINDOW_BLOCKS: z.coerce.number().int().positive().default(500),
    INDEXER_START_BLOCK: z.coerce.number().int().nonnegative().optional(),
    INDEXER_STORAGE_ENABLED: z.string().optional(),
    AXIOM_COMPUTE_API_KEY: z.string().optional(),
    AXIOM_COMPUTE_VERIFY_TEE: z.string().optional(),
    AXIOM_ENCRYPTION_ALGORITHM: z.string().optional(),
    OG_COMPUTE_API_KEY: z.string().optional(),
    AXIOM_TEE_SIGNER_PK: z.string(),
    DEPLOYER_PK: hexString,
    AXIOM_RUNTIME_SIGNER_PK: z.string().optional(),
    AXIOM_OPERATOR_PK: z.string().optional(),
    AXIOM_COMPUTE_SIGNER_PK: z.string().optional(),
    AXIOM_COMPUTE_MODEL: z.string().optional(),
    AXIOM_PORT: z.coerce.number().int().positive().default(3000),
    PORT: z.coerce.number().int().positive().optional(),
    AXIOM_BIND: z.string().default("0.0.0.0"),
    AXIOM_AGENT_NFT_ADDRESS: z.string().optional(),
    AXIOM_STRATEGY_VAULT_ADDRESS: z.string().optional(),
    AXIOM_TEE_VERIFIER_ADDRESS: z.string().optional(),
    AXIOM_PAYMENT_PROCESSOR_ADDRESS: z.string().optional(),
    AGENT_NFT_ADDRESS: z.string().optional(),
    VAULT_ADDRESS: z.string().optional(),
    AXIOM_TEE_VERIFIER: z.string().optional(),
    PAYMENT_PROCESSOR_ADDRESS: z.string().optional(),
  }),
);
export type BackendEnv = z.infer<typeof backendEnvSchema>;
