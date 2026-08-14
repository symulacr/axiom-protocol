import { z } from "zod";
import { hexString } from "@axiom/config/types/hex";
import { sharedEnvSchema } from "@axiom/config/env-schema";
import { RUNTIME_DEFAULTS } from "@axiom/config";

export const backendEnvSchema = sharedEnvSchema.merge(
  z.object({
    // Oracle is in-process since the merge; URL retained (optional) for e2e/CLI that still
    // dial the /oracle surface directly.
    AXIOM_ORACLE_URL: z
      .string()
      .url(
        "AXIOM_ORACLE_URL must be a valid URL (e2e/CLI fallback for the /oracle surface)",
      )
      .optional(),
    AXIOM_INDEXER_API_KEY: z.string().optional(),
    AXIOM_EVM_RPC: z.string().url(),
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
    // 0G storage (in-process oracle + chat transcripts); same env contract as the old oracle.
    AXIOM_STORAGE_INDEXER_RPC: z.string().url().optional(),
    AXIOM_STORAGE_EVM_RPC: z.string().url().optional(),
    AXIOM_STORAGE_PRIVATE_KEY: hexString.optional(),
    AXIOM_STORAGE_FEE: z.string().optional(),
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
