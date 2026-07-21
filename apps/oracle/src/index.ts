import * as Sentry from "@sentry/node";

import { Wallet } from "ethers";

import { TeeSigner } from "./signer.js";
import { type Eip712Domain } from "@axiom/config";
import {
  InMemoryStorage,
  ZeroGStorage,
  type StorageAdapter,
} from "@axiom/config/storage/0g";
import { startServer } from "./server.js";
export { startServer, type ServerConfig } from "./server.js";
import { loadEnv } from "@axiom/config/env";
import { oracleEnvSchema } from "./env-schema.js";
import { toViemHex } from "@axiom/config/types/hex";
import { registerProcessHandlers } from "@axiom/config/process";

loadEnv();
if (process.env.PORT) {
  process.env.AXIOM_ORACLE_PORT = process.env.PORT;
}

const env = oracleEnvSchema.parse(process.env);
if (env.AXIOM_SENTRY_DSN) {
  Sentry.init({
    dsn: env.AXIOM_SENTRY_DSN,
    environment: process.env.NODE_ENV ?? "development",
  });
}

const teeVerifierRaw = env.AXIOM_TEE_VERIFIER_ADDRESS ?? env.AXIOM_TEE_VERIFIER;
if (!teeVerifierRaw)
  throw new Error(
    "Missing AXIOM_TEE_VERIFIER_ADDRESS or deprecated AXIOM_TEE_VERIFIER",
  );
const teeVerifier: `0x${string}` = toViemHex(teeVerifierRaw);
const chainId = BigInt(env.AXIOM_CHAIN_ID);
const eip712Domain: Eip712Domain = { chainId, verifyingContract: teeVerifier };
const signer = new TeeSigner(env.AXIOM_TEE_SIGNER_PK, eip712Domain);

let storage: StorageAdapter;
if (env.AXIOM_STORAGE_INDEXER_RPC || process.env.AXIOM_STORAGE_RPC) {
  const indexerRpc =
    env.AXIOM_STORAGE_INDEXER_RPC || process.env.AXIOM_STORAGE_RPC!;
  const evmRpc = env.AXIOM_STORAGE_EVM_RPC || env.AXIOM_EVM_RPC;
  const storagePk = env.AXIOM_STORAGE_PRIVATE_KEY ?? env.AXIOM_TEE_SIGNER_PK;
  const wallet = new Wallet(storagePk);
  storage = new ZeroGStorage({ indexerRpc, evmRpc, signer: wallet });
  console.log(`[oracle] storage: 0G Storage (${indexerRpc})`);
} else {
  storage = new InMemoryStorage();
  console.log(
    "[oracle] storage: InMemoryStorage (no AXIOM_STORAGE_INDEXER_RPC/AXIOM_STORAGE_RPC configured)",
  );
}

const { httpServer: oracleHttp } = startServer({
  signer,
  storage,
  bind: env.AXIOM_ORACLE_BIND,
  port: env.AXIOM_ORACLE_PORT,
  env,
});

process.on("SIGTERM", () => {
  console.log("[oracle] SIGTERM received — draining connections...");
  oracleHttp.closeAllConnections?.();
  oracleHttp.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  console.log("[oracle] SIGINT received — draining connections...");
  oracleHttp.closeAllConnections?.();
  oracleHttp.close(() => process.exit(0));
});

registerProcessHandlers();
