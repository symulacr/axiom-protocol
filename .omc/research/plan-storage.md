# 0G Storage Integration — Revised Fix Plan

**Date**: 2026-06-24 | **Author**: planning-agent  
**Based on**: `stack-storage.md` research report + SDK source verification (v1.2.10) + deep-trace + actual source code audit
**SDK version**: `@0gfoundation/0g-storage-ts-sdk@1.2.10`

---

## SDK Source Verification Results (Confirmed vs. Corrected)

### Finding A (Corrected — false positive)
The research report flagged missing `.merkleTree()` call before `indexer.upload()`. **False positive.** The SDK's `Uploader.uploadFile()` calls `file.merkleTree()` internally at line 26. Axiom's `uploadToStorage()` does NOT need to call it manually.

### Finding B (Confirmed — single encryption layer in oracle)
The oracle's `ZeroGStorage.upload()` at `apps/oracle/src/server.ts:97` calls `storage.upload(newBlob)` **without** the SDK `encryption` option. Only app-level AES-256-GCM is used. No double encryption.

### Finding C (Confirmed — E2E test IS double-encrypted)
`apps/backend/src/cli/run-e2e.ts:106-117` encrypts with AES-256-GCM, then SDK re-encrypts with AES-256-CTR. Two different cipher modes stacked. Intentional but fragile.

### Finding D (Confirmed) — SDK uses AES-256-CTR, Axiom app uses AES-256-GCM

| Aspect | SDK (`@noble/ciphers`) | Axiom app-level (`node:crypto`) |
|--------|----------------------|-------------------------------|
| Cipher | AES-256-CTR | AES-256-GCM |
| Auth tag | None | 16-byte GCM auth tag |
| Nonce/IV | 16 bytes | 12 bytes |
| Wire format | `[0x01][nonce:16][ciphertext]` | `[iv:12][ciphertext][authTag:16]` |

These are **incompatible** — if mixed, `tryDecrypt()` silently returns raw bytes.

### Finding E (Confirmed) — `tryDecrypt()` is best-effort, never throws
Returns `{ bytes, decrypted: false }` on any failure (wrong key, missing header, off-curve pubkey). `downloadSingleToBlob()` passes this through silently — callers get garbage data with no error.

---

## Issue Inventory (Post-Audit)

| # | Severity | Issue | Files | Action |
|---|----------|-------|-------|--------|
| 1 | 🔴 CRITICAL | **Silent decryption failure**: SDK `tryDecrypt()` returns raw bytes on any error, never throws | `packages/config/src/storage/0g.ts` (download path) | Add validation guard |
| 2 | 🔴 HIGH | Triple `ZeroGStorage` class definitions with incompatible interfaces | `packages/config/src/storage/0g.ts` + `apps/backend/src/storage/0g.ts` + `apps/oracle/src/storage.ts` | Consolidate to one |
| 3 | 🟠 HIGH | Cipher mode mismatch: SDK AES-256-CTR vs Axiom AES-256-GCM — incompatible | All encryption paths | Align on one mode |
| 4 | 🟡 MEDIUM | Dead code: `submitEvent(event, {})` in indexer's `composeSinks` storage case | `apps/indexer/src/index.ts` line 162 | Remove no-op block |
| 5 | 🟡 MEDIUM | Env var naming inconsistency (3 naming conventions for storage RPC) | All storage files + `packages/config/src/env.ts` | Standardize + aliases |
| 6 | 🟡 MEDIUM | Oracle storage has no retry wrapper (backend does: `withRetry`) | `apps/oracle/src/storage.ts` | Auto-fixed by consolidation |
| 7 | 🟢 LOW | Duplicate `Encryption` type definitions | `packages/config/src/storage/0g.ts` + `apps/backend/src/storage/0g.ts` | Auto-fixed by consolidation |
| 8 | 🟢 LOW | `InMemoryStorage` lives in oracle but imported by backend tests | `apps/oracle/src/storage.ts` + `apps/backend/src/server/transfer.test.ts` | Auto-fixed by consolidation |
| 9 | 🟢 LOW | Encryption strategy inconsistency (oracle=app-level, backend=SDK-level) | Both storage paths | Align per Issue 3 decision |
| 10 | 🟢 LOW | Indexer uses `new Indexer(ogStorageRpc)` directly without wrapper | `apps/indexer/src/index.ts` line 256 | Acceptable as-is |

---

## SDK Feature Map (Relevant to Axiom)

Only **2 SDK exports** are currently imported by Axiom: `Indexer` and `MemData`.

| SDK Export | Axiom Uses? | Plan |
|------------|-------------|------|
| `Indexer` | ✅ YES | Keep |
| `MemData` | ✅ YES (in config's `uploadToStorage`) | Keep |
| `tryDecrypt` | ❌ Not used | **Import** for decryption validation guard |
| `tryDecryptFragments` | ❌ Not used | Not needed (single-file downloads) |
| `KvClient`, `Batcher`, `ZgFile`, `HotRouterClient`, `StorageNode`, `peekHeader` (method) | ❌ No use case | **No enablement code** — Axiom has zero use cases for 0G KV store, file-based uploads, or hot storage |

**Key correction from original plan**: `peekHeader` is an instance **method** on `Indexer`, NOT a standalone export. Importing it as `import { peekHeader } from "@0gfoundation/0g-storage-ts-sdk"` would fail. If needed later, call `indexer.peekHeader()`.

---

## Fix Plans

---

## Issue 2: Triple ZeroGStorage Classes — CONSOLIDATE TO ONE

### Current State

Three separate ZeroGStorage classes/usage patterns:

| Aspect | Config (shared) | Backend wrapper | Oracle wrapper |
|--------|----------------|----------------|---------------|
| File | `packages/config/src/storage/0g.ts` | `apps/backend/src/storage/0g.ts` | `apps/oracle/src/storage.ts` |
| Interface | Free functions | `uploadData()` / `download()` | `upload()` / `download()` + `StorageAdapter` |
| Retry | ❌ None | ✅ `withRetry()` (3x) | ❌ None |
| Encryption | ✅ Passes through | ✅ Passes through | ❌ None |
| Download withProof | default `true` | configurable | forced `false` |
| Seen-set tracking | ❌ | ❌ | ✅ |
| SDK imports | `Indexer, MemData` | `Indexer` | `Indexer` |

### What the actual code reveals

- **`withRetry()`** already exists in `apps/backend/src/storage/0g.ts:13-29` — move to config
- **`InMemoryStorage`** already exists in `apps/oracle/src/storage.ts:17-36` — move to config
- **`uploadToStorage()` / `downloadFromStorage()`** already exist in config — augment with `tryDecrypt` guard
- **`StorageAdapter`** interface already exists in oracle — re-export from config

### Consolidation Plan

**Rewite `/home/eya/og/packages/config/src/storage/0g.ts`** with a comprehensive consolidated module:

```ts
import { Indexer, MemData, tryDecrypt } from "@0gfoundation/0g-storage-ts-sdk";
import { type Signer, keccak256 } from "ethers";
import type { Hex } from "viem";

// ── Public types ──────────────────────────────────────────────────────────

export interface UploadResult { rootHash: Hex; txHash: Hex; size: number; }
export interface DownloadResult { data: Uint8Array; rootHash: Hex; size: number; }

export interface StorageAdapter {
  upload(blob: Uint8Array): Promise<{ rootHash: Hex }>;
  download(rootHash: Hex): Promise<Uint8Array>;
  markDataHashSeen(rootHash: Hex): void;
  hasSeenDataHash(rootHash: Hex): boolean;
}

export interface ZeroGStorageConfig {
  indexerRpc: string;
  evmRpc: string;
  signer: Signer;
}

// Re-export SDK's EncryptionOption type so callers don't import from SDK directly
export type Encryption =
  | { type: "aes256"; key: Uint8Array }
  | { type: "ecies"; recipientPubKey: Uint8Array | string };

// ── Retry helper (moved from backend) ─────────────────────────────────────

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: { attempts?: number },
): Promise<T> {
  const maxAttempts = opts?.attempts ?? 3;
  let lastErr: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    try { return await fn(); } catch (err) { lastErr = err; if (i < maxAttempts - 1) await new Promise((r) => setTimeout(r, 100 * (i + 1) * (i + 1))); }
  }
  throw lastErr;
}

// ── In-memory storage for dev/test (moved from oracle) ────────────────────

export class InMemoryStorage implements StorageAdapter {
  private store = new Map<string, Uint8Array>();
  private seenDataHashes = new Set<string>();
  async upload(blob: Uint8Array): Promise<{ rootHash: Hex }> {
    const rootHash = keccak256(blob) as Hex;
    this.store.set(rootHash.toLowerCase(), new Uint8Array(blob));
    return { rootHash };
  }
  async download(rootHash: Hex): Promise<Uint8Array> {
    const blob = this.store.get(rootHash.toLowerCase());
    if (!blob) throw new Error(`Blob not found: ${rootHash}`);
    return new Uint8Array(blob);
  }
  markDataHashSeen(rootHash: Hex): void { this.seenDataHashes.add(rootHash.toLowerCase()); }
  hasSeenDataHash(rootHash: Hex): boolean { return this.seenDataHashes.has(rootHash.toLowerCase()); }
}

// ── Core upload/download helpers (augmented from existing) ────────────────

export async function uploadToStorage(
  indexer: Indexer, data: Uint8Array, evmRpc: string, signer: Signer,
  encryption?: Encryption,
): Promise<UploadResult> {
  const opts = encryption ? { encryption } : {};
  const [tx, err] = await indexer.upload(new MemData(data), evmRpc, signer, opts);
  if (err) throw new Error(`0G upload failed: ${err.message ?? String(err)}`);
  if (!tx) throw new Error("0G Storage upload returned no transaction");
  const rootHash = "rootHash" in tx ? (tx.rootHash as Hex) : (tx.rootHashes[0] as Hex);
  const txHash = "txHash" in tx ? (tx.txHash as Hex) : (tx.txHashes[0] as Hex);
  if (!rootHash || !txHash) throw new Error("0G Storage upload returned empty hashes");
  return { rootHash, txHash, size: data.length };
}

export async function downloadFromStorage(
  indexer: Indexer, rootHash: Hex,
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

  // 🛡️ Guard against silent decryption failure (tryDecrypt never throws)
  if (opts?.symmetricKey || opts?.privateKey) {
    const result = tryDecrypt(data, {
      symmetricKey: opts.symmetricKey,
      privateKey: opts.privateKey,
    });
    if (!result.decrypted) {
      throw new Error(
        `0G Storage decryption failed for ${rootHash}: ` +
        "the SDK returned raw bytes (wrong key, missing header, or malformed data). " +
        "Check that the correct decryption key was provided and that the file was SDK-encrypted."
      );
    }
  }

  return { data, rootHash, size: data.length };
}

// ── Unified ZeroGStorage (replaces backend + oracle wrappers) ─────────────

export class ZeroGStorage implements StorageAdapter {
  readonly indexer: Indexer;
  readonly config: ZeroGStorageConfig;
  private seenDataHashes = new Set<string>();

  constructor(config: ZeroGStorageConfig) {
    this.config = config;
    this.indexer = new Indexer(config.indexerRpc);
  }

  // StorageAdapter interface (for oracle compat)
  async upload(blob: Uint8Array): Promise<{ rootHash: Hex }> {
    const result = await withRetry(() =>
      uploadToStorage(this.indexer, blob, this.config.evmRpc, this.config.signer),
    );
    return { rootHash: result.rootHash };
  }
  async download(rootHash: Hex): Promise<Uint8Array> {
    const result = await withRetry(() =>
      downloadFromStorage(this.indexer, rootHash, { withProof: false }),
    );
    return result.data;
  }
  markDataHashSeen(rootHash: Hex): void { this.seenDataHashes.add(rootHash.toLowerCase()); }
  hasSeenDataHash(rootHash: Hex): boolean { return this.seenDataHashes.has(rootHash.toLowerCase()); }

  // Backward-compat methods (for backend consumers)
  async uploadData(data: Uint8Array, encryption?: Encryption): Promise<UploadResult> {
    return withRetry(() =>
      uploadToStorage(this.indexer, data, this.config.evmRpc, this.config.signer, encryption),
    );
  }
  async downloadWithOpts(
    rootHash: Hex,
    opts?: { symmetricKey?: Uint8Array; privateKey?: Uint8Array | string; withProof?: boolean },
  ): Promise<DownloadResult> {
    return withRetry(() => downloadFromStorage(this.indexer, rootHash, opts));
  }
}
```

**NOT implemented (no current use case):**
- `uploadFromFile()` via `ZgFile.fromFilePath()` — Axiom only uploads in-memory blobs
- `uploadToHot()` — Axiom does not use 0G hot storage
- `KvClient` wrapper — Axiom does not use 0G KV store
- `peekEncryptionHeader()` — `peekHeader` is an Indexer instance method; import it directly via `indexer.peekHeader()` if needed later

### Remove duplicate files

**`/home/eya/og/apps/backend/src/storage/0g.ts`** — DELETE.

**`/home/eya/og/apps/oracle/src/storage.ts`** — DELETE.

### Updated import map for all consumers

| Consumer | Current Import | New Import |
|----------|---------------|------------|
| `apps/backend/src/orchestrator/index.ts` | `from "../storage/0g.js"` | `from "@axiom/config/storage/0g"` |
| `apps/backend/src/cli/run-e2e.ts` | `from "../storage/0g.js"` | `from "@axiom/config/storage/0g"` |
| `apps/backend/src/server.ts` | `from "./storage/0g.js"` | `from "@axiom/config/storage/0g"` (also move `pickOGNetwork` import) |
| `apps/backend/src/server/transfer.test.ts` | `from "../../../oracle/src/storage.js"` | `from "@axiom/config/storage/0g"` |
| `apps/backend/src/storage/0g.test.ts` | `from "./0g.js"` | `from "@axiom/config/storage/0g"` |
| `apps/oracle/src/index.ts` | `from "./storage.js"` | `from "@axiom/config/storage/0g"` |
| `apps/oracle/src/server.ts` | `from "./storage.js"` | `from "@axiom/config/storage/0g"` |
| `apps/oracle/src/server.test.ts` | `from "./storage.js"` | `from "@axiom/config/storage/0g"` |
| `apps/oracle/src/server-access-proof.test.ts` | `from "./storage.js"` | `from "@axiom/config/storage/0g"` |
| `apps/oracle/test/server-datahash-binding.test.ts` | `from "../src/storage.js"` | `from "@axiom/config/storage/0g"` |
| `apps/indexer/src/index.ts` | `from "@axiom/config/storage/0g"` (already correct) | Unchanged |

---

## Issue 1: Silent Decryption Failure — CRITICAL

### Analysis

The SDK's `tryDecrypt()` (in `indexer/decryption.js`) returns `{ bytes, decrypted: false }` on any failure — never throws. `Indexer.downloadToBlob()` passes this through silently when `opts.decryption` is set. Callers get raw ciphertext with no error.

### Fix Plan

Add explicit validation in `downloadFromStorage()` (included in the consolidated code above):

```ts
if (opts?.symmetricKey || opts?.privateKey) {
  const result = tryDecrypt(data, {
    symmetricKey: opts.symmetricKey,
    privateKey: opts.privateKey,
  });
  if (!result.decrypted) {
    throw new Error(
      `0G Storage decryption failed for ${rootHash}: ` +
      "the SDK returned raw bytes (wrong key, missing header, or malformed data)."
    );
  }
}
```

This wraps the silent-fallback behavior with an explicit throw, so callers always know whether decryption succeeded.

---

## Issue 3: Cipher Mode Mismatch — AES-256-CTR vs AES-256-GCM

### Analysis

The SDK's encryption uses **AES-256-CTR** (via `@noble/ciphers`). Axiom's application layer uses **AES-256-GCM** (via `node:crypto`). These are incompatible.

Current flows:
- **Oracle**: App-level GCM only → uploads ciphertext as raw bytes to 0G. No SDK encryption. (Correct for this path.)
- **Backend/E2E**: App-level GCM + SDK CTR on top → double encryption with incompatible modes.
- **Download with `symmetricKey`**: SDK tries `tryDecrypt()` with CTR — fails silently on GCM-encrypted data, returns raw bytes.

### Fix Plan

**Option A (Recommended)**: Use SDK-native AES-256-CTR encryption exclusively. This means:
- The oracle's `aes-gcm.ts` becomes unused for storage uploads
- The E2E test removes the app-layer GCM step (just upload the plaintext with SDK encryption)
- SDK handles encrypt/decrypt transparently via `encryption` option

For the oracle transfer-validity re-encryption flow (which needs plaintext access to re-key):
1. Download with SDK decryption → get plaintext
2. Re-encrypt with new key using SDK encryption
3. Upload new ciphertext

**Option B (Keep app-level)**: Keep app-level GCM, never use SDK's `encryption` option. All uploads use `encryption: undefined` (raw bytes). All encryption/decryption handled by `@axiom/oracle/crypto/aes-gcm.ts`. Simpler but misses SDK's automatic decrypt-on-download.

**Recommended: Option A — align with SDK AES-256-CTR**.

---

## Issue 4: Dead Code in Indexer composeSinks

### Analysis

`apps/indexer/src/index.ts:162` — `submitEvent(event, {})` with empty options `{}` is a no-op. The real upload to 0G Storage happens in `flushBuffer()` called by the batch timer.

### Fix Plan

Replace the entire `"storage"` case:

```ts
// BEFORE:
case "storage":
  try {
    await submitEvent(event, {});
  } catch (err) {
    process.stderr.write(
      JSON.stringify({
        level: "error",
        msg: "da submit failed",
        err: err instanceof Error ? err.message : String(err),
      }) + "\n",
    );
  }
  break;

// AFTER:
case "storage":
  // 0G Storage upload is handled by the batch timer (eventBuffer + flushBuffer).
  // No per-event submit needed.
  break;
```

---

## Issue 5: Env Var Naming Inconsistency

### Analysis

Three naming conventions for storage RPC:

| Variable | Used By | Status |
|----------|---------|--------|
| `AXIOM_STORAGE_RPC` | Backend + `env.ts` canonical | Canonical |
| `OG_STORAGE_RPC` | Indexer, benchmarks | Backward compat alias exists in `env.ts` |
| `AXIOM_STORAGE_INDEXER_RPC` + `AXIOM_STORAGE_EVM_RPC` | Oracle | NOT in `env.ts` alias chain |

The oracle's `env.ts` already re-exports `getEnvWithAlias` from `@axiom/config/env`, but the oracle reads `process.env.AXIOM_STORAGE_INDEXER_RPC` directly in `apps/oracle/src/index.ts:22`.

### Fix Plan

1. **Add backward-compat aliases** in `apps/oracle/src/index.ts`: check `AXIOM_STORAGE_INDEXER_RPC` first, then fall back to `AXIOM_STORAGE_RPC`, then `OG_STORAGE_RPC`
2. **Add `AXIOM_STORAGE_EVM_RPC`** to `env.ts` `ENV_KEYS` (or document it as oracle-specific)
3. **Update indexer**: `process.env["OG_STORAGE_RPC"]` → `process.env["AXIOM_STORAGE_RPC"] ?? process.env["OG_STORAGE_RPC"]`

---

## Issues 6–10 (Auto-fixed by consolidation or accepted)

| # | Issue | Resolution |
|---|-------|------------|
| 6 | Oracle no retry | Auto-fixed: unified `ZeroGStorage` wraps all ops in `withRetry()` |
| 7 | Duplicate Encryption types | Auto-fixed: single export from SDK in consolidated module |
| 8 | InMemoryStorage reverse dependency | Auto-fixed: moved to config, imported from `@axiom/config/storage/0g` |
| 9 | Encryption strategy inconsistency | Addressed by Issue 3 decision |
| 10 | Indexer uses raw Indexer | Acceptable as-is — indexer has its own batching/retry |

---

## Implementation Order

### Phase 1 — CRITICAL: Fix silent decryption failure
- Add `tryDecrypt()` validation guard in `downloadFromStorage()`
- Implemented in the consolidated code above

### Phase 2 — HIGH: Consolidate all 3 wrappers into 1
- Rewrite `packages/config/src/storage/0g.ts` with the full consolidated class
- DELETE `apps/backend/src/storage/0g.ts`
- DELETE `apps/oracle/src/storage.ts`
- Update all 11 consumer import paths
- Auto-fixes Issues 5, 6, 7, 8

### Phase 3 — MEDIUM: Cleanup
- Fix Issue 3: Remove dead `submitEvent()` call in indexer
- Fix Issue 4: Add env var fallback chain in oracle + indexer
- Update E2E test to use SDK-native encryption only (simplify double encryption)

### Phase 4 — Documentation
- Document encryption architecture: when to use SDK CTR vs app GCM
- Document that `tryDecrypt()` validation throws on failure
- Note that `peekHeader()` is an Indexer instance method (not standalone import)

### Not implementing (no current use case)
- KvClient wrapper, ZgFile/uploadFromFile, uploadToHot, HotRouterClient, Batcher, peekEncryptionHeader wrapper

---

## File Change Summary

| Action | File |
|--------|------|
| **REWRITE** | `packages/config/src/storage/0g.ts` — Full consolidation with `ZeroGStorage`, `StorageAdapter`, `withRetry`, `InMemoryStorage`, `tryDecrypt` guard |
| **DELETE** | `apps/backend/src/storage/0g.ts` |
| **DELETE** | `apps/oracle/src/storage.ts` |
| **UPDATE** | 11 consumer files to `import from "@axiom/config/storage/0g"` (see import map above) |
| **UPDATE** | `apps/indexer/src/index.ts` — Remove dead `submitEvent()` + env var fallback |
| **UPDATE** | `apps/backend/src/cli/run-e2e.ts` — Simplify to SDK-native encryption only |
| **UPDATE** | `apps/oracle/src/index.ts` — Add env var fallback for `AXIOM_STORAGE_INDEXER_RPC` |

### Validation Checklist

- [ ] `pnpm typecheck` passes (all 3 packages)
- [ ] `pnpm --filter @axiom/backend test` passes
- [ ] `pnpm --filter @axiom/oracle test` passes
- [ ] `pnpm --filter @axiom/indexer test` passes
- [ ] No imports remain pointing to deleted files
- [ ] E2E test uploads/downloads correctly with SDK-native encryption
- [ ] Oracle transfer-validity flow works (download → decrypt → re-encrypt → upload)
- [ ] `tryDecrypt` validation guard throws error on wrong key
- [ ] Deprecated env vars (`OG_STORAGE_RPC`, `AXIOM_STORAGE_RPC`) still work as fallbacks
