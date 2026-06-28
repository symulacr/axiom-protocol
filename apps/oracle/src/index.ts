import { Wallet } from "ethers";

import { TeeSigner, type Eip712Domain } from "./signer.js";
import { InMemoryStorage, ZeroGStorage, type StorageAdapter } from "@axiom/config/storage/0g";
import { startServer } from "./server.js";
export { startServer, type ServerConfig } from "./server.js";
import { loadEnv } from "./env.js";
import { oracleEnvSchema } from "./env-schema.js";
import { toViemHex } from "@axiom/config/types/hex";

loadEnv();

const env = oracleEnvSchema.parse(process.env);

const teeVerifierRaw = env.AXIOM_TEE_VERIFIER_ADDRESS ?? env.AXIOM_TEE_VERIFIER;
if (!teeVerifierRaw) throw new Error("Missing AXIOM_TEE_VERIFIER_ADDRESS or deprecated AXIOM_TEE_VERIFIER");
const teeVerifier: `0x${string}` = toViemHex(teeVerifierRaw);
const chainId = BigInt(env.AXIOM_CHAIN_ID);
const eip712Domain: Eip712Domain = { chainId, verifyingContract: teeVerifier };
const signer = new TeeSigner(env.AXIOM_TEE_SIGNER_PK, eip712Domain);

// Use real 0G Storage when the indexer RPC + EVM RPC are configured;
// fall back to InMemoryStorage for dev/test (no 0G network dependency).
let storage: StorageAdapter;
if (env.AXIOM_STORAGE_INDEXER_RPC || process.env.AXIOM_STORAGE_RPC) {
  const indexerRpc = env.AXIOM_STORAGE_INDEXER_RPC || process.env.AXIOM_STORAGE_RPC!;
  const evmRpc = env.AXIOM_STORAGE_EVM_RPC || env.AXIOM_EVM_RPC;
  // Reuse the TEE signer's ethers Wallet for storage upload transactions,
  // unless AXIOM_STORAGE_PRIVATE_KEY is configured for key separation.
  // In production this wallet must hold 0G tokens for gas.
  const storagePk = env.AXIOM_STORAGE_PRIVATE_KEY ?? env.AXIOM_TEE_SIGNER_PK;
  const wallet = new Wallet(storagePk);
  storage = new ZeroGStorage({ indexerRpc, evmRpc, signer: wallet });
  console.log(`[oracle] storage: 0G Storage (${indexerRpc})`);
} else {
  storage = new InMemoryStorage();
  console.log("[oracle] storage: InMemoryStorage (no AXIOM_STORAGE_INDEXER_RPC/AXIOM_STORAGE_RPC configured)");
}

const { httpServer: oracleHttp } = startServer({ signer, storage, bind: env.AXIOM_ORACLE_BIND, port: env.AXIOM_ORACLE_PORT, env });

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

// @fix F1-A1: Add process.on('unhandledRejection') handler — oracle has SIGTERM but not rejection handler
// @audit-ref: V1-A1 confirmed — zero across all apps
