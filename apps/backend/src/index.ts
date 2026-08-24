import { type ethers, Wallet } from "ethers";
import { resolveAddress } from "@axiom/config/addresses";
import { registerProcessHandlers } from "@axiom/config/process";
import { startServer, type ServerConfig } from "./server.js";
import { createLogger } from "./utils/logger.js";
import { initSentry } from "./utils/sentry.js";
import { loadEnv } from "@axiom/config/env";
import { getSharedProvider } from "./provider.js";
import { backendEnvSchema } from "./env-schema.js";
import { ARISTOTLE_CHAIN_ID, resolveStorageRpc } from "@axiom/config/networks";
import { ZeroGStorage, type StorageAdapter } from "@axiom/config/storage/0g";
import { createStaticProvider } from "./compute/index.js";
import { getEventStore } from "./events/store.js";
import { IndexerService } from "./indexer/index.js";

loadEnv();

const env = backendEnvSchema.parse(process.env);

const provider = getSharedProvider(env.AXIOM_CHAIN_ID ?? ARISTOTLE_CHAIN_ID);
const signer = new Wallet(
  // runtime signer must not be the deployer/upgrader key; dedicated key in prod, DEPLOYER_PK only for local dev
  env.AXIOM_RUNTIME_SIGNER_PK ?? env.DEPLOYER_PK,
  provider,
);

/** AXIOM_STORAGE_FEE (hex or decimal string) → bigint wei; undefined when unset. Passed to ZeroGStorage so uploads skip market() pricing on chains whose flow contract lacks market() (e.g. Galileo testnet). */
function parseStorageFee(): bigint | undefined {
  const raw = process.env.AXIOM_STORAGE_FEE;
  if (raw === undefined || raw.trim() === "") return undefined;
  const s = raw.trim();
  if (/^0x[0-9a-fA-F]+$/.test(s) || /^\d+$/.test(s)) return BigInt(s);
  throw new Error(
    `AXIOM_STORAGE_FEE must be a hex (0x…) or decimal string, got: ${raw}`,
  );
}

// Testnet-only contracts have no live-chain bytecode, so on-chain reads revert (500); omit empty-code addresses so existing guards return a clean 503 ("address not configured").
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
        console.warn(
          `[boot] ${key} at ${addr} has no bytecode — omitted; related routes will 503`,
        );
      } catch (err) {
        console.warn(
          `[boot] could not verify ${key} at ${addr}: ${
            err instanceof Error ? err.message : String(err)
          } — omitted`,
        );
      }
      return false;
    }),
  );
  return live;
}

async function main(): Promise<void> {
  // Lazy: @sentry/node loads only when a DSN is configured; awaited before startServer
  // so the express error handler registers with Sentry already initialized.
  await initSentry(env);
  const addresses = await resolveLiveAddresses(provider, env);
  // Chat-transcript persistence on 0G, same env contract as the oracle. Absent indexer RPC ⇒
  // persistence disabled with a boot warning — the backend must still serve chat without storage.
  let chatStorage: StorageAdapter | null = null;
  // Chain-driven fallback: unset indexer RPC derives from AXIOM_CHAIN_ID via the networks
  // table (16602→testnet indexer, 16661→mainnet) — explicit env always wins.
  const storageIndexerRpc =
    process.env.AXIOM_STORAGE_INDEXER_RPC ??
    resolveStorageRpc(env.AXIOM_CHAIN_ID ?? ARISTOTLE_CHAIN_ID);
  if (storageIndexerRpc) {
    const storageEvmRpc =
      process.env.AXIOM_STORAGE_EVM_RPC ?? env.AXIOM_EVM_RPC;
    chatStorage = new ZeroGStorage({
      indexerRpc: storageIndexerRpc,
      evmRpc: storageEvmRpc,
      signer: new Wallet(
        process.env.AXIOM_STORAGE_PRIVATE_KEY ?? env.AXIOM_TEE_SIGNER_PK,
        // The 0G SDK's upload broadcasts a tx through this signer; an unbound Wallet throws
        // UNSUPPORTED_OPERATION. Bind it to the same EVM RPC the upload targets, reusing the
        // backend's createStaticProvider helper instead of a hand-rolled provider.
        createStaticProvider(storageEvmRpc),
      ),
      fee: parseStorageFee(),
    });
    console.log(
      `[boot] chat transcript storage: 0G Storage (${storageIndexerRpc})`,
    );
  } else {
    console.warn(
      "[boot] chat transcript storage: disabled — set AXIOM_STORAGE_INDEXER_RPC to persist chat transcripts to 0G",
    );
  }
  const server = startServer({
    bind: env.AXIOM_BIND,
    port: env.PORT ?? env.AXIOM_PORT ?? 3000,
    env,
    evmRpc: env.AXIOM_EVM_RPC,
    signer,
    chatStorage,
    addresses: addresses as ServerConfig["addresses"],
  });
  const indexer = new IndexerService({ provider, env });
  indexer.start();

  let shuttingDown = false;
  const onSignal = (sig: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    createLogger("server").info("shutdown", { signal: sig });
    // Bound the drain: a refusing socket must not turn graceful shutdown into
    // SIGKILL-by-orchestrator (which would void the EventStore flush).
    const forceExit = setTimeout(() => process.exit(1), 10_000);
    forceExit.unref();
    void (async () => {
      await indexer.stop(); // final checkpoint rename completes first
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
