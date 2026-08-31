import { getRelayerConfig } from "@axiom/config";

/** Lifecycle of a queued forward-request. */
export type QueueStatus =
  "queued" | "submitted" | "confirmed" | "dead-lettered";

export interface SponsorRecord {
  id: string;
  /** EIP-712 ForwardRequest (typed struct, exactly as signed by the user). */
  request: {
    user: `0x${string}`;
    target: `0x${string}`;
    data: `0x${string}`;
    maxGasCost: bigint;
    nonce: bigint;
    deadline: bigint;
  };
  userSig: `0x${string}`;
  /** Lowercased recovered signer — admission-control key (rate bucket + inflight cap). */
  user: string;
  status: QueueStatus;
  enqueuedAt: number;
  attempts: number;
  lastError?: string;
  /** Relay tx hash once submitted. */
  txHash?: `0x${string}`;
}

/** Relay broadcast leg: submit one record, return the tx hash. Mocked in tests. */
export type RelaySubmitter = (record: SponsorRecord) => Promise<`0x${string}`>;

/**
 * In-memory FIFO queue with per-user inflight admission (risk §5) and a
 * dead-letter tail. Batch drain is bounded by AXIOM_RELAYER_BATCH_MAX (max 64).
 * In-memory only: a process restart loses queued sponsorships — acceptable
 * because signatures carry deadlines and clients re-submit on timeout.
 */
export interface RelayerQueue {
  /** Admission + enqueue. Returns null when the per-user inflight cap rejects. */
  enqueue(
    record: Omit<SponsorRecord, "id" | "status" | "enqueuedAt" | "attempts">,
  ): SponsorRecord | null;
  /** Take up to `max` queued records (marks them submitted synchronously). */
  takeBatch(max: number): SponsorRecord[];
  markConfirmed(id: string): void;
  /** Dead-letter after broadcast failure. */
  markFailed(id: string, error: string): void;
  /** Reservations for admission control: user → sum of maxGasCost not yet confirmed. */
  reservedWei(user: string): bigint;
  /** Records pending (queued or submitted) for a user. */
  inflightOf(user: string): SponsorRecord[];
  all(): readonly SponsorRecord[];
}

let seq = 0;
function nextId(): string {
  seq += 1;
  return `rel-${Date.now()}-${seq}`;
}

export function createRelayerQueue(): RelayerQueue {
  const cfg = getRelayerConfig();
  const records = new Map<string, SponsorRecord>();

  const inflightOf = (user: string): SponsorRecord[] =>
    [...records.values()].filter(
      (r) =>
        r.user === user && (r.status === "queued" || r.status === "submitted"),
    );

  return {
    enqueue(record) {
      const normalized = record.user.toLowerCase();
      if (inflightOf(normalized).length >= cfg.sponsorMaxInflightPerUser) {
        return null;
      }
      const full: SponsorRecord = {
        ...record,
        user: normalized,
        id: nextId(),
        status: "queued",
        enqueuedAt: Date.now(),
        attempts: 0,
      };
      records.set(full.id, full);
      return full;
    },

    takeBatch(max) {
      const batch: SponsorRecord[] = [];
      for (const r of records.values()) {
        if (batch.length >= max) break;
        if (r.status === "queued") {
          r.status = "submitted";
          batch.push(r);
        }
      }
      return batch;
    },

    markConfirmed(id) {
      const r = records.get(id);
      if (r) r.status = "confirmed";
    },

    markFailed(id, error) {
      const r = records.get(id);
      if (!r) return;
      r.attempts += 1;
      r.lastError = error;
      // Single broadcast failure dead-letters: the op is retryable client-side
      // with a fresh nonce; looping here burns relayer gas (plan §2.3 note).
      r.status = "dead-lettered";
    },

    reservedWei(user) {
      return inflightOf(user.toLowerCase()).reduce(
        (sum, r) => sum + r.request.maxGasCost,
        0n,
      );
    },

    inflightOf,

    all: () => [...records.values()],
  };
}

export function getQueueStats(q: RelayerQueue): {
  queued: number;
  submitted: number;
  deadLettered: number;
  confirmed: number;
} {
  const counts = { queued: 0, submitted: 0, deadLettered: 0, confirmed: 0 };
  for (const r of q.all())
    counts[r.status === "dead-lettered" ? "deadLettered" : r.status] += 1;
  return counts;
}
