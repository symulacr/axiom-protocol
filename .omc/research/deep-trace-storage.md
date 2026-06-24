# Deep Trace Report: 0G Storage Integration in Axiom Protocol

**Generated:** 2026-06-24
**SDK Version:** `@0gfoundation/0g-storage-ts-sdk@1.2.10` (installed in 3 locations)
**Researcher:** Deep-trace agent

---

## 1. SDK Source Audit — Every Exported Module vs. What Axiom Uses

### 1.1 SDK Entry Point (`lib.esm/index.js`)

The SDK re-exports everything from 10 barrel modules:

| Module | What it exports | Axiom uses? |
|--------|----------------|-------------|
| `./common/index.js` | `selectNodes()`, `nodeForSegment()`, `checkReplica()`, `EncryptionHeader`, `parseEncryptionHeader()`, `cryptAt()`, `deriveEciesEncryptKey()`, `deriveEciesDecryptKey()`, `newSymmetricHeader()`, `newEciesHeader()`, `decryptFile()`, `decryptFragmentData()`, `resolveDecryptionKey()`, `normalizePubKey()`, `normalizePrivKey()`, `EncryptedFile`, `EncryptedFileFragment`, `newSymmetricEncryptedFile()`, `newEciesEncryptedFile()` | **INDIRECTLY** (via SDK's own Uploader/Downloader internals) |
| `./transfer/index.js` | `Uploader`, `Downloader`, `mergeUploadOptions()`, `UploadOption`, `EncryptionOption`, `defaultUploadOption`, `getShardConfigs()`, `calculatePrice()` | **INDIRECTLY** (SDK creates these internally) |
| `./indexer/index.js` | `Indexer` class + `DownloadOption`, `tryDecrypt()`, `tryDecryptFragments()` | **YES** — `Indexer` only |
| `./kv/index.js` | `KvClient`, `Batcher`, `StreamDataBuilder`, `KvIterator`, `MAX_KEY_SIZE`, `MAX_SET_SIZE` | **NO — FULLY UNUSED** |
| `./node/index.js` | `StorageNode`, `StorageKv`, `isValidConfig()` | **INDIRECTLY** (SDK internals) |
| `./file/index.js` | `Blob` (SDK's AbstractFile subclass), `ZgFile`, `MemData`, `MerkleTree`, `AbstractFile`, `EncryptedFile`, `nextPow2()`, `numSplits()`, `computePaddedSize()`, `iteratorPaddedSize()` | **PARTIALLY** — `MemData` only |
| `./hot/index.js` | `HotRouterClient`, `HotUploadOption`, `UploadToHotResult`, `HotStatus` | **NO — FULLY UNUSED** |
| `./contracts/flow/index.js` | `FixedPriceFlow__factory` (typechain) | **INDIRECTLY** (SDK internals) |
| `./utils.js` | `getFlowContract()`, `getMarketContract()`, `delay()`, `checkExist()`, `GetSplitNum()`, `SegmentRange()`, `txWithGasAdjustment()` | **INDIRECTLY** (SDK internals) |
| `./constant.js` | `DEFAULT_CHUNK_SIZE` (256B), `DEFAULT_SEGMENT_MAX_CHUNKS` (1024), `DEFAULT_SEGMENT_SIZE`, `EMPTY_CHUNK_HASH`, `ZERO_HASH`, `SMALL_FILE_SIZE_THRESHOLD`, `TIMEOUT_MS`, `DEFAULT_BATCH_SIZE` (10) | **INDIRECTLY** (SDK internals) |

### 1.2 Indexer Class — Full Method Surface

```typescript
class Indexer extends HttpProvider {
  constructor(url: string)
  
  // Node discovery
  getShardedNodes(): Promise<ShardedNodes>
  getNodeLocations(): Promise<Map<string, IpLocation>>
  getFileLocations(rootHash: string): Promise<ShardedNode[]>
  
  // Node selection
  selectNodes(expectedReplica: number, method?: 'min'|'max'|'random'): Promise<[StorageNode[], Error | null]>
  
  // Uploader factory
  newUploaderFromIndexerNodes(blockchain_rpc, signer, expectedReplica, opts?): Promise<[Uploader | null, Error | null]>
  
  // Upload methods
  upload(file: AbstractFile, blockchain_rpc, signer, uploadOpts?, retryOpts?, opts?): Promise<[UploadResult, Error | null]>
  uploadToHot(file, blockchain_rpc, signer, hotOpts, uploadOpts?, retryOpts?, opts?): Promise<[UploadToHotResult, Error | null]>
  
  // Download to file (Node.js only)
  download(rootHash, filePath, proof?): Promise<Error | null>                           // single
  download(rootHashes[], filePath, proof?): Promise<Error | null>                       // multi-fragment
  
  // Download to Blob (browser-safe)
  downloadToBlob(rootHash, opts?: DownloadOption): Promise<[Blob, Error | null]>         // single
  downloadToBlob(rootHashes[], opts?: DownloadOption): Promise<[Blob, Error | null]>     // multi-fragment
  
  // Encryption header peeking
  peekHeader(rootHash): Promise<[EncryptionHeader | null, Error | null]>
  
  // Internal
  private newDownloaderFromIndexerNodes(rootHash): Promise<[Downloader | null, Error | null]>
}
```

### 1.3 What Axiom Actually Imports

In the entire codebase, Axiom only imports **two** things from the SDK:

```typescript
// packages/config/src/storage/0g.ts
import { Indexer, MemData } from "@0gfoundation/0g-storage-ts-sdk";
```

And in the 3 application wrappers:
```typescript
// apps/backend/src/storage/0g.ts
// apps/oracle/src/storage.ts
// apps/indexer/src/index.ts
import { Indexer } from "@0gfoundation/0g-storage-ts-sdk";
```

**That's it.** Out of ~30+ exported classes and ~100+ exported functions/methods, Axiom uses exactly 2: `Indexer` and `MemData`.

### 1.4 SDK Features NOT Used By Axiom

| SDK Feature | Risk if SDK changes |
|------------|-------------------|
| **`uploadToHot()`** — upload + prefetch to hot storage | None (not imported) |
| **`selectNodes()`** — low-level node selection API | **MEDIUM** — Indexer.upload() calls it internally |
| **`KvClient`** — KV store read client | None (not imported) |
| **`Batcher`** — batch KV writes to storage nodes | None (not imported) |
| **`ZgFile`** — Node.js file-based uploads | None (not imported) |
| **`Blob`** (SDK's AbstractFile subclass) | **LOW** — Axiom uses MemData instead |
| **`EncryptedFile`** / **`EncryptedFileFragment`** | **HIGH** — SDK handles encryption internally for uploads, but Axiom does app-level encryption instead |
| **`HotRouterClient`** / **`HotUploadOption`** | None (not imported) |
| **`peekHeader()`** — peek encryption header | **MEDIUM** — would be useful for Axiom's download flow |
| **`tryDecrypt()`** / **`tryDecryptFragments()`** | **HIGH** — SDK download handles decryption internally, but Axiom does app-level decryption too |
| **`getFlowContract()`** / **`getMarketContract()`** | None (not imported) |

---

## 2. Full Upload Call Chain

### 2.1 Application Entry Points

**Three callers can initiate uploads:**

#### A) `packages/config/src/storage/0g.ts` — `uploadToStorage()`
```typescript
export async function uploadToStorage(
  indexer: Indexer,
  data: Uint8Array,
  evmRpc: string,
  signer: Signer,
  encryption?: EncryptionOption,
): Promise<UploadResult> {
  const opts = encryption ? { encryption } : {};
  const [tx, err] = await indexer.upload(new MemData(data), evmRpc, signer, opts);
  // ...parse result...
}
```

#### B) `apps/indexer/src/index.ts` — direct call
```typescript
const result = await uploadToStorage(
  _storageIndexer,
  payload,                          // Uint8Array
  _storageRpcUrl,
  _storageSigner,
);
```

#### C) `apps/backend/src/storage/0g.ts` — `ZeroGStorage.uploadData()`
```typescript
async uploadData(data: Uint8Array, encryption?: Encryption): Promise<UploadResult> {
  return withRetry(() => uploadToStorage(this.indexer, data, this.config.evmRpc, this.config.signer, encryption));
}
```

### 2.2 Full Chain: Call to Finished Upload

```
uploadToStorage()
  └─ indexer.upload(new MemData(data), evmRpc, signer, opts)
       └─ Indexer.upload()
            ├─ mergeUploadOptions(uploadOpts)          // fills defaults
            ├─ newUploaderFromIndexerNodes()
            │    ├─ indexer.selectNodes(1, 'min')       // calls indexer_getShardedNodes RPC
            │    ├─ clients[0].getStatus()              // calls zgs_getStatus RPC
            │    ├─ getFlowContract(status.flowAddress, signer)
            │    └─ new Uploader(clients, rpc, flow, gasPrice, gasLimit)
            └─ uploader.splitableUpload(file, mergedOpts, retryOpts)
                 └─ Uploader.splitableUpload()
                      ├─ mergeUploadOptions(opts)
                      ├─ file.size() <= fragmentSize? (4GB default)
                      │   YES → uploadFile(file, mergedOpts, retryOpts)
                      │   NO  → file.split(fragmentSize) → uploadFile(fragment[i]) for each
                      └─ Uploader.uploadFile()
                           ├─ wrapEncryption(file, enc) if encryption option set
                           │   type 'aes256'  → newSymmetricEncryptedFile(file, key)
                           │   type 'ecies'   → newEciesEncryptedFile(file, recipientPubKey)
                           ├─ file.merkleTree()
                           │    └─ iterateWithOffsetAndBatch(0, 256*1024, true)
                           │         └─ for each segment: AbstractFile.segmentRoot() → MerkleTree
                           ├─ findExistingFileInfo(rootHash) → skipIfFinalized check
                           ├─ file.createSubmission(tags, submitter)
                           ├─ submitLogEntryNoReceipt(submission, opts)
                           │    └─ flow.submit(submission, txOpts)  // ON-CHAIN TX
                           ├─ waitForLogEntry(rootHash, ...)          // polls storage nodes
                           ├─ splitTasks(info, tree, opts)
                           │    └─ getShardConfigs(nodes) → checkReplica()
                           └─ processTasksInParallel(file, tree, tasks, retryOpts)
                                └─ for each task:
                                     uploadTask(file, tree, task, retryOpts)
                                      └─ getSegment(file, tree, segIndex)
                                           └─ file.readFromFile() [via MemIterator]
                                      └─ nodes[clientIndex].uploadSegmentsByTxSeq(segments, txSeq)
                                           └─ zgs_uploadSegmentsByTxSeq RPC
```

### 2.3 Encryption in the Upload Path

**Critical finding:** The SDK's `Uploader` natively supports encryption via `EncryptedFile` wrapping:

```typescript
wrapEncryption(file, enc) {
    switch (enc.type) {
        case 'aes256':
            return newSymmetricEncryptedFile(file, enc.key);  // AES-256-CTR (not GCM)
        case 'ecies':
            return newEciesEncryptedFile(file, enc.recipientPubKey);  // ECDH-derived AES-256-CTR
    }
}
```

**Axiom's encryption flow is OUTSIDE this mechanism.** Axiom encrypts at the application layer before passing data to `uploadToStorage()`:

- **Oracle:** `plaintext → aesGcmEncrypt(key, data) → concatEncrypted() → blob` then uploads the ciphertext blob
- **E2E test:** `plaintext → aesGcmEncrypt(key, data) → blob` then uploads with `{ type: "aes256", key }` (effectively encrypting twice)

The SDK's native encryption uses **AES-256-CTR** (via `@noble/ciphers`), while Axiom's app-layer encryption uses **AES-256-GCM** (via Node.js `node:crypto`). These are different cipher modes.

### 2.4 What Happens on Upload Failure

1. **`indexer.upload()`** — returns `[{ txHash: '', rootHash: '', txSeq: 0 }, err]` on failure
2. **`uploadToStorage()`** — throws `new Error("0G upload failed: ...")` if err is truthy
3. **Backend `ZeroGStorage.uploadData()`** — wraps in `withRetry()` (3 attempts, backoff 100/400/900ms)
4. **Oracle `ZeroGStorage.upload()`** — NO retry wrapper
5. **Indexer** — catches error, re-buffers events (`eventBuffer.unshift(...batch)`), continues

**Upper-bound retry:** The SDK's Uploader has its own internal retry (max 3, configurable) for "too many data writing" errors on segment upload.

---

## 3. All 3 ZeroGStorage Instances — Side-by-Side Comparison

### 3.1 `packages/config/src/storage/0g.ts` (Shared Core)

**File:** `/home/eya/og/packages/config/src/storage/0g.ts`

| Property | Value |
|----------|-------|
| Class/Function | `uploadToStorage()` + `downloadFromStorage()` (free functions) |
| SDK imports | `Indexer`, `MemData` |
| Upload retry | **None** (error throws immediately) |
| Download retry | **None** (error throws immediately) |
| Encryption upload | Passes `{ encryption }` option to SDK's `indexer.upload()` |
| Encryption download | Passes `{ symmetricKey, privateKey }` to SDK's `indexer.downloadToBlob()` |
| Download with proof | Yes, `opts.withProof` defaults to `true` |
| Errror handling | `throw new Error(...)` on any failure |

**Key quirk:** `downloadFromStorage()` defaults `withProof: true` but the entire proof is silently discarded — the returned `DownloadResult` only has `{ data, rootHash, size }`.

### 3.2 `apps/backend/src/storage/0g.ts` (Backend Wrapper)

**File:** `/home/eya/og/apps/backend/src/storage/0g.ts`

| Property | Value |
|----------|-------|
| Class | `ZeroGStorage` (typed wrapper) |
| SDK imports | `Indexer` only |
| Constructor | `new Indexer(config.indexerRpc)` |
| Upload method | `uploadData(data, encryption?)` → `withRetry(() => uploadToStorage(...))` |
| Download method | `download(rootHash, opts?)` → `withRetry(() => downloadFromStorage(...))` |
| Retry logic | `withRetry()`: 3 attempts, 100/400/900ms exponential backoff |
| Encryption | Re-exports `Encryption` type (same shape as SDK's `EncryptionOption`) |

**Divergence from shared core:** Adds `withRetry()` wrapper. This is the only layer that adds retry.

### 3.3 `apps/oracle/src/storage.ts` (Oracle Wrapper)

**File:** `/home/eya/og/apps/oracle/src/storage.ts`

| Property | Value |
|----------|-------|
| Class | `ZeroGStorage` implements `StorageAdapter` |
| SDK imports | `Indexer` only |
| Constructor | `new Indexer(config.indexerRpc)` |
| Upload method | `upload(blob)` → `uploadToStorage(...)` — **NO retry** |
| Download method | `download(rootHash)` → `downloadFromStorage(..., { withProof: false })` — **NO retry** |
| Retry logic | **None** |
| Encryption | **Not supported** in the upload/download methods |

**Divergence from shared core:**
- `download()` passes `{ withProof: false }` vs. shared core's default `true`
- `upload()` passes no encryption option (even though the shared core supports it)
- No retry wrapper unlike backend
- Implements `StorageAdapter` interface + `markDataHashSeen()`/`hasSeenDataHash()` + `InMemoryStorage` dev alternative

### 3.4 Summary Table of Divergences

| Aspect | Config (shared) | Backend wrapper | Oracle wrapper |
|--------|----------------|----------------|---------------|
| Retry on upload | ❌ None | ✅ `withRetry()` (3x) | ❌ None |
| Retry on download | ❌ None | ✅ `withRetry()` (3x) | ❌ None |
| Encryption on upload | ✅ Passes through | ✅ Passes through | ❌ None (SDK path only) |
| Encryption on download | ✅ Passes through | ✅ Passes through | ❌ None (`withProof: false`) |
| Download withProof | ✅ default `true` | ✅ configurable | ❌ forced `false` |
| Error style | `throw` | `throw` (via withRetry) | `throw` |
| SDK imports | `Indexer, MemData` | `Indexer` | `Indexer` |

---

## 4. Encryption Path — Full End-to-End Trace

### 4.1 Application-Layer Encryption (Axiom's Own)

Axiom implements **two** encryption layers independent of the SDK:

#### AES-256-GCM (`apps/oracle/src/crypto/aes-gcm.ts`)
```
KEY (32 bytes) + PLAINTEXT
  → randomBytes(12) = IV
  → createCipheriv('aes-256-gcm', key, iv)
  → cipher.update(plaintext) + cipher.final() = CIPHERTEXT
  → cipher.getAuthTag() = AUTHTAG (16 bytes)
  → OUTPUT: iv (12) || ciphertext || authTag (16)
```

#### ECIES Key Wrapping (`apps/oracle/src/crypto/ecies.ts`)
```
RECEIVER_PUBKEY (64-byte uncompressed) + DATA_ENCRYPTION_KEY (32 bytes)
  → toCompressed() → 33-byte compressed pubkey
  → eciesjs.encrypt(compressedPubkey, dataKey)
  → OUTPUT: sealedKey (ephemeral pubkey prefix + ECIES ciphertext)
```

### 4.2 Oracle Transfer-Rekey Flow

```
plaintext (agent strategy)
  ↓
aesGcmEncrypt(newDataKey, plaintext)
  → iv || ciphertext || authTag
  ↓
concatEncrypted() → encryptedBlob
  ↓
storage.upload(encryptedBlob)           // uploads to 0G as opaque bytes
  → returns newDataHash (rootHash)
  ↓
sealKeyForReceiver(targetPubkey, newDataKey)   // ECIES encrypt the DEK
  → eciesjs.encrypt(compressedPubkey, newDataKey)
  → sealedKey
```

### 4.3 Oracle Download-Decrypt Flow

```
storage.download(dataHash)
  → encryptedBlob (raw bytes from 0G)
  ↓
parseEncrypted(encryptedBlob)
  → { iv, ciphertext, authTag }
  ↓
aesGcmDecrypt(oldDataKey, { iv, ciphertext, authTag })
  → createDecipheriv('aes-256-gcm', key, iv)
  → decipher.setAuthTag(authTag)
  → decipher.update() + decipher.final()
  → plaintext
```

### 4.4 Double-Encryption Risk (E2E Test)

In `apps/backend/src/cli/run-e2e.ts`:

```typescript
// Step 3: AES-256-GCM encrypt with dataKey
const enc = aesGcmEncrypt(dataKey, plaintext);
const blob = concatEncrypted(enc);

// Step 4: Upload to 0G with encryption option
const upload = await storage.uploadData(blob, { type: "aes256", key: dataKey });
```

This encrypts the data with AES-256-GCM at the app layer, **then** the SDK encrypts the already-encrypted blob with AES-256-CTR before storing to 0G. When downloading with the correct key, the SDK strips its AES-256-CTR layer, returning the still-AES-256-GCM-encrypted blob. The receiver then decrypts AES-256-GCM separately.

**This double encryption is intentional but fragile** — two different cipher modes (GCM + CTR) are stacked.

### 4.5 SDK Native Encryption (Not Used by Axiom)

The SDK natively supports encryption via `EncryptedFile`:

```typescript
// SDK's encryption (AES-256-CTR via @noble/ciphers)
header = [version(1)][nonce(16)]        // symmetric: 17 bytes
      or [version(2)][ephemeralPub(33)][nonce(16)]  // ECIES: 50 bytes
body = AES-256-CTR(key, nonce, plaintext)
file_on_0g = header || body
```

The SDK's `Downloader.downloadFileToBlob()` and `Indexer.downloadToBlob()` handle decryption automatically if `decryption` option is provided:
- `tryDecrypt()` — best-effort decrypt, returns raw bytes if decryption fails (silent fallback!)
- `tryDecryptFragments()` — multi-fragment decryption with CTR offset tracking
- `peekHeader()` — peek encryption header without full download

---

## 5. Full Download Call Chain

```
downloadFromStorage(indexer, rootHash, opts?)
  └─ indexer.downloadToBlob(rootHash, { proof, decryption })
       └─ Indexer.downloadToBlob(rootHash, opts)
            └─ downloadSingleToBlob(rootHash, opts)
                 ├─ newDownloaderFromIndexerNodes(rootHash)
                 │    ├─ indexer.getFileLocations(rootHash)  // indexer_getFileLocations RPC
                 │    ├─ selectNodes(locations, 1, 'random')
                 │    └─ new Downloader(clients)
                 ├─ downloader.downloadToBlob(rootHash, proof)
                 │    └─ Downloader.downloadFileToBlob(root, proof)
                 │         ├─ queryFile(root) → getFileInfo(root, true)  // zgs_getFileInfo RPC
                 │         ├─ getShardConfigs(this.nodes)
                 │         └─ downloadFileHelperToBlob(info, proof)
                 │              └─ for each segment:
                 │                   downloadTask(info, 0, taskInd, numChunks, proof)
                 │                    └─ nodes[nodeIndex].downloadSegmentByTxSeq(txSeq, start, end)
                 │                         → zgs_downloadSegmentByTxSeq RPC
                 │              └─ new Blob(chunks)   // raw, un-decrypted
                 └─ if opts.decryption:
                      tryDecrypt(encrypted, opts)  // best-effort
                       → parseEncryptionHeader() → resolveDecryptionKey() → decryptFile()
                      → new Blob([plaintext])
```

---

## 6. Every SDK Feature Not Used — Risk Assessment

### 6.1 `uploadToHot()` — Upload + Prefetch to Hot Storage

The SDK supports atomic upload + hot-storage prefetch, which would reduce latency for subsequent reads. Axiom does not use hot storage at all.

### 6.2 `KvClient` + `Batcher` — KV Store Operations

The SDK includes a complete KV store client suite:
- `KvClient.getValue()`, `getNext()`, `getPrev()`, `getFirst()`, `getLast()`
- `Batcher` + `StreamDataBuilder` for batched KV writes
- Permission checking (`hasWritePermission`, `isAdmin`, `isWriterOfKey`, etc.)

Axiom does not use 0G KV storage at all.

### 6.3 `ZgFile` — File-Based Uploads

The SDK has `ZgFile.fromFilePath()` for uploading files directly from disk. Axiom only uses `MemData` (in-memory Uint8Array uploads). This is fine for Axiom's use case.

### 6.4 `selectNodes()` — Low-Level Node Selection

The SDK exports `selectNodes()` with `'min'`, `'max'`, `'random'` methods. Axiom calls it only indirectly via `Indexer.upload()`.

### 6.5 `peekHeader()` — Encryption Header Inspection

The SDK can peek at a file's encryption header without downloading the full file. Axiom could use this to determine encryption type before download, but doesn't.

### 6.6 `Flow Contract` Types (`FixedPriceFlow`)

The SDK bundles typechain-generated flow contract bindings. Axiom doesn't interact with flow contracts directly.

### 6.7 Hot Router (`HotRouterClient`)

Complete client for hot-storage router with `prefetch()`, `fileStatus()`, `waitForCached()`. Not used.

### 6.8 `EncryptedFile` / `EncryptedFileFragment`

SDK's internal AES-256-CTR encryption wrapper. Axiom does app-layer AES-256-GCM instead, meaning:
- SDK's native encryption AND Axiom's encryption are both in play (double encryption in some paths)
- Different cipher modes (CTR vs GCM) — incompatible if mixed
- SDK tries to decrypt files automatically if `decryption` is set — could silently return garbage if wrong keys are provided (it falls back to raw bytes on error)

---

## 7. Critical Risks and Issues Found

### 7.1 Silent Decryption Failure (CONFIRMED)

The SDK's `tryDecrypt()` and `tryDecryptFragments()` functions return **raw bytes on ANY decryption failure** — they never throw. The `Indexer.downloadSingleToBlob()` and `Indexer.downloadFragmentsToBlob()` methods use these functions.

**Impact:** If an encrypted file is downloaded with the wrong key, the SDK returns the still-encrypted blob without error. Callers get garbage data with no indication of failure.

### 7.2 Axiom's Encryption Type Mismatch

- **SDK native:** AES-256-CTR (stream cipher, no authentication)
- **Axiom app-layer:** AES-256-GCM (authenticated encryption)
- **Upload with `encryption` option:** SDK wraps data in AES-256-CTR, then attempts to decrypt on download using SDK's own CTR mode
- **Download without `encryption` option:** Raw bytes returned — if Axiom encrypted at app layer with GCM, the SDK doesn't know about it

**The oracle's `ZeroGStorage.upload()` does NOT pass encryption to `uploadToStorage()`**, meaning only app-layer AES-256-GCM protects the data. The SDK stores the GCM ciphertext as raw bytes.

### 7.3 Inconsistent Retry Coverage

| Upload path | Retry? |
|-------------|--------|
| Backend `uploadData()` | ✅ 3 attempts, 100/400/900ms |
| Oracle `upload()` | ❌ None |
| Indexer `uploadToStorage()` | ❌ None |
| Oracle `download()` | ❌ None |
| Backend `download()` | ✅ 3 attempts |

### 7.4 Inconsistent Download Proof Configuration

| Download path | `withProof` |
|--------------|-------------|
| Config shared default | `true` |
| Backend wrapper | Respects caller |
| Oracle `download()` | forced `false` |

### 7.5 Raw Blob vs. ArrayBuffer Type Cast

In `downloadFromStorage()`:
```typescript
const data = new Uint8Array(await blob.arrayBuffer());
```
The SDK's `downloadSingleToBlob()` returns `[new Blob([bytes]), null]` — there's a type cast from `Uint8Array<ArrayBufferLike>` to `BlobPart`. If V8/Node.js changes BlobPart narrowing rules, this could break silently.

### 7.6 SDK Version Change Risk

If the SDK updates from `1.2.10`:
- **API surface change in `Indexer.upload()` return type** — currently returns `{ txHash, rootHash, txSeq } | { txHashes, rootHashes, txSeqs }`, Axiom handles both shapes
- **`MemData` constructor signature change** — Axiom constructs `new MemData(data, evmRpc, signer, opts)` — if SDK changes this, it breaks
- **EncryptionOption shape change** — Axiom defines its own local `EncryptionOption` type that must match the SDK's

### 7.7 Dependency Copy Duplication

`@0gfoundation/0g-storage-ts-sdk@1.2.10` is installed in **3 separate locations**:
- `packages/config/node_modules/@0gfoundation/0g-storage-ts-sdk/`
- `apps/backend/node_modules/@0gfoundation/0g-storage-ts-sdk/`
- `apps/oracle/node_modules/@0gfoundation/0g-storage-ts-sdk/`

And listed as a dependency in 3 places:
- `packages/config/package.json`
- `apps/backend/package.json`
- `apps/oracle/package.json`

With pnpm workspaces, this should be hoisted to root `node_modules` — having 3 copies is unusual and suggests a `pnpm-lock.yaml` quirk or `nohoist` configuration.

### 7.8 The Indexer Instance Structure

Each application creates its own `Indexer` instance:
- Backend: `new Indexer(config.indexerRpc)` in `ZeroGStorage` constructor
- Oracle: `new Indexer(config.indexerRpc)` in `ZeroGStorage` constructor
- Indexer service: `new Indexer(ogStorageRpc)` in `main()`

Since `Indexer extends HttpProvider` (from `open-jsonrpc-provider`), each instance has its own HTTP connection pool. Connection pooling is not shared across instances.

---

## 8. Encryption Path Flowchart

```
UPLOAD PATH (Backend / E2E):
─────────────────────────────
  plaintext (agent strategy)
      │
      ▼
  [Application Layer] aesGcmEncrypt(dataKey, plaintext)
      │  → iv (12) || ciphertext || authTag (16)
      ▼
  [Optional: SDK Encryption Layer]
      │  → if `encryption` option is set: EncryptedFile wraps blob
      │    in AES-256-CTR: header (17/50B) || ciphertext
      ▼
  [Upload to 0G]
      │  → uploadToStorage() → indexer.upload() → Uploader.splitableUpload()
      │  → ON-CHAIN TX + segment upload to storage nodes
      ▼
  rootHash (stored on-chain as dataHash in AgentNFT)

DOWNLOAD PATH (Oracle):
─────────────────────────────
  rootHash (dataHash)
      │
      ▼
  [Download from 0G]
      │  → downloadFromStorage() → indexer.downloadToBlob()
      │  → Downloader.downloadFileToBlob() → raw segments reassembled
      ▼
  [Optional: SDK Decryption Layer]
      │  → if `decryption` option set: tryDecrypt() strips AES-256-CTR
      │  → falls back to raw bytes silently on failure
      ▼
  [Application Layer] parseEncrypted(rawBlob)
      │  → { iv, ciphertext, authTag }
      ▼
  aesGcmDecrypt(dataKey, { iv, ciphertext, authTag })
      │
      ▼
  plaintext

REKEY PATH (Oracle transfer-validity):
─────────────────────────────
  oldDataHash → download oldBlob from 0G
      → parseEncrypted(oldBlob)
      → aesGcmDecrypt(oldDataKey, oldEnc)
      → oldPlaintext
      → aesGcmEncrypt(newDataKey, oldPlaintext)
      → concatEncrypted(newEnc)
      → upload newBlob to 0G
      → newDataHash = rootHash
      → sealKeyForReceiver(targetPubkey, newDataKey)  [ECIES]
      → sealedKey
```

---

## 9. Recommended Improvements (Informational)

1. **Remove duplicate SDK dependency** — only `@axiom/config` needs it; backend and oracle can consume transitively
2. **Unify retry policy** — add `withRetry()` to oracle's `ZeroGStorage`
3. **Unify download `withProof`** — use `true` consistently (currently oracle uses `false`)
4. **Consider SDK's native encryption** — using `EncryptedFile` in addition to/supplanting app-layer AES-256-GCM would leverage the SDK's automatic decrypt-on-download
5. **Use `peekHeader()`** before download in Axiom to detect encryption type
6. **Reuse `Indexer` instances** across the process lifecycle — each `new Indexer(url)` creates a new JSON-RPC connection
