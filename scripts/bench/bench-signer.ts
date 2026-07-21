// Bench: TeeSigner signing performance
// Run: pnpm exec tsx scripts/bench/bench-signer.ts
import { TeeSigner, ownershipMessageHash } from '../../apps/oracle/src/signer.ts';
import { performance } from 'node:perf_hooks';

const TEST_PK = '0x' + '11'.repeat(32);
const input = {
  dataHash: ('0x' + 'aa'.repeat(32)) as `0x${string}`,
  sealedKey: ('0x' + 'bb'.repeat(32)) as `0x${string}`,
  targetPubkey: ('0x' + 'cc'.repeat(64)) as `0x${string}`,
  to: '0x0000000000000000000000000000000000000001' as `0x${string}`,
  nft: '0x0000000000000000000000000000000000000002' as `0x${string}`,
  nonce: 42n,
  validUntil: 99999999999n,
};

const domain = { chainId: 16661n, verifyingContract: ('0x' + 'dd'.repeat(20)) as `0x${string}` };
const signer = new TeeSigner(TEST_PK, domain);

// Warmup
for (let i = 0; i < 10; i++) signer.signOwnership(input);

// Ownership signing benchmark
const OWNERSHIP_SAMPLES = 500;
const ownershipTimes: number[] = [];
for (let i = 0; i < OWNERSHIP_SAMPLES; i++) {
  const start = performance.now();
  signer.signOwnership({ ...input, nonce: BigInt(i) });
  ownershipTimes.push(performance.now() - start);
}
const ownAvg = ownershipTimes.reduce((a, b) => a + b, 0) / ownershipTimes.length;
const ownSorted = [...ownershipTimes].sort((a, b) => a - b);
const ownMedian = ownSorted[Math.floor(ownSorted.length / 2)];

console.log(JSON.stringify({
  benchmark: 'ownership-signing',
  samples: OWNERSHIP_SAMPLES,
  avgMs: Number(ownAvg.toFixed(3)),
  minMs: Number(Math.min(...ownershipTimes).toFixed(3)),
  maxMs: Number(Math.max(...ownershipTimes).toFixed(3)),
  medianMs: Number(ownMedian.toFixed(3)),
  opsPerSec: Number((1000 / ownAvg).toFixed(0)),
}));

// Message hash benchmark
const HASH_SAMPLES = 2000;
const hashTimes: number[] = [];
for (let i = 0; i < HASH_SAMPLES; i++) {
  const start = performance.now();
  ownershipMessageHash({ ...input, nonce: BigInt(i) });
  hashTimes.push(performance.now() - start);
}
const hashAvg = hashTimes.reduce((a, b) => a + b, 0) / hashTimes.length;
console.log(JSON.stringify({
  benchmark: 'ownership-message-hash',
  samples: HASH_SAMPLES,
  avgMs: Number(hashAvg.toFixed(4)),
  opsPerSec: Number((1000 / hashAvg).toFixed(0)),
}));

// Constructor benchmark
const CONSTRUCTOR_SAMPLES = 200;
const ctorTimes: number[] = [];
for (let i = 0; i < CONSTRUCTOR_SAMPLES; i++) {
  const start = performance.now();
  new TeeSigner(TEST_PK, domain);
  ctorTimes.push(performance.now() - start);
}
const ctorAvg = ctorTimes.reduce((a, b) => a + b, 0) / ctorTimes.length;
console.log(JSON.stringify({
  benchmark: 'signer-constructor',
  samples: CONSTRUCTOR_SAMPLES,
  avgMs: Number(ctorAvg.toFixed(3)),
  opsPerSec: Number((1000 / ctorAvg).toFixed(0)),
}));

console.log('---');
console.log(`Ownership signing:  ${ownAvg.toFixed(3)} ms avg  [${Math.min(...ownershipTimes).toFixed(3)}–${Math.max(...ownershipTimes).toFixed(3)}]  ${(1000/ownAvg).toFixed(0)} ops/sec`);
console.log(`Message hash:      ${hashAvg.toFixed(4)} ms avg  ${(1000/hashAvg).toFixed(0)} ops/sec`);
console.log(`Constructor:       ${ctorAvg.toFixed(3)} ms avg  ${(1000/ctorAvg).toFixed(0)} ops/sec`);
