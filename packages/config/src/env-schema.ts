import { z } from "zod";

/**
 * Shared environment variables used across multiple Axiom Protocol packages
 * (backend, oracle, etc.). Individual packages merge this into their own
 * schema via Zod's `.merge()`.
 *
 * Keep this minimal — only vars consumed by 2+ packages belong here.
 */
export const sharedEnvSchema = z.object({
  /** Frontend origin for CORS / CSP (optional — falls back to localhost). */
  AXIOM_FRONTEND_URL: z.string().url().optional(),
  /** API key for optional bearer-token auth on HTTP endpoints. */
  AXIOM_API_KEY: z.string().optional(),
  /** API key for authenticating with the 0G Compute proxy. */
  OG_COMPUTE_API_KEY: z.string().optional(),
  /** EIP-155 chain ID (defaults to 16602 = Galileo testnet). */
  AXIOM_CHAIN_ID: z.coerce.number().int().positive().default(16602),
  /** Explicit override for the 0G Compute Router base URL. */
  OG_COMPUTE_BASE_URL: z.string().url().optional(),
});

export type SharedEnv = z.infer<typeof sharedEnvSchema>;
