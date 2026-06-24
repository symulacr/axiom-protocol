import { Indexer } from "@0gfoundation/0g-storage-ts-sdk";
import { ethers } from "ethers";
import { loadEnv, getEnvWithAlias } from "./env.js";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { GALILEO_CHAIN_ID, OG_NETWORKS } from "@axiom/config/networks";
import { uploadToStorage } from "@axiom/config/storage/0g";

import {
  POLL_INTERVAL_MS,
  POLL_WINDOW_BLOCKS,
  Watcher,
} from "./watcher.js";
import type { AxiomEvent } from "./events.js";
import { postEvent } from "./sink.js";
import { submitEvent, submitBatch, makeRealSubmitterFromClient } from "./da.js";
import type { SubmitFn } from "./da.js";
import { DaClient } from "./da-client.js";

// Load shared .env before any env reads.
loadEnv(fileURLToPath(new URL("../../.env", import.meta.url)));

const DEFAULT_RPC_URL = OG_NETWORKS[GALILEO_CHAIN_ID]?.evmRpc ?? "https://evmrpc-testnet.0g.ai";

function rpcUrl() {
  return getEnvWithAlias("AXIOM_EVM_RPC", ["OG_RPC_URL", "RPC_URL"], DEFAULT_RPC_URL);
}

function chainId() {
  const raw = getEnvWithAlias("AXIOM_CHAIN_ID", ["OG_CHAIN_ID"], String(GALILEO_CHAIN_ID));
  if (raw === "") return GALILEO_CHAIN_ID;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`AXIOM_CHAIN_ID is not a positive integer: ${raw}`);
  }
  return n;
}

function stdoutSink(event: AxiomEvent) {
  console.log(JSON.stringify(event, bigintReplacer));
}

function bigintReplacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
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
const BATCH_INTERVAL = parseInt(process.env["STORAGE_BATCH_INTERVAL_MS"] ?? "5000");
const BATCH_MAX = parseInt(process.env["STORAGE_BATCH_MAX_EVENTS"] ?? "10");

const DA_BATCH_INTERVAL = parseInt(process.env["DA_BATCH_INTERVAL_MS"] ?? "5000");
const DA_BATCH_MAX = parseInt(process.env["DA_BATCH_MAX_EVENTS"] ?? "100");

let _storageIndexer: Indexer | undefined;
let _storageSigner: ethers.Wallet | undefined;
let _storageRpcUrl = "";

let _daSubmitFn: SubmitFn | undefined;

let batchTimer: ReturnType<typeof setTimeout> | null = null;

let daEventBuffer: AxiomEvent[] = [];
let daBatchTimer: ReturnType<typeof setTimeout> | null = null;

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

async function flushDaBuffer(): Promise<void> {
  if (daEventBuffer.length === 0) return;
  if (!_daSubmitFn) return;
  const batch = daEventBuffer.splice(0, DA_BATCH_MAX);
  try {
    await submitBatch(batch, { submitFn: _daSubmitFn });
    process.stderr.write(
      JSON.stringify({
        level: "debug",
        msg: "batch submitted to 0G DA",
        batchSize: batch.length,
      }) + "\n",
    );
  } catch (err) {
    // Re-buffer on failure so events aren't lost (same pattern as storage)
    daEventBuffer.unshift(...batch);
    process.stderr.write(
      JSON.stringify({
        level: "warn",
        msg: "batch DA submission failed, events re-buffered",
        err: err instanceof Error ? err.message : String(err),
        batchSize: batch.length,
      }) + "\n",
    );
  }
}

function startDaBatchTimer(): void {
  if (daBatchTimer !== null) return;
  daBatchTimer = setTimeout(async () => {
    stopDaBatchTimer();
    await flushDaBuffer();
  }, DA_BATCH_INTERVAL);
}

function stopDaBatchTimer(): void {
  if (daBatchTimer !== null) {
    clearTimeout(daBatchTimer);
    daBatchTimer = null;
  }
}

type EventSinkConfig =
  | { readonly da: "disabled" }
  | { readonly da: "grpc"; grpcUrl: string }
  | { readonly da: "storage"; storageIndexer: Indexer; storageSigner: ethers.Wallet };

function composeSinks(config: EventSinkConfig, extra: {
  backendUrl: string | undefined;
  rpcUrl: string;
  grpcClient?: DaClient;
}) {
  const grpcSubmitFn: SubmitFn | undefined =
    config.da === "grpc" && extra.grpcClient
      ? makeRealSubmitterFromClient(extra.grpcClient)
      : undefined;
  _daSubmitFn = grpcSubmitFn;

  return async (event: AxiomEvent) => {
    switch (config.da) {
      case "disabled":
        break;
      case "grpc":
        // Buffer events for batched DA submission (~1000x cost reduction)
        daEventBuffer.push(event);
        if (daEventBuffer.length >= DA_BATCH_MAX) {
          stopDaBatchTimer();
          await flushDaBuffer();
        } else if (daBatchTimer === null) {
          startDaBatchTimer();
        }
        break;
      case "storage":
        break;
    }

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

  //   - INDEXER_DA_ENABLED gates DA submission.
  //   - DA_GRPC_URL points to the 0G DA Client gRPC endpoint.
  //   - BACKEND_URL routes events to POST /v1/events.
  const daEnabled = process.env["INDEXER_DA_ENABLED"] === "1"
    || process.env["INDEXER_DA_ENABLED"] === "true";
  const backendUrl = process.env["BACKEND_URL"];
  const daGrpcUrl = process.env["DA_GRPC_URL"] ?? process.env["OG_DA_GRPC_URL"];

  // 0G Storage setup (replaces DA sidecar for event permanence)
  const ogStorageRpc = getEnvWithAlias("AXIOM_STORAGE_RPC", ["OG_STORAGE_RPC"], "");
  const DEPLOYER_PK = process.env["DEPLOYER_PK"];
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

  const daConfig: EventSinkConfig = daEnabled && daGrpcUrl
    ? { da: "grpc", grpcUrl: daGrpcUrl }
    : daEnabled && storageIndexer && storageSigner
      ? { da: "storage", storageIndexer, storageSigner }
      : { da: "disabled" };

  const grpcClient = daConfig.da === "grpc" && typeof daConfig.grpcUrl === "string"
    ? new DaClient(daConfig.grpcUrl)
    : undefined;

  const healthPort = parseInt(process.env["HEALTH_PORT"] ?? "9091", 10);
  const healthServer = grpcClient
    ? startHealthServer(healthPort, () => grpcClient.connected)
    : undefined;

  const composedSink = composeSinks(daConfig, {
    backendUrl,
    rpcUrl: url,
    grpcClient,
  });

  const watcher = new Watcher({
    provider,
    sink: composedSink,
  });
  // Graceful shutdown on SIGINT / SIGTERM. We use `Promise.withResolvers()`
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
  stopBatchTimer();
  await flushBuffer();
  stopDaBatchTimer();
  await flushDaBuffer();
  if (healthServer) healthServer.close();
  if (grpcClient) grpcClient.close();
  process.stderr.write(JSON.stringify({ level: "info", msg: "stopped" }) + "\n");
}

/** HTTP health endpoint — returns 200 if DA gRPC is connected, 503 otherwise. */
function startHealthServer(port: number, daConnected: () => boolean) {
  const server = createServer((req, res) => {
    if (req.url === "/health") {
      const healthy = daConnected();
      res.writeHead(healthy ? 200 : 503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: healthy ? "ok" : "degraded",
        da: healthy ? "connected" : "disconnected",
      }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(port);
  return server;
}

// `main()` returns a Promise<void>; we attach a single error handler so
// any unhandled rejection lands on stderr (not swallowed).
main().catch((err: unknown) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  process.stderr.write(JSON.stringify({ level: "error", msg: "fatal", err: message }) + "\n");
  process.exit(1);
});
