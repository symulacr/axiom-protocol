import { FetchRequest, JsonRpcProvider, Wallet } from "ethers";
import { resolveAddress } from "@axiom/config/addresses";
import { startServer } from "./server.js";
import { loadEnv } from "./env.js";
import { backendEnvSchema } from "./env-schema.js";
import { GALILEO_CHAIN_ID } from "@axiom/config/networks";
import { getEventStore } from "./events/store.js";

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
const server = startServer({
  bind: env.AXIOM_BIND,
  port: env.AXIOM_PORT ?? env.PORT ?? 3000,
  env,
  evmRpc: env.AXIOM_EVM_RPC,
  storageRpc: env.AXIOM_STORAGE_RPC,
  signer,
  oracleBaseUrl: env.AXIOM_ORACLE_URL,
  addresses: {
    agentNft: resolveAddress("agentNft", env),
    vault: resolveAddress("strategyVault", env),
    verifier: resolveAddress("teeVerifier", env),
    paymentProcessor: resolveAddress("paymentProcessor", env),
  },
});

const onSignal = (sig: NodeJS.Signals): void => {
  console.log(JSON.stringify({ level: "info", msg: "shutdown", signal: sig }));
  getEventStore().flush();
  server.httpServer.closeAllConnections?.();
  server.httpServer.close(() => process.exit(0));
};
process.on("SIGTERM", onSignal);
process.on("SIGINT", onSignal);

process.on("unhandledRejection", (reason: unknown) => {
  const err = reason instanceof Error ? reason.stack ?? reason.message : String(reason);
  console.error(JSON.stringify({ level: "error", msg: "unhandledRejection", err, pid: process.pid }));
  process.exit(1);
});
process.on("uncaughtException", (err: Error) => {
  console.error(JSON.stringify({ level: "error", msg: "uncaughtException", err: err.stack ?? err.message, pid: process.pid }));
  process.exit(1);
});
