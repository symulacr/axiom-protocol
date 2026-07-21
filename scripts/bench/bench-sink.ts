// Bench: Indexer sink throughput
// Run: pnpm exec tsx scripts/bench/bench-sink.ts
import { postEvent, type HttpEventSinkOptions, type Fetcher } from '../../apps/indexer/src/sink.ts';
import { bigintReplacer } from '@axiom/config/types/bigint';
import { performance } from 'node:perf_hooks';

const sampleEvent = {
  kind: 'Transfer',
  blockNumber: 1000000,
  txHash: '0x' + 'aa'.repeat(32) as `0x${string}`,
  logIndex: 0,
  from: '0x1111111111111111111111111111111111111111' as `0x${string}`,
  to: '0x2222222222222222222222222222222222222222' as `0x${string}`,
  tokenId: 1n,
} as const;

// JSON serialization throughput
const SERIAL_SAMPLES = 10000;
const serialTimes: number[] = [];
for (let i = 0; i < SERIAL_SAMPLES; i++) {
  const start = performance.now();
  JSON.stringify(sampleEvent, bigintReplacer);
  serialTimes.push(performance.now() - start);
}
const serialAvg = serialTimes.reduce((a, b) => a + b, 0) / serialTimes.length;
const serialSorted = [...serialTimes].sort((a, b) => a - b);
const serialP95 = serialSorted[Math.floor(serialSorted.length * 0.95)];
console.log(JSON.stringify({
  benchmark: 'json-serialization',
  samples: SERIAL_SAMPLES,
  avgMs: Number(serialAvg.toFixed(5)),
  p95Ms: Number(serialP95.toFixed(5)),
  opsPerSec: Number((1000 / serialAvg).toFixed(0)),
}));

// postEvent with in-memory fetcher (simulated 2xx)
const MEM_SAMPLES = 500;
const memTimes: number[] = [];
for (let i = 0; i < MEM_SAMPLES; i++) {
  const start = performance.now();
  await postEvent(sampleEvent as any, {
    backendUrl: 'http://localhost:1',
    maxRetries: 0,
    fetcher: async (_url: string, _init?: RequestInit) => {
      await Promise.resolve();
      return new Response('{}', { status: 200 });
    },
  } as HttpEventSinkOptions & { fetcher: Fetcher });
  memTimes.push(performance.now() - start);
}
const memAvg = memTimes.reduce((a, b) => a + b, 0) / memTimes.length;
console.log(JSON.stringify({
  benchmark: 'sink-postEvent-mem',
  samples: MEM_SAMPLES,
  avgMs: Number(memAvg.toFixed(4)),
  opsPerSec: Number((1000 / memAvg).toFixed(0)),
}));

console.log('---');
console.log(`JSON serialization:       ${serialAvg.toFixed(5)} ms avg (p95=${serialP95.toFixed(5)})  ${(1000/serialAvg).toFixed(0)} ops/sec`);
console.log(`Sink postEvent (in-mem):  ${memAvg.toFixed(4)} ms avg  ${(1000/memAvg).toFixed(0)} ops/sec`);
