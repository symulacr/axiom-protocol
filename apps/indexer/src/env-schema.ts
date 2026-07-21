import { z } from "zod";
import { hexString } from "@axiom/config/types/hex";
import { sharedEnvSchema } from "@axiom/config/env-schema";

export const indexerEnvSchema = sharedEnvSchema.merge(
  z.object({
    AXIOM_STORAGE_RPC: z.string().optional(),
    AXIOM_BACKEND_URL: z.string().url().optional(),
    AXIOM_INDEXER_API_KEY: z.string().optional(),
    INDEXER_STORAGE_ENABLED: z.string().optional(),
    AXIOM_EVM_RPC: z.string().url(),
    DEPLOYER_PK: hexString.optional(),
    INDEXER_HEALTH_PORT: z.coerce.number().int().positive().default(9091),
    PORT: z.coerce.number().int().positive().optional(),
    INDEXER_START_BLOCK: z.coerce.number().int().nonnegative().optional(),
    INDEXER_POLL_WINDOW_BLOCKS: z.coerce.number().int().positive().default(500),
  }),
);
