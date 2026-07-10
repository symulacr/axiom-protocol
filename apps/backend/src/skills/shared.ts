

export { getSharedProvider } from "../provider.js";
export { TTLCache } from "../utils/cache.js";
export { createLogger } from "../utils/logger.js";

import { getSharedProvider } from "../provider.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("skills:shared");


export function ser(v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v)) return v.map(ser);
  if (v !== null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = ser(val);
    }
    return out;
  }
  return v;
}


export class OnlineStats {
  n = 0;
  mean = 0;
  private m2 = 0;

  update(x: number): void {
    this.n++;
    const delta = x - this.mean;
    this.mean += delta / this.n;
    const delta2 = x - this.mean;
    this.m2 += delta * delta2;
  }

  get variance(): number {
    return this.n < 2 ? 0 : this.m2 / this.n;
  }

  get stddev(): number {
    return Math.sqrt(this.variance);
  }

  get sharpe(): number {
    return this.stddev === 0 ? 0 : this.mean / this.stddev;
  }
}


export function* boundedBfs<T>(
  start: T,
  neighbors: (node: T) => Iterable<T>,
  maxNodes = 5000,
): Generator<{ node: T; depth: number }> {
  const visited = new Set<T>();
  const queue: { node: T; depth: number }[] = [{ node: start, depth: 0 }];
  visited.add(start);

  while (queue.length > 0) {
    if (visited.size > maxNodes) return;
    const current = queue.shift()!;
    yield current;
    for (const next of neighbors(current.node)) {
      if (!visited.has(next)) {
        if (visited.size >= maxNodes) return;
        visited.add(next);
        queue.push({ node: next, depth: current.depth + 1 });
      }
    }
  }
}


export class ZScoreDetector {
  private readonly window: number[] = [];
  private readonly maxSize: number;
  private readonly threshold: number;

  constructor(windowSize = 100, threshold = 3.0) {
    this.maxSize = windowSize;
    this.threshold = threshold;
  }

  get size(): number {
    return this.window.length;
  }

  get mean(): number {
    if (this.window.length === 0) return 0;
    let s = 0;
    for (const v of this.window) s += v;
    return s / this.window.length;
  }

  get stddev(): number {
    const n = this.window.length;
    if (n < 2) return 0;
    const m = this.mean;
    let ss = 0;
    for (const v of this.window) ss += (v - m) ** 2;
    return Math.sqrt(ss / n);
  }

  push(value: number): number | null {
    this.window.push(value);
    if (this.window.length > this.maxSize) this.window.shift();
    const sd = this.stddev;
    if (sd === 0) return null;
    return (value - this.mean) / sd;
  }

  isAnomaly(value: number): { z: number | null; anomaly: boolean } {
    const z = this.push(value);
    return { z, anomaly: z !== null && Math.abs(z) >= this.threshold };
  }
}


interface LogFilter {
  address?: string;
  topics?: (string | string[] | null)[];
  fromBlock: number;
  toBlock: number;
}

interface RpcLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  transactionIndex: string;
  blockHash: string;
  logIndex: string;
  removed: boolean;
}

export async function* getLogsChunked(
  filter: LogFilter,
  chunkSize = 2_000,
): AsyncGenerator<RpcLog[]> {
  const provider = getSharedProvider();
  let from = filter.fromBlock;
  const end = filter.toBlock;

  while (from <= end) {
    let to = Math.min(from + chunkSize - 1, end);
    let success = false;

    while (!success) {
      const params = {
        fromBlock: "0x" + from.toString(16),
        toBlock: "0x" + to.toString(16),
        ...(filter.address ? { address: filter.address } : {}),
        ...(filter.topics ? { topics: filter.topics } : {}),
      };

      try {
        const logs: RpcLog[] = await provider.send("eth_getLogs", [params]);
        yield logs;
        success = true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (to === from) {
          log.warn("eth_getLogs failed on single block, skipping", {
            block: from,
            error: msg,
          });
          success = true;
        } else {
          const mid = Math.floor((from + to) / 2);
          log.debug("eth_getLogs chunk too large, halving", {
            from,
            to,
            newTo: mid,
          });
          to = mid;
        }
      }
    }

    from = to + 1;
  }
}
