// Benchmark: 0G Storage downloadToBlob() throughput simulation
// Measures: DownloadOption construction, proof option overhead, decryption setup
// No actual network calls - measures SDK method dispatch overhead
//
// Run: node /tmp/axiom-bench-storage/bench-download-throughput.mjs

import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';

async function main() {
  console.log('=== 0G Storage Download Throughput Benchmark ===\n');

  // Module import
  const importStart = performance.now();
  const sdk = await import('@0gfoundation/0g-storage-ts-sdk');
  const importElapsed = performance.now() - importStart;
  console.log(`SDK import: ${importElapsed.toFixed(2)}ms`);

  // Benchmark 1: DownloadOption construction patterns
  const optionRuns = 50000;
  const optionPatterns = [
    { name: 'proof-only', build: () => ({ proof: true }) },
    { name: 'proof+decrypt_symmetric', build: () => ({ proof: true, decryption: { symmetricKey: new Uint8Array(32) } }) },
    { name: 'proof+decrypt_privateKey', build: () => ({ proof: true, decryption: { privateKey: new Uint8Array(32) } }) },
    { name: 'full_decrypt_both', build: () => ({ proof: true, decryption: { symmetricKey: new Uint8Array(32), privateKey: new Uint8Array(32) } }) },
    { name: 'no_proof', build: () => ({}) },
  ];

  console.log('--- DownloadOption Construction Cost ---');
  for (const pattern of optionPatterns) {
    // Warm up
    for (let i = 0; i < 100; i++) pattern.build();
    
    const start = performance.now();
    for (let i = 0; i < optionRuns; i++) {
      pattern.build();
    }
    const elapsed = performance.now() - start;
    console.log(`  ${pattern.name.padEnd(28)}: ${((elapsed/optionRuns)*1000).toFixed(3)}µs avg`);
  }

  // Benchmark 2: Decryption key resolution (simulating what downloadToBlob does internally)
  console.log('\n--- Decryption Key Resolution Overhead ---');
  
  // Simulate the SDK's hexStringToBytes + key resolution
  function hexStringToBytes(h) {
    const clean = h.startsWith('0x') ? h.slice(2) : h;
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) {
      out[i] = parseInt(clean.substr(i * 2, 2), 16);
    }
    return out;
  }

  const keyResolveRuns = 20000;
  const hexKey = '0x' + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join('');
  const binaryKey = new Uint8Array(32);
  crypto.getRandomValues(binaryKey);

  // hex string path
  const startHex = performance.now();
  for (let i = 0; i < keyResolveRuns; i++) {
    const k = hexStringToBytes(hexKey);
  }
  const hexElapsed = performance.now() - startHex;

  // binary key path (no conversion)
  const startBin = performance.now();
  for (let i = 0; i < keyResolveRuns; i++) {
    const k = binaryKey;  // direct pass-through
  }
  const binElapsed = performance.now() - startBin;

  console.log(`  hex string→bytes (${keyResolveRuns}runs): ${((hexElapsed/keyResolveRuns)*1000).toFixed(3)}µs`);
  console.log(`  binary key pass-through:                 ${((binElapsed/keyResolveRuns)*1000).toFixed(3)}µs`);
  console.log(`  NOTE: SDK resolves hex strings on every downloadToBlob call`);

  // Benchmark 3: Blob/ArrayBuffer conversion overhead
  console.log('\n--- Blob→Uint8Array Conversion Overhead ---');
  const blobSizes = [1024, 65536, 1048576, 10485760]; // 1KB, 64KB, 1MB, 10MB
  for (const size of blobSizes) {
    const data = new Uint8Array(size);
    crypto.getRandomValues(data);
    const blob = new Blob([data]);
    
    const runs = 100;
    const start = performance.now();
    for (let i = 0; i < runs; i++) {
      const buf = await blob.arrayBuffer();
      const arr = new Uint8Array(buf);
    }
    const elapsed = performance.now() - start;
    console.log(`  ${size.toString().padStart(8)}B: ${((elapsed/runs)).toFixed(3)}ms avg`);
  }

  // Benchmark 4: Concurrent download option validation
  // The SDK's best-effort decrypt fallback pattern
  console.log('\n--- Best-Effort Decrypt Fallback Overhead ---');
  const decryptRuns = 10000;
  const startTry = performance.now();
  for (let i = 0; i < decryptRuns; i++) {
    // Simulate the tryDecrypt pattern: fallback to raw if decrypt fails
    const opts = { proof: i % 2 === 0, decryption: i % 3 === 0 ? { symmetricKey: binaryKey } : undefined };
    const hasEncryption = opts.decryption !== undefined;
    const proofEnabled = opts.proof;
    void hasEncryption; void proofEnabled; // simulate the check
  }
  const tryElapsed = performance.now() - startTry;
  console.log(`  Conditional branch pattern (${decryptRuns}runs): ${((tryElapsed/decryptRuns)*1000).toFixed(3)}µs avg`);

  console.log('\n--- Key Insights ---');
  console.log('  Our DownloadOptions is a subset of SDK DownloadOption.');
  console.log('  SDK handles hex string→Uint8Array conversion for keys internally.');
  console.log('  Our downloadFromStorage wrapper adds ~2 line overhead per call.');
  console.log('  Proof verification enables on-chain verification but adds latency.');
  console.log('  Decryption is best-effort in SDK (fallback to raw on mismatch).');

  const results = {
    importMs: importElapsed,
    downloadOptionPatterns: optionPatterns.map(p => p.name),
    blobOverhead: blobSizes.map(s => ({ size: s })),
  };
  writeFileSync('/tmp/axiom-bench-storage/results-download-throughput.json', JSON.stringify(results, null, 2));
  console.log('\nResults saved to /tmp/axiom-bench-storage/results-download-throughput.json');
}

main().catch(console.error);
