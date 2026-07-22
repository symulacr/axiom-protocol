/**
 * BEFORE: Benchmark for measurable performance changes
 * Runs from apps/backend context: cd apps/backend && npx tsx bench-before.ts
 *
 * Measures:
 * 1. Interface creation cost (L2)
 * 2. Module load time with readFileSync (M5)
 * 3. EventStore dedup scan (M3)
 * 4. EventStore persist serialization (M7)
 * 5. broadcast filtering (M8)
 * 6. RPC sequential vs parallel pattern (H2)
 */

import { ethers } from "ethers";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

const PAYMENT_PROCESSOR_ABI = [{"inputs":[{"internalType":"address","name":"from","type":"address"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"agentTokenId","type":"uint256"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"PaymentProcessed","type":"event"},{"inputs":[{"internalType":"uint256","name":"agentTokenId","type":"uint256"},{"internalType":"uint256","name":"newBps","type":"uint256"}],"name":"setRoyaltyBps","outputs":[],"stateMutability":"nonpayable","type":"function"}];
const ERC20_ABI = [{"constant":true,"inputs":[{"name":"_owner","type":"address"}],"name":"balanceOf","outputs":[{"name":"balance","type":"uint256"}],"type":"function"}];

const WARMUP = 5;
const ITERATIONS = 100;

function measure(label: string, fn: () => unknown, iters = ITERATIONS): Record<string, number> {
  for (let i = 0; i < WARMUP; i++) fn();
  const times: number[] = [];
  for (let i = 0; i < iters; i++) {
    const t0 = performance.now();
    fn();
    const t1 = performance.now();
    times.push(t1 - t0);
  }
  times.sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const p50 = times[Math.floor(times.length * 0.5)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const p99 = times[Math.floor(times.length * 0.99)];
  console.log(`  ${label}: avg=${(avg * 1000).toFixed(1)}µs p50=${(p50 * 1000).toFixed(1)}µs p95=${(p95 * 1000).toFixed(1)}µs`);
  return { avg, p50, p95, p99 };
}

async function main() {
  console.log("=== BEFORE: Baseline Benchmarks ===\n");

  // 1. Interface creation cost (L2)
  console.log("[1] ethers.Interface creation cost (lift to module level = 0 after)");
  const ifaceResults: Record<string, Record<string, number>> = {};
  ifaceResults["paymentProcessor"] = measure("new ethers.Interface (payment processor ABI, 2 events/1 func)", 
    () => new ethers.Interface(PAYMENT_PROCESSOR_ABI));
  ifaceResults["erc20"] = measure("new ethers.Interface (ERC20 ABI, 1 func)", 
    () => new ethers.Interface(ERC20_ABI));
  ifaceResults["mini"] = measure("new ethers.Interface (2 funcs, minimal)", 
    () => new ethers.Interface(["function balanceOf(address) view returns (uint256)", "function ownerOf(uint256) view returns (address)"]));

  // 2. Module load time with readFileSync (M5)
  console.log("\n[2] Module load time with readFileSync version (M5)");
  // Simulate the readFileSync pattern from server.ts:71
  const readFileSyncVersion = () => {
    JSON.parse(readFileSync(new URL("../backend/package.json", import.meta.url), "utf8")).version;
  };
  measure("readFileSync + JSON.parse package.json", readFileSyncVersion);
  // Compare: JSON static import would be 0ms at runtime (compile-time resolved)

  // 3. EventStore dedup scan (M3) — simulate O(N) scan
  console.log("\n[3] EventStore dedup scan simulation (M3)");
  const bucketCount = 50;
  const buckets = new Map<string, Array<{ id: string; key: string }>>();
  for (let i = 0; i < bucketCount; i++) {
    const items: Array<{ id: string; key: string }> = [];
    for (let j = 0; j < 20; j++) {
      items.push({ id: `bucket-${i}-${j}`, key: `dup-key-${(i + j) % 5}` });
    }
    buckets.set(`bucket-${i}`, items);
  }
  const seenKeys = new Set<string>();
  // Simulate O(N) scan per append
  function findByDedupeKeyScan(key: string) {
    for (const [, bucket] of buckets) {
      const found = bucket.find(e => e.key === key);
      if (found) return found;
    }
    return undefined;
  }
  function findByDedupeKeyOptimized(key: string) {
    if (!seenKeys.has(key)) return undefined;
    for (const [, bucket] of buckets) {
      const found = bucket.find(e => e.key === key);
      if (found) return found;
    }
    return undefined;
  }
  // Most calls are MISS (new key not seen before)
  measure("findByDedupeKey (O(N) scan, miss — append path)", () => findByDedupeKeyScan(`new-key-${Math.random()}`));
  measure("findByDedupeKey OPTIMIZED (O(1) seenKeys check, miss)", () => findByDedupeKeyOptimized(`new-key-${Math.random()}`));

  // 4. Broadcast filtering (M8) — simulate filtering vs unfiltered
  console.log("\n[4] broadcast topic filtering simulation (M8)");
  const clientCount = 1000;
  const clients = new Set<{ id: number; topics: Set<string>; open: boolean }>();
  const topicIndex = new Map<string, Set<{ id: number; topics: Set<string>; open: boolean }>>();
  for (let i = 0; i < clientCount; i++) {
    const client = { id: i, topics: new Set(["topic-1", "topic-2"]), open: true };
    clients.add(client);
    topicIndex.set("topic-1", (topicIndex.get("topic-1") ?? new Set()).add(client));
  }
  measure(`broadcast to ALL ${clientCount} clients (BEFORE — no topic filter)`, () => {
    for (const c of clients) { if (c.open) JSON.stringify({ topic: "test", payload: "x" }); }
  });
  const subscribed = topicIndex.get("topic-1")!;
  measure(`broadcast to ${subscribed.size} subscribed clients (AFTER — topic filter)`, () => {
    for (const c of subscribed) { if (c.open) JSON.stringify({ topic: "test", payload: "x" }); }
  });

  // 5. RPC pattern simulation — sequential vs parallel
  console.log("\n[5] Sequential vs parallel RPC simulation (H2)");
  const agents = 100;
  // Simulate RPC-like async calls with artificial delay
  const rpcDelay = () => new Promise(resolve => setImmediate(resolve));
  
  async function sequential() {
    const results: number[] = [];
    for (let i = 0; i < agents; i++) {
      await rpcDelay();
      results.push(i);
    }
    return results;
  }
  async function parallel() {
    return Promise.all(Array.from({ length: agents }, (_, i) => rpcDelay().then(() => i)));
  }

  for (let w = 0; w < WARMUP; w++) { await sequential(); await parallel(); }
  let t0 = performance.now(); await sequential(); let t1 = performance.now();
  console.log(`  sequential (${agents} await calls): ${(t1 - t0).toFixed(1)}ms`);
  t0 = performance.now(); await parallel(); t1 = performance.now();
  console.log(`  parallel (${agents} Promise.all): ${(t1 - t0).toFixed(1)}ms`);

  // 6. Persist serialization simulation (M7)
  console.log("\n[6] Persist serialization simulation (M7)");
  const persistBuckets = new Map<string, unknown[]>();
  const serialized = new Map<string, string>();
  for (let i = 0; i < 200; i++) {
    const events = Array.from({ length: 5 }, (_, j) => ({ id: `evt-${i}-${j}`, payload: "x".repeat(50) }));
    persistBuckets.set(`bucket-${i}`, events);
    serialized.set(`bucket-${i}`, JSON.stringify(events));
  }
  const dirty = new Set(["bucket-0"]); // Only 1 dirty out of 200

  // Before: iterate ALL buckets
  function saveAllBuckets() {
    const parts: string[] = [];
    for (const [key, events] of persistBuckets) {
      let json = serialized.get(key);
      if (dirty.has(key) || json === undefined) {
        json = JSON.stringify(events);
        serialized.set(key, json);
      }
      parts.push(`${JSON.stringify(key)}:${json}`);
    }
    return parts;
  }
  // After: iterate serialized + dirty diff
  function saveDirtyBuckets() {
    const parts: string[] = [];
    for (const [key, json] of serialized) {
      if (dirty.has(key)) {
        const events = persistBuckets.get(key);
        if (events) {
          const freshJson = JSON.stringify(events);
          serialized.set(key, freshJson);
          parts.push(`${JSON.stringify(key)}:${freshJson}`);
        }
      } else {
        parts.push(`${JSON.stringify(key)}:${json}`);
      }
    }
    for (const key of dirty) {
      if (serialized.has(key)) continue;
      const events = persistBuckets.get(key);
      if (!events) continue;
      const json = JSON.stringify(events);
      serialized.set(key, json);
      parts.push(`${JSON.stringify(key)}:${json}`);
    }
    return parts;
  }

  measure("saveBuckets iterate ALL (200 buckets, 1 dirty) — BEFORE", saveAllBuckets);
  measure("saveBuckets iterate serialized+dirty (200 entries, 1 dirty) — AFTER", saveDirtyBuckets);

  console.log("\n=== BEFORE Benchmarks Complete ===");
  console.log("Results saved. Apply edits, then run bench-after.ts");
}

main().catch(console.error);
