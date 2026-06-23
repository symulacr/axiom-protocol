import { Wallet } from "ethers";

import { TeeSigner, type Eip712Domain } from "./signer.js";
import { InMemoryStorage, ZeroGStorage, type StorageAdapter } from "./storage.js";
import { startServer } from "./server.js";
import { loadEnv } from "./env.js";
import { oracleEnvSchema } from "./env-schema.js";
import { toViemHex } from "@axiom/config/types/hex";

loadEnv();

const env = oracleEnvSchema.parse(process.env);

const teeVerifier: `0x${string}` = toViemHex(env.AXIOM_TEE_VERIFIER);
const chainId = BigInt(env.AXIOM_CHAIN_ID);
const eip712Domain: Eip712Domain = { chainId, verifyingContract: teeVerifier };
const signer = new TeeSigner(env.AXIOM_TEE_SIGNER_PK, eip712Domain);

// Use real 0G Storage when the indexer RPC + EVM RPC are configured;
// fall back to InMemoryStorage for dev/test (no 0G network dependency).
let storage: StorageAdapter;
if (env.AXIOM_STORAGE_INDEXER_RPC && env.AXIOM_STORAGE_EVM_RPC) {
  // Reuse the TEE signer's ethers Wallet for storage upload transactions,
  // unless AXIOM_STORAGE_PRIVATE_KEY is configured for key separation.
  // In production this wallet must hold 0G tokens for gas.
  const storagePk = env.AXIOM_STORAGE_PRIVATE_KEY ?? env.AXIOM_TEE_SIGNER_PK;
  const wallet = new Wallet(storagePk);
  storage = new ZeroGStorage({ indexerRpc: env.AXIOM_STORAGE_INDEXER_RPC, evmRpc: env.AXIOM_STORAGE_EVM_RPC, signer: wallet });
  console.log(`[oracle] storage: 0G Storage (${env.AXIOM_STORAGE_INDEXER_RPC})`);
} else {
  storage = new InMemoryStorage();
  console.log("[oracle] storage: InMemoryStorage (no AXIOM_STORAGE_INDEXER_RPC/AXIOM_STORAGE_EVM_RPC configured)");
}

startServer({ signer, storage, bind: env.AXIOM_ORACLE_BIND, port: env.AXIOM_ORACLE_PORT, env });
