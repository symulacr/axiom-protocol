import { z } from "zod";
import { hexString } from "@axiom/config/types/hex";
import { sharedEnvSchema } from "@axiom/config/env-schema";

export const indexerEnvSchema = sharedEnvSchema.merge(
  z.object({
    AXIOM_EVM_RPC: z.string().url(),
    AXIOM_CHAIN_ID: z.coerce.number().int().positive().default(16602),
    AXIOM_STORAGE_RPC: z.string().optional(),
    AXIOM_STORAGE_EVM_RPC: z.string().optional(),
    AXIOM_BACKEND_URL: z.string().url().optional(),
    INDEXER_DA_ENABLED: z.string().optional(),
    DEPLOYER_PK: hexString.optional(),
    STORAGE_BATCH_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
    STORAGE_BATCH_MAX_EVENTS: z.coerce.number().int().positive().default(10),
    INDEXER_HEALTH_PORT: z.coerce.number().int().positive().default(9091),
    PORT: z.coerce.number().int().positive().optional(),
    INDEXER_START_BLOCK: z.coerce.number().int().nonnegative().optional(),
    INDEXER_POLL_WINDOW_BLOCKS: z.coerce.number().int().positive().default(500),
  }),
);
