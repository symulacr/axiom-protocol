import * as Sentry from "@sentry/node";

import { type ethers, Wallet } from "ethers";
import { resolveAddress } from "@axiom/config/addresses";
import { registerProcessHandlers } from "@axiom/config/process";
import { startServer, type ServerConfig } from "./server.js";
import { createLogger } from "./utils/logger.js";
import { loadEnv } from "@axiom/config/env";
import { getSharedProvider } from "./provider.js";
import { backendEnvSchema } from "./env-schema.js";
import { ARISTOTLE_CHAIN_ID } from "@axiom/config/networks";
import { getEventStore } from "./events/store.js";
import { IndexerService } from "./indexer/index.js";

loadEnv();

const env = backendEnvSchema.parse(process.env);
if (env.AXIOM_SENTRY_DSN) {
  Sentry.init({
    dsn: env.AXIOM_SENTRY_DSN,
    environment: process.env.NODE_ENV ?? "development",
  });
}

const provider = getSharedProvider(env.AXIOM_CHAIN_ID ?? ARISTOTLE_CHAIN_ID);
// The backend runtime signer must NOT be the deployer/upgrader key. Use a
// dedicated key in production; fall back to DEPLOYER_PK only for local dev.
const signer = new Wallet(env.AXIOM_RUNTIME_SIGNER_PK ?? env.DEPLOYER_PK, provider);

// On the live chain (0G mainnet), contracts deployed only on testnet have no
// bytecode, so on-chain reads revert and crash with a 500. Omit any address
// whose code is empty on the live chain so the existing guards return a clean
// 503 ("address not configured") instead of a 500 revert.
async function resolveLiveAddresses(
  chainProvider: ethers.JsonRpcProvider,
  backendEnv: typeof env,
): Promise<Partial<NonNullable<ServerConfig["addresses"]>>> {
  const resolved = {
    agentNft: resolveAddress("agentNft", backendEnv),
    vault: resolveAddress("strategyVault", backendEnv),
    verifier: resolveAddress("teeVerifier", backendEnv),
    paymentProcessor: resolveAddress("paymentProcessor", backendEnv),
  };
  const live: Partial<typeof resolved> = {};
  await Promise.all(
    (Object.keys(resolved) as (keyof typeof resolved)[]).map(async (key) => {
      const addr = resolved[key];
      try {
        const code = await chainProvider.getCode(addr);
        if (code && code !== "0x") {
          live[key] = addr;
          return true;
        }
      } catch {
        // Unverifiable on the live chain → omit to degrade gracefully.
      }
      return false;
    }),
  );
  return live;
}

async function main(): Promise<void> {
  const addresses = await resolveLiveAddresses(provider, env);
  const server = startServer({
    bind: env.AXIOM_BIND,
    port: env.PORT ?? env.AXIOM_PORT ?? 3000,
    env,
    evmRpc: env.AXIOM_EVM_RPC,
    signer,
    oracleBaseUrl: env.AXIOM_ORACLE_URL,
    addresses: addresses as ServerConfig["addresses"],
  });
  // Start background indexer (polls chain events → EventStore)
  const indexer = new IndexerService({ provider, env });
  indexer.start();

  let shuttingDown = false;
  const onSignal = (sig: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    createLogger("server").info("shutdown", { signal: sig });
    void (async () => {
      indexer.stop();
      await getEventStore().flush();
      server.httpServer.closeAllConnections?.();
      server.httpServer.close(() => process.exit(0));
    })();
  };
  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);
  registerProcessHandlers();
}

void main().catch((err) => {
  const e = err instanceof Error ? err : new Error(String(err));
  createLogger("server").error("Fatal startup error", {
    message: e.message,
    stack: e.stack,
  });
  process.exit(1);
});
