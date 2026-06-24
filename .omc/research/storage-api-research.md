# 0G Storage Indexer API — Deep Research Report

> **Date:** 2026-06-24  
> **Objective:** Discover the REAL 0G Storage Indexer & Storage Node API formats, understand why `zg_getStatus` returned `-32601 method not found`, and document every RPC method the SDK uses.

---

## Executive Summary

The 0G Storage ecosystem has **three distinct** JSON-RPC API surfaces, each with its own method prefix:

| Component      | Method Prefix    | Called On                                | Purpose                              |
|----------------|-----------------|------------------------------------------|--------------------------------------|
| **Indexer**    | `indexer_`       | `https://indexer-storage-testnet-turbo.0g.ai` | Node discovery, file location lookup |
| **Storage Node** | `zgs_`         | Individual storage node URLs (returned by Indexer) | Segment upload/download, status, file info |
| **KV Node**    | `kv_`            | KV node URLs (e.g. `http://3.101.147.150:6789`) | Key-value storage operations |

**Root cause of `zg_getStatus -32601`:**
1. The method name is wrong — it's `zgs_getStatus` (with an **s** after `zg`), not `zg_getStatus`.
2. Even `zgs_getStatus` cannot be called on the **Indexer** URL — it's a **Storage Node** method. The Indexer only understands `indexer_*` methods.

---

## 1. How the SDK Actually Communicates

### Transport Layer (`open-jsonrpc-provider` HttpProvider / BaseProvider)

Every RPC call uses **JSON-RPC 2.0** over **HTTP POST** with `axios`. The payload format:

```json
{
  "jsonrpc": "2.0",
  "method": "<method_name>",
  "params": [...],
  "id": <number>
}
```

Response format (standard JSON-RPC 2.0):

```json
{
  "jsonrpc": "2.0",
  "result": <data>,
  "id": <number>
}
```

On error:

```json
{
  "jsonrpc": "2.0",
  "error": { "code": <number>, "message": <string>, "data": <any> },
  "id": <number>
}
```

**Source:** `zgstorage.esm.js` lines 25554–25567 (BaseProvider class) and 27829–27849 (HttpProvider._transport).

### Indexer → Storage Node Flow

1. **Indexer queries** `indexer_getShardedNodes()` → gets list of trusted/discovered storage node URLs
2. **Indexer queries** `indexer_getFileLocations(rootHash)` → gets storage node URLs for a specific file
3. **Uploader/Downloader** creates `StorageNode` clients pointing to individual storage node URLs
4. **StorageNode** calls `zgs_getStatus`, `zgs_getFileInfo`, `zgs_uploadSegmentsByTxSeq`, `zgs_downloadSegmentByTxSeq`, etc. on the storage node URLs

---

## 2. Indexer JSON-RPC Methods

Base URL: `https://indexer-storage-testnet-turbo.0g.ai` (testnet) / `https://indexer-storage-turbo.0g.ai` (mainnet)

### `indexer_getShardedNodes`

- **Params:** none (`[]`)
- **Returns:** `{ trusted: ShardedNode[], discovered: ShardedNode[] }`
- **Each ShardedNode:** `{ url: string, config?: ShardConfig }`
- **Used for:** Selecting storage nodes for upload
- **Source:** `Indexer.js` line 64, Go SDK `client.go` line 71

### `indexer_getNodeLocations`

- **Params:** none (`[]`)
- **Returns:** `Map<string, IpLocation>` (node URL → IP location info)
- **Source:** `Indexer.js` line 69, Go SDK `client.go` line 78

### `indexer_getFileLocations(rootHash)`

- **Params:** `[rootHash: string]`
- **Returns:** `ShardedNode[]` (or `null` → normalized to `[]`)
- **Used for:** Finding which storage nodes hold a specific file (for download)
- **Source:** `Indexer.js` line 73, Go SDK `client.go` line 83

### `indexer_getSelectedNodes` (Go SDK only — NOT in TS SDK)

- **Params:** `[expectedReplica: uint, method: string, fullTrusted: bool, dropped: string[]]`
- **Returns:** `ShardedNodes`
- **Note:** The TS SDK does this logic client-side using `getShardedNodes()` + local `selectNodes()` function
- **Source:** Go SDK `client.go` line 76

---

## 3. Storage Node JSON-RPC Methods

Base URL: Individual storage node URLs (e.g. `http://3.101.147.150:6789`, `http://54.218.211.108:5678`, etc. — returned by Indexer)

### `zgs_getStatus`

- **Params:** none (`[]`)
- **Returns:** `Status`
  ```typescript
  {
    connectedPeers: number;
    logSyncHeight: number;
    logSyncBlock: Hash;
    nextTxSeq: number;
    networkIdentity: {
      chainId: number;
      flowAddress: string;
      p2pProtocolVersion: { major: number; minor: number; build: number };
    };
  }
  ```
- **Source:** `StorageNode.js` line 10, Go SDK `client_zgs.go` line 73

### `zgs_getShardConfig`

- **Params:** none (`[]`)
- **Returns:** `ShardConfig` (numShard, shardId, etc.)
- **Source:** `StorageNode.js` line 97, Go SDK `client_zgs.go` line 133

### `zgs_getFileInfo(root, needAvailable)`

- **Params:** `[root: Hash, needAvailable: boolean]`
- **Returns:** `FileInfo | null`
  ```typescript
  {
    tx: Transaction;
    finalized: boolean;
    isCached: boolean;
    uploadedSegNum: number;
  }
  ```
- **Source:** `StorageNode.js` line 83, Go SDK `client_zgs.go` line 82

### `zgs_getFileInfoByTxSeq(txSeq)`

- **Params:** `[txSeq: number]`
- **Returns:** `FileInfo | null`
- **Source:** `StorageNode.js` line 90, Go SDK `client_zgs.go` line 87

### `zgs_checkFileFinalized` (Go SDK only — NOT in TS SDK)

- **Params:** `[txSeqOrRoot]`
- **Returns:** `*bool`
- **Source:** Go SDK `client_zgs.go` line 78

### `zgs_uploadSegment(seg)`

- **Params:** `[SegmentWithProof]`
- **Returns:** `number`
- **Source:** `StorageNode.js` line 14, Go SDK `client_zgs.go` line 91

### `zgs_uploadSegments(segs)`

- **Params:** `[SegmentWithProof[]]`
- **Returns:** `number`
- **Source:** `StorageNode.js` line 21, Go SDK `client_zgs.go` line 96

### `zgs_uploadSegmentByTxSeq(seg, txSeq)`

- **Params:** `[SegmentWithProof, number]`
- **Returns:** `number`
- **Source:** `StorageNode.js` line 29, Go SDK `client_zgs.go` line 101

### `zgs_uploadSegmentsByTxSeq(segs, txSeq)` ⭐ **Primary upload method**

- **Params:** `[SegmentWithProof[], number]`
- **Returns:** `number`
- **Used in:** Uploader's `uploadTask` method — this is the actual workhorse for uploading data segments to storage nodes
- **Source:** `StorageNode.js` line 37, Uploader.js line 433, Go SDK `client_zgs.go` line 106

### `zgs_downloadSegment(root, startIndex, endIndex)`

- **Params:** `[root: Hash, startIndex: number, endIndex: number]`
- **Returns:** `Segment` (base64 encoded data)
- **Source:** `StorageNode.js` line 43, Go SDK `client_zgs.go` line 111

### `zgs_downloadSegmentWithProof(root, index)`

- **Params:** `[root: Hash, index: number]`
- **Returns:** `SegmentWithProof`
- **Source:** `StorageNode.js` line 50, Go SDK `client_zgs.go` line 121

### `zgs_downloadSegmentByTxSeq(txSeq, startIndex, endIndex)` ⭐ **Primary download method**

- **Params:** `[txSeq: number, startIndex: number, endIndex: number]`
- **Returns:** `Segment`
- **Used in:** Downloader's `downloadTask` method — downloads segments by transaction sequence number (more reliable than by root hash)
- **Source:** `StorageNode.js` line 61, Downloader.js line 343, Go SDK `client_zgs.go` line 116

### `zgs_downloadSegmentWithProofByTxSeq(txSeq, index)`

- **Params:** `[txSeq: number, index: number]`
- **Returns:** `SegmentWithProof`
- **Source:** `StorageNode.js` line 69, Go SDK `client_zgs.go` line 126

### `zgs_getSectorProof(sectorIndex, root)`

- **Params:** `[sectorIndex: number, root: Hash]`
- **Returns:** `FlowProof`
- **Source:** `StorageNode.js` line 76, Go SDK `client_zgs.go` line 138

---

## 4. KV Node JSON-RPC Methods

Base URL: KV node endpoint (e.g. `http://3.101.147.150:6789`)

### `kv_getValue(streamId, key, startIndex, length, version?)`

- **Params:** `[streamId: Hash, key: base64, startIndex: number, length: number, version?: number]`
- **Returns:** `Value`
- **Source:** `StorageKv.js` line 19

### `kv_getNext(streamId, key, startIndex, length, inclusive, version?)`

- **Params:** `[streamId, key, startIndex, length, inclusive, version?]`
- **Returns:** `KeyValue`
- **Source:** `StorageKv.js` line 30

### `kv_getPrev(streamId, key, startIndex, length, inclusive, version?)`

- **Params:** `[streamId, key, startIndex, length, inclusive, version?]`
- **Returns:** `KeyValue`
- **Source:** `StorageKv.js` line 46

### `kv_getFirst(streamId, startIndex, length, version?)`

- **Params:** `[streamId, startIndex, length, version?]`
- **Returns:** `KeyValue`
- **Source:** `StorageKv.js` line 63

### `kv_getLast(streamId, startIndex, length, version?)`

- **Params:** `[streamId, startIndex, length, version?]`
- **Returns:** `KeyValue`
- **Source:** `StorageKv.js` line 73

### `kv_getTransactionResult(txSeq)`

- **Params:** `[txSeq: string]`
- **Returns:** `string`
- **Source:** `StorageKv.js` line 83

### `kv_getHoldingStreamIds()`

- **Params:** none
- **Returns:** `Hash[]`
- **Source:** `StorageKv.js` line 92

### `kv_hasWritePermission(account, streamId, key, version?)`

- **Params:** `[account, streamId, key, version?]`
- **Returns:** `boolean`
- **Source:** `StorageKv.js` line 97

### `kv_IsAdmin(account, streamId, version?)` ⚠️ **Note capital "I"**

- **Params:** `[account, streamId, version?]`
- **Returns:** `boolean`
- **Note:** Method name has capital "I" (`kv_IsAdmin`, not `kv_isAdmin`)
- **Source:** `StorageKv.js` line 111

### `kv_isSpecialKey(streamId, key, version?)`

- **Params:** `[streamId, key, version?]`
- **Returns:** `boolean`
- **Source:** `StorageKv.js` line 122

### `kv_isWriterOfKey(account, streamId, key, version?)`

- **Params:** `[account, streamId, key, version?]`
- **Returns:** `boolean`
- **Source:** `StorageKv.js` line 132

### `kv_isWriterOfStream(account, streamId, version?)`

- **Params:** `[account, streamId, version?]`
- **Returns:** `boolean`
- **Source:** `StorageKv.js` line 145

---

## 5. Hot Router REST API (non-JSON-RPC)

These are **REST** endpoints (not JSON-RPC), using plain HTTP with `fetch`.

### `POST /prefetch`

- **Body:** `{ file_hashes: string[] }`
- **Response:** `{ status: "cached" | "prefetching" | "not_cached" | "unknown" }`
- **Source:** `HotRouterClient.js` line 60

### `GET /file/status?hash=ROOT_HASH`

- **Response:** `{ status: "cached" | "prefetching" | "not_cached" | "unknown" }`
- **Source:** `HotRouterClient.js` line 76

### `POST /download` (Go SDK only)

- **Body:** `{ user, file_hashes, nonce, signature }` (EIP-712 signed)
- **Response:** `{ node_url, provider, file_hashes, max_fee, nonce, signature }`
- **Source:** Go SDK `client_hot_router.go`

### `GET /balance?user=ADDRESS` (Go SDK only)

- **Response:** `{ balance, local_reserved, available }`
- **Source:** Go SDK `client_hot_router.go`

### `GET /service?provider=ADDRESS` (Go SDK only)

- **Response:** `{ price_per_byte, url, active }`
- **Source:** Go SDK `client_hot_router.go`

---

## 6. Why `zg_getStatus` Returns `-32601 Method Not Found`

### Two bugs in the probe:

**Bug 1: Wrong method name prefix**
- ❌ `zg_getStatus` — wrong, missing the `s`
- ✅ `zgs_getStatus` — correct (the `s` stands for "Storage")

All storage node methods use the prefix `zgs_` (0G **S**torage), not `zg_`. The Go SDK consistently uses `zgs_` across all storage node RPCs.

**Bug 2: Wrong endpoint**
- `zgs_getStatus` is a **Storage Node** method, NOT an Indexer method
- The Indexer URL (`https://indexer-storage-testnet-turbo.0g.ai`) only accepts `indexer_*` methods
- Storage node URLs (returned by `indexer_getShardedNodes` or `indexer_getFileLocations`) are where `zgs_*` methods can be called

### Correct way to call `zgs_getStatus`:

```bash
# Step 1: Get a storage node URL from the indexer
curl -s -X POST https://indexer-storage-testnet-turbo.0g.ai \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"indexer_getShardedNodes","params":[],"id":1}'

# Step 2: Call zgs_getStatus on one of the returned node URLs
curl -s -X POST http://<STORAGE_NODE_URL> \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"zgs_getStatus","params":[],"id":1}'
```

---

## 7. Axiom's Current Usage Analysis

### How Axiom uses the SDK correctly:

File: `/home/eya/og/packages/config/src/storage/0g.ts`

```typescript
// Correct: Indexer constructed with indexer RPC URL
this.indexer = new Indexer(config.indexerRpc);

// Correct: indexer.upload() uses Indexer to discover nodes, then StorageNode to upload
const [tx, err] = await indexer.upload(new MemData(data), evmRpc, signer, opts);

// Correct: indexer.downloadToBlob() uses Indexer to find file locations, then StorageNode to download
const [blob, err] = await indexer.downloadToBlob(rootHash, downloadOpts);
```

### What Axiom does NOT use (available but unused):

| Method/Feature | Available In SDK | Used By Axiom | Notes |
|---|---|---|---|
| `uploadToHot()` (Indexer) | ✅ v1.2.10 | ❌ | Upload + hot cache prefetch in one step |
| `peekHeader()` (Indexer) | ✅ v1.2.10 | ❌ | Check encryption header before download |
| `getFileLocations()` (Indexer) | ✅ | ❌ (only used internally) | Direct file location lookup |
| `StorageNode` direct usage | ✅ | ❌ | All storage node access is via Indexer wrapper |
| `StorageKv` / `KvClient` | ✅ | ❌ | KV store not used |
| `HotRouterClient` | ✅ | ❌ | Hot storage not used |
| `indexer_getNodeLocations` (RPC) | ✅ | ❌ | Node IP location data |
| `zgs_getStatus` (RPC) | ✅ | ❌ | Storage node health/status checks |
| Hot Router `GET /file/status` | ✅ | ❌ | Check if file is hot-cached |
| Client-side encryption (AES-256, ECIES) | ✅ | ✅ | Used in tests |
| `tryDecrypt()` | ✅ | ✅ | Used for download verification |

### Methods Axiom SHOULD consider:

1. **`zgs_getStatus`** on storage nodes — for health checks and monitoring storage node sync status
2. **`peekHeader()`** — to detect file encryption before attempting download (especially in the oracle)
3. **`indexer_getNodeLocations`** — for network topology awareness and node selection optimization

---

## 8. Complete Method Index

### Indexer (`indexer_*` prefix)
| # | Method | TS SDK | Go SDK | Params |
|---|--------|--------|--------|--------|
| 1 | `indexer_getShardedNodes` | ✅ | ✅ | `[]` |
| 2 | `indexer_getNodeLocations` | ✅ | ✅ | `[]` |
| 3 | `indexer_getFileLocations` | ✅ | ✅ | `[rootHash]` |
| 4 | `indexer_getSelectedNodes` | ❌ | ✅ | `[expectedReplica, method, fullTrusted, dropped]` |

### Storage Node (`zgs_*` prefix)
| # | Method | TS SDK | Go SDK | Params |
|---|--------|--------|--------|--------|
| 1 | `zgs_getStatus` | ✅ | ✅ | `[]` |
| 2 | `zgs_getShardConfig` | ✅ | ✅ | `[]` |
| 3 | `zgs_getFileInfo` | ✅ | ✅ | `[root, needAvailable]` |
| 4 | `zgs_getFileInfoByTxSeq` | ✅ | ✅ | `[txSeq]` |
| 5 | `zgs_checkFileFinalized` | ❌ | ✅ | `[txSeqOrRoot]` |
| 6 | `zgs_uploadSegment` | ✅ | ✅ | `[SegmentWithProof]` |
| 7 | `zgs_uploadSegments` | ✅ | ✅ | `[SegmentWithProof[]]` |
| 8 | `zgs_uploadSegmentByTxSeq` | ✅ | ✅ | `[SegmentWithProof, txSeq]` |
| 9 | `zgs_uploadSegmentsByTxSeq` | ✅ | ✅ | `[SegmentWithProof[], txSeq]` |
| 10 | `zgs_downloadSegment` | ✅ | ✅ | `[root, startIndex, endIndex]` |
| 11 | `zgs_downloadSegmentWithProof` | ✅ | ✅ | `[root, index]` |
| 12 | `zgs_downloadSegmentByTxSeq` | ✅ | ✅ | `[txSeq, startIndex, endIndex]` |
| 13 | `zgs_downloadSegmentWithProofByTxSeq` | ✅ | ✅ | `[txSeq, index]` |
| 14 | `zgs_getSectorProof` | ✅ | ✅ | `[sectorIndex, root]` |

### KV Node (`kv_*` prefix)
| # | Method | TS SDK | Params |
|---|--------|--------|--------|
| 1 | `kv_getValue` | ✅ | `[streamId, key, startIndex, length, version?]` |
| 2 | `kv_getNext` | ✅ | `[streamId, key, startIndex, length, inclusive, version?]` |
| 3 | `kv_getPrev` | ✅ | `[streamId, key, startIndex, length, inclusive, version?]` |
| 4 | `kv_getFirst` | ✅ | `[streamId, startIndex, length, version?]` |
| 5 | `kv_getLast` | ✅ | `[streamId, startIndex, length, version?]` |
| 6 | `kv_getTransactionResult` | ✅ | `[txSeq]` |
| 7 | `kv_getHoldingStreamIds` | ✅ | `[]` |
| 8 | `kv_hasWritePermission` | ✅ | `[account, streamId, key, version?]` |
| 9 | `kv_IsAdmin` ⚠️ | ✅ | `[account, streamId, version?]` |
| 10 | `kv_isSpecialKey` | ✅ | `[streamId, key, version?]` |
| 11 | `kv_isWriterOfKey` | ✅ | `[account, streamId, key, version?]` |
| 12 | `kv_isWriterOfStream` | ✅ | `[account, streamId, version?]` |

### Hot Router (REST — non JSON-RPC)
| # | Endpoint | Method | TS SDK | Go SDK |
|---|----------|--------|--------|--------|
| 1 | `/prefetch` | POST | ✅ | ✅ |
| 2 | `/file/status` | GET | ✅ | ✅ |
| 3 | `/download` | POST | ❌ | ✅ |
| 4 | `/balance` | GET | ❌ | ✅ |
| 5 | `/service` | GET | ❌ | ✅ |

---

## 9. Key Takeaway

**The error `zg_getStatus: -32601 method not found` is caused by TWO mistakes:**
1. Wrong method name prefix: should be `zgs_` not `zg_`
2. Wrong endpoint: `zgs_*` methods belong to storage nodes, not the indexer

The correct JSON-RPC call to check storage node status is:

```
POST http://<storage-node-url>
Content-Type: application/json

{"jsonrpc":"2.0","method":"zgs_getStatus","params":[],"id":1}
```

And the storage node URLs must first be obtained from the indexer via `indexer_getShardedNodes` or `indexer_getFileLocations`.
