import { Wallet } from "ethers";
import {
  resolveAddress,
  resolveAddressOptional,
} from "@axiom/config/addresses";
import { startServer, type ServerConfig } from "./server.js";
import { createLogger } from "./utils/logger.js";
import { initSentry } from "./utils/logger.js";
import { loadEnv } from "@axiom/config/env";
import { createStaticProvider, getSharedProvider } from "./providers.js";
import { backendEnvSchema } from "./env-schema.js";
import { ARISTOTLE_CHAIN_ID, resolveStorageRpc } from "@axiom/config/networks";
import { ZeroGStorage, type StorageAdapter } from "@axiom/config/storage/0g";

import { getEventStore } from "./events/store.js";
import { IndexerService } from "./indexer/index.js";
import { startKeeper } from "./keepers/index.js";

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
  chainProvider: Awaited<ReturnType<typeof getSharedProvider>>,
  backendEnv: typeof env,
): Promise<Partial<NonNullable<ServerConfig["addresses"]>>> {
  const resolved = {
    agentNft: resolveAddress("agentNft", backendEnv),
    vault: resolveAddress("strategyVault", backendEnv),
    verifier: resolveAddress("teeVerifier", backendEnv),
    paymentProcessor: resolveAddress("paymentProcessor", backendEnv),
    // V3 W3-B: facade contracts are optional until the deploy lane publishes
    // them — omitted addresses keep the routes 503ing cleanly instead of
    // failing boot.
    delegationRegistry: resolveAddressOptional(
      "delegationRegistry",
      backendEnv,
    ),
  };
  const live: Partial<typeof resolved> = {};
  await Promise.all(
    (Object.keys(resolved) as (keyof typeof resolved)[]).map(async (key) => {
      const addr = resolved[key];
      if (!addr) {
        console.warn(
          `[boot] ${key} address not configured — omitted; related routes will 503`,
        );
        return false;
      }
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
  // S-4: bind shutdown listeners BEFORE the async boot (address resolution hits the
  // RPC; storage construction follows). A SIGTERM during boot must still drain —
  // the pre-server guard below defers the drain until the EventStore exists, so a
  // kill mid-boot exits fast instead of voiding the flush the handler protects.
  let shuttingDown = false;
  let drain: () => Promise<void> = async () => {};
  const onSignal = (sig: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    createLogger("server").info("shutdown", { signal: sig });
    const forceExit = setTimeout(() => process.exit(1), 10_000);
    forceExit.unref();
    void drain().then(() => process.exit(0));
  };
  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);
  registerProcessHandlers();

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

  // Proof-cleanup keeper (ADR-003 wave I3): OFF by default — null unless
  // AXIOM_KEEPER_MODE enables it, so current deploys are unchanged.
  const keeper = startKeeper({ env });
  // S-4: server + indexer now exist — arm the real drain for the early-bound listener.
  drain = async () => {
    keeper?.stop();
    await indexer.stop(); // final checkpoint rename completes first
    await getEventStore().flush();
    server.httpServer.closeAllConnections?.();
    server.httpServer.close(() => process.exit(0));
  };
}

void main().catch((err) => {
  const e = err instanceof Error ? err : new Error(String(err));
  createLogger("server").error("Fatal startup error", {
    message: e.message,
    stack: e.stack,
  });
  process.exit(1);
});

// ---- process lifecycle (absorbed from @axiom/config/process; sole consumer) ----

export function registerProcessHandlers(): void {
  // console.error in fatal handlers is the sanctioned channel before exit(1).
  const fatal = (msg: string, error: unknown): void => {
    console.error(
      JSON.stringify({
        level: "error",
        msg,
        error,
        pid: process.pid,
      }),
    );
    process.exit(1);
  };

  process.on("unhandledRejection", (reason: unknown) => {
    fatal(
      "unhandledRejection",
      reason instanceof Error
        ? (reason.stack ?? reason.message)
        : String(reason),
    );
  });

  process.on("uncaughtException", (err: Error) => {
    fatal("uncaughtException", err.stack ?? err.message);
  });
}
