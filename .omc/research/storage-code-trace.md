# Storage Code Trace: 0G SDK ↔ Axiom Usage Analysis

**Date:** 2026-06-24
**SDK version:** `@0gfoundation/0g-storage-ts-sdk@1.2.10`
**SDK location:** `packages/config/node_modules/@0gfoundation/0g-storage-ts-sdk/dist/zgstorage.esm.js`

---

## 1. SDK Architecture Overview

### 1.1 Transport Layer

All storage RPCs flow through `HttpProvider` (inherits from `open-jsonrpc-provider`'s `BaseProvider`). It sends **JSON-RPC 2.0 POST** requests via `axios`:

```
POST {url}
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "<rpc_method>",
  "params": [...],
  "id": <number>
}
```

Key RPC methods (from `StorageNode` class, lines 27856-27953):
| Method | Purpose |
|--------|---------|
| `zgs_getStatus` | Node health + shard info |
| `zgs_uploadSegment` | Upload one segment |
| `zgs_uploadSegments` | Upload multiple segments |
| `zgs_uploadSegmentByTxSeq` | Upload segment with tx sequence |
| `zgs_uploadSegmentsByTxSeq` | Upload segments with tx sequence |
| `zgs_downloadSegment` | Download one segment |
| `zgs_downloadSegmentWithProof` | Download segment + merkle proof |
| `zgs_downloadSegmentByTxSeq` | Download segment by tx sequence |
| `zgs_getFileInfo` | Get file metadata + finalization status |
| `zgs_getFileInfoByTxSeq` | Get file info by tx sequence |
| `zgs_getShardConfig` | Get node sharding configuration |

Indexer-specific RPCs (from `Indexer` class):
| Method | Purpose |
|--------|---------|
| `indexer_getShardedNodes` | Get trusted/discovered storage nodes |
| `indexer_getNodeLocations` | Get node geo-locations |
| `indexer_getFileLocations` | Get which storage nodes hold a root hash |

### 1.2 Upload Call Chain

```
Indexer.upload(file, blockchain_rpc, signer, uploadOpts, retryOpts, opts)
  └─► Indexer.newUploaderFromIndexerNodes(blockchain_rpc, signer, expectedReplica, opts)
        ├─► this.selectNodes(expectedReplica, 'min')
        │     ├─► this.getShardedNodes()            // indexer_getShardedNodes RPC
        │     └─► selectNodes(nodes, ...)           // picks covering shard set
        ├─► clients[0].getStatus()                  // zgs_getStatus RPC
        └─► getFlowContract(status.networkIdentity.flowAddress, signer)
  └─► Uploader.splitableUpload(file, mergedOpts, retryOpts)
        └─► Uploader.uploadFile(file, mergedOpts, retryOpts)
              ├─► if mergedOpts.encryption: file = wrapEncryption(file, enc)
              │     ├─► {type:'aes256'} → newSymmetricEncryptedFile(file, key)
              │     │     └─► EncryptedFile: prepends 17-byte AES-256-CTR header
              │     └─► {type:'ecies'}  → newEciesEncryptedFile(file, recipientPub)
              │           └─► EncryptedFile: prepends 50-byte ECIES header
              ├─► file.merkleTree()                  // build Merkle tree over segments
              ├─► file.createSubmission(tags, submitter)
              ├─► submitLogEntryNoReceipt(submission) // calls flow.submit() on-chain
              ├─► waitForLogEntry(rootHash, ...)      // polls storage nodes via zgs_getFileInfo
              └─► splitTasks(info, tree)
                    └─► for each shard: uploadSegmentsByTxSeq(segments, txSeq)
                          │                          // zgs_uploadSegmentsByTxSeq RPC
                          └─► StorageNode.uploadSegmentsByTxSeq()
```

### 1.3 Download Call Chain

```
Indexer.downloadToBlob(rootHash, opts = { proof, decryption })
  └─► Indexer.downloadSingleToBlob(rootHash, opts)
        ├─► Indexer.newDownloaderFromIndexerNodes(rootHash)
        │     ├─► this.getFileLocations(rootHash)        // indexer_getFileLocations RPC
        │     └─► selectNodes(locations, 1, 'random')
        ├─► Downloader.downloadToBlob(rootHash, opts.proof)
        │     └─► Downloader.downloadFileToBlob(rootHash, proof)
        │           └─► Downloader.downloadFileRawToBlob(rootHash, proof)
        │                 ├─► Downloader.queryFile(root)  // zgs_getFileInfo on each node
        │                 ├─► getShardConfigs(nodes)      // zgs_getShardConfig on each node
        │                 └─► downloadFileHelperToBlob(info, proof)
        │                       └─► downloadTask(info, ...)
        │                             └─► node.downloadSegmentByTxSeq(txSeq, start, end)
        │                                   // zgs_downloadSegmentByTxSeq RPC
        └─► if opts.decryption:
              tryDecrypt(encrypted, { symmetricKey, privateKey })
              ├─► parseEncryptionHeader(encrypted)
              ├─► resolveDecryptionKey(...) → aesKey
              └─► decryptFile(aesKey, encrypted) → plaintext Blob
```

---

## 2. Caller Analysis

### 2.1 Wrapper: `packages/config/src/storage/0g.ts`

| Function | SDK Calls | Encryption Path |
|----------|-----------|----------------|
| `uploadToStorage(...)` | `indexer.upload(new MemData(data), evmRpc, signer, opts)` | SDK-level if `encryption` provided |
| `downloadFromStorage(...)` | `indexer.downloadToBlob(rootHash, downloadOpts)` | SDK-level decrypt, then **Axiom guard re-decrypts** |
| `ZeroGStorage.upload()` | `uploadToStorage(..., NO encryption)` | Raw bytes only |
| `ZeroGStorage.download()` | `downloadFromStorage(..., NO decrypt)` | Raw bytes only |
| `ZeroGStorage.uploadData()` | `uploadToStorage(..., WITH encryption)` | SDK encrypts |
| `ZeroGStorage.downloadWithOpts()` | `downloadFromStorage(..., WITH decrypt)` | SDK decrypts + **guard** |

### 2.2 Consumers

| File | How it uses storage | Encryption used |
|------|-------------------|----------------|
| `apps/backend/src/server.ts` | `ZeroGStorage` via `_storage` variable (line 135) — **never calls upload/download methods directly** | N/A |
| `apps/backend/src/orchestrator/index.ts` | `this.storage.downloadWithOpts(rootHash, { symmetricKey, withProof })` at line 244-265 (`fetchStoragePeek`) | SDK AES-256-CTR |
| `apps/oracle/src/index.ts` | `ZeroGStorage` or `InMemoryStorage` for the oracle's `storage` adapter | N/A |
| `apps/oracle/src/server.ts` | `config.storage.upload(blob)` at line 99 (transfer-validity re-key) | App-level AES-256-GCM |
| `apps/oracle/src/server.ts` | `config.storage.download(dataHash)` at line 88 | App-level AES-256-GCM |
| `apps/oracle/src/server.ts` | `config.storage.markDataHashSeen()` / `.hasSeenDataHash()` | N/A |
| `apps/indexer/src/index.ts` | `uploadToStorage(indexer, payload, rpc, signer)` at lines 82-88 (no encryption) | None |
| `apps/backend/src/cli/run-e2e.ts` | `storage.uploadData(blob, { type: "aes256", key })` at line 120 | SDK AES-256-CTR |

---

## 3. Mismatch Table

| Aspect | SDK Expects | Axiom Provides | Match? |
|--------|-------------|----------------|--------|
| **Upload arg 4** (`uploadOpts`) | `UploadOption` with optional `encryption?: {type, key/pubkey}` | `{ encryption: { type: "aes256", key: Uint8Array } }` or `{}` | ✅ |
| **Upload arg 5** (`retryOpts`) | `RetryOpts \| undefined` | `undefined` | ✅ |
| **Upload arg 6** (`opts`) | `TransactionOptions \| undefined` | `undefined` | ✅ |
| **Download arg 2** (`opts`) | `DownloadOption = { proof?, decryption? }` | `{ proof, decryption: { symmetricKey } }` | ✅ |
| **Download decrypt success** | Returns `[Blob(plaintext), null]` | `data = Uint8Array(await blob.arrayBuffer())` → **then re-decrypts via guard** | ❌ BUG |
| **Encryption algorithm** | AES-256-CTR (SDK's `EncryptedFile`) | AES-256-CTR (SDK) + AES-256-GCM (app-level via `@axiom/oracle/crypto/aes-gcm`) | ⚠️ Dual |
| **Upload data format (SDK-encrypted)** | Encryption header (17/50 bytes) + AES-256-CTR ciphertext | Same | ✅ |
| **Upload data format (app-level)** | Raw bytes | AES-256-GCM (iv + ciphertext + authTag) | ⚠️ |
| **Download decryption guard** | No guard needed (SDK silently returns raw on failure) | `tryDecrypt(data, key)` on already-decrypted data | ❌ BUG |
| **Error handling** | Returns `[blob \| null, Error \| null]` tuple | Wrapped in `withRetry()` + checked for `err` | ✅ |

---

## 4. Critical Bugs

### BUG #1: Double Decryption — Guard Always Throws False Positive

**Location:** `packages/config/src/storage/0g.ts`, `downloadFromStorage()`, lines 111-133

**Root cause:** When `downloadFromStorage` passes `decryption: { symmetricKey }` to `indexer.downloadToBlob`, the SDK's internal `tryDecrypt` runs first. If it succeeds, it returns **plaintext** data. Then Axiom's guard runs `tryDecrypt` **again on the already-decrypted plaintext**. The plaintext no longer has an SDK encryption header, so `tryDecrypt` returns `{ decrypted: false }`, and the guard throws:

```
Error: 0G Storage decryption failed for <rootHash>: the SDK returned raw bytes 
(wrong key, missing header, or malformed data). 
Check that the correct decryption key was provided and that the file was SDK-encrypted.
```

**Impact:** Any call to `downloadFromStorage` (or `downloadWithOpts`) with a valid symmetricKey that matches an SDK-encrypted file will throw a false error. The data was actually decrypted correctly by the SDK, but the guard interprets the plaintext as a "silent failure".

**Affected callers:**
- `apps/backend/src/orchestrator/index.ts:265` — `this.storage.downloadWithOpts(modelDataRoot, { symmetricKey, withProof })`
- `apps/backend/src/cli/run-e2e.ts:120` — indirect via the orchestrator path

**All four cases:**

| Scenario | SDK return | Guard input | Guard output | Result |
|----------|-----------|-------------|-------------|--------|
| SDK-encrypted + correct key | plaintext | plaintext | `decrypted: false` | **THROWS** ❌ |
| SDK-encrypted + wrong key | raw ciphertext | raw ciphertext | `decrypted: false` | **THROWS** ✅ (correctly) |
| Raw data + key supplied | raw data | raw data | `decrypted: false` | **THROWS** ❌ |
| No key supplied | raw data | (guard skipped) | N/A | OK ✅ |

Cases 1 and 3 are false positives. Case 2 is a true positive, but it is **indistinguishable** from Case 1 from the caller's perspective, so the guard provides no debugging value.

### BUG #2: Dual Encryption Inconsistency

**Location:** Multiple files

**Problem:** Axiom has **two** independent encryption layers:

1. **SDK AES-256-CTR** (used by `uploadData` / `downloadWithOpts` when `encryption.type === "aes256"`)
   - File: `packages/config/src/storage/0g.ts:174` + SDK's `EncryptedFile` class
   - Used by: `apps/backend/src/cli/run-e2e.ts:120`

2. **App-level AES-256-GCM** (used by the oracle's re-key path)
   - File: `apps/oracle/src/crypto/aes-gcm.ts`
   - Used by: `apps/oracle/src/server.ts:95-98`

These use **different cipher modes** (CTR vs GCM) and **different key material**. The SDK's `tryDecrypt` can only decrypt SDK-encrypted (CTR) data. When the oracle stores GCM-encrypted blobs via `storage.upload(blob)` (without SDK encryption), the data on 0G is raw GCM ciphertext. If any code path later calls `downloadFromStorage` with a symmetricKey on this data, the SDK's `tryDecrypt` would fail (no CTR header), and the guard would throw.

Currently the oracle's download path (`storage.download()`) does NOT pass a symmetricKey, so this doesn't cause a runtime error. But it's a ticking bomb — if anyone mixes the paths, data corruption or false errors result.

### BUG #3: `ZeroGStorage.upload()` Stores Raw Bytes Despite the Adapter Interface Name

**Location:** `packages/config/src/storage/0g.ts:151-154`

**Issue:** The `StorageAdapter.upload()` interface suggests data is persisted, but unlike `uploadData()`, it does NOT use SDK encryption. The oracle's `transfer-validity` route:
1. Encrypts data with app-level AES-256-GCM
2. Passes the GCM ciphertext to `storage.upload(blob)`
3. `storage.upload` calls `uploadToStorage(indexer, blob, ...)` WITHOUT encryption opts → stored as raw GCM bytes

If someone later calls `storage.download()` → `downloadFromStorage(..., no decrypt)` → gets raw GCM bytes back. The caller must know to app-decrypt them. This works correctly today, but the asymmetric behavior between `upload()` (no encryption) and `uploadData()` (SDK encryption) is confusing and error-prone.

### BUG #4: Silent Decryption Failure in SDK

**Location:** SDK `Indexer.downloadSingleToBlob()` (lines 30207-30226)

**Issue:** When `tryDecrypt` fails inside the SDK, it returns the raw blob with no error:
```javascript
if (!decrypted) return [rawBlob, null]; // No error, returns encrypted data
```

The caller receives `[Blob, null]` — no way to distinguish "decryption succeeded" from "decryption failed, here's raw bytes." The Axiom guard tries to detect this, but due to Bug #1 it creates false positives instead. The real fix should ideally be in how the SDK communicates decryption status.

---

## 5. Specific Recommendations

### Fix #1: Remove the `tryDecrypt` guard from `downloadFromStorage`

**File:** `packages/config/src/storage/0g.ts`, lines 119-132

**Change:** Remove the post-SDK `tryDecrypt` guard entirely. The SDK's `Indexer.downloadToBlob` already calls `tryDecrypt` internally when `opts.decryption` is provided. The guard adds no value — it cannot distinguish "SDK decrypted successfully" from "SDK silently returned raw data" because both cases produce the same result when re-checked.

**Why safe:** When a caller passes `symmetricKey` or `privateKey` to `downloadFromStorage`:
- If the data was SDK-encrypted with that key → SDK decrypts it → data is plaintext ✓
- If the data was NOT SDK-encrypted → SDK returns raw bytes → caller receives the raw data (which it can app-decrypt if needed) ✓
- If the data was SDK-encrypted with a DIFFERENT key → SDK returns raw corrupted data → this is the one case where the guard would have helped, but the guard can't distinguish it from the success case anyway, so it's equally useless

**After fix:** The `downloadFromStorage` function becomes:
```typescript
export async function downloadFromStorage(
  indexer: Indexer,
  rootHash: Hex,
  opts?: { symmetricKey?: Uint8Array; privateKey?: Uint8Array | string; withProof?: boolean },
): Promise<DownloadResult> {
  const downloadOpts = {
    proof: opts?.withProof ?? true,
    decryption: { symmetricKey: opts?.symmetricKey, privateKey: opts?.privateKey },
  };
  const [blob, err] = await indexer.downloadToBlob(rootHash, downloadOpts);
  if (err) throw new Error(`0G download failed: ${err.message ?? String(err)}`);
  if (!blob) throw new Error(`0G Storage download returned no blob for ${rootHash}`);
  const data = new Uint8Array(await blob.arrayBuffer());
  return { data, rootHash, size: data.length };
}
```

### Fix #2: Consolidate to a single encryption strategy

**Decision needed:** Either:
- **Option A:** Always use SDK encryption (AES-256-CTR) via `uploadData()`/`downloadWithOpts()`, and convert the oracle's app-level GCM to use the SDK's encryption path. This means the oracle's `storage.upload(blob)` becomes `storage.uploadData(blob, { type: "aes256", key: ... })`.
- **Option B:** Never use SDK encryption. Always store raw bytes and handle all encryption at the app level. The oracle already does this. Change the e2e test (`run-e2e.ts`) to not pass `{ type: "aes256", key }` to `uploadData()`, and the orchestrator to not pass `symmetricKey` to `downloadWithOpts()`.

**Recommendation: Option B** — simpler, avoids coupling to SDK's specific crypto format, and matches what the oracle already does. The SDK encryption adds header bytes (17-50 bytes overhead) and AES-CTR mode has no authentication (anyone with the key can flip bits undetected), whereas GCM provides authenticated encryption.

### Fix #3: Align `upload()` and `uploadData()` behavior

**File:** `packages/config/src/storage/0g.ts`

If Option B is chosen:
- Make `uploadData()` an alias for `upload()` (remove encryption parameter)
- Remove the `Encryption` type re-export
- Remove `downloadWithOpts()` (callers who need encrypted transport use app-level encryption and call `download()`)

If Option A is chosen:
- Change `upload()` to also accept and pass encryption opts (for consistency)
- Change the oracle to use `uploadData()` with a generated key

### Fix #4: (Optional) SDK-level workaround

If you want to keep the guard for safety while fixing the false-positive:

**Change the guard in `downloadFromStorage`** to only run when the SDK was NOT asked to decrypt — i.e., pass decryption info ONLY to the guard, not to `indexer.downloadToBlob`:

```typescript
export async function downloadFromStorage(
  indexer: Indexer,
  rootHash: Hex,
  opts?: { symmetricKey?: Uint8Array; privateKey?: Uint8Array | string; withProof?: boolean },
): Promise<DownloadResult> {
  const downloadOpts = {
    proof: opts?.withProof ?? true,
    // Don't pass decryption to SDK — we'll handle it ourselves
    decryption: undefined,
  };
  const [blob, err] = await indexer.downloadToBlob(rootHash, downloadOpts);
  if (err) throw new Error(`0G download failed: ...`);
  if (!blob) throw new Error(`...`);
  const data = new Uint8Array(await blob.arrayBuffer());

  // Only attempt decryption if caller provided key material
  if (opts?.symmetricKey || opts?.privateKey) {
    const result = tryDecrypt(data, {
      symmetricKey: opts.symmetricKey,
      privateKey: opts.privateKey,
    });
    if (result.decrypted) {
      return { data: result.bytes, rootHash, size: result.bytes.length };
    }
    // If decryption failed but caller expected it, throw
    throw new Error(`...`);
  }

  return { data, rootHash, size: data.length };
}
```

But this still has the "can't distinguish wrong key from unencrypted" problem. Option B (app-level encryption only) is cleaner.

---

## 6. Summary

| # | Bug | Severity | Location |
|---|-----|----------|----------|
| 1 | Guard in `downloadFromStorage` throws on successful SDK decryption (double-decrypt) | **Critical** — breaks any encrypted download | `0g.ts:119-132` |
| 2 | Dual encryption (SDK CTR + app GCM) creates inconsistent states | **High** — confusion, potential corruption | Multiple files |
| 3 | `upload()` vs `uploadData()` asymmetry (one encrypts, one doesn't) | **Medium** — API design issue | `0g.ts:151-154` vs `174-177` |
| 4 | SDK silently returns raw blob on decrypt failure (no error flag) | **Low** — SDK design limitation | SDK `downloadSingleToBlob()` |
