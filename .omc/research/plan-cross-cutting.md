# Cross-Cutting 0G Integration Redesign Plan

**Date:** 2026-06-24
**Author:** planning-agent (synthesized from 6 stack research reports + web research + dependency audit)
**Scope:** Every 0G component across `packages/config`, `apps/backend`, `apps/indexer`, `apps/oracle`, `apps/frontend`, `apps/contracts`, `apps/bench`

---

## Architecture (Target State)

See individual component plans for per-package architecture diagrams:
- **Storage architecture**: [`plan-storage.md`](plan-storage.md)
- **Compute architecture**: [`plan-compute.md`](plan-compute.md)
- **DA architecture**: [`plan-da.md`](plan-da.md)
- **Chain integration**: [`plan-chain.md`](plan-chain.md)
- **Agentic ID**: [`plan-agentic-id.md`](plan-agentic-id.md)

**Key properties of the target architecture:**
- `@0gfoundation/0g-storage-ts-sdk` appears in only **1** package.json (`packages/config`)
- `@0gfoundation/0g-compute-ts-sdk` appears in **zero** package.json (dead dep removed)
- `ZeroGStorage` class defined in **1** place (`packages/config/src/storage/0g.ts`)
- `InMemoryStorage` class defined in **1** place (`packages/config/src/storage/0g.ts`)
- `withRetry` function defined in **1** place (`packages/config/src/storage/0g.ts`)
- `StorageAdapter` interface defined in **1** place (`packages/config/src/storage/0g.ts`)
- All ~32 env vars documented in `ENV_KEYS` (packages/config/src/env.ts)
- All URLs centralised in `OG_NETWORKS` (packages/config/src/networks.ts)
- No backward imports across package boundaries
- No hardcoded dRPC URLs

---

## Section 1: Complete Wrapper Elimination Map

Every wrapper/abstraction that wraps 0G SDK types. Individual component plans contain exact replacement code — this section only cross-references.

### 1.1 `ZeroGStorage` — 3 copies → 1 (packages/config)

**Files eliminated:**
- `apps/backend/src/storage/0g.ts` — delete entirely
- `apps/oracle/src/storage.ts` — delete `ZeroGStorage` class + `InMemoryStorage` class

**Unified target** in `packages/config/src/storage/0g.ts`.
Full consolidated code with `ZeroGStorage`, `StorageAdapter`, `InMemoryStorage`, `withRetry`, and `tryDecrypt` validation guard → **see [`plan-storage.md`](plan-storage.md) Section "Issue 2: Triple ZeroGStorage Classes — CONSOLIDATE TO ONE"** for the exact replacement code.

Backward-compat re-exports (temporary during migration): see [`plan-storage.md`](plan-storage.md) for the exact import map across all 11 consumer files.

### 1.2–1.5 Minor wrapper consolidations

All handled as part of the `packages/config/src/storage/0g.ts` consolidation in `plan-storage.md`:
- `withRetry` (2→1 copies) — moved into config
- `InMemoryStorage` (1→config) — moved from oracle
- `StorageAdapter` interface (1→config) — moved from oracle
- `Encryption` type (2→1) — unified in config (uses SDK's `EncryptionOption` type)

### 1.6 `KNOWN_PROVIDERS` static map — delete entirely

| Current Location | Action |
|-----------------|--------|
| `apps/backend/src/compute/router.ts` lines 9-12 | Delete — move provider URLs to `OG_NETWORKS` as `computeDirectProxyUrl` or use on-chain discovery |
| `packages/config/src/networks.ts` | Add `computeDirectProxyUrl` field to `OGNetwork` |

### 1.7 `decodeDirectKeyToken` — harden and simplify

See [`plan-compute.md`](plan-compute.md) Issue 2 for the hardened code with `payload.user`/`payload.providerAddress` fallback.

### 1.8 `getComputeBaseUrl` — move to networks.ts

Replaced by `resolveComputeRouterUrl()` in `packages/config/src/networks.ts`. See [`plan-compute.md`](plan-compute.md) Issue 3.

### 1.9 Dead `@0gfoundation/0g-compute-ts-sdk` — remove from all package.json

| File | Action |
|------|--------|
| `apps/bench/package.json` | Remove `"@0gfoundation/0g-compute-ts-sdk": "^0.8.4"` (unused dep) |
| (any other) | Grep confirms it's NOT in any other package.json |

### 1.10 Backward import fix — `apps/backend/src/server/transfer.test.ts`

5 imports from `../../../oracle/src/` must become `@axiom/oracle/*` package imports.
**Full fix:** see [`plan-chain.md`](plan-chain.md) Issue 3 (backward import), or the detailed table in [`deep-trace-cross-cutting.md`](deep-trace-cross-cutting.md) Section 5.2.

Precondition: Oracle must export `startServer` from its `index.ts`:
```typescript
// apps/oracle/src/index.ts — add re-export
export { startServer } from "./server.js";
```

---

## Section 2: Env Var Standardization

### 2.1 Env Var Map

See [`deep-trace-cross-cutting.md`](deep-trace-cross-cutting.md) Section 1 for the complete 50-entry env var trace. Key findings:

- `ENV_KEYS` currently has **14 entries** (not 12) — still far below the ~32 that should be registered
- **Missing from `ENV_KEYS`**: `AXIOM_COMPUTE_BASE_URL`, `AXIOM_COMPUTE_MODEL`, `OG_COMPUTE_API_KEY`, `AXIOM_STORAGE_INDEXER_RPC`, `AXIOM_STORAGE_EVM_RPC`, `AXIOM_STORAGE_PRIVATE_KEY`, `AXIOM_ORACLE_BIND`, `AXIOM_ORACLE_PORT`, `AXIOM_AGENT_NFT_ADDRESS`, `AXIOM_STRATEGY_VAULT_ADDRESS`, `AXIOM_PAYMENT_PROCESSOR_ADDRESS`, `AXIOM_MOCK_USDC_ADDRESS`, `DA_GRPC_URL`, `INDEXER_DA_ENABLED`, `BACKEND_URL`, `STORAGE_BATCH_INTERVAL_MS`, `STORAGE_BATCH_MAX_EVENTS`, `DA_GRPC_TLS_CA_CERT`, `DA_GRPC_TLS_ENABLED`, `AXIOM_ORACLE_ADMIN_PK`
- Backward aliases (`OG_RPC_URL`, `OG_STORAGE_RPC`, `OG_CHAIN_ID`, `TEE_SIGNER_PK`) are **already handled** by `getEnvWithAlias()` in `env.ts` and `networks.ts` — do NOT add to `ENV_KEYS`

### 2.2 `ENV_KEYS` Expansion

See the deep trace for the full proposed `ENV_KEYS` object. The expansion adds ~18 new entries across categories: Chain, Storage, Oracle, Compute, HTTP, Auth, Contract Addresses, DA/Indexer.

### 2.3 Missing Backend Schema Key

Add to `apps/backend/src/env-schema.ts`:
```typescript
OG_COMPUTE_API_KEY: z.string().optional(),
```

### 2.4 `.env.example` Missing Vars to Add

Add to `/home/eya/og/.env.example`:
```env
# ── Missing Oracle Storage Vars ──
# AXIOM_STORAGE_INDEXER_RPC=https://indexer-storage-testnet-turbo.0g.ai
# AXIOM_STORAGE_EVM_RPC=https://evmrpc-testnet.0g.ai
# AXIOM_STORAGE_PRIVATE_KEY=0x...        # separate storage gas key (defaults to TEE_SIGNER_PK)

# ── Missing Compute Vars ──
# AXIOM_COMPUTE_BASE_URL=https://compute-network-6.integratenetwork.work/v1/proxy
# AXIOM_COMPUTE_MODEL=qwen2.5-omni

# ── DA Client TLS Vars ──
# DA_GRPC_TLS_CA_CERT=/path/to/ca.pem
# DA_GRPC_TLS_ENABLED=true

# ── Undocumented vars ──
# RECEIVER_PK=0x...
# AXIOM_ORACLE_ADMIN_PK=0x...
```

---

## Section 3: Network Config Enrichment

### 3.1 Expanded `OGNetwork` Interface

Current (5 fields: `name`, `chainId`, `evmRpc`, `storageRpc`, `flowContract`) → Target (10 fields).

```typescript
export interface OGNetwork {
  readonly name: "galileo" | "aristotle";
  readonly chainId: number;
  readonly evmRpc: string;
  readonly storageRpc: string;
  readonly flowContract: `0x${string}`;

  // ── NEW FIELDS ──
  readonly computeRouterUrl: string;          // Compute Router API base
  readonly computeDirectProxyUrl: string;     // Direct SDK proxy URL
  readonly daGrpcUrl: string;                 // Default DA gRPC hint (env overrides)
  readonly blockExplorer: string;             // Chain explorer URL
  readonly explorerApiUrl: string;            // Explorer API (for verification)
}
```

### 3.2 Updated `_OG_NETWORKS` + Resolver Functions

See [`plan-compute.md`](plan-compute.md) for compute URL resolver design, [`plan-da.md`](plan-da.md) for DA gRPC URL handling, and [`plan-chain.md`](plan-chain.md) for explorer URL unification. The 5 new resolvers follow the same `getEnvWithAlias()` → `pickOGNetwork()` → fallback pattern as `resolveRpcUrl()` and `resolveStorageRpc()`.

New resolver functions (from `packages/config/src/networks.ts` — exact code in component plans):
- `resolveComputeRouterUrl(chainId?)` — see plan-compute.md
- `resolveComputeDirectProxyUrl(chainId?)` — see plan-compute.md
- `resolveBlockExplorerUrl(chainId?)` — see plan-chain.md
- `resolveExplorerApiUrl(chainId?)` — see plan-chain.md
- `resolveDaGrpcUrl(chainId?)` — see plan-da.md

## Section 4: URL Centralization Code

Every hardcoded URL that must be replaced with a `resolve*()` call. See [`deep-trace-cross-cutting.md`](deep-trace-cross-cutting.md) Section 3 for the complete 15-entry URL map.

### 4.1 Hardcoded URLs → Resolver Call Summary

| URL Pattern | Files Affected | Replace With | Component Plan |
|---|---|---|---|
| `evmrpc-testnet.0g.ai` / `evmrpc.0g.ai` | `server.ts`, `indexer/index.ts` | `resolveRpcUrl(chainId)` | plan-chain.md |
| `indexer-storage-*.0g.ai` | `server.ts`, `0g.test.ts`, `cli/run-e2e.ts` | `resolveStorageRpc(chainId)` | plan-chain.md |
| `router-api*.integratenetwork.work` / `router-api.0g.ai` | `compute/router.ts` | `resolveComputeRouterUrl(chainId)` | plan-compute.md |
| `compute-network-6...` | `compute/router.ts` | `resolveComputeDirectProxyUrl(chainId)` | plan-compute.md |
| `chainscan*.0g.ai` | `HistoryPage.tsx`, `MarketPage.tsx` | `resolveBlockExplorerUrl(chainId)` | plan-chain.md |
| `chainscan*.0g.ai/open/api` | `hardhat.config.cjs` | `resolveExplorerApiUrl(chainId)` | plan-chain.md |
| `0g-galileo-testnet.drpc.org` | 6 Solidity test files + `0g.test.ts` | `resolveRpcUrl(GALILEO_CHAIN_ID)` | plan-chain.md |
| `inference-0x*.testnet.0g.ai` | `compute/router.ts` (KNOWN_PROVIDERS) | Delete with KNOWN_PROVIDERS | plan-compute.md |
| `localhost:51001` | `.env.example` | Default in `resolveDaGrpcUrl()` | plan-da.md |

### 4.2 Frontend Explorer URL Fix

**`apps/frontend/src/pages/HistoryPage.tsx`** — Replace chain-ID switch with:
```typescript
import { resolveBlockExplorerUrl } from "@axiom/config/networks";
return `${resolveBlockExplorerUrl(chainId)}/tx/${txHash}`;
```

**`apps/frontend/src/pages/MarketPage.tsx`** — Replace ternary with:
```typescript
import { resolveBlockExplorerUrl } from "@axiom/config/networks";
const explorerUrl = resolveBlockExplorerUrl(chainId);
```

---

## Section 5: Dependency Cleanup Plan

### 5.1 Dependencies to Remove

| Package | Dependency | Reason |
|---------|-----------|--------|
| `apps/backend/package.json` | `@0gfoundation/0g-storage-ts-sdk` | Import via `@axiom/config/storage/0g` |
| `apps/oracle/package.json` | `@0gfoundation/0g-storage-ts-sdk` | Import via `@axiom/config/storage/0g` |
| `apps/indexer/package.json` | `@0gfoundation/0g-storage-ts-sdk` | Import via `@axiom/config/storage/0g` |
| `apps/bench/package.json` | `@0gfoundation/0g-storage-ts-sdk` | Bench uses SDK directly — KEEP (bench exception) |
| `apps/bench/package.json` | `@0gfoundation/0g-compute-ts-sdk` | **DEAD DEP** — never imported, remove |

### 5.2 Dependencies to Add

| Package | Dependency | Why |
|---------|-----------|-----|
| `packages/config/package.json` | (none) | Already has `@0gfoundation/0g-storage-ts-sdk` ✅ |

### 5.3 Dependency Consolidation Matrix (Final State)

| Package | `@0gfoundation/0g-storage-ts-sdk` | `@0gfoundation/0g-compute-ts-sdk` |
|---------|:---:|:---:|
| `packages/config` | ✅ **KEEP (only copy)** | ❌ Never had |
| `apps/backend` | ❌ Removed | ❌ Never had |
| `apps/oracle` | ❌ Removed | ❌ Never had |
| `apps/indexer` | ❌ Removed | ❌ Never had |
| `apps/bench` | ✅ KEEP (uses directly) | ❌ **Removed** |
| `apps/frontend` | ❌ Never had | ❌ Never had |
| `apps/contracts` | ❌ Never had | ❌ Never had |

---

## Section 6: Implementation Order (Dependency Graph)

This section is a cross-reference index. Each component plan has its own detailed phase breakdown.

### Phase 0 — Foundation: `packages/config` (must go first)

| Step | File | Change | Component Plan Ref |
|------|------|--------|--------------------|
| 0.0 | `packages/config/src/env.ts` | Expand `ENV_KEYS` to ~32 vars | deep-trace-cross-cutting.md §1 |
| 0.1 | `packages/config/src/networks.ts` | Add 5 fields to `OGNetwork` + 5 resolvers | plan-chain.md, plan-compute.md, plan-da.md |
| 0.2 | `packages/config/src/storage/0g.ts` | Unify `ZeroGStorage`/`InMemoryStorage`/`withRetry`/`StorageAdapter` | plan-storage.md §Issue 2 |
| 0.3 | `packages/config/package.json` | No change needed — `./storage/0g` already exported | — |

**Validation:** `pnpm --filter @axiom/config build` passes.

### Phase 1 — Consumer: `apps/backend`

See [`plan-storage.md`](plan-storage.md) (storage wrapper elimination), [`plan-compute.md`](plan-compute.md) (compute router refactor), [`plan-chain.md`](plan-chain.md) (provider hardening, URLs, backward imports).

### Phase 2 — Consumer: `apps/oracle`

See [`plan-storage.md`](plan-storage.md) §Issue 2 (import map), [`plan-chain.md`](plan-chain.md) §Issue 2b (oracle provider hardening).

### Phase 3 — Consumer: `apps/indexer`

See [`plan-da.md`](plan-da.md) (all P0-P4 issues: caching, TLS, deadlines, env vars, health endpoint).

### Phase 4 — Consumer: `apps/frontend`

See [`plan-chain.md`](plan-chain.md) §Issue 3 (Aristotle addresses) and §Issue 4 (chain-aware address getters).

### Phase 5 — Consumer: `apps/contracts`

See [`plan-chain.md`](plan-chain.md) §Issue 1 (dRPC → official RPC in Solidity tests) and [`plan-agentic-id.md`](plan-agentic-id.md) (EIP-7857 compliance).

### Phase 6 — Cleanup: Remove deprecated files

After all consumers updated: delete `apps/backend/src/storage/0g.ts` and update any remaining re-exports.

---

## Section 7: Summary of All Changes

### 7.1 File Change Count by Phase

| Phase | Package | Files Changed | Key Change |
|-------|---------|--------------|------------|
| P0 | `packages/config` | 4 files | Expand ENV_KEYS to 32 vars, add 5 OGNetwork fields + resolvers, unify ZeroGStorage |
| P1 | `apps/backend` | 6 files | Delete ZeroGStorage, fix URLs, fix backward imports, remove SDK dep, expand schema |
| P2 | `apps/oracle` | 4 files | Delete ZeroGStorage/InMemoryStorage, import from config, export ecies, remove SDK dep |
| P3 | `apps/indexer` | 4 files | Fix DA caching bug, add TLS, add deadlines, fix env vars, remove SDK dep |
| P4 | `apps/frontend` | 2 files | Resolve explorer URLs from OG_NETWORKS |
| P5 | `apps/contracts` | 7 files | Fix dRPC → official RPC in tests |
| P6 | `apps/backend` | 1 file | Delete storage/0g.ts entirely |
| — | `apps/bench` | 1 file | Remove dead `@0gfoundation/0g-compute-ts-sdk` dep |

### 7.2 Critical Bugs Fixed

| # | Bug | Severity | Phase |
|---|-----|----------|-------|
| C1 | `ENV_KEYS` has only 14 of ~32 required vars | 🔴 HIGH | P0 |
| C2 | `makeRealSubmitter` creates new gRPC connection per event | 🔴 CRITICAL | P3 |
| C3 | dRPC third-party RPC in 7 test files (no SLA, may break) | 🟡 MEDIUM | P5 |
| C4 | Backward import in `transfer.test.ts` bypasses package boundary | 🔴 HIGH | P1 |
| C5 | Duplicate `ZeroGStorage` classes with incompatible interfaces | 🔴 HIGH | P0/P1/P2 |
| C6 | DA gRPC uses `createInsecure()` — no TLS | 🔴 HIGH | P3 |
| C7 | No retry on oracle storage operations | 🟡 MEDIUM | P2 |
| C8 | `decryptionKey` typo in storage test (should be `symmetricKey`) | 🟡 MEDIUM | P1 |
| C9 | `@0gfoundation/0g-compute-ts-sdk` dead ~20MB transitive dep | 🟢 LOW | PX |
| C10 | DA gRPC has no request deadlines — may hang forever | 🟡 MEDIUM | P3 |

### 7.3 Total Stats

| Metric | Before | After |
|--------|--------|-------|
| `ZeroGStorage` class definitions | 3 (config, backend, oracle) | **1** (config) |
| `InMemoryStorage` locations | 1 (oracle) + 1 backward import | **1** (config, clean import) |
| `withRetry` definitions | 2 (backend, config after merge) | **1** (config) |
| `@0gfoundation/0g-storage-ts-sdk` deps | 5 | **2** (config + bench) |
| `@0gfoundation/0g-compute-ts-sdk` deps | 1 (bench) | **0** |
| `ENV_KEYS` entries | 14 | **~32** |
| `OGNetwork` fields | 5 | **10** |
| `resolve*()` functions | 2 (`resolveRpcUrl`, `resolveStorageRpc`) | **7** (+5 new) |
| Hardcoded dRPC URLs | 7 files | **0** |
| Backward imports | 1 file (5 imports) | **0** |
| Files modified total | — | **~29** |
