import { DaClient } from "./da-client.js";

import type { AxiomEvent } from "./events.js";
import { canonicalizeEvent } from "./serialization.js";

/** DA submission receipt: gRPC request ID + blob status sequence. */
export type SubmitResult = { txHash: string; seq: bigint };

/** Sentinel returned when the submission fails. */
const FAILED_SUBMIT: Readonly<SubmitResult> = Object.freeze({ txHash: "", seq: 0n });

/** Submitter function (swappable for tests). */
export type SubmitFn = (bytes: Uint8Array, event: AxiomEvent) => Promise<SubmitResult>;

export type DaLogger = (line: Record<string, unknown>) => void;

/** Options for `submitEvent`. All fields optional. */
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
 * Submit one event to 0G DA. Never throws — returns sentinel on failure.
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

function stderrJsonLogger(line: Record<string, unknown>) {
  console.error(JSON.stringify({ ...line, ts: new Date().toISOString() }));
}

/** Build a `SubmitFn` from a pre-configured DA gRPC URL. */
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
