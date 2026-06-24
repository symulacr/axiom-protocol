# Deep-03: 0G Storage SDK Integration Audit

**Status: HAS_GAPS** (2 issues found)

## Files Inspected

### Shared SDK (source of truth)
| File | Role |
|------|------|
| `/home/eya/og/packages/config/src/storage/0g.ts` | Shared `uploadToStorage` / `downloadFromStorage` |
| `/home/eya/og/packages/config/src/networks.ts` | `OGNetwork` type, `flowContract`, URL defaults |
| `/home/eya/og/packages/config/src/env.ts` | Env-var aliasing (`AXIOM_STORAGE_RPC` etc.) |
| `/home/eya/og/packages/config/package.json` | `exports` map (includes `./storage/0g`) |

### Consumers
| File | Role |
|------|------|
| `/home/eya/og/apps/backend/src/storage/0g.ts` | Backend `ZeroGStorage` wrapper (retry + typed config) |
| `/home/eya/og/apps/backend/src/storage/0g.test.ts` | Backend storage roundtrip tests |
| `/home/eya/og/apps/backend/src/server.ts` | Server init — uses `ZeroGStorage` from `./storage/0g.js` |
| `/home/eya/og/apps/backend/src/orchestrator/index.ts` | Orchestrator — uses `ZeroGStorage` from `../storage/0g.js` |
| `/home/eya/og/apps/backend/src/cli/run-e2e.ts` | E2E CLI — uses `ZeroGStorage` from `../storage/0g.js` |
| `/home/eya/og/apps/backend/src/orchestrator/orchestrator-chainid.test.ts` | ChainId wiring test — checks `storage.config.indexerRpc` |
| `/home/eya/og/apps/oracle/src/storage.ts` | Oracle `StorageAdapter` / `ZeroGStorage` (local class) |
| `/home/eya/og/apps/oracle/src/index.ts` | Oracle init — instantiates `ZeroGStorage` / `InMemoryStorage` |
| `/home/eya/og/apps/oracle/src/server.ts` | Oracle server — uses `StorageAdapter` interface |
| `/home/eya/og/apps/oracle/src/server-access-proof.test.ts` | Oracle test — uses `InMemoryStorage` |
| `/home/eya/og/apps/indexer/src/index.ts` | Indexer main — uses `uploadToStorage` directly |
| `/home/eya/og/apps/indexer/src/da.ts` | DA submitter — gRPC (separate from storage SDK) |
| `/home/eya/og/apps/indexer/src/da-client.ts` | DA gRPC client (separate from storage SDK) |

---

## 1. All Consumer Import Paths Verified

| Consumer | Imports from `@axiom/config/storage/0g` | Lines |
|----------|-----------------------------------------|-------|
| Backend `storage/0g.ts` | `uploadToStorage`, `downloadFromStorage`, `UploadResult`, `DownloadResult` | 4–5 |
| Oracle `storage.ts` | `uploadToStorage` only | 4 |
| Indexer `index.ts` | `uploadToStorage` only | 6 |

The `@axiom/config/package.json` `exports` map correctly includes:
```json
"./storage/0g": "./dist/storage/0g.js"
```

All three consumers are workspace deps (`"@axiom/config": "workspace:*"`).

---

## 2. Gap A — Oracle `download()` bypasses shared `downloadFromStorage`

**File:** `/home/eya/og/apps/oracle/src/storage.ts`, lines 53–57

```typescript
async download(rootHash: Hex): Promise<Uint8Array> {
    const [blob, err] = await this.indexer.downloadToBlob(rootHash, { proof: false });
    if (err) throw err;
    if (!blob) throw new Error(`0G Storage download returned no blob for ${rootHash}`);
    return new Uint8Array(await blob.arrayBuffer());
}
```

The oracle constructs its own `Indexer` instance and calls `indexer.downloadToBlob()` directly instead of calling the shared `downloadFromStorage()` from `@axiom/config/storage/0g`.

**Impact:** The oracle uses `{ proof: false }` (skipping Merkle proof verification), whereas the shared SDK's `downloadFromStorage` defaults to `proof: true`. While this may be intentional (the oracle doesn't need proofs for re-encryption), it means:
- The oracle has its own parallel download implementation to maintain
- Type/error handling diverges from the shared SDK
- The oracle returns `Uint8Array` while the shared SDK returns `DownloadResult` (with `rootHash` and `size`)

**Action:** Either:
- (a) Make the oracle use `downloadFromStorage` with `{ withProof: false }`, or
- (b) Document why the oracle needs different download behavior and add a `skipProof` option to the shared SDK.

---

## 3. Gap B — Backend test passes `decryptionKey` instead of `symmetricKey`

**File:** `/home/eya/og/apps/backend/src/storage/0g.test.ts`, line 42

```typescript
const { data, size: dlSize } = await storage.download(rootHash, { decryptionKey: aesKey, withProof: true });
```

The `download()` method on `ZeroGStorage` (and `downloadFromStorage`) expects `{ symmetricKey: aesKey, withProof: true }`. The property `decryptionKey` is **not** part of the type — TypeScript should flag this as an excess property error during `tsc --noEmit`, but `tsx` runs without type checking at runtime, so the test would pass the key as `undefined` silently.

**Impact:** The AES-256 client-side encrypted roundtrip test would:
1. Upload encrypted data successfully
2. Download it without providing the decryption key (because `decryptionKey` is silently ignored)
3. Fail on the assertion comparing plaintext to ciphertext

This test will **fail at runtime** when `DEPLOYER_PK` is set, but it's being skipped in CI (no `DEPLOYER_PK` env), so the bug is latent.

**Fix:**
```typescript
const { data, size: dlSize } = await storage.download(rootHash, { symmetricKey: aesKey, withProof: true });
```

---

## 4. KV Usage — None

No `kv`, `KVStore`, or key-value store patterns are present in any storage or config files. The oracle maintains a local `Set<string>` for `seenDataHashes`, but this is in-memory only.

---

## 5. Flow Contracts — Defined but Unused in Application Code

The `flowContract` field exists in the `OGNetwork` interface (`packages/config/src/networks.ts:9`) and has valid addresses:

| Network | Flow Contract Address |
|---------|----------------------|
| Galileo (16602) | `0x22E03a6A89B950F1c82ec5e74F8eCa321a105296` |
| Aristotle (16661) | `0x62D4144dB0F0a6fBBaeb6296c785C71B3D57C526` |

However, `flowContract` is **never imported or read by any TypeScript application code** — it only appears in:
- `packages/config/src/networks.ts` (definition + values)
- `apps/contracts/script/DeployAristotle.s.sol` (output JSON template)

**Action:** Either wire `flowContract` into the oracle/backend config for Flow-based re-encryption, or remove it as dead config.

---

## 6. Indexer Storage URLs — Correct

All indexer storage URLs are consistent:

| Purpose | URL |
|---------|-----|
| Galileo testnet | `https://indexer-storage-testnet-turbo.0g.ai` |
| Aristotle mainnet | `https://indexer-storage-turbo.0g.ai` |

URLs are centralized in `OG_NETWORKS` with `resolveStorageRpc()` providing env-var overrides (`AXIOM_STORAGE_RPC` → `OG_STORAGE_RPC` → network default → Galileo fallback). Hardcoded fallbacks exist in places but are only hit when neither env var nor network config provides a value.

---

## 7. Upload/Download API Consistency

| Operation | Shared SDK | Backend | Oracle | Indexer |
|-----------|-----------|---------|--------|---------|
| `uploadToStorage` | ✅ Defined | ✅ Uses via wrapper | ✅ Uses directly | ✅ Uses directly |
| `downloadFromStorage` | ✅ Defined | ✅ Uses via wrapper | ❌ **Bypasses** (calls `indexer.downloadToBlob` directly) | N/A (no download needed) |

The oracle is the only consumer missing the shared download path.

---

## 8. Direct `@0gfoundation/0g-storage-ts-sdk` Dependencies

All four packages list the SDK as a direct dependency (`"@0gfoundation/0g-storage-ts-sdk": "^1.2.10"`):

- `packages/config` (shared SDK)
- `apps/backend` (wrapper)
- `apps/oracle` (local `ZeroGStorage`)
- `apps/indexer` (direct `Indexer` construction + `uploadToStorage`)

Ideally only `packages/config` would depend on the 0G SDK directly, and apps would get it transitively. The duplicated dependency isn't harmful (pnpm deduplicates), but it indicates the migration to the shared SDK isn't fully complete — the oracle and indexer still import `Indexer` from the SDK directly rather than from the config package.

---

## Summary

```
┌──────────────────────────────────────────────────────────────┐
│                     Overall Status: HAS_GAPS                  │
├──────────────────────────────────────────────────────────────┤
│ Gap A  Oracle download bypasses shared downloadFromStorage   │
│ Gap B  Backend test uses wrong key name (decryptionKey)      │
│ Minor  flowContract is dead config in application code       │
│ Minor  Direct SDK deps in oracle/indexer (not via config)    │
└──────────────────────────────────────────────────────────────┘
```

### Recommendations

1. **Fix Gap A:** Update `/home/eya/og/apps/oracle/src/storage.ts` lines 53–57 to use `downloadFromStorage` from `@axiom/config/storage/0g`, passing `{ withProof: false }` to preserve the current behavior.

2. **Fix Gap B:** Update `/home/eya/og/apps/backend/src/storage/0g.test.ts` line 42 — change `decryptionKey` to `symmetricKey`.

3. **Address `flowContract`:** Either implement Flow contract integration in the oracle (for on-chain re-encryption validation) or remove the unused field from `OGNetwork`.

4. **Clean up direct SDK deps:** Consider making `@0gfoundation/0g-storage-ts-sdk` only a direct dependency of `@axiom/config` and re-exporting `Indexer` type + instance factory from the shared SDK.
