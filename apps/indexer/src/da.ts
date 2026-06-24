import { DaClient } from "./da-client.js";
import type { AxiomEvent } from "./events.js";
import { canonicalizeEvent } from "./serialization.js";

export type SubmitResult = { txHash: string; seq: bigint };

const FAILED_SUBMIT: Readonly<SubmitResult> = Object.freeze({ txHash: "", seq: 0n });

export type SubmitFn = (bytes: Uint8Array, event: AxiomEvent) => Promise<SubmitResult>;

export type DaLogger = (line: Record<string, unknown>) => void;

export type SubmitEventOptions = {
  submitFn?: SubmitFn;
  logger?: DaLogger;
};

export async function submitEvent(
  event: AxiomEvent,
  opts: SubmitEventOptions = {},
): Promise<SubmitResult> {
  const log: DaLogger = opts.logger ?? stderrJsonLogger;
  const bytes = canonicalizeEvent(event);

  if (!opts.submitFn) {
    log({
      level: "warn",
      msg: "da submission skipped: no submitFn configured",
      kind: event.kind,
      txHash: event.txHash,
    });
    return FAILED_SUBMIT;
  }

  try {
    return await opts.submitFn(bytes, event);
  } catch (err) {
    log({
      level: "error",
      msg: "da submission failed",
      kind: event.kind,
      txHash: event.txHash,
      err: err instanceof Error ? err.message : String(err),
    });
    return FAILED_SUBMIT;
  }
}

export async function submitBatch(
  events: AxiomEvent[],
  opts: SubmitEventOptions = {},
): Promise<SubmitResult> {
  // Batch into one DisperseBlob call for ~1000x cost reduction
  const log: DaLogger = opts.logger ?? stderrJsonLogger;

  if (events.length === 0) return FAILED_SUBMIT;

  // Serialize all events as a JSON array (BigInt-safe)
  const blobData = JSON.stringify(events, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
  const blobBytes = new TextEncoder().encode(blobData);

  if (!opts.submitFn) {
    log({
      level: "warn",
      msg: "da batch submission skipped: no submitFn configured",
      batchSize: events.length,
    });
    return FAILED_SUBMIT;
  }

  try {
    return await opts.submitFn(blobBytes, events[0]!);
  } catch (err) {
    log({
      level: "error",
      msg: "da batch submission failed",
      batchSize: events.length,
      err: err instanceof Error ? err.message : String(err),
    });
    return FAILED_SUBMIT;
  }
}

function stderrJsonLogger(line: Record<string, unknown>) {
  console.error(JSON.stringify({ ...line, ts: new Date().toISOString() }));
}

export function makeRealSubmitter(daGrpcUrl: string): SubmitFn {
  const client = new DaClient(daGrpcUrl);
  // Fire-and-forget readiness check — logs fatal error at startup
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

export function makeRealSubmitterFromClient(client: DaClient): SubmitFn {
  return async (bytes: Uint8Array, _event: AxiomEvent) => {
    const { requestId } = await client.disperseBlob(bytes);
    return { txHash: requestId, seq: 0n };
  };
}
