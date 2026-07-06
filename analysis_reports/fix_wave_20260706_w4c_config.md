# Fix Wave — Agent W4-C (Config Package)

**Date:** 2026-07-06  
**Scope:** `packages/config/src/types/hex.ts`, `types/schemas.ts`, `addresses.ts`, `storage/0g.ts`, `crypto/ecies.ts`, `eip712.ts`, `index.ts`  
**Audit refs:** M17, H3-config, M6-config, L9, L10, L12, S3, M15 (`fix_manifest.md` § W4-C)

## Fixes Applied

### 1. M17 — Export shared hex regexes; dedupe schemas
**Files:** `types/hex.ts`, `types/schemas.ts`  
**Before:** `HEX_REGEX` / `ADDRESS_REGEX` private in `hex.ts`; `schemas.ts` duplicated inline `/^0x.../` literals.  
**After:** Both regexes exported from `hex.ts`; `hexString` and `address` Zod schemas import and use them.

### 2. L9 — Remove unnecessary double cast in `toViemHex`
**File:** `types/hex.ts`  
**Before:** `return h as unknown as \`0x${string}\``  
**After:** `return h as \`0x${string}\``

### 3. H3-config — Align `StorageAdapter.upload` with `ZeroGStorage`
**File:** `storage/0g.ts`  
**Before:** Interface `upload(blob: Uint8Array)` vs class `upload(blob, encryption?)`.  
**After:** Interface accepts optional `encryption?: Encryption`; `InMemoryStorage.upload` updated to match (ignores encryption param).

### 4. M6-config — Dynamic `getAddresses` iteration
**Files:** `addresses.ts`, `index.ts`  
**Before:** No `getAddresses` function (manual key enumeration would be required).  
**After:** `getAddresses(env?)` iterates `DEPLOYED_ADDRESSES` keys via `resolveAddress`; exported from `index.ts`.

### 5. L10 — Remove hex round-trip in `toCompressed`
**File:** `crypto/ecies.ts`  
**Before:** `ProjectivePoint.fromHex(Buffer.from(full).toString("hex"))`  
**After:** `ProjectivePoint.fromHex(full)` — passes `Uint8Array` directly.

### 6. L12 — Split `OwnershipProofResult` types
**File:** `eip712.ts`  
**Before:** Core + optional meta fields (`accessProofNonce?`, `ownershipProofNonce?`) in one interface.  
**After:**
- `OwnershipProofResult` — core fields only (`newDataUri`, `newDataHash`, `sealedKey`, `ownershipSignature`)
- `OwnershipProofResultWithMeta` — extends core with optional `accessProofNonce`, `ownershipProofNonce`, `signer`

**Follow-up (out of scope):** `apps/backend/src/oracle/client.ts` should use `OwnershipProofResultWithMeta` for `TransferValidityResult` when nonce/signer meta is expected. `OwnershipProofResult` remains valid for core-field consumers.

### 7. S3 — Named crypto exports in `index.ts`
**File:** `index.ts`  
**Before:** `export *` from `aes-gcm.js`, `ecies.js`, `secp256k1.js`.  
**After:** Explicit named exports preserving backward compatibility:
- `aesGcmEncrypt`, `aesGcmDecrypt`, `concatEncrypted`, `parseEncrypted`, `EncryptedPayload`
- `sealKeyForReceiver`, `unsealKeyForReceiver`
- `publicKeyUncompressedFromPrivate`, `pubKeyToAddress`, `deriveUncompressedPubkeyFromHex`

### 8. M15 — Bounded `seenDataHashes` eviction
**File:** `storage/0g.ts`  
**Before:** `Set` grew unbounded in `InMemoryStorage` and `ZeroGStorage`.  
**After:** `MAX_SEEN_HASHES = 10_000`; on cap, evict 1000 oldest entries (insertion-order Set) before adding new hash. Applied to both storage implementations.

## Verification

| Command | Result |
|---------|--------|
| `pnpm --filter @axiom/config build` | ✅ Pass |

## Manifest Status Update

| ID | Status |
|----|--------|
| M17 | Done |
| H3-config | Done |
| M6-config | Done |
| L9 | Done |
| L10 | Done |
| L12 | Done (oracle client follow-up noted) |
| S3 | Done |
| M15 | Done |