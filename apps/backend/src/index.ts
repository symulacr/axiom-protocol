import { Wallet, JsonRpcProvider } from "ethers";
import { getAddress } from "viem";
import { startServer } from "./server.js";
import { loadEnv } from "./env.js";
import { backendEnvSchema } from "./env-schema.js";

// Seed process.env from a single .env file via the canonical loader.
// See https://nodejs.org/api/process.html#processenv (env.ts documents the source).
loadEnv();

export const env = backendEnvSchema.parse(process.env);

const provider = new JsonRpcProvider(env.AXIOM_EVM_RPC);
const signer = new Wallet(env.DEPLOYER_PK, provider);
startServer({
  bind: env.BIND,
  port: env.PORT,
  env,
  evmRpc: env.AXIOM_EVM_RPC,
  storageRpc: env.AXIOM_STORAGE_RPC,
  signer,
  oracleBaseUrl: env.AXIOM_ORACLE_URL,
  addresses: {
    agentNft: env.AGENT_NFT_ADDRESS ? getAddress(env.AGENT_NFT_ADDRESS) : getAddress("0xf12F158a20c36a351b056FD60b3a7377ce4F1e09"),
    vault: env.VAULT_ADDRESS ? getAddress(env.VAULT_ADDRESS) : getAddress("0xb7F89e50D5A3039Da7d39528436B820371572874"),
    verifier: env.AXIOM_TEE_VERIFIER ? getAddress(env.AXIOM_TEE_VERIFIER) : getAddress("0x24f725198d64A3b03A8386cD8fa12BD7c591734A"),
    paymentProcessor: env.PAYMENT_PROCESSOR_ADDRESS ? getAddress(env.PAYMENT_PROCESSOR_ADDRESS) : getAddress("0x096203fB54681b66dD8ab9bA47aaB462aA8C4A5f"),
  },
});
