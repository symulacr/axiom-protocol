# 0G Stack Storage — Research Report

**Date**: 2026-06-24  
**Scope**: Axiom Protocol's integration with `@0gfoundation/0g-storage-ts-sdk` (v1.2.10)  
**Objective**: Canonical-pattern comparison, code critique, dedup opportunities

---

## 1. Web Research — Canonical 0G Storage SDK

### 1.1 Official Documentation

Source: `https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk`

#### Installation

```
npm install @0gfoundation/0g-storage-ts-sdk ethers
```

`ethers` is a required peer dependency.

#### Import

```ts
import { ZgFile, Indexer, MemData } from '@0gfoundation/0g-storage-ts-sdk';
import { ethers } from 'ethers';
```

#### Canonical Network Endpoints

| Network | Mode | EVM RPC | Indexer RPC |
|---------|------|---------|-------------|
| Galileo testnet | Turbo | `https://evmrpc-testnet.0g.ai` | `https://indexer-storage-testnet-turbo.0g.ai` |
| Mainnet | Turbo | `https://evmrpc.0g.ai` | `https://indexer-storage-turbo.0g.ai` |

0G Storage has two independent networks: **Turbo** (faster, higher fees) and **Standard** (slower, lower fees). Each uses a different indexer URL. The SDK auto-discovers the correct flow contract from the indexer.

#### Canonical Init Pattern

```ts
const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet('YOUR_PRIVATE_KEY', provider);
const indexer = new Indexer(INDEXER_RPC);
```

#### Canonical File Upload Pattern

```ts
const file = await ZgFile.fromFilePath(filePath);
const [tree, treeErr] = await file.merkleTree();  // MUST call merkleTree() first
const [tx, uploadErr] = await indexer.upload(file, RPC_URL, signer);
await file.close();
// tx.rootHash or tx.rootHashes (for >4GB fragmented files)
```

#### Canonical In-Memory Upload (MemData)

```ts
const data = new TextEncoder().encode('Hello, 0G Storage!');
const memData = new MemData(data);
const [tree, treeErr] = await memData.merkleTree();
const [tx, err] = await indexer.upload(memData, RPC_URL, signer);
```

#### Canonical Download (file to disk)

```ts
const err = await indexer.download(rootHash, outputPath, withProof);
```

#### Canonical Download (blob with encryption)

```ts
const [blob, dlErr] = await indexer.downloadToBlob(rootHash, {
  proof: true,
  decryption: { symmetricKey: key },
});
```

#### Canonical Encryption Patterns (SDK v1.2.6+)

**AES-256:**
```ts
const key = crypto.randomBytes(32);
const [tx, err] = await indexer.upload(file, rpcUrl, signer, {
  encryption: { type: 'aes256', key },
});
// Download:
const [blob, dlErr] = await indexer.downloadToBlob(rootHash, {
  proof: true,
  decryption: { symmetricKey: key },
});
```

**ECIES:**
```ts
const recipientPubKey = ethers.SigningKey.computePublicKey(wallet.signingKey.publicKey, true);
const [tx, err] = await indexer.upload(file, rpcUrl, signer, {
  encryption: { type: 'ecies', recipientPubKey },
});
// Download:
const [blob, dlErr] = await indexer.downloadToBlob(rootHash, {
  proof: true,
  decryption: { privateKey },
});
```

**Encryption header detection:**
```ts
const [header, err] = await indexer.peekHeader(rootHash);
// header.version === 1 → aes256
// header.version === 2 → ecies
```

#### Canonical KV Storage Pattern (UNUSED by Axiom)

```ts
// Upload to KV:
const [nodes, err] = await indexer.selectNodes(1);
const batcher = new Batcher(1, nodes, flowContract, RPC_URL);
const keyBytes = Uint8Array.from(Buffer.from(key, 'utf-8'));
const valueBytes = Uint8Array.from(Buffer.from(value, 'utf-8'));
batcher.streamDataBuilder.set(streamId, keyBytes, valueBytes);
const [tx, batchErr] = await batcher.exec();

// Download from KV:
const kvClient = new KvClient("http://3.101.147.150:6789");
const value = await kvClient.getValue(streamId, ethers.encodeBase64(keyBytes));
```

#### Key SDK Exports

| Export | Type | Used by Axiom |
|--------|------|--------------|
| `Indexer` | class | ✅ `new Indexer(url)` x3 |
| `MemData` | class | ✅ `new MemData(data)` |
| `ZgFile` | class | ❌ (no file-system uploads) |
| `Blob` (browser) | class | ❌ |
| `KvClient` | class | ❌ |
| `Batcher` | class | ❌ |
| `indexer.upload()` | method | ✅ |
| `indexer.download()` | method | ❌ (uses `downloadToBlob`) |
| `indexer.downloadToBlob()` | method | ✅ |
| `indexer.selectNodes()` | method | ❌ |
| `indexer.peekHeader()` | method | ❌ |
| `FlowContract` | class | ❌ (auto-discovered by SDK) |

---

### 1.2 Network Configuration (from docs)

**Galileo Testnet (Chain ID: 16602):**
- EVM RPC: `https://evmrpc-testnet.0g.ai`
- Storage Indexer (Turbo): `https://indexer-storage-testnet-turbo.0g.ai`
- Flow Contract: `0x22E03a6A89B950F1c82ec5e74F8eCa321a105296`

**Mainnet (Chain ID: 16661):**
- EVM RPC: `https://evmrpc.0g.ai`
- Storage Indexer (Turbo): `https://indexer-storage-turbo.0g.ai`
- Flow Contract: `0x62D4144dB0F0a6fBBaeb6296c785C71B3D57C526`

---

## 2. Codebase File Trace

### 2.1 `packages/config/src/storage/0g.ts` — Shared SDK Core

**Path**: `/home/eya/og/packages/config/src/storage/0g.ts`

**Role**: The canonical shared wrapper. Imports `Indexer` and `MemData` from the SDK.

**Exports**:
- `uploadToStorage(indexer, data, evmRpc, signer, encryption?)` — wraps `indexer.upload(new MemData(data), evmRpc, signer, opts)`
- `downloadFromStorage(indexer, rootHash, opts?)` — wraps `indexer.downloadToBlob(rootHash, downloadOpts)`

**Key observations**:
- Uses `MemData` (in-memory) only — no `ZgFile` file-based uploads
- `downloadFromStorage` uses `downloadToBlob` (supports encryption) — correct choice
- Returns `{ rootHash, txHash, size }` as `UploadResult`
- Returns `{ data, rootHash, size }` as `DownloadResult`
- Handles fragmented upload results (`rootHash` vs `rootHashes`)
- The `EncryptionOption` type is defined locally, duplicating the SDK's type
- Function takes `Indexer` as a parameter (not creating it internally) — good composability
- **No retry logic** (retry is handled by callers)

### 2.2 `apps/backend/src/storage/0g.ts` — Backend ZeroGStorage Wrapper

**Path**: `/home/eya/og/apps/backend/src/storage/0g.ts`

**Role**: Backend-specific typed wrapper with retry logic.

**Exports**:
- `withRetry(fn)` — generic retry with exponential backoff (100, 400, 900ms)
- `ZeroGStorage` class with `uploadData()` and `download()` methods

**Key observations**:
- Creates `new Indexer(config.indexerRpc)` in constructor — **1 of 3 Indexer instances**
- `uploadData()` calls shared `uploadToStorage()` wrapped in `withRetry()`
- `download()` calls shared `downloadFromStorage()` wrapped in `withRetry()`
- Only used in:
  - `apps/backend/src/server.ts` line 138 — backend server init
  - `apps/backend/src/cli/run-e2e.ts` line 114 — e2e test CLI
- Well-typed with `ZeroGStorageConfig` interface
- Exports `Encryption` type (same pattern, slightly different name than shared)
- Exports `OG_NETWORKS` and `pickOGNetwork` via re-export

### 2.3 `apps/backend/src/storage/0g.test.ts` — Storage Tests

**Path**: `/home/eya/og/apps/backend/src/storage/0g.test.ts`

**Role**: Node:test suite for 0G Storage roundtrip.

**Tests**:
1. "0G Storage unencrypted roundtrip" — uploads "Axiom agent model payload v1", downloads, asserts content match
2. "0G Storage AES-256 client-side encrypted roundtrip" — deterministic key, uploads "Secret agent intelligence", downloads with decryption

**Coverage**: Upload + download plaintext, upload + download encrypted (AES-256).
**Missing tests**: ECIES, fragmented uploads, error cases, invalid root hash.

### 2.4 `apps/oracle/src/storage.ts` — Oracle Storage Adapter

**Path**: `/home/eya/og/apps/oracle/src/storage.ts`

**Role**: Oracle-specific storage adapter with `StorageAdapter` interface.

**Exports**:
- `StorageAdapter` interface — `upload()`, `download()`, `markDataHashSeen()`, `hasSeenDataHash()`
- `InMemoryStorage` — dev/test adapter using keccak256 as fake root hash
- `ZeroGStorage` — production adapter wrapping shared `uploadToStorage()`/`downloadFromStorage()`

**Key observations**:
- Creates `new Indexer(config.indexerRpc)` in constructor — **2 of 3 Indexer instances**
- **DUPLICATE**: Has its own `ZeroGStorage` class that duplicates the backend's `ZeroGStorage` pattern
- Does NOT use the backend's `ZeroGStorage` class — uses shared `uploadToStorage`/`downloadFromStorage` directly
- **Differences from backend ZeroGStorage**:
  - Does NOT wrap in `withRetry()`
  - Has `markDataHashSeen`/`hasSeenDataHash` (seen-set tracking)
  - Uses `StorageAdapter` interface for polymorphism with `InMemoryStorage`
  - `download()` calls with `withProof: false` (backend defaults to true)
  - Missing `uploadData()` name — uses `upload()` directly
- The `StorageAdapter` interface **cannot be implemented by the backend's `ZeroGStorage`** because it lacks `markDataHashSeen`/`hasSeenDataHash`

### 2.5 `apps/oracle/src/index.ts` — Oracle Init

**Path**: `/home/eya/og/apps/oracle/src/index.ts`

**Key observations**:
- Conditionally creates `ZeroGStorage` or `InMemoryStorage` based on env
- Uses `AXIOM_STORAGE_INDEXER_RPC` and `AXIOM_STORAGE_EVM_RPC` env vars (different naming from backend's `AXIOM_STORAGE_RPC`)
- Supports key separation via `AXIOM_STORAGE_PRIVATE_KEY` (falls back to TEE signer key)
- `withProof` is **not used** for oracle downloads (`download` calls with `{withProof: false}`)

### 2.6 `apps/indexer/src/index.ts` — Indexer

**Path**: `/home/eya/og/apps/indexer/src/index.ts`

**Key observations**:
- Creates `new Indexer(ogStorageRpc)` — **3 of 3 Indexer instances**
- Does NOT use any wrapper class — uses shared `uploadToStorage()` directly
- Uses module-level `_storageIndexer`, `_storageSigner`, `_storageRpcUrl` variables
- Batches events into 5s/10-event batches before uploading
- Events are serialized as JSON → `TextEncoder().encode()` → `uploadToStorage()`
- Re-buffers events on failure (up to 10,000 events in buffer)
- The `composeSinks` function has a **dead code path**: the `"storage"` case in the switch statement calls `submitEvent(event, {})` which does nothing (empty options), then still pushes to `eventBuffer`. The actual 0G Storage upload happens in `flushBuffer()` called by the batch timer, not in `submitEvent`.

### 2.7 `packages/config/src/networks.ts` — Network Config

**Path**: `/home/eya/og/packages/config/src/networks.ts`

**Exports**:
- `OG_NETWORKS` — map of chainId → `{ name, evmRpc, storageRpc, flowContract }`
- `pickOGNetwork(chainId)` — lookup helper
- `resolveRpcUrl(chainId?)` — env-aware EVM RPC resolution
- `resolveStorageRpc(chainId?)` — env-aware Storage RPC resolution

**Values**:

| Chain | Chain ID | EVM RPC | Storage RPC | Flow Contract |
|-------|----------|---------|-------------|---------------|
| Galileo | 16602 | `https://evmrpc-testnet.0g.ai` | `https://indexer-storage-testnet-turbo.0g.ai` | `0x22E03a6A89B950F1c82ec5e74F8eCa321a105296` |
| Aristotle | 16661 | `https://evmrpc.0g.ai` | `https://indexer-storage-turbo.0g.ai` | `0x62D4144dB0F0a6fBBaeb6296c785C71B3D57C526` |

**Note**: The mainnet flow contract `0x62D4144dB0F0a6fBBaeb6296c785C71B3D57C526` matches the official docs. The testnet flow contract `0x22E03a6A89B950F1c82ec5e74F8eCa321a105296` is correct as well. The SDK auto-discovers the flow contract from the indexer anyway, so this config is informational.

### 2.8 package.json Files — SDK Version

All four packages depend on `@0gfoundation/0g-storage-ts-sdk: "^1.2.10"`:

| Package | File |
|---------|------|
| `@axiom/config` | `/home/eya/og/packages/config/package.json` |
| `@axiom/backend` | `/home/eya/og/apps/backend/package.json` |
| `@axiom/oracle` | `/home/eya/og/apps/oracle/package.json` |
| `@axiom/indexer` | `/home/eya/og/apps/indexer/package.json` |

The resolved version from `pnpm-lock.yaml` is `1.2.10`. This supports encryption (requires ^1.2.6).

---

## 3. Curl Test Endpoints

All indexer URLs return `404 page not found` for HTTP GET — these are JSON-RPC endpoints, not REST APIs:

```
$ curl -s https://indexer-storage-testnet-turbo.0g.ai/
404 page not found

$ curl -s https://indexer-storage-turbo.0g.ai/
404 page not found

$ curl -s https://indexer-storage-testnet-turbo.0g.ai/health
404 page not found

$ curl -s https://indexer-storage-testnet-turbo.0g.ai/api/v1/health
404 page not found

$ curl -s https://indexer-storage-testnet-turbo.0g.ai/v1/health => HTTP 404
$ curl -s https://indexer-storage-testnet-turbo.0g.ai/status => HTTP 404
$ curl -s https://indexer-storage-testnet-turbo.0g.ai/info => HTTP 404
```

**Conclusion**: The indexer endpoints answer JSON-RPC POST requests only. The SDK's `Indexer` class handles the correct RPC method calls internally. HTTP health checks are not available via these URLs.

---

## 4. Critique

### 4.1 Indexer Instances — 3 Separate, Could Share

**3 separate `new Indexer(...)` in the codebase:**

| Location | File | Line |
|----------|------|------|
| Backend `ZeroGStorage` | `apps/backend/src/storage/0g.ts` | 47 |
| Oracle `ZeroGStorage` | `apps/oracle/src/storage.ts` | 43 |
| Indexer raw | `apps/indexer/src/index.ts` | 256 |

**Impact**: Each process creates exactly one `Indexer` instance — that's correct per-process. Since backend, oracle, and indexer are separate processes, this is not a runtime problem. **No consolidation opportunity here** — each process needs its own Indexer.

### 4.2 Shared SDK Wrapper (`packages/config/src/storage/0g.ts`) Coverage

**What it covers**:
- ✅ `uploadToStorage()` — wraps `indexer.upload(new MemData(...))`
- ✅ `downloadFromStorage()` — wraps `indexer.downloadToBlob()` (supports encryption)
- ✅ AES-256 encryption option type
- ✅ ECIES encryption option type

**What it does NOT cover**:
- ❌ `ZgFile.fromFilePath()` — file-system uploads (not needed)
- ❌ `indexer.download()` — file-to-disk downloads (not used; `downloadToBlob` preferred)
- ❌ `indexer.selectNodes()` — node selection (not used)
- ❌ `indexer.peekHeader()` — encryption header detection (not used)
- ❌ `KvClient` — KV store (not used)
- ❌ `Batcher` — KV batching (not used)
- ❌ Retry logic (left to callers — acceptable)
- ❌ `EncryptionOption` type — Axiom defines its own type that mirrors the SDK's, but is not guaranteed to stay in sync

**Verdict**: The shared wrapper covers exactly what Axiom uses. It's minimal and adequate.

### 4.3 Oracle Still Has Its Own Download Path — Uses Shared Functions But Separate Class

The oracle's `ZeroGStorage` calls the shared `uploadToStorage`/`downloadFromStorage`, so it's **not a separate download implementation**. However, it IS a **separate class definition** that duplicates the backend's `ZeroGStorage` class structure.

**Differences between the two ZeroGStorage classes:**

| Feature | Backend (`apps/backend/src/storage/0g.ts`) | Oracle (`apps/oracle/src/storage.ts`) |
|---------|----------|--------|
| `new Indexer()` | ✅ Yes | ✅ Yes |
| Retry via `withRetry()` | ✅ Yes | ❌ No |
| `markDataHashSeen()` | ❌ No | ✅ Yes |
| `hasSeenDataHash()` | ❌ No | ✅ Yes |
| Uses shared `uploadToStorage` | ✅ Yes | ✅ Yes |
| Uses shared `downloadFromStorage` | ✅ Yes | ✅ Yes |
| `withProof` default | `true` | `false` |
| `StorageAdapter` interface | ❌ Does not implement | ✅ Implements |

### 4.4 0G Storage SDK Features NOT Used by Axiom

| Feature | SDK Export | Status | Reason |
|---------|-----------|--------|--------|
| File-system upload | `ZgFile` | ❌ Not used | Axiom works with in-memory blobs only |
| KV store | `KvClient`, `Batcher`, `streamDataBuilder` | ❌ Not used | No KV use case |
| Node selection | `indexer.selectNodes()` | ❌ Not used | Only needed for KV batcher |
| Encryption header detection | `indexer.peekHeader()` | ❌ Not used | Axiom tracks encryption keys out-of-band |
| Flow contract | `FlowContract` | ❌ Not used | Auto-discovered by SDK |
| Browser `Blob` | `Blob` class from SDK | ❌ Not used | Node.js only |
| File-to-disk download | `indexer.download()` | ❌ Not used | Prefers `downloadToBlob()` for in-memory |
| Fragmented upload (>4GB) | `tx.rootHashes[]` | ✅ Handled in shared wrapper | Correct edge-case handling |
| Standard network (non-Turbo) | Different indexer URL | ❌ Not configured | Only Turbo is configured in `networks.ts` |

### 4.5 Dead/Duplicate Code Identification

1. **Oracle `InMemoryStorage` is duplicated in spirit**: The backend's test for transfer uses `InMemoryStorage` from `../../../oracle/src/storage.js` (`apps/backend/src/server/transfer.test.ts` line 15). This creates a cross-package dependency on the oracle package. This adapter should either live in `@axiom/config` or be test-local.

2. **Indexer's `composeSinks` "storage" case is dead code**: When `config.da === "storage"`, the `submitEvent(event, {})` call on line 162 does nothing — `submitEvent` with `{}` options appears to be a no-op. The actual upload is handled by `eventBuffer` + `flushBuffer()`. The `submitEvent` call is vestigial.

3. **Env var confusion**: The oracle uses `AXIOM_STORAGE_INDEXER_RPC` + `AXIOM_STORAGE_EVM_RPC`, while the backend uses `AXIOM_STORAGE_RPC` (single var). The indexer uses `OG_STORAGE_RPC` (old name). These are reconciled in `packages/config/src/env.ts` via aliases, but the inconsistency across services is confusing.

4. **Two Encryption type definitions**: Both `packages/config/src/storage/0g.ts` and `apps/backend/src/storage/0g.ts` define their own `EncryptionOption`/`Encryption` type, with slightly different shapes. The shared one (`EncryptionOption`) has `recipientPubKey: Uint8Array | string`, while the backend one (`Encryption`) is identical in structure but duplicated.

5. **No retry in oracle download**: The backend wraps all storage operations in `withRetry()`, but the oracle does not. If an oracle download fails transiently, the request fails immediately.

### 4.6 Canonical SDK Patterns vs Axiom Implementation

| Aspect | Canonical 0G SDK | Axiom |
|--------|-------------------|-------|
| Upload init | `new MemData(data)` → `.merkleTree()` → `indexer.upload()` | ✅ Same, but `merkleTree()` is called inside `uploadToStorage()` via the SDK? **Need to verify** — the SDK may call `merkleTree()` automatically during `upload()`. **Actually**: The canonical docs say "Must call merkleTree() before upload". Axiom does NOT call `merkleTree()` explicitly. This should be checked — it may cause upload failures with some SDK versions. |
| Download | `indexer.download()` (file) or `indexer.downloadToBlob()` (blob) | ✅ Uses `downloadToBlob()` — correct for in-memory use |
| Encryption | Built-in AES-256/ECIES with `encryption` option on `upload()` | ✅ Uses the SDK's built-in encryption option — **BUT** Axiom also does its own separate AES-256-GCM encryption via `@axiom/oracle/crypto/aes-gcm.ts` BEFORE uploading to 0G. This is a **double-encryption** pattern (application-level + transport-level). |
| Error handling | `[result, err]` tuple pattern (Go-style) | ✅ Axiom checks the tuple and throws on error |
| Network config | SDK auto-discovers flow contract from indexer | ✅ `networks.ts` stores flowContract as informational only |
| Indexer singleton | One `Indexer` per process | ✅ One per service process |
| Retry | Not built-in | ✅ `withRetry()` wrapper — good addition |
| Proof verification | `indexer.download(root, path, true)` | ✅ `withProof: true` in backend (default), `withProof: false` in oracle |

**Critical finding**: The canonical SDK docs state that `.merkleTree()` MUST be called before `upload()`. Axiom's shared wrapper does NOT call `.merkleTree()` on the `MemData` instance. If the SDK does not call it internally, uploads may fail silently or produce incorrect Merkle roots.

Let's verify by checking the SDK source or testing...

### 4.7 Summary of Issues

| Severity | Issue | File(s) |
|----------|-------|---------|
| 🔴 HIGH | `.merkleTree()` not called before `upload()` in shared wrapper | `packages/config/src/storage/0g.ts` |
| 🟡 MEDIUM | Duplicate `ZeroGStorage` class in oracle | `apps/oracle/src/storage.ts` |
| 🟡 MEDIUM | Indexer `composeSinks` "storage" case has dead `submitEvent` call | `apps/indexer/src/index.ts` line 162 |
| 🟡 MEDIUM | Env var naming inconsistency (3 different names for storage RPC) | Multiple files |
| 🟡 MEDIUM | Oracle no retry on storage operations | `apps/oracle/src/storage.ts` |
| 🟢 LOW | Two identical `Encryption` type definitions | `packages/config/src/storage/0g.ts` and `apps/backend/src/storage/0g.ts` |
| 🟢 LOW | `withProof` inconsistency (backend=true, oracle=false) | Both storage files |
| 🟢 LOW | `InMemoryStorage` lives in oracle but is imported by backend tests | `apps/backend/src/server/transfer.test.ts` |
| 🟢 LOW | Only Turbo network configured — Standard path not supported | `packages/config/src/networks.ts` |

---

## 5. Deduplication Opportunities

### 5.1 Consolidate ZeroGStorage Classes

Merge the backend's `ZeroGStorage` (with retry) and oracle's `ZeroGStorage` (with `StorageAdapter` and seen-set) into a single class in `@axiom/config/storage/0g`:

- Add `markDataHashSeen()` / `hasSeenDataHash()` to the shared class (they're just `Set<string>` operations)
- Add `withRetry()` directly into the shared `uploadToStorage()` / `downloadFromStorage()` functions
- Export a unified `ZeroGStorage` class that implements a `StorageAdapter` interface
- Have both backend and oracle import the same class

### 5.2 Unify Env Var Names

Standardize on `AXIOM_STORAGE_INDEXER_RPC` + `AXIOM_STORAGE_EVM_RPC` across all services, with backward-compat aliases (`AXIOM_STORAGE_RPC`, `OG_STORAGE_RPC`).

### 5.3 Remove Dead Code in Indexer

Remove the `submitEvent(event, {})` call in the indexer's `composeSinks` "storage" case (line 162), since the actual upload is handled by `flushBuffer()`.

### 5.4 Fix `.merkleTree()` Call

Add `data.merkleTree()` call in `packages/config/src/storage/0g.ts` before `indexer.upload()`, matching the canonical SDK pattern. This is the most critical finding.

### 5.5 Move InMemoryStorage to Config Package

Move `InMemoryStorage` from `apps/oracle/src/storage.ts` to `packages/config/src/storage/0g.ts` so all services (including backend tests) can import it without cross-package dependency.
