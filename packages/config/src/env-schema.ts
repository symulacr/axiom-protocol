import { z } from "zod";

export const sharedEnvSchema = z.object({
  AXIOM_FRONTEND_URL: z.string().url().optional(),
  AXIOM_API_KEY: z.string().optional(),
  AXIOM_COMPUTE_API_KEY: z.preprocess((val) => {
    if (val === undefined || val === "") {
      return process.env.OG_COMPUTE_API_KEY ?? undefined;
    }
    return val;
  }, z.string().optional()),
  AXIOM_CHAIN_ID: z.coerce.number().int().positive().default(16661),
  OG_COMPUTE_BASE_URL: z.string().url().optional(),
});
