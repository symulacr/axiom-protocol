// Bench: Event parser with properly ABI-encoded log data
// Run: cd apps/indexer && node ../../node_modules/.pnpm/tsx@4.22.4/node_modules/tsx/dist/cli.mjs src/__bench__/bench-parser.ts
import { decodeAxiomLog } from '../events/parser.ts';
import { EVENT_SIGNATURES, EVENT_ABI } from '../events.ts';
import { getEventSelector, encodeAbiParameters, type AbiEvent, parseAbiItem } from 'viem';
import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';

function randomHex(bytes: number): `0x${string}` {
  const hex = [...randomBytes(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
  return ('0x' + hex) as `0x${string}`;
}
function addrToTopic(addr: string): string {
  return '0x' + '000000000000000000000000' + addr.replace('0x', '').padStart(40, '0');
}
function uint256Topic(val: bigint | number): string {
  return '0x' + BigInt(val).toString(16).padStart(64, '0');
}
function bytes32Topic(val: string): string {
  return '0x' + val.replace('0x', '').padStart(64, '0').slice(0, 64);
}

type FakeLog = {
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
  address: string;
  topics: string[];
  data: string;
  removed: boolean;
};

function encodeNonIndexed(abi: AbiEvent, args: Record<string, unknown>): string {
  const nonIndexed = abi.inputs.filter(i => !i.indexed);
  if (nonIndexed.length === 0) return '0x';
  const abiParams = nonIndexed.map(i => ({ type: i.type, name: i.name }));
  const values = nonIndexed.map(i => args[i.name!]);
  return encodeAbiParameters(abiParams as any, values as any);
}

function buildLog(name: string, indexed: Record<string, unknown>, nonIndexed: Record<string, unknown>): FakeLog {
  const sig = (EVENT_SIGNATURES as Record<string, string>)[name];
  const abi = (EVENT_ABI as Record<string, AbiEvent>)[name];
  const selector = getEventSelector(sig);
  const topics: string[] = [selector];
  for (const input of abi.inputs) {
    if (input.indexed) {
      const val = indexed[input.name!];
      if (val !== undefined) {
        if (typeof val === 'string' && val.startsWith('0x') && val.length === 42) {
          topics.push(addrToTopic(val));
        } else if (typeof val === 'bigint' || typeof val === 'number') {
          topics.push(uint256Topic(val));
        } else if (typeof val === 'string' && val.length === 66) {
          topics.push(bytes32Topic(val));
        } else {
          topics.push(uint256Topic(BigInt(val as any)));
        }
      }
    }
  }
  return {
    blockNumber: 1000000 + Math.floor(Math.random() * 100000),
    transactionHash: randomHex(32),
    logIndex: 0,
    address: randomHex(20),
    topics,
    data: encodeNonIndexed(abi, nonIndexed),
    removed: false,
  };
}

// Representative event types covering all parsing paths
const eventConfigs: Array<{
  name: string;
  indexed: Record<string, unknown>;
  nonIndexed: Record<string, unknown>;
}> = [
  {
    name: 'Transfer',
    indexed: {
      from: '0x1111111111111111111111111111111111111111',
      to: '0x2222222222222222222222222222222222222222',
      tokenId: 1n,
    },
    nonIndexed: {},
  },
  {
    name: 'Deposited',
    indexed: {
      tokenId: 42n,
      from: '0x3333333333333333333333333333333333333333',
      asset: '0x4444444444444444444444444444444444444444',
    },
    nonIndexed: { amount: 1000000000000000000n },
  },
  {
    name: 'PaymentProcessed',
    indexed: {
      agentTokenId: 7n,
      payer: '0x5555555555555555555555555555555555555555',
      creator: '0x6666666666666666666666666666666666666666',
    },
    nonIndexed: { amount: 500n, creatorCut: 50n, protocolCut: 25n },
  },
  {
    name: 'Upgraded',
    indexed: { implementation: '0x7777777777777777777777777777777777777777' },
    nonIndexed: {},
  },
  {
    name: 'Executed',
    indexed: {
      tokenId: 99n,
      actionHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      target: '0x8888888888888888888888888888888888888888',
    },
    nonIndexed: { value: 1000n, result: '0xdeadbeef' as `0x${string}` },
  },
  {
    name: 'Initialized',
    indexed: {},
    nonIndexed: { version: 1n },
  },
  {
    name: 'CreatorSet',
    indexed: { tokenId: 5n, creator: '0x9999999999999999999999999999999999999999' },
    nonIndexed: {},
  },
  {
    name: 'VerifierUpdated',
    indexed: {
      oldVerifier: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      newVerifier: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    },
    nonIndexed: {},
  },
  {
    name: 'DelegateAccess',
    indexed: {
      user: '0xcccccccccccccccccccccccccccccccccccccccc',
      assistant: '0xdddddddddddddddddddddddddddddddddddddddd',
    },
    nonIndexed: {},
  },
  {
    name: 'SignerExecuted',
    indexed: {
      oldSigner: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      newSigner: '0xffffffffffffffffffffffffffffffffffffffff',
    },
    nonIndexed: {},
  },
];

// Build logs and verify they parse
const logs: FakeLog[] = [];
const eventNames: string[] = [];
for (let i = 0; i < eventConfigs.length; i++) {
  const cfg = eventConfigs[i];
  const log = buildLog(cfg.name, cfg.indexed, cfg.nonIndexed);
  log.logIndex = i;
  logs.push(log);
  eventNames.push(cfg.name);
}

console.log(JSON.stringify({
  benchmark: 'event-parser-baseline',
  eventTypes: eventConfigs.length,
  names: eventNames,
}));

// Verify parseability
let parseable = 0;
const parseFailures: string[] = [];
for (let i = 0; i < logs.length; i++) {
  try {
    const result = decodeAxiomLog(logs[i] as any);
    if (result !== null) parseable++;
    else parseFailures.push(`${eventNames[i]}: null`);
  } catch (err: any) {
    parseFailures.push(`${eventNames[i]}: ${err?.message ?? err}`);
  }
}
if (parseFailures.length > 0) {
  console.log(JSON.stringify({ benchmark: 'event-parser-verify', totalLogs: logs.length, parseable, failures: parseFailures }));
} else {
  console.log(JSON.stringify({ benchmark: 'event-parser-verify', totalLogs: logs.length, parseable: `${parseable}/${logs.length}` }));
}

// Warmup
for (let i = 0; i < 50; i++) decodeAxiomLog(logs[i % logs.length] as any);

// Single decode throughput
const ITERATIONS = 5000;
const decodeTimes: number[] = [];
let success = 0;
for (let i = 0; i < ITERATIONS; i++) {
  const log = logs[i % logs.length];
  const start = performance.now();
  const result = decodeAxiomLog(log as any);
  decodeTimes.push(performance.now() - start);
  if (result !== null) success++;
}
const avgDecode = decodeTimes.reduce((a, b) => a + b, 0) / decodeTimes.length;
const sorted = [...decodeTimes].sort((a, b) => a - b);
const p50 = sorted[Math.floor(sorted.length * 0.5)];
const p95 = sorted[Math.floor(sorted.length * 0.95)];
const p99 = sorted[Math.floor(sorted.length * 0.99)];
console.log(JSON.stringify({
  benchmark: 'decodeAxiomLog',
  iterations: ITERATIONS,
  success,
  avgMs: Number(avgDecode.toFixed(5)),
  p50Ms: Number(p50.toFixed(5)),
  p95Ms: Number(p95.toFixed(5)),
  p99Ms: Number(p99.toFixed(5)),
  opsPerSec: Number((1000 / avgDecode).toFixed(0)),
}));

// Per-event-type breakdown
console.log(JSON.stringify({ benchmark: 'per-event-type', header: true }));
for (let ei = 0; ei < logs.length; ei++) {
  const perTimes: number[] = [];
  for (let i = 0; i < 500; i++) {
    const start = performance.now();
    decodeAxiomLog(logs[ei] as any);
    perTimes.push(performance.now() - start);
  }
  const perAvg = perTimes.reduce((a, b) => a + b, 0) / perTimes.length;
  console.log(JSON.stringify({
    benchmark: 'per-event-type',
    event: eventNames[ei],
    samples: 500,
    avgMs: Number(perAvg.toFixed(5)),
    opsPerSec: Number((1000 / perAvg).toFixed(0)),
  }));
}

// Batch decode — simulates a poll tick with mixed event types
const BATCH_SIZES = [10, 50, 100, 500];
for (const batchSize of BATCH_SIZES) {
  const batchTimes: number[] = [];
  for (let b = 0; b < 50; b++) {
    const batch = Array.from({ length: batchSize }, (_, i) => logs[i % logs.length]);
    const start = performance.now();
    for (const log of batch) decodeAxiomLog(log as any);
    batchTimes.push(performance.now() - start);
  }
  const batchAvg = batchTimes.reduce((a, b) => a + b, 0) / batchTimes.length;
  console.log(JSON.stringify({
    benchmark: 'batch-decode',
    batchSize,
    runs: 50,
    avgMs: Number(batchAvg.toFixed(3)),
    eventsPerSec: Number(((batchSize / batchAvg) * 1000).toFixed(0)),
  }));
}

console.log('---');
console.log(`All events parsed:      ${success}/${ITERATIONS}`);
console.log(`Single decode avg:      ${avgDecode.toFixed(5)} ms  ${(1000/avgDecode).toFixed(0)} ops/sec`);
console.log(`Latency:                p50=${p50.toFixed(5)} p95=${p95.toFixed(5)} p99=${p99.toFixed(5)} ms`);
for (const bs of BATCH_SIZES) {
  const batchAvg = (() => {
    const t: number[] = [];
    for (let b = 0; b < 50; b++) {
      const batch = Array.from({ length: bs }, (_, i) => logs[i % logs.length]);
      const s = performance.now();
      for (const log of batch) decodeAxiomLog(log as any);
      t.push(performance.now() - s);
    }
    return t.reduce((a, b) => a + b, 0) / t.length;
  })();
  console.log(`Batch ${bs}:              ${batchAvg.toFixed(3)} ms  ${((bs/batchAvg)*1000).toFixed(0)} ev/s`);
}
