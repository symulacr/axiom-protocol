import { Indexer } from "@0gfoundation/0g-storage-ts-sdk";
import { ethers } from "ethers";
import { loadEnv } from "./env.js";
import { fileURLToPath } from "node:url";
import { uploadToStorage } from "@axiom/config/storage/0g";
import { bigintReplacer } from "@axiom/config/types/bigint";
import { createServer } from "node:http";

import {
  POLL_INTERVAL_MS,
  POLL_WINDOW_BLOCKS,
  Watcher,
} from "./watcher.js";
import type { AxiomEvent } from "./events.js";
import { postEvent } from "./sink.js";
import { indexerEnvSchema } from "./env-schema.js";


// Load shared .env before any env reads.
loadEnv(fileURLToPath(new URL("../../.env", import.meta.url)));
const env = indexerEnvSchema.parse(process.env);


function rpcUrl() {
  return env.AXIOM_EVM_RPC;
}

function chainId() {
  return env.AXIOM_CHAIN_ID;
}

function stdoutSink(event: AxiomEvent) {
  console.log(JSON.stringify(event, bigintReplacer));
}

function banner(cid: number) {
  process.stderr.write(
    JSON.stringify({
      level: "info",
      msg: "axiom-indexer starting",
      rpcUrl: rpcUrl(),
      chainId: cid,
      pollWindowBlocks: POLL_WINDOW_BLOCKS.toString(),
      pollIntervalMs: POLL_INTERVAL_MS,
    }) + "\n",
  );
}

const eventBuffer: AxiomEvent[] = [];
const BATCH_INTERVAL = env.STORAGE_BATCH_INTERVAL_MS;
const BATCH_MAX = env.STORAGE_BATCH_MAX_EVENTS;

let _storageIndexer: Indexer | undefined;
let _storageSigner: ethers.Wallet | undefined;
let _storageRpcUrl = "";

let batchTimer: ReturnType<typeof setTimeout> | null = null;

async function flushBuffer(): Promise<void> {
  if (eventBuffer.length === 0) return;
  if (!_storageIndexer || !_storageSigner) return;
  const batch = eventBuffer.splice(0);
  try {
    const payload = new TextEncoder().encode(JSON.stringify(batch, bigintReplacer));
    const result = await uploadToStorage(
      _storageIndexer,
      payload,
      _storageRpcUrl,
      _storageSigner,
    );
    process.stderr.write(
      JSON.stringify({
        level: "debug",
        msg: "batch stored to 0G Storage",
        rootHash: result.rootHash,
        batchSize: batch.length,
        txHash: result.txHash,
      }) + "\n",
    );
  } catch (err) {
    // Re-buffer on failure so events aren't lost
    const MAX_BUFFER_SIZE = 10000;
    for (const _ev of batch) {
      if (eventBuffer.length >= MAX_BUFFER_SIZE) {
        const dropped = eventBuffer.pop();
        console.warn(`[indexer] event buffer full, dropping oldest event: ${dropped?.kind ?? "unknown"}`);
      }
    }
    eventBuffer.unshift(...batch);
    process.stderr.write(
      JSON.stringify({
        level: "warn",
        msg: "batch storage upload failed, events re-buffered",
        err: err instanceof Error ? err.message : String(err),
        batchSize: batch.length,
      }) + "\n",
    );
  }
}

function startBatchTimer(): void {
  if (batchTimer !== null) return;
  batchTimer = setTimeout(async () => {
    stopBatchTimer();
    await flushBuffer();
  }, BATCH_INTERVAL);
}

function stopBatchTimer(): void {
  if (batchTimer !== null) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }
}

type EventSinkConfig =
  | { readonly da: "disabled" }
  | { readonly da: "storage"; storageIndexer: Indexer; storageSigner: ethers.Wallet };

function composeSinks(config: EventSinkConfig, extra: {
  backendUrl: string | undefined;
  rpcUrl: string;
}) {
  return async (event: AxiomEvent) => {
    stdoutSink(event);

    if (extra.backendUrl !== undefined) {
      try {
        const { status } = await postEvent(event, { backendUrl: extra.backendUrl });
        if (status >= 400) {
          process.stderr.write(
            JSON.stringify({
              level: "warn",
              msg: "backend rejected event",
              status,
              kind: event.kind,
              txHash: event.txHash,
            }) + "\n",
          );
        }
      } catch (err) {
        process.stderr.write(
          JSON.stringify({
            level: "error",
            msg: "http sink failed",
            err: err instanceof Error ? err.message : String(err),
          }) + "\n",
        );
      }
    }

    // 0G Storage upload (batched, best-effort)
    if (config.da === "storage") {
      eventBuffer.push(event);
      if (eventBuffer.length >= BATCH_MAX) {
        stopBatchTimer();
        await flushBuffer();
      } else if (batchTimer === null) {
        startBatchTimer();
      }
    }
  };
}

async function main() {
  const startTime = Date.now();
  const cid = chainId();
  const url = rpcUrl();

  // Explicit chainId avoids eth_chainId round-trip.
  const fetchReq = new ethers.FetchRequest(url);
  fetchReq.timeout = 10_000;
  const provider = new ethers.JsonRpcProvider(fetchReq, cid, {
    staticNetwork: true,
  });
  banner(cid);

  // Verify the RPC is actually answering on the expected chain
  const liveChainId = Number((await provider.getNetwork()).chainId);
  if (liveChainId !== cid) {
    process.stderr.write(
      JSON.stringify({
        level: "error",
        msg: "RPC chainId mismatch",
        expected: cid,
        actual: liveChainId,
        rpcUrl: url,
      }) + "\n",
    );
    // Don't crash — let the watcher continue or gracefully degrade
    return;
  }

  //   - INDEXER_DA_ENABLED gates DA (storage) submission.
  //   - BACKEND_URL routes events to POST /v1/events.
  const daEnabled = env.INDEXER_DA_ENABLED === "1"
    || env.INDEXER_DA_ENABLED === "true";
  const backendUrl = env.AXIOM_BACKEND_URL;
  // 0G Storage setup (replaces DA sidecar for event permanence)
  const ogStorageRpc = env.AXIOM_STORAGE_RPC ?? "";
  const DEPLOYER_PK = env.DEPLOYER_PK;
  let storageIndexer: Indexer | undefined;
  let storageSigner: ethers.Wallet | undefined;
  if (ogStorageRpc && DEPLOYER_PK) {
    try {
      storageSigner = new ethers.Wallet(DEPLOYER_PK, provider);
      storageIndexer = new Indexer(ogStorageRpc);
    } catch {
      // non-fatal — storage is best-effort
    }
  }

  _storageIndexer = storageIndexer;
  _storageSigner = storageSigner;
  _storageRpcUrl = url;

  const daConfig: EventSinkConfig = daEnabled && storageIndexer && storageSigner
    ? { da: "storage", storageIndexer, storageSigner }
    : { da: "disabled" };

  const composedSink = composeSinks(daConfig, {
    backendUrl,
    rpcUrl: url,
  });

  const watcher = new Watcher({
    provider,
    sink: composedSink,
  });
  // Health check server for Docker/k8s probes
  const healthPort = env.INDEXER_HEALTH_PORT;
  const healthServer = createServer((req, res) => {
    if (req.url === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "ok",
        chainId: cid,
        lastProcessedBlock: watcher.cursor.toString(),
        uptime: Math.floor((Date.now() - startTime) / 1000),
      }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  healthServer.listen(healthPort);
  process.stderr.write(JSON.stringify({ level: "info", msg: "health server listening", port: healthPort }) + "\n");
  // Graceful shutdown on SIGINT/SIGTERM. We use `Promise.withResolvers()`
  // per the project's `ts-promise-with-resolvers` rule — the explicit
  // executor form is the documented exception, not the default.
  const { promise: shutdown, resolve: resolveShutdown } = Promise.withResolvers<void>();
  const onSignal = (sig: NodeJS.Signals): void => {
    process.stderr.write(JSON.stringify({ level: "info", msg: "shutdown", signal: sig }) + "\n");
    resolveShutdown();
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  const handle = watcher.start();
  await shutdown;
  await handle.stop();
  await new Promise<void>((resolve) => healthServer.close(() => resolve()));
  stopBatchTimer();
  await flushBuffer();
  process.stderr.write(JSON.stringify({ level: "info", msg: "stopped" }) + "\n");
}

// `main()` returns a Promise<void>; we attach a single error handler so
// any unhandled rejection lands on stderr (not swallowed).
main().catch((err: unknown) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  process.stderr.write(JSON.stringify({ level: "error", msg: "fatal", err: message }) + "\n");
  process.exit(1);
});

process.on("unhandledRejection", (reason: unknown) => {
  const err = reason instanceof Error ? reason.stack ?? reason.message : String(reason);
  console.error(JSON.stringify({ level: "error", msg: "unhandledRejection", err, pid: process.pid }));
  process.exit(1);
});
process.on("uncaughtException", (err: Error) => {
  console.error(JSON.stringify({ level: "error", msg: "uncaughtException", err: err.stack ?? err.message, pid: process.pid }));
  process.exit(1);
});
