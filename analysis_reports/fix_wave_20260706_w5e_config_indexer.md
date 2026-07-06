# Fix Wave — Agent W5-E (Config / Indexer)

**Date:** 2026-07-06  
**Scope:** `packages/config/src/crypto/secp256k1.ts`, `packages/config/src/index.ts`, `apps/indexer/src/watcher.ts`  
**Audit refs:** S3, L6 (`implementation_plan_waves.md` § Wave 3 Agent 4 / Agent 3)

## Fixes Applied

### 1. S3 — Rename misleading `deriveUncompressedPubkeyFromHex`
**File:** `packages/config/src/crypto/secp256k1.ts`  
**Before:** `deriveUncompressedPubkeyFromHex` implied 65-byte `0x04||X||Y` but returned 64-byte `X||Y`.  
**After:**
- Primary export: `deriveRawPubkeyFromHex` with JSDoc: *"Derives the 64-byte raw public key (X||Y, no 0x04 prefix) from a private key hex."*
- Backward-compat alias: `export const deriveUncompressedPubkeyFromHex = deriveRawPubkeyFromHex` (deprecated in JSDoc).

**File:** `packages/config/src/index.ts`  
**After:** Named exports include both `deriveRawPubkeyFromHex` and `deriveUncompressedPubkeyFromHex`. Existing consumers (`apps/backend`, `apps/oracle`) unchanged.

### 2. L6 — Reorg-safe finality hook point in indexer watcher
**File:** `apps/indexer/src/watcher.ts`  
**Before:** `this.nextBlock = toBlock + 1n` advanced checkpoint with no reorg margin annotation.  
**After:**
- Module constant: `REORG_SAFE_DEPTH = 10n` (exported alongside `POLL_WINDOW_BLOCKS`).
- At checkpoint advance (~line 545): compute `safeBlock = toBlock > REORG_SAFE_DEPTH ? toBlock - REORG_SAFE_DEPTH : 0n` with comments marking where reorg-safe finality would be enforced.
- Poll tick logger includes `safeBlock` for observability (minimal; no behavior change to indexing).

Full reorg handling (event invalidation, checkpoint rollback) remains out of scope — this documents the hook only.

## Verification

| Command | Result |
|---------|--------|
| `pnpm --filter @axiom/config build` | ✅ Pass |
| `pnpm --filter @axiom/indexer typecheck` | ✅ Pass |

## Manifest Status Update

| ID | Status |
|----|--------|
| S3 | Done |
| L6 | Done (hook + constant; full reorg handling deferred) |