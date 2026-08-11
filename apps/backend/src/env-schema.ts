import { z } from "zod";
import { hexString } from "@axiom/config/types/hex";
import { sharedEnvSchema } from "@axiom/config/env-schema";
import { RUNTIME_DEFAULTS } from "@axiom/config";

export const backendEnvSchema = sharedEnvSchema.merge(
  z.object({
    AXIOM_ORACLE_URL: z.string().url(),
    AXIOM_INDEXER_API_KEY: z.string().optional(),
    AXIOM_EVM_RPC: z.string().url(),
    AXIOM_STORAGE_RPC: z.string().url().optional(),
    INDEXER_POLL_WINDOW_BLOCKS: z.coerce
      .number()
      .int()
      .positive()
      .default(RUNTIME_DEFAULTS.indexerPollWindowBlocks),
    INDEXER_START_BLOCK: z.coerce.number().int().nonnegative().optional(),
    AXIOM_COMPUTE_API_KEY: z.string().optional(),
    OG_COMPUTE_API_KEY: z.string().optional(),
    AXIOM_TEE_SIGNER_PK: z.string(),
    DEPLOYER_PK: hexString,
    AXIOM_RUNTIME_SIGNER_PK: z.string().optional(),
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
