import { Indexer } from "@0gfoundation/0g-storage-ts-sdk";
import { ethers } from "ethers";
import { loadEnv } from "@axiom/config/env";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { uploadToStorage } from "@axiom/config/storage/0g";
import { bigintReplacer } from "@axiom/config";
import { createServer } from "node:http";

import {
  POLL_INTERVAL_MS,
  Watcher,
  buildDefaultWatchList,
} from "./watcher.js";
import { resolveIndexerAddresses } from "./events.js";
import type { AxiomEvent } from "./events.js";
import { postEvent } from "./sink.js";
import { indexerEnvSchema } from "./env-schema.js";

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

function banner(cid: number, pollWindow: bigint) {
  process.stderr.write(
    JSON.stringify({
      level: "info",
      msg: "axiom-indexer starting",
      rpcUrl: rpcUrl(),
      chainId: cid,
      pollWindowBlocks: pollWindow.toString(),
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

let _flushLock = false;

let batchTimer: ReturnType<typeof setTimeout> | null = null;

async function flushBuffer(): Promise<void> {
  if (_flushLock) return;
  if (eventBuffer.length === 0) return;
  if (!_storageIndexer || !_storageSigner) return;
  _flushLock = true;
  const batch = eventBuffer.splice(0);
  try {
    const payload = new TextEncoder().encode(
      JSON.stringify(batch, bigintReplacer),
    );
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
    const MAX_BUFFER_SIZE = 10000;
    while (eventBuffer.length + batch.length > MAX_BUFFER_SIZE && eventBuffer.length > 0) {
      const dropped = eventBuffer.shift();
      try {
        const dlqDir = join(".data", "dlq");
        mkdirSync(dlqDir, { recursive: true });
        const dlqFile = join(dlqDir, `dropped-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
        writeFileSync(dlqFile, JSON.stringify(dropped, bigintReplacer));
      } catch { /* best-effort */ }
      console.warn(
        `[indexer] event buffer full, dropping oldest event: ${dropped?.kind ?? "unknown"}`,
      );
    }
    eventBuffer.push(...batch);
    process.stderr.write(
      JSON.stringify({
        level: "warn",
        msg: "batch storage upload failed, events re-buffered",
        err: err instanceof Error ? err.message : String(err),
        batchSize: batch.length,
      }) + "\n",
    );
  } finally {
    _flushLock = false;
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
  | {
      readonly da: "storage";
      storageIndexer: Indexer;
      storageSigner: ethers.Wallet;
    };

function composeSinks(
  config: EventSinkConfig,
  extra: {
    backendUrl: string | undefined;
    rpcUrl: string;
    chainId: number;
    apiKey: string | undefined;
    indexerKey: string | undefined;
  },
) {
  return async (event: AxiomEvent) => {
    stdoutSink(event);

    if (extra.backendUrl !== undefined) {
      // Rethrow on failure so the watcher does not advance past undelivered blocks.
      const { status } = await postEvent(event, {
        backendUrl: extra.backendUrl,
        chainId: extra.chainId,
        apiKey: extra.apiKey,
        indexerKey: extra.indexerKey,
      });
      if (status >= 400) {
        throw new Error(
          `backend rejected event status=${status} kind=${event.kind} tx=${event.txHash}`,
        );
      }
    }

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

  const fetchReq = new ethers.FetchRequest(url);
  fetchReq.timeout = 10_000;
  const provider = new ethers.JsonRpcProvider(fetchReq, cid, {
    staticNetwork: true,
  });
  const pollWindow = BigInt(env.INDEXER_POLL_WINDOW_BLOCKS);
  banner(cid, pollWindow);

  const liveChainId = Number((await provider.getNetwork()).chainId);
  if (liveChainId !== cid) {
    process.stderr.write(
      JSON.stringify({
        level: "warn",
        msg: "RPC chainId mismatch — continuing with configured chainId",
        expected: cid,
        actual: liveChainId,
        rpcUrl: url,
      }) + "\n",
    );
  }

  const storageEnabled =
    env.INDEXER_STORAGE_ENABLED === "1" || env.INDEXER_STORAGE_ENABLED === "true";
  const backendUrl = env.AXIOM_BACKEND_URL;
  const ogStorageRpc = env.AXIOM_STORAGE_RPC ?? "";
  const DEPLOYER_PK = env.DEPLOYER_PK;
  let storageIndexer: Indexer | undefined;
  let storageSigner: ethers.Wallet | undefined;
  if (ogStorageRpc && DEPLOYER_PK) {
    try {
      storageSigner = new ethers.Wallet(DEPLOYER_PK, provider);
      storageIndexer = new Indexer(ogStorageRpc);
    } catch { /* storage signer setup failed — skip */ }
  }

  _storageIndexer = storageIndexer;
  _storageSigner = storageSigner;
  _storageRpcUrl = url;

  const daConfig: EventSinkConfig =
    storageEnabled && storageIndexer && storageSigner
      ? { da: "storage", storageIndexer, storageSigner }
      : { da: "disabled" };

  const composedSink = composeSinks(daConfig, {
    backendUrl,
    rpcUrl: url,
    chainId: cid,
    apiKey: env.AXIOM_API_KEY,
    indexerKey: env.AXIOM_INDEXER_API_KEY,
  });

  const contractAddresses = resolveIndexerAddresses(
    process.env as Record<string, unknown>,
  );
  process.stderr.write(
    JSON.stringify({
      level: "info",
      msg: "indexer contract addresses",
      agentNft: contractAddresses.AXIOM_AGENT_NFT,
      strategyVault: contractAddresses.AXIOM_STRATEGY_VAULT,
    }) + "\n",
  );

  const watcher = new Watcher({
    provider,
    sink: composedSink,
    watchList: buildDefaultWatchList(contractAddresses),
    pollWindow,
    ...(env.INDEXER_START_BLOCK !== undefined
      ? { startBlock: BigInt(env.INDEXER_START_BLOCK) }
      : {}),
  });
  const healthPort = env.PORT ?? env.INDEXER_HEALTH_PORT;
  const healthServer = createServer((req, res) => {
    if (req.url === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          chainId: cid,
          lastProcessedBlock: watcher.cursor.toString(),
          uptime: Math.floor((Date.now() - startTime) / 1000),
        }),
      );
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  healthServer.listen(healthPort);
  process.stderr.write(
    JSON.stringify({
      level: "info",
      msg: "health server listening",
      port: healthPort,
    }) + "\n",
  );
  const { promise: shutdown, resolve: resolveShutdown } =
    Promise.withResolvers<void>();
  const onSignal = (sig: NodeJS.Signals): void => {
    process.stderr.write(
      JSON.stringify({ level: "info", msg: "shutdown", signal: sig }) + "\n",
    );
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
  process.stderr.write(
    JSON.stringify({ level: "info", msg: "stopped" }) + "\n",
  );
}

main().catch((err: unknown) => {
  const message =
    err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(
    JSON.stringify({ level: "error", msg: "fatal", err: message }) + "\n",
  );
  process.exit(1);
});

process.on("unhandledRejection", (reason: unknown) => {
  const err =
    reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
  console.error(
    JSON.stringify({
      level: "error",
      msg: "unhandledRejection",
      err,
      pid: process.pid,
    }),
  );
  process.exit(1);
});
process.on("uncaughtException", (err: Error) => {
  console.error(
    JSON.stringify({
      level: "error",
      msg: "uncaughtException",
      err: err.stack ?? err.message,
      pid: process.pid,
    }),
  );
  process.exit(1);
});
