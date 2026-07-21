import type { JsonRpcProvider, Log } from "ethers";
import { TOPIC_TABLE, type WatchedEvent } from "../events/parser.js";

export async function pollOnce(
  provider: JsonRpcProvider,
  watchList: readonly WatchedEvent[],
  fromBlock: bigint,
  window: bigint,
) {
  const toBlock = fromBlock + window - 1n;

  const allLogs: Log[] = [];
  // Group by contract address for multi-topic batching (4 calls vs 31)
  const byAddress = new Map<string, string[]>();
  for (const { name, address } of watchList) {
    const key = address.toLowerCase();
    const list = byAddress.get(key);
    if (list) { list.push(TOPIC_TABLE[name]); }
    else { byAddress.set(key, [TOPIC_TABLE[name]]); }
  }
  for (const [addr, topics] of byAddress) {
    const filter = { address: addr, topics: [topics], fromBlock, toBlock };
    const logs = await provider.getLogs(filter);
    for (const log of logs) allLogs.push(log);
  }
  return allLogs;
}

export function logsByChainOrder(a: Log, b: Log) {
  if (a.blockNumber !== b.blockNumber) {
    return a.blockNumber < b.blockNumber ? -1 : 1;
  }
  if (a.index !== b.index) {
    return a.index < b.index ? -1 : 1;
  }
  return 0;
}
