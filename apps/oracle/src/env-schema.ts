import { z } from "zod";
import { hexString, address } from "@axiom/config/types/schemas";
import { sharedEnvSchema } from "@axiom/config/env-schema";

export const oracleEnvSchema = sharedEnvSchema.merge(z.object({
  AXIOM_TEE_SIGNER_PK: hexString,
  AXIOM_ORACLE_URL: z.string().url().default("http://127.0.0.1:8787"),
  AXIOM_STORAGE_INDEXER_RPC: z.string().url().optional(),
  AXIOM_STORAGE_EVM_RPC: z.string().url().optional(),
  AXIOM_EVM_RPC: z.string().url(),
  AXIOM_TEE_VERIFIER: address,
  AXIOM_ORACLE_BIND: z.string().default("127.0.0.1"),
  AXIOM_ORACLE_PORT: z.coerce.number().int().positive().default(8787),
  AXIOM_STORAGE_PRIVATE_KEY: hexString.optional(),
}));
export type OracleEnv = z.infer<typeof oracleEnvSchema>;
