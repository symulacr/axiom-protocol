import { z } from "zod";
import { hexString } from "@axiom/config/types/schemas";
import { sharedEnvSchema } from "@axiom/config/env-schema";

/**
 * Indexer environment variable schema.
 * Extends the shared schema with indexer-specific vars.
 */
export const indexerEnvSchema = sharedEnvSchema.merge(z.object({
  /** EVM RPC URL for the 0G chain. */
  AXIOM_EVM_RPC: z.string().url(),
  /** 0G Storage node RPC URL. */
  AXIOM_STORAGE_RPC: z.string().optional(),
  /** 0G Storage EVM RPC URL. */
  AXIOM_STORAGE_EVM_RPC: z.string().optional(),
  /** Backend URL to POST events to (maps from BACKEND_URL). */
  AXIOM_BACKEND_URL: z.string().url().optional(),
  /** Enable data availability submission to 0G Storage. */
  INDEXER_DA_ENABLED: z.string().optional(),
  /** Deployer private key for storage transactions. */
  DEPLOYER_PK: hexString.optional(),
  /** Storage batch interval in ms. */
  STORAGE_BATCH_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  /** Max events per storage batch. */
  STORAGE_BATCH_MAX_EVENTS: z.coerce.number().int().positive().default(10),
  /** Health check server port for Docker/k8s probes. */
  INDEXER_HEALTH_PORT: z.coerce.number().int().positive().default(9091),
}));

export type IndexerEnv = z.infer<typeof indexerEnvSchema>;
