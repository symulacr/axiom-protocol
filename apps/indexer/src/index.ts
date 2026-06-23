// apps/indexer/src/index.ts
//
// Long-running on-chain event indexer for the Axiom Protocol.
//
// Behaviour:
//   1. Connect to 0G Galileo testnet via HTTP RPC (env: `OG_RPC_URL`,
//      default `https://0g-galileo-testnet.drpc.org`, chainId 16602).
//      Ref: https://docs.0g.ai/ai-context
//   2. Poll the chain every 12 s, 50 blocks at a time, for events emitted
//      by AxiomAgentNFT (ERC-1967 proxy at `0xf12F158a20c36a351b056FD60b3a7377ce4F1e09`)
//      and AxiomStrategyVault (`0xb7F89e50D5A3039Da7d39528436B820371572874`).
//   3. Decode each log using the event-signature table in `events.ts` and
//      print it to stdout as one JSON object per line.
//   4. On SIGINT / SIGTERM, stop the loop cleanly and exit.
//
// Future work (NOT in this starter):
//   - Submit each emitted event to 0G DA (gRPC `DisperseBlob` on the
//     0G DA Client container, port 51001). The backend orchestration
//     layer at `apps/backend/src/orchestrator/index.ts` will own this
//     interface; this indexer should publish to a queue (NATS / Redis
//     Streams / direct gRPC) that the orchestrator subscribes to.
//     Ref: https://docs.0g.ai/developer-hub/building-on-0g/da-integration
//   - Persist the last polled block to `apps/indexer/data/checkpoint.json`
//     and resume on restart. Right now we start from `head - window`.

import { Indexer, MemData } from "@0gfoundation/0g-storage-ts-sdk";
import { ethers } from "ethers";
import { loadEnv } from "./env.js";
import { fileURLToPath } from "node:url";

import {
  POLL_INTERVAL_MS,
  POLL_WINDOW_BLOCKS,
  Watcher,
  SOURCES,
} from "./watcher.js";
import type { AxiomEvent } from "./events.js";
import { postEvent } from "./sink.js";
import { submitEvent, makeRealSubmitter } from "./da.js";

// Load shared .env from repo root before any env reads.
loadEnv(fileURLToPath(new URL("../../.env", import.meta.url)));

/** 0G Galileo testnet. Source: https://docs.0g.ai/ai-context */
const DEFAULT_RPC_URL = "https://evmrpc-testnet.0g.ai";
/** 0G Galileo chain id (0x40DA). Source: https://docs.0g.ai/ai-context */
const DEFAULT_CHAIN_ID = 16602;

function rpcUrl() {
  return process.env["OG_RPC_URL"] ?? DEFAULT_RPC_URL;
}

function chainId() {
  const raw = process.env["OG_CHAIN_ID"];
  if (raw === undefined || raw === "") return DEFAULT_CHAIN_ID;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`OG_CHAIN_ID is not a positive integer: ${raw}`);
  }
  return n;
}

/** Default sink: one JSON object per line on stdout. */
function stdoutSink(event: AxiomEvent) {
  // We deliberately do NOT spread the bigint fields; the JSON.stringify
  // replacer below stringifies them so the output is valid JSON.
  console.log(JSON.stringify(event, bigintReplacer));
}

function bigintReplacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}

/**
 * Banner emitted on startup so the operator can see the indexer is live
 * and which contracts it's watching. Goes to stderr (stdout is reserved
 * for event JSON lines, the canonical machine-readable stream).
 */
function banner(cid: number) {
  process.stderr.write(
    JSON.stringify({
      level: "info",
      msg: "axiom-indexer starting",
      rpcUrl: rpcUrl(),
      chainId: cid,
      pollWindowBlocks: POLL_WINDOW_BLOCKS.toString(),
      pollIntervalMs: POLL_INTERVAL_MS,
      sources: SOURCES,
    }) + "\n",
  );
}

// --- 0G Storage event batching ---
//
// Instead of uploading each event individually (each costs ~0.0012 OG in gas),
// we buffer events and upload them as a batch JSON array blob.
const eventBuffer: AxiomEvent[] = [];
const BATCH_INTERVAL = parseInt(process.env["STORAGE_BATCH_INTERVAL_MS"] ?? "5000");
const BATCH_MAX = parseInt(process.env["STORAGE_BATCH_MAX_EVENTS"] ?? "10");

/** Module-level handles for 0G Storage (set once in main()). */
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
    const [tx] = await _storageIndexer.upload(
      new MemData(payload),
      _storageRpcUrl,
      _storageSigner,
    );
    if (tx) {
      const rootHash = "rootHash" in tx ? tx.rootHash : tx.rootHashes[0];
      const txHash = "txHash" in tx ? tx.txHash : tx.txHashes[0];
      if (rootHash === undefined || txHash === undefined) {
        throw new Error("Storage upload returned no root hash");
      }
      process.stderr.write(
        JSON.stringify({
          level: "debug",
          msg: "batch stored to 0G Storage",
          rootHash,
          batchSize: batch.length,
          txHash,
        }) + "\n",
      );
    }
  } catch (err) {
    // Re-buffer on failure so events are not lost
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
  | { readonly da: "grpc"; grpcUrl: string }
  | { readonly da: "storage"; storageIndexer: Indexer; storageSigner: ethers.Wallet };

/**
 * Build the composed `EventSink` used by the watcher. The base sink is stdout.
 */
function composeSinks(config: EventSinkConfig, extra: {
  backendUrl: string | undefined;
  rpcUrl: string;
}) {
  return async (event: AxiomEvent) => {
    switch (config.da) {
      case "disabled":
        break;
      case "grpc": {
        const submitFn = makeRealSubmitter(config.grpcUrl);
        try {
          await submitEvent(event, { submitFn });
        } catch (err) {
          process.stderr.write(
            JSON.stringify({
              level: "error",
              msg: "da submit failed",
              err: err instanceof Error ? err.message : String(err),
            }) + "\n",
          );
        }
        break;
      }
      case "storage":
        try {
          await submitEvent(event, {});
        } catch (err) {
          process.stderr.write(
            JSON.stringify({
              level: "error",
              msg: "da submit failed",
              err: err instanceof Error ? err.message : String(err),
            }) + "\n",
          );
        }
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

  // ethers v6: `JsonRpcProvider(url, network, options)`. Passing the
  // explicit chainId avoids an extra `eth_chainId` round-trip and lets
  // ethers throw a clear "chainId mismatch" error if the RPC is wrong.
  // Ref: https://docs.ethers.org/v6/api/providers/#JsonRpcProvider
  const provider = new ethers.JsonRpcProvider(url, cid, {
    staticNetwork: true,
  });
  banner(cid);

  // Verify the RPC is actually answering on the expected chain.
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
    process.exit(1);
  }

  //   - `INDEXER_DA_ENABLED` gates the DA submitter (apps/indexer/src/da.ts).
  //     When true, every decoded event is submitted to 0G DA *before* the
  //     stdout sink fires so a slow / failing DA cannot block the indexer
  //     but a successful DA submit is observable to the operator.
  //   - `DA_GRPC_URL` points to the 0G DA Client gRPC endpoint (default
  //     port 51001). The DA Client sidecar handles gas payment, so the
  //     indexer no longer needs a private key or signer.
  //   - `BACKEND_URL` (when set) routes events to the backend's
  //     POST /v1/events via postEvent. Default sink remains stdout.
  const daEnabled = process.env["INDEXER_DA_ENABLED"] === "1"
    || process.env["INDEXER_DA_ENABLED"] === "true";
  const backendUrl = process.env["BACKEND_URL"];
  const daGrpcUrl = process.env["DA_GRPC_URL"];

  // 0G Storage setup (replaces DA sidecar for event permanence)
  const ogStorageRpc = process.env["OG_STORAGE_RPC"];
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

  const composedSink = composeSinks(daConfig, {
    backendUrl,
    rpcUrl: url,
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
  // Flush any remaining buffered events to 0G Storage
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
