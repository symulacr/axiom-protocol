import { FetchRequest, JsonRpcProvider, Wallet } from "ethers";
import { getAddress } from "viem";
import { startServer } from "./server.js";
import { loadEnv } from "./env.js";
import { backendEnvSchema } from "./env-schema.js";
import { DEPLOYED_ADDRESSES } from "@axiom/config/addresses";
import { GALILEO_CHAIN_ID } from "@axiom/config/networks";

loadEnv();

export const env = backendEnvSchema.parse(process.env);

const fetchReq = new FetchRequest(env.AXIOM_EVM_RPC);
fetchReq.timeout = 10_000;

const provider = new JsonRpcProvider(
  fetchReq,
  env.AXIOM_CHAIN_ID ?? GALILEO_CHAIN_ID,
  { staticNetwork: true },
);
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
    agentNft: env.AXIOM_AGENT_NFT_ADDRESS
      ? getAddress(env.AXIOM_AGENT_NFT_ADDRESS)
      : env.AGENT_NFT_ADDRESS
        ? getAddress(env.AGENT_NFT_ADDRESS)
        : getAddress(DEPLOYED_ADDRESSES.agentNft),
    vault: env.AXIOM_STRATEGY_VAULT_ADDRESS
      ? getAddress(env.AXIOM_STRATEGY_VAULT_ADDRESS)
      : env.VAULT_ADDRESS
        ? getAddress(env.VAULT_ADDRESS)
        : getAddress(DEPLOYED_ADDRESSES.strategyVault),
    verifier: env.AXIOM_TEE_VERIFIER_ADDRESS
      ? getAddress(env.AXIOM_TEE_VERIFIER_ADDRESS)
      : env.AXIOM_TEE_VERIFIER
        ? getAddress(env.AXIOM_TEE_VERIFIER)
        : getAddress(DEPLOYED_ADDRESSES.teeVerifier),
    paymentProcessor: env.AXIOM_PAYMENT_PROCESSOR_ADDRESS
      ? getAddress(env.AXIOM_PAYMENT_PROCESSOR_ADDRESS)
      : env.PAYMENT_PROCESSOR_ADDRESS
        ? getAddress(env.PAYMENT_PROCESSOR_ADDRESS)
        : getAddress(DEPLOYED_ADDRESSES.paymentProcessor),
  },
});
