import { Wallet, JsonRpcProvider } from "ethers";
import { getAddress } from "viem";
import { startServer } from "./server.js";
import { loadEnv } from "./env.js";
import { backendEnvSchema } from "./env-schema.js";
import { DEPLOYED_ADDRESSES } from "@axiom/config/addresses";

loadEnv();

export const env = backendEnvSchema.parse(process.env);

const provider = new JsonRpcProvider(env.AXIOM_EVM_RPC);
const signer = new Wallet(env.DEPLOYER_PK, provider);
startServer({
  bind: env.AXIOM_BIND,
  port: env.AXIOM_PORT,
  env,
  evmRpc: env.AXIOM_EVM_RPC,
  storageRpc: env.AXIOM_STORAGE_RPC,
  signer,
  oracleBaseUrl: env.AXIOM_ORACLE_URL,
  addresses: {
    agentNft: env.AGENT_NFT_ADDRESS ? getAddress(env.AGENT_NFT_ADDRESS) : getAddress(DEPLOYED_ADDRESSES.agentNft),
    vault: env.VAULT_ADDRESS ? getAddress(env.VAULT_ADDRESS) : getAddress(DEPLOYED_ADDRESSES.strategyVault),
    verifier: env.AXIOM_TEE_VERIFIER ? getAddress(env.AXIOM_TEE_VERIFIER) : getAddress(DEPLOYED_ADDRESSES.teeVerifier),
    paymentProcessor: env.PAYMENT_PROCESSOR_ADDRESS ? getAddress(env.PAYMENT_PROCESSOR_ADDRESS) : getAddress(DEPLOYED_ADDRESSES.paymentProcessor),
  },
});
