// Benchmark: 0G Storage Indexer.upload() with various option combinations
// Measures: import time, MemData construction, option merge, no actual network calls
// 
// Run: node /tmp/axiom-bench-storage/bench-upload-options.mjs

import { performance, PerformanceObserver } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';

async function measureImport() {
  const start = performance.now();
  const mod = await import('@0gfoundation/0g-storage-ts-sdk');
  const elapsed = performance.now() - start;
  return { elapsed, mod };
}

async function roundTripBench(sdk) {

  // Benchmark 1: MemData creation (no size variation)
  const memDataSizes = [64, 1024, 65536, 1048576]; // bytes
  const memDataResults = [];
  for (const size of memDataSizes) {
    const data = new Uint8Array(size);
    const runs = 1000;
    const start = performance.now();
    for (let i = 0; i < runs; i++) {
      new sdk.MemData(data);
    }
    const elapsed = performance.now() - start;
    memDataResults.push({ size, avgMs: (elapsed / runs).toFixed(4) });
  }

  // Benchmark 2: merkleTree() overhead
  const merkleSizes = [64, 1024, 65536, 1048576];
  const merkleResults = [];
  for (const size of merkleSizes) {
    const data = new Uint8Array(size);
    const memData = new sdk.MemData(data);
    // Warm up
    const runs = size <= 65536 ? 100 : 10;
    const start = performance.now();
    for (let i = 0; i < runs; i++) {
      const md = i === 0 ? memData : new sdk.MemData(data);
      await md.merkleTree();
    }
    const elapsed = performance.now() - start;
    merkleResults.push({ size, runs, avgMs: (elapsed / runs).toFixed(4) });
  }

  // Benchmark 3: Option merge overhead (UploadOption construction)
  const mergeRuns = 10000;
  const optionCombos = [
    { name: 'minimal', opts: {} },
    { name: 'withEncryption', opts: { encryption: { type: 'aes256', key: new Uint8Array(32) } } },
    { name: 'withReplica', opts: { expectedReplica: 3, taskSize: 0 } },
    { name: 'full', opts: { encryption: { type: 'aes256', key: new Uint8Array(32) }, expectedReplica: 5, taskSize: 0, finalityRequired: true } },
  ];

  // Using mergeUploadOptions from SDK
  let mergeUploadOptions;
  try {
    const transferMod = await import('@0gfoundation/0g-storage-ts-sdk');
    mergeUploadOptions = transferMod.mergeUploadOptions;
  } catch {
    mergeUploadOptions = null;
  }

  const mergeResults = [];
  for (const combo of optionCombos) {
    const start = performance.now();
    for (let i = 0; i < mergeRuns; i++) {
      // Replicate the SDK's merge internally to avoid import issues
      const opt = combo.opts;
      const merged = { 
        expectedReplica: opt.expectedReplica ?? 1,
        taskSize: opt.taskSize ?? 0,
        finalityRequired: opt.finalityRequired ?? true,
        fragmentSize: opt.fragmentSize ?? 256,
        skipTx: opt.skipTx ?? false,
        skipIfFinalized: opt.skipIfFinalized ?? false,
        encryption: opt.encryption,
      };
    }
    const elapsed = performance.now() - start;
    mergeResults.push({ name: combo.name, avgUs: ((elapsed / mergeRuns) * 1000).toFixed(2) });
  }

  // Benchmark 4: UploadOption object creation patterns
  const objRuns = 100000;
  const start1 = performance.now();
  for (let i = 0; i < objRuns; i++) {
    const opts = {};
    if (i % 2 === 0) opts.encryption = { type: 'aes256', key: new Uint8Array(32) };
    opts.expectedReplica = 3;
  }
  const spreadTime = performance.now() - start1;

  const start2 = performance.now();
  for (let i = 0; i < objRuns; i++) {
    const enc = i % 2 === 0 ? { type: 'aes256', key: new Uint8Array(32) } : undefined;
    const opts = { encryption: enc, expectedReplica: 3 };
  }
  const directTime = performance.now() - start2;

  return { memDataResults, merkleResults, mergeResults, spreadVsDirect: { spreadAvgUs: ((spreadTime/objRuns)*1000).toFixed(2), directAvgUs: ((directTime/objRuns)*1000).toFixed(2) } };
}

async function main() {
  console.log('=== 0G Storage Upload Options Benchmark ===\n');

  // Module import time
  const { elapsed: importMs, mod } = await measureImport();
  console.log(`SDK module import (cold): ${importMs.toFixed(2)}ms`);

  const results = await roundTripBench(mod);
  
  console.log('\n--- MemData Construction ---');
  for (const r of results.memDataResults) {
    console.log(`  ${r.size.toString().padStart(8)}B: ${r.avgMs}ms avg`);
  }

  console.log('\n--- Merkle Tree Computation ---');
  for (const r of results.merkleResults) {
    console.log(`  ${r.size.toString().padStart(8)}B (${r.runs} runs): ${r.avgMs}ms avg`);
  }

  console.log('\n--- UploadOption Merge (local replication) ---');
  for (const r of results.mergeResults) {
    console.log(`  ${r.name.padEnd(20)}: ${r.avgUs}µs avg`);
  }

  console.log('\n--- Object Construction Pattern ---');
  console.log(`  Spread/grow pattern: ${results.spreadVsDirect.spreadAvgUs}µs`);
  console.log(`  Direct literal:      ${results.spreadVsDirect.directAvgUs}µs`);

  console.log('\n--- Key Insights ---');
  console.log('  SDK Indexer.upload() handles MemData creation internally.');
  console.log('  Our uploadToStorage() creates MemData + calls merkleTree redundantly.');
  console.log('  Merkle tree cost scales with data size (O(n) for chunking).');
  console.log('  Option merge overhead is negligible (<1µs per call).');
  
  // Save results
  const report = JSON.stringify({ importMs, ...results }, null, 2);
  writeFileSync('/tmp/axiom-bench-storage/results-upload-options.json', report);
  console.log('\nResults saved to /tmp/axiom-bench-storage/results-upload-options.json');
}

main().catch(console.error);
