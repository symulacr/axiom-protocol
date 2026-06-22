// Thin re-export — single source of truth is packages/config/src/env.ts.
// DA-helper kept local since it is unique to the indexer.
export { loadEnv, getEnv } from "@axiom/config/env";

/**
 * Default 0G DA gRPC endpoint (Galileo testnet).
 *
 * The DA Client sidecar listens on port 51001. When running locally,
 * override via `DA_GRPC_URL` in `.env`.
 * Ref: https://docs.0g.ai/developer-hub/building-on-0g/da-integration
 */
export const DEFAULT_DA_GRPC_URL = "localhost:51001";

/**
 * Resolve the DA gRPC URL from the environment or return the default.
 * The DA Client sidecar handles gas payment; the indexer no longer
 * needs a private key / signer.
 */
export function getDaGrpcUrl(): string {
  return process.env["DA_GRPC_URL"] ?? DEFAULT_DA_GRPC_URL;
}
