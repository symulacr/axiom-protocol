// apps/indexer/src/da.ts
//
// Data Availability submission for indexed events.
//
// What this module does
// ---------------------
// `submitEvent` turns one `AxiomEvent` (decoded in `watcher.ts` from an
// on-chain log) into a single blob submitted to 0G DA via gRPC DisperseBlob
// and returns the resulting request ID. The underlying transport is the 0G
// DA Client sidecar gRPC service (port 51001).
//
// Why a `submitFn` option?
// -------------------------
// Two reasons:
//   1. Tests cannot hit the live network and the testnet is rate-limited.
//      A mock `submitFn` lets `da.test.ts` validate the canonical
//      serialization and the returned shape without a wallet.
//   2. Production wiring can swap the real submitter for a queue
//      (NATS / Redis Streams) publish without touching the watcher.
//
// The "never throw" guarantee
// ---------------------------
// `Watcher.tick` (apps/indexer/src/watcher.ts:458) only catches errors
// at the tick level, so a thrown sink function would stop the whole
// polling loop. `submitEvent` is designed to be the `sink`: it catches
// every error, logs to stderr, and returns a sentinel
// `{ txHash: "", seq: 0n }` for failed submissions. The watcher can
// then chain `submitEvent` directly into the sink and survive
// transient DA outages without manual intervention.

import { DaClient } from "./da-client.js";

import type { AxiomEvent } from "./events.js";
import { canonicalizeEvent } from "./serialization.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Successful DA submission: the hex-encoded request ID from the gRPC
 * `DisperseBlob` response (acts as a receipt the caller can use to poll
 * `GetBlobStatus`), plus the initial `BlobStatus` as the "sequence" value.
 */
export type SubmitResult = { txHash: string; seq: bigint };

/**
 * Sentinel returned when the submission itself fails. An empty
 * `txHash` is the signal; the watcher must keep polling on this.
 */
const FAILED_SUBMIT: Readonly<SubmitResult> = Object.freeze({ txHash: "", seq: 0n });

/**
 * The submitter function the watcher can swap via dependency
 * injection. It receives the canonical event bytes and returns the
 * receipt. Splitting the bytes-builder from the network call lets
 * tests assert on the exact bytes we sent, separate from the
 * serialization correctness.
 */
export type SubmitFn = (bytes: Uint8Array, event: AxiomEvent) => Promise<SubmitResult>;

/** Logger shape: one JSON-serializable line per message. */
export type DaLogger = (line: Record<string, unknown>) => void;

/**
 * Options for `submitEvent`. All fields are optional; sensible
 * defaults pull from the same env vars the rest of the indexer
 * already uses (see `apps/indexer/src/index.ts`).
 */
export type SubmitEventOptions = {
  /** Override the submitter (test seam, queue publisher, etc.). */
  submitFn?: SubmitFn;
  /** 0G DA gRPC endpoint URL. Default: env `DA_GRPC_URL`. */
  daGrpcUrl?: string;
  /** Logger for non-fatal submission errors. Default: one JSON line per error to stderr. */
  logger?: DaLogger;
};

// ---------------------------------------------------------------------------
// Real gRPC submitter
// ---------------------------------------------------------------------------

async function realSubmit(
  daGrpcUrl: string,
  bytes: Uint8Array,
): Promise<SubmitResult> {
  const client = new DaClient(daGrpcUrl);
  try {
    await client.waitForReady(10_000); // 10s timeout for one-off submission
    const { requestId } = await client.disperseBlob(bytes);
    return { txHash: requestId, seq: 0n };
  } finally {
    client.close();
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Submit one event to 0G DA. Never throws. Returns a sentinel
 * `{ txHash: "", seq: 0n }` on any failure (caller checks `txHash`).
 *
 * @param event  The decoded `AxiomEvent` to publish.
 * @param opts   Optional override (test seam, alternate gRPC URL, etc.).
 */
export async function submitEvent(
  event: AxiomEvent,
  opts: SubmitEventOptions = {},
): Promise<SubmitResult> {
  const log: DaLogger = opts.logger ?? stderrJsonLogger;
  const bytes = canonicalizeEvent(event);

  // 1. Caller-supplied submitter (tests, queue publisher). Always
  //    preferred over the real network call when present.
  if (opts.submitFn) {
    try {
      return await opts.submitFn(bytes, event);
    } catch (err) {
      log({
        level: "error",
        msg: "da submission failed (custom submitter)",
        kind: event.kind,
        txHash: event.txHash,
        err: err instanceof Error ? err.message : String(err),
      });
      return FAILED_SUBMIT;
    }
  }

  // 2. gRPC real-network path. The DA Client sidecar handles gas
  //    payment (the indexer no longer needs a private key / signer).
  const daGrpcUrl =
    opts.daGrpcUrl ?? process.env["DA_GRPC_URL"];
  if (daGrpcUrl === undefined || daGrpcUrl === "") {
    log({
      level: "warn",
      msg: "da submission skipped: no submitFn and no DA gRPC URL configured",
      kind: event.kind,
      txHash: event.txHash,
    });
    return FAILED_SUBMIT;
  }

  try {
    return await realSubmit(daGrpcUrl, bytes);
  } catch (err) {
    log({
      level: "error",
      msg: "da submission failed",
      kind: event.kind,
      txHash: event.txHash,
      daGrpcUrl,
      err: err instanceof Error ? err.message : String(err),
    });
    return FAILED_SUBMIT;
  }
}

/** One JSON line on stderr, timestamped — matches the watcher's stderr format. */
function stderrJsonLogger(line: Record<string, unknown>) {
  console.error(JSON.stringify({ ...line, ts: new Date().toISOString() }));
}

/**
 * Build a `SubmitFn` from a pre-configured DA gRPC URL. Mostly a
 * convenience for `apps/indexer/src/index.ts` once the env vars are
 * parsed there.
 */
export function makeRealSubmitter(daGrpcUrl: string): SubmitFn {
  const client = new DaClient(daGrpcUrl);
  // Fire-and-forget readiness check — logs a fatal error at startup
  // if the DA sidecar is down, but does not block the returned submit fn.
  client.waitForReady(30_000).catch((err) => {
    console.error(JSON.stringify({
      level: "fatal",
      msg: "DA client failed to connect",
      daGrpcUrl,
      err: err instanceof Error ? err.message : String(err),
    }));
  });
  return async (bytes: Uint8Array) => {
    const { requestId } = await client.disperseBlob(bytes);
    return { txHash: requestId, seq: 0n };
  };
}
