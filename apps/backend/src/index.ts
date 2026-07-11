import * as Sentry from "@sentry/node";

import { Wallet } from "ethers";
import { resolveAddress } from "@axiom/config/addresses";
import { registerProcessHandlers } from "@axiom/config/process";
import { startServer } from "./server.js";
import { createLogger } from "./utils/logger.js";
import { loadEnv } from "./env.js";
import { getSharedProvider } from "./provider.js";
import { backendEnvSchema } from "./env-schema.js";
import { GALILEO_CHAIN_ID } from "@axiom/config/networks";
import { getEventStore } from "./events/store.js";

loadEnv();

export const env = backendEnvSchema.parse(process.env);
if (env.AXIOM_SENTRY_DSN) {
  Sentry.init({
    dsn: env.AXIOM_SENTRY_DSN,
    environment: process.env.NODE_ENV ?? "development",
  });
}

const provider = getSharedProvider(env.AXIOM_CHAIN_ID ?? GALILEO_CHAIN_ID);
const signer = new Wallet(env.DEPLOYER_PK, provider);
const server = startServer({
  bind: env.AXIOM_BIND,
  port: env.PORT ?? env.AXIOM_PORT ?? 3000,
  env,
  evmRpc: env.AXIOM_EVM_RPC,
  signer,
  oracleBaseUrl: env.AXIOM_ORACLE_URL,
  addresses: {
    agentNft: resolveAddress("agentNft", env),
    vault: resolveAddress("strategyVault", env),
    verifier: resolveAddress("teeVerifier", env),
    paymentProcessor: resolveAddress("paymentProcessor", env),
  },
});

let shuttingDown = false;
const onSignal = (sig: NodeJS.Signals): void => {
  if (shuttingDown) return;
  shuttingDown = true;
  createLogger("server").info("shutdown", { signal: sig });
  void (async () => {
    await getEventStore().flush();
    server.httpServer.closeAllConnections?.();
    server.httpServer.close(() => process.exit(0));
  })();
};
process.on("SIGTERM", onSignal);
process.on("SIGINT", onSignal);
registerProcessHandlers();
