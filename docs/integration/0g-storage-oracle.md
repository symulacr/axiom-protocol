# Oracle ↔ 0G Storage Integration Guide

> How the Axiom TEE oracle service integrates with the 0G Storage
> network for encrypted blob upload/download during ERC-7857 re-keying.
> Companion to `docs/research/wave-2-findings.md`.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [StorageAdapter Interface](#2-storageadapter-interface)
3. [Configuration](#3-configuration)
4. [Upload: Ciphertext → 0G Storage](#4-upload-ciphertext--0g-storage)
5. [Download: 0G Storage → Ciphertext](#5-download-0g-storage--ciphertext)
6. [Re-Keying Flow](#6-re-keying-flow)
7. [Code Patterns](#7-code-patterns)
8. [Error Handling](#8-error-handling)
9. [Testing](#9-testing)
10. [Migration: InMemoryStorage → 0G Storage](#10-migration-inmemorystorage--0g-storage)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Oracle Service                          │
│                                                             │
│  POST /v1/transfer-validity                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 1. Download old ciphertext (storage.download)       │   │
│  │ 2. Decrypt with oldDataEncryptionKey (AES-256-GCM)  │   │
│  │ 3. Generate new AES-256 key                          │   │
│  │ 4. Re-encrypt plaintext (AES-256-GCM)               │   │
│  │ 5. Upload new ciphertext (storage.upload)           │   │
│  │ 6. Seal new key for receiver (ECIES)                │   │
│  │ 7. Sign OwnershipProof (TEE signer)                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│          ┌───────────────┴───────────────┐                 │
│          ▼                               ▼                  │
│  ┌──────────────┐               ┌──────────────┐           │
│  │ StorageAdapter│               │  TeeSigner   │           │
│  │ (interface)  │               │  (ECDSA)     │           │
│  └──────┬───────┘               └──────────────┘           │
│         │                                                    │
└─────────┼────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────┐
│        0G Storage Network       │
│                                 │
│  Indexer (RPC)                  │
│    └─ selectNodes()             │
│    └─ upload(MemData, signer)   │
│    └─ downloadToBlob(rootHash)  │
│                                 │
│  Storage Nodes (sharded)        │
│    └─ Merkle-rooted segments    │
└─────────────────────────────────┘
```

The oracle treats storage as a blob store with a simple interface:
`upload(bytes) → rootHash` and `download(rootHash) → bytes`. The 0G
Storage SDK handles node selection, sharding, Merkle proofs, and
on-chain payment transparently.

---

## 2. StorageAdapter Interface

Defined in `apps/oracle/src/storage.ts:14–19`:

```typescript
export interface StorageAdapter {
  upload(blob: Uint8Array): Promise<{ rootHash: Hex }>;
  download(rootHash: Hex): Promise<Uint8Array>;
  markDataHashSeen(rootHash: Hex): void;
  hasSeenDataHash(rootHash: Hex): boolean;
}
```

| Method | Purpose |
|--------|---------|
| `upload(blob)` | Store encrypted bytes, return the Merkle root hash |
| `download(rootHash)` | Retrieve encrypted bytes by root hash |
| `markDataHashSeen(rootHash)` | Record that the oracle has processed this root (seen-set) |
| `hasSeenDataHash(rootHash)` | Check if the oracle has seen this root (used by `/v1/ownership`) |

The seen-set is an oracle-local cache (`Set<string>`) that binds signed
proofs to previously-uploaded storage roots. It prevents the oracle
from signing ownership proofs for data it hasn't processed. In
`InMemoryStorage` it's in-memory; in the 0G Storage adapter it should
also be in-memory (the set is a runtime concern, not persisted).

---

## 3. Configuration

### 3.1 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OG_STORAGE_RPC` | `https://indexer-storage-testnet-turbo.0g.ai` | 0G Storage indexer URL (Turbo testnet) |
| `OG_EVM_RPC` | `https://evmrpc-testnet.0g.ai` | EVM RPC for storage tx signing |
| `OG_STORAGE_PRIVATE_KEY` | _(required)_ | Wallet private key for signing storage uploads (needs 0G tokens) |
| `OG_CHAIN_ID` | `16602` | EIP-155 chain ID (16602 = Galileo testnet, 16661 = Aristotle mainnet) |

### 3.2 Network Endpoints

From `apps/backend/src/storage/0g.ts:55–58`:

```typescript
export const OG_NETWORKS = {
  16602: { name: "galileo",   chainId: 16602,
           storageRpc: "https://indexer-storage-testnet-turbo.0g.ai",
           flowContract: "0x22E03a6A89B950F1c82ec5e74F8eCa321a105296" },
  16661: { name: "aristotle", chainId: 16661,
           storageRpc: "https://indexer-storage-turbo.0g.ai",
           flowContract: "0x62D4144dB0F0a6fBBaeb6296c785C71B3D57C526" },
} as const;
```

The Turbo indexer is recommended (faster finality). The SDK
auto-discovers the flow contract from the indexer's node status, so
explicitly passing the flow address is optional but recommended for
determinism.

### 3.3 Adapter Instantiation

The adapter needs an `Indexer` (for RPC) and an ethers `Wallet` (for
signing storage transactions):

```typescript
import { Indexer, MemData } from "@0gfoundation/0g-storage-ts-sdk";
import { ethers } from "ethers";
import type { Signer } from "ethers";
import type { Hex } from "viem";
import type { StorageAdapter } from "./storage.js";

export class ZeroGStorageAdapter implements StorageAdapter {
  private readonly indexer: Indexer;
  private readonly evmRpc: string;
  private readonly signer: Signer;
  private readonly seenDataHashes = new Set<string>();

  constructor(opts: {
    indexerRpc: string;
    evmRpc: string;
    signer: Signer;
  }) {
    this.indexer = new Indexer(opts.indexerRpc);
    this.evmRpc = opts.evmRpc;
    this.signer = opts.signer;
  }
  // ... upload, download, markDataHashSeen, hasSeenDataHash
}
```

---

## 4. Upload: Ciphertext → 0G Storage

### 4.1 API Call

```typescript
async upload(blob: Uint8Array): Promise<{ rootHash: Hex }> {
  const memData = new MemData(blob);
  const [tx, err] = await this.indexer.upload(
    memData,
    this.evmRpc,
    this.signer,
    // No encryption option — the oracle encrypts BEFORE calling upload.
    // The blob passed here is already AES-256-GCM ciphertext.
  );
  if (err !== null) throw err;

  // Handle both single-blob and fragmented (>4GB) return shapes
  if ("rootHash" in tx) {
    return { rootHash: tx.rootHash as Hex };
  }
  // Fragmented: take the first root (oracle blobs are small, this
  // path is unlikely but must be handled)
  const firstRoot = tx.rootHashes[0];
  if (!firstRoot) throw new Error("0G Storage upload returned empty rootHashes");
  return { rootHash: firstRoot as Hex };
}
```

### 4.2 Key Points

- **Use `MemData`, not `ZgFile`.** The oracle works with in-memory
  `Uint8Array` buffers, not filesystem files. `MemData` wraps a
  `Uint8Array` and requires no `merkleTree()` call or `close()`.
- **No SDK encryption option.** The oracle applies its own AES-256-GCM
  encryption (`crypto/aes-gcm.ts`) before calling `storage.upload()`.
  Passing `encryption` in the upload options would double-encrypt.
- **Handle both return shapes.** Single blob returns `{ rootHash, txHash,
  txSeq }`; fragmented returns `{ rootHashes, txHashes, txSeqs }`. The
  oracle's blobs are small (agent metadata, not multi-GB datasets), so
  the single-blob path is expected, but the adapter must not crash on
  the fragmented shape.
- **Always check `err`.** The SDK returns `[result, err]` tuples. An
  `err !== null` means the upload failed — throw it.

### 4.3 What Happens Internally

1. `Indexer.upload` calls `selectNodes(expectedReplica)` to get trusted storage nodes
2. Gets the first node's `flowAddress` and instantiates the Flow contract
3. Creates an `Uploader` with the selected nodes
4. Calls `uploader.splitableUpload(file, opts)` — builds the Merkle tree, splits into segments if > 4 GB, uploads each segment to the appropriate shard nodes, and submits a storage transaction on-chain
5. Returns the root hash (Merkle root of the full file)

The on-chain transaction costs gas — the signer wallet must hold 0G
tokens.

---

## 5. Download: 0G Storage → Ciphertext

### 5.1 API Call

```typescript
async download(rootHash: Hex): Promise<Uint8Array> {
  const [blob, err] = await this.indexer.downloadToBlob(rootHash, {
    proof: true,   // Merkle proof verification — recommended for integrity
    // No decryption option — the oracle decrypts AFTER download using
    // its own AES-256-GCM layer. The blob returned here is raw ciphertext.
  });
  if (err !== null) throw err;
  if (!blob) throw new Error(`0G Storage download returned no blob for ${rootHash}`);

  return new Uint8Array(await blob.arrayBuffer());
}
```

### 5.2 Key Points

- **Use `downloadToBlob`, not `download`.** The `download` method writes
  to a filesystem path (Node.js only). `downloadToBlob` returns a `Blob`
  and works in both Node.js and browser environments. The oracle needs
  in-memory bytes.
- **Enable `proof: true`.** Merkle proof verification ensures the
  downloaded data matches the root hash — critical for integrity in a
  decentralized storage system.
- **No decryption option.** The oracle handles decryption itself
  (`aesGcmDecrypt` in `server.ts:66`). The SDK's built-in decryption
  (v1/v2 encryption headers) is not used because the oracle uses its
  own AES-256-GCM format (`parseEncrypted` / `concatEncrypted`).
- **Return type is `[Blob, Error | null]`.** Always null-check the
  error before accessing the blob.

### 5.3 What Happens Internally

1. `Indexer.downloadToBlob` calls `getFileLocations(rootHash)` to find all nodes holding the file
2. Selects a covering shard set using the `random` method (load balancing)
3. Creates a `Downloader` with the selected nodes
4. Fetches all segments and assembles them into a `Blob`
5. If `decryption` is supplied, parses the encryption header and decrypts (not used here)

---

## 6. Re-Keying Flow

The full `/v1/transfer-validity` flow (`server.ts:34–108`), annotated
with storage calls:

```
Client (backend) → POST /v1/transfer-validity
  Body: { oldDataHash, oldDataUri, targetPubkey64, nonces, oldDataEncryptionKey }

Oracle:
  1. storage.download(oldDataUri)          ← 0G Storage download
     → oldBlob (raw ciphertext bytes)

  2. parseEncrypted(oldBlob)
     → oldEnc { ciphertext, nonce, tag }   ← AES-256-GCM parse

  3. aesGcmDecrypt(oldDataKey, oldEnc)
     → oldPlaintext                         ← decrypt with caller-supplied key

  4. newDataKey = randomBytes(32)           ← fresh AES-256 key

  5. aesGcmEncrypt(newDataKey, oldPlaintext)
     → newEnc                               ← re-encrypt

  6. concatEncrypted(newEnc)
     → newBlob (raw ciphertext bytes)

  7. storage.upload(newBlob)                ← 0G Storage upload
     → { rootHash: newDataHash }

  8. storage.markDataHashSeen(newDataHash)  ← seen-set update

  9. sealKeyForReceiver(targetPubkey, newDataKey)
     → sealedKey                            ← ECIES seal for receiver

  10. signer.signOwnership({ dataHash, sealedKey, targetPubkey, nonce, validUntil })
      → ownershipSignature                  ← TEE attestation

  Response: { newDataUri, newDataHash, sealedKey, ownershipSignature, nonces }
```

### 6.1 ERC-7857 Compliance

This flow satisfies all 5 verification checks the on-chain
`verifyTransferValidity()` performs:

| Check | How Satisfied |
|-------|--------------|
| 1. Pre-image knowledge | Oracle downloaded and decrypted the old data (step 1–3) |
| 2. Correct re-encryption | Old key decrypts old ciphertext, new key re-encrypts (step 3–5) |
| 3. Secure key transmission | New key sealed with receiver's pubkey via ECIES (step 9) |
| 4. Hash integrity | `newDataHash` = root hash of uploaded new ciphertext (step 7) |
| 5. Data availability | New ciphertext uploaded to 0G Storage, root hash returned (step 7) |

The `ownershipSignature` (step 10) is the TEE attestation that the
on-chain verifier checks via `teeOracleVerify()`.

---

## 7. Code Patterns

### 7.1 Adapter (Reference Shape)

```typescript
import { Indexer, MemData } from "@0gfoundation/0g-storage-ts-sdk";
import type { Signer } from "ethers";
import type { Hex } from "viem";
import type { StorageAdapter } from "./storage.js";

export interface ZeroGStorageAdapterConfig {
  indexerRpc: string;
  evmRpc: string;
  signer: Signer;
}

export class ZeroGStorageAdapter implements StorageAdapter {
  private readonly indexer: Indexer;
  private readonly evmRpc: string;
  private readonly signer: Signer;
  private readonly seenDataHashes = new Set<string>();

  constructor(config: ZeroGStorageAdapterConfig) {
    this.indexer = new Indexer(config.indexerRpc);
    this.evmRpc = config.evmRpc;
    this.signer = config.signer;
  }

  async upload(blob: Uint8Array): Promise<{ rootHash: Hex }> {
    const [tx, err] = await this.indexer.upload(
      new MemData(blob),
      this.evmRpc,
      this.signer,
    );
    if (err !== null) throw err;
    if ("rootHash" in tx) return { rootHash: tx.rootHash as Hex };
    const first = tx.rootHashes[0];
    if (!first) throw new Error("0G Storage upload returned empty rootHashes");
    return { rootHash: first as Hex };
  }

  async download(rootHash: Hex): Promise<Uint8Array> {
    const [blob, err] = await this.indexer.downloadToBlob(rootHash, {
      proof: true,
    });
    if (err !== null) throw err;
    if (!blob) throw new Error(`No blob for ${rootHash}`);
    return new Uint8Array(await blob.arrayBuffer());
  }

  markDataHashSeen(rootHash: Hex): void {
    this.seenDataHashes.add(rootHash.toLowerCase());
  }

  hasSeenDataHash(rootHash: Hex): boolean {
    return this.seenDataHashes.has(rootHash.toLowerCase());
  }
}
```

### 7.2 Server Wiring

In `apps/oracle/src/index.ts` (or wherever the server is constructed),
swap `InMemoryStorage` for `ZeroGStorageAdapter`:

```typescript
import { ZeroGStorageAdapter } from "./storage-0g.js";
import { ethers } from "ethers";

const storageSigner = new ethers.Wallet(
  process.env.OG_STORAGE_PRIVATE_KEY!,
  new ethers.JsonRpcProvider(process.env.OG_EVM_RPC!),
);

const storage = new ZeroGStorageAdapter({
  indexerRpc: process.env.OG_STORAGE_RPC!,
  evmRpc: process.env.OG_EVM_RPC!,
  signer: storageSigner,
});

startServer({ signer: teeSigner, storage, bind, port });
```

### 7.3 Backend Reference

The backend's `ZeroGStorage` class (`apps/backend/src/storage/0g.ts:93–162`)
is the canonical reference for 0G Storage SDK usage in this repo. It
already handles:
- Dual return-shape normalization (`unwrapUploadResult`, lines 148–161)
- In-memory upload via `MemData` (`uploadData`, line 114)
- `downloadToBlob` with proof verification (`download`, line 141)
- Network selection by chain ID (`OG_NETWORKS`, lines 55–58)

The oracle adapter should follow the same patterns.

---

## 8. Error Handling

### 8.1 Upload Failures

| Error | Cause | Mitigation |
|-------|-------|-----------|
| `err !== null` from `indexer.upload` | Network error, insufficient gas, node unavailable | Retry with backoff; ensure signer has 0G tokens |
| Empty `rootHashes` array | Fragmented upload with no fragments (shouldn't happen) | Throw explicit error |
| Gas estimation failure | Signer has no 0G tokens | Fund the wallet; check balance before upload |

### 8.2 Download Failures

| Error | Cause | Mitigation |
|-------|-------|-----------|
| `err !== null` from `downloadToBlob` | Root hash not found, all nodes unavailable | Retry; verify the root hash exists via `getFileLocations` |
| `No locations found for root hash` | Blob was never uploaded, or uploaded to a different network (Turbo vs Standard) | Verify network consistency; check indexer URL |
| `null` blob with no error | Edge case in SDK | Throw explicit error (handled in pattern above) |

### 8.3 Recommended Retry Strategy

```typescript
async function uploadWithRetry(
  storage: StorageAdapter,
  blob: Uint8Array,
  maxRetries = 3,
): Promise<{ rootHash: Hex }> {
  let lastErr: Error | null = null;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await storage.upload(blob);
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (i < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * (i + 1))); // backoff
      }
    }
  }
  throw lastErr;
}
```

---

## 9. Testing

### 9.1 Unit Tests (InMemoryStorage)

The existing `InMemoryStorage` adapter is designed for isolated oracle
testing without a live 0G Storage node. Tests should continue to use
`InMemoryStorage` for:

- Re-keying logic (decrypt → re-encrypt → seal → sign)
- Seen-set behavior
- Error paths (missing fields, bad key length)

### 9.2 Integration Tests (Live 0G Storage)

For testing the real adapter against Galileo testnet:

```typescript
import { ZeroGStorageAdapter } from "./storage-0g.js";

const adapter = new ZeroGStorageAdapter({
  indexerRpc: "https://indexer-storage-testnet-turbo.0g.ai",
  evmRpc: "https://evmrpc-testnet.0g.ai",
  signer: testWallet,  // wallet with testnet 0G tokens
});

// Round-trip test
const data = new TextEncoder().encode("test ciphertext");
const { rootHash } = await adapter.upload(data);
const retrieved = await adapter.download(rootHash);
assert.deepEqual(retrieved, data);
```

> **Note:** The existing oracle test suite has 1 pre-existing failure
> related to 0G Storage network availability. Integration tests against
> the live network are inherently flaky — mark them as
> `@integration` / skip in CI unless a network is available.

### 9.3 Mock for CI

For CI environments without 0G Storage access, inject
`InMemoryStorage` (the existing adapter). The `StorageAdapter` interface
makes this a zero-code-change swap.

---

## 10. Migration: InMemoryStorage → 0G Storage

### 10.1 What Changes

| Aspect | InMemoryStorage | ZeroGStorageAdapter |
|--------|----------------|---------------------|
| `upload()` | `keccak256(blob)` as root | Real Merkle root from 0G Storage network |
| `download()` | Map lookup | Network download via indexer + storage nodes |
| Persistence | In-memory `Map` (lost on restart) | Decentralized (persistent, replicated) |
| Cost | Free | Gas cost per upload (signer needs 0G tokens) |
| Latency | < 1 ms | Seconds (network round-trip + tx finality) |
| Seen-set | In-memory `Set` | In-memory `Set` (same — runtime concern) |

### 10.2 What Does NOT Change

- **The `StorageAdapter` interface** — both adapters implement the same 4 methods
- **The `/v1/transfer-validity` handler** — calls `storage.download`, `storage.upload`, `storage.markDataHashSeen` identically
- **The `/v1/ownership` handler** — calls `storage.hasSeenDataHash` identically
- **The oracle's crypto layer** — AES-256-GCM encrypt/decrypt and ECIES sealing happen before/after storage calls, unchanged
- **The TEE signer** — signature logic is independent of storage

### 10.3 Migration Steps

1. **Create** `apps/oracle/src/storage-0g.ts` implementing `ZeroGStorageAdapter` (follows the pattern in section 7.1)
2. **Wire** the adapter in `apps/oracle/src/index.ts` (section 7.2), gated by env var presence
3. **Keep** `InMemoryStorage` as the fallback for tests / devnet
4. **Add** env vars: `OG_STORAGE_RPC`, `OG_EVM_RPC`, `OG_STORAGE_PRIVATE_KEY`, `OG_CHAIN_ID`
5. **Test** round-trip upload/download against Galileo testnet
6. **Verify** the full `/v1/transfer-validity` flow end-to-end with real storage

### 10.4 Backward Compatibility

The `StorageAdapter` interface is the seam. No caller of
`storage.upload` / `storage.download` needs to change. The server
handler code (`server.ts:34–108`) is storage-agnostic — it only depends
on the interface methods. Swapping adapters is a constructor-time
change, not a code change in the handlers.
