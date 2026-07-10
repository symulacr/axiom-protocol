

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
