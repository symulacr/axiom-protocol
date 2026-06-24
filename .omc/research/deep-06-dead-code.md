# Deep Dive: Dead Code Analysis

**Status:** COMPLETE

**Date:** 2026-06-24
**Scope:** Axiom Protocol monorepo at `/home/eya/og`

Covers: `apps/backend/src/`, `apps/frontend/src/`, `apps/oracle/src/`, `apps/indexer/src/`, `packages/config/src/`

---

## 1. Entirely Dead Files

### 1.1 `apps/backend/src/routers/create-route.ts` — DEAD FILE

| Field | Value |
|-------|-------|
| **File** | `/home/eya/og/apps/backend/src/routers/create-route.ts` |
| **Severity** | 🔴 HIGH |
| **Recommendation** | **REMOVE** |

This file exports `createRoute`, `RouteHandler`, `CreateRouteOptions` — ALL of which are also exported by `route-factory.ts`. Only `route-factory.ts` is imported in `server.ts` (line 25). The entire `create-route.ts` file is duplicate dead code.

```back:24:27:apps/backend/src/routers/create-route.ts
export interface CreateRouteOptions<T> { ... }
export type RouteHandler<T> = ( ... ) => ...;
export function createRoute<T>( ... ) { ... }
```

The `server.ts` imports:
```
import { createRoute } from "./routers/route-factory.js";   // ✓ live
```
No file imports `create-route.ts`.

---

## 2. Unused Exports in `packages/config/src/`

### 2.1 `packages/config/src/types/collections.ts` — ENTIRELY UNUSED

| Export | File | Severity | Recommendation |
|--------|------|----------|---------------|
| `NonEmptyArray<T>` | `packages/config/src/types/collections.ts:2` | 🟡 MEDIUM | REMOVE |
| `isNonEmpty()` | `packages/config/src/types/collections.ts:4` | 🟡 MEDIUM | REMOVE |
| `first()` | `packages/config/src/types/collections.ts:9` | 🟡 MEDIUM | REMOVE |
| `last()` | `packages/config/src/types/collections.ts:10` | 🟡 MEDIUM | REMOVE |
| `checkedAt()` | `packages/config/src/types/collections.ts:14` | 🟡 MEDIUM | REMOVE |

None of these are imported anywhere in `apps/`. Grep for `@axiom/config/types/collections`, `isNonEmpty`, `checkedAt`, `first[`, `last[` across all apps yields zero results.

---

### 2.2 `packages/config/src/types/ethers.ts` — ENTIRELY UNUSED

| Export | File | Severity | Recommendation |
|--------|------|----------|---------------|
| `keccak256()` | `packages/config/src/types/ethers.ts:5` | 🟡 MEDIUM | REMOVE |
| `computeAddress()` | `packages/config/src/types/ethers.ts:9` | 🟡 MEDIUM | REMOVE |
| `hexlify()` | `packages/config/src/types/ethers.ts:13` | 🟡 MEDIUM | REMOVE |

Grep for `@axiom/config/types/ethers` across all apps yields zero results. These are thin wrappers around ethers v6 that nobody uses — apps import ethers directly.

---

### 2.3 `packages/config/src/types/bigint.ts` — PARTIALLY UNUSED

| Export | File | Severity | Recommendation |
|--------|------|----------|---------------|
| `Serialized<T>` type | `packages/config/src/types/bigint.ts:2` | 🟢 LOW | REMOVE |
| `Deserialized<T>` type | `packages/config/src/types/bigint.ts:3` | 🟢 LOW | REMOVE |
| `parseBigInt()` | `packages/config/src/types/bigint.ts:5` | 🟢 LOW | REMOVE |
| `extractBigIntArg()` | `packages/config/src/types/bigint.ts:15` | 🟢 LOW | REMOVE |

The following exports ARE used: `bigintReplacer` (backend oracle client + server + ws), `stringifyBigIntSafe` (ws broadcaster), `bigIntSafe` (ws broadcaster).

---

### 2.4 `packages/config/src/types/schemas.ts` — PARTIALLY UNUSED

| Export | File | Severity | Recommendation |
|--------|------|----------|---------------|
| `fetchAndValidate()` | `packages/config/src/types/schemas.ts:20` | 🟢 LOW | REMOVE |
| `bytes32` schema | `packages/config/src/types/schemas.ts:17` | 🟢 LOW | REMOVE |

None of the apps import `fetchAndValidate` or `bytes32` from schemas. In-use exports: `hexString`, `address`, `hexViem`, `addressViem`.

---

### 2.5 `packages/config/src/api/routes.ts` — ENTIRELY UNUSED

| Export | File | Severity | Recommendation |
|--------|------|----------|---------------|
| `ROUTES` const | `packages/config/src/api/routes.ts:1` | 🟡 MEDIUM | REMOVE |

Grep for `@axiom/config/api` in all apps returns zero results (only the file's own comment imports itself).

---

### 2.6 `packages/config/src/api/responses.ts` — ENTIRELY UNUSED

| Export | File | Severity | Recommendation |
|--------|------|----------|---------------|
| `HealthResponse` | `packages/config/src/api/responses.ts:9` | 🟡 MEDIUM | REMOVE |
| `MintResponse` | `packages/config/src/api/responses.ts:19` | 🟡 MEDIUM | REMOVE |
| `TransferChallengeResponse` | `packages/config/src/api/responses.ts:29` | 🟡 MEDIUM | REMOVE |
| `AccessProofStruct` | `packages/config/src/api/responses.ts:49` | 🟡 MEDIUM | REMOVE |
| `OwnershipProofStruct` | `packages/config/src/api/responses.ts:57` | 🟡 MEDIUM | REMOVE |
| `StoredEvent` | `packages/config/src/api/responses.ts:69` | 🟡 MEDIUM | REMOVE |
| `PaymentConfigResponse` | `packages/config/src/api/responses.ts:80` | 🟡 MEDIUM | REMOVE |
| `RoyaltyResponse` | `packages/config/src/api/responses.ts:87` | 🟡 MEDIUM | REMOVE |
| `TickResponse` | `packages/config/src/api/responses.ts:97` | 🟡 MEDIUM | REMOVE |

File comment says "Import from @axiom/config/api/responses in both layers" but nothing actually imports it. All response types are defined locally or shaped inline.

---

### 2.7 `packages/config/src/abis/` — ENTIRELY UNUSED

| Export | File | Severity | Recommendation |
|--------|------|----------|---------------|
| `AGENT_NFT_ABI` | `packages/config/src/abis/agentNft.ts:1` | 🟡 MEDIUM | REMOVE |
| `VAULT_ABI` | `packages/config/src/abis/vault.ts:1` | 🟡 MEDIUM | REMOVE |
| `PAYMENT_PROCESSOR_ABI` | `packages/config/src/abis/paymentProcessor.ts:1` | 🟡 MEDIUM | REMOVE |
| `ITRANSFER_FROM_ABI` | `packages/config/src/abis/iTransferFrom.ts:1` | 🟡 MEDIUM | REMOVE |
| `ERC20_ABI` | `packages/config/src/abis/erc20.ts:1` | 🟡 MEDIUM | REMOVE |

None are ever imported via `@axiom/config/abis`. The backend defines its own inline ABI arrays in `server.ts` (lines 41–53 for `AGENT_NFT_ABI`, `VAULT_ABI`). The `payment/processor.ts` also defines its own `PAYMENT_PROCESSOR_ABI` and `ERC20_ABI` locally. The frontend has its own ABI definitions in `src/abi/`. The shared ABIs in `packages/config/src/abis/` are completely orphaned.

---

### 2.8 `packages/config/src/env.ts` — PARTIALLY UNUSED

| Export | File | Severity | Recommendation |
|--------|------|----------|---------------|
| `ENV_KEYS` const | `packages/config/src/env.ts:57` | 🟢 LOW | REMOVE |

Grep for `ENV_KEYS` across all apps yields zero results. The full list of canonical env var names is referenced in a comment block (line 30) but the typed `ENV_KEYS` object is dead.

Live exports: `loadEnv`, `getEnv`, `getEnvWithAlias`.

---

### 2.9 `packages/config/src/networks.ts` — PARTIALLY UNUSED

| Export | File | Severity | Recommendation |
|--------|------|----------|---------------|
| `resolveRpcUrl()` | `packages/config/src/networks.ts:41` | 🟢 LOW | REMOVE |
| `resolveStorageRpc()` | `packages/config/src/networks.ts:49` | 🟢 LOW | REMOVE |

Grep for `resolveRpcUrl` and `resolveStorageRpc` in apps yields zero results. Live exports: `OG_NETWORKS`, `pickOGNetwork`, `GALILEO_CHAIN_ID`, `ARISTOTLE_CHAIN_ID`.

---

### 2.10 `packages/config/src/index.ts` — barrel re-export of dead module

| Line | Issue | Severity | Recommendation |
|------|-------|----------|---------------|
| Line 5 | `export * from "./types/index.js"` barrel-re-exports all dead modules above | 🟢 LOW | CLEANUP |

The barrel `packages/config/src/types/index.ts` re-exports `hex.js`, `bigint.js`, `ethers.js`, `collections.js`, `schemas.js`, `contract.js`. While some have live exports, the barrel pulls in dead code too. Each consumer imports specific subpaths (`@axiom/config/types/bigint`), so the barrel is not directly consumed — but keeping it clean avoids drift.

---

## 3. Unused / Orphaned Functions in Apps

### 3.1 `apps/oracle/src/crypto/ecies.ts` — internal function not exported

| Export | File | Severity | Recommendation |
|--------|------|----------|---------------|
| `unsealKeyForReceiver()` | `apps/oracle/src/crypto/ecies.ts:29` | 🟡 MEDIUM | EXPORT or REMOVE |

`unsealKeyForReceiver` is declared as a plain `function` (no `export` keyword), so it's not part of the oracle package's public API. However, the backend's `server/transfer.test.ts` imports it via cross-app relative path:

```back:2:2:apps/backend/src/server/transfer.test.ts
import { unsealKeyForReceiver } from "../../../oracle/src/crypto/ecies.js";
```

This breaks the module boundary. Either:
- Export it from the oracle package and add it to `package.json` exports, or
- Inline the function in the test file.

**Severity is MEDIUM** because the transfer test may break if the oracle package restructures.

### 3.2 Cross-app test imports

| Import | File | Severity | Recommendation |
|--------|------|----------|---------------|
| `../../../oracle/src/crypto/aes-gcm.js` | `apps/backend/src/server/transfer.test.ts:1` | 🟡 MEDIUM | REFACTOR |
| `../../../oracle/src/crypto/ecies.js` | `apps/backend/src/server/transfer.test.ts:2` | 🟡 MEDIUM | REFACTOR |
| `../../../oracle/src/server.js` | `apps/backend/src/server/transfer.test.ts:12` | 🟡 MEDIUM | REFACTOR |
| `../../../oracle/src/signer.js` | `apps/backend/src/server/transfer.test.ts:13` | 🟡 MEDIUM | REFACTOR |
| `../../../oracle/src/storage.js` | `apps/backend/src/server/transfer.test.ts:14` | 🟡 MEDIUM | REFACTOR |

The backend's integration test deep-imports oracle internals across package boundaries. This should route through oracle's published exports or be moved into the oracle test suite.

---

## 4. Unused Dependencies in `package.json`

### 4.1 `apps/frontend/package.json` — `ethers` unused

| Dependency | File | Severity | Recommendation |
|------------|------|----------|---------------|
| `ethers: ^6.16.0` | `apps/frontend/package.json:18` | 🟡 MEDIUM | REMOVE |

The frontend imports `viem`, `wagmi`, `@rainbow-me/rainbowkit`, `react-router-dom`, `@tanstack/react-query`, and `@axiom/config/networks`. Grep for any `import ... from "ethers"` in `apps/frontend/src/` yields **zero results**. The `ethers` package is a dead weight dependency.

### 4.2 `apps/backend/package.json` — `ethereum-cryptography` unused in production code

| Dependency | File | Severity | Recommendation |
|------------|------|----------|---------------|
| `ethereum-cryptography: ^2.2.1` | `apps/backend/package.json:26` | 🟢 LOW | KEEP / document |

Only used by `apps/backend/src/cli/run-e2e.ts` (the e2e test script). Not imported by any production code. Could be made a devDependency.

### 4.3 `apps/backend/package.json` — `eciesjs` unused in production code

| Dependency | File | Severity | Recommendation |
|------------|------|----------|---------------|
| `eciesjs: ^0.4.18` | `apps/backend/package.json:25` | 🟢 LOW | KEEP / document |

Only used by `apps/backend/src/cli/run-e2e.ts`. Same situation as `ethereum-cryptography`. Could be devDependency.

---

## 5. Deprecated ethers v5 Syntax

**No ethers v5 patterns found.** The project uses ethers v6 consistently:
- `ethers.Wallet` (not `Wallet.createRandom`)
- `ethers.parseEther` (v6 re-export, not `ethers.utils.parseEther`)
- No `ethers.utils.*` calls
- No `BigNumber` usage
- `ethers.formatEther` is not used at all (viem's `formatEther` is preferred in frontend)

**Severity: ✅ NONE — all clean.**

---

## 6. Dead `.env` Files

**No actual `.env` files are committed.** Only `.env.example` files exist at:
- `/home/eya/og/.env.example`
- `/home/eya/og/apps/frontend/.env.example`

Both are properly gitignored via `.gitignore` patterns:
```
.env
.env.*
!.env.example
```

**Severity: ✅ NONE — all clean.**

---

## 7. Stale tsconfig Config

### 7.1 `apps/contracts/tsconfig.json` — stale include paths

| Field | Value | Issue | Severity | Recommendation |
|-------|-------|-------|----------|---------------|
| `include` | `["./script", "./hardhat.config.cjs"]` | No `.ts` files in `./script/` (all `.sol`). `hardhat.config.cjs` requires `allowJs: true` which is not set. | 🟢 LOW | Consider narrowing include |
| `exclude` | `["node_modules", "out", "cache", "broadcast"]` | Missing `forge-cache/`, `lib/` | 🟢 LOW | Add `forge-cache/` and `lib/` |

The `include` paths match zero TypeScript files currently, making `tsc --noEmit` a no-op for this package.

---

## 8. Previously Known Dead Code (Cross-Reference)

The repo has pre-existing dead-code analysis in `apps/bench/discovery/wave12-a-*.txt` files. Key items that are still unresolved:

### Backend (`wave12-a-deadcode-backend.txt`)

Many items listed in the wave12 scan have since been removed or refactored (e.g. `ownership.ts`, `compute/0g-broker.ts`, `compute/audio.ts`, `crypto/secp256k1.ts`, `storage/chain-id.ts`, `storage/range.ts`, `storage/stream.ts` — these files no longer exist). The remaining flagged items that are **still present**:

| Item | File | Status |
|------|------|--------|
| `_resetEventStoreForTests` | `apps/backend/src/events/store.ts:186` | KEEP — test utility |
| `OracleClientConfig` | `apps/backend/src/oracle/client.ts:22` | Still present |
| `TransferValidityInput` | `apps/backend/src/oracle/client.ts:32` | Still present |
| `TransferValidityResult` | `apps/backend/src/oracle/client.ts:56` | Still present |

### Frontend (`wave12-a-deadcode-frontend.txt`)

Still present:
| Item | File | Status |
|------|------|--------|
| `AXIOM_TEE_VERIFIER_ADDRESS` | `apps/frontend/src/abi/addresses.ts:47` | Still present |
| `AxiomAgentNftAbi` type | `apps/frontend/src/abi/axiomAgentNft.ts:6` | Still present |
| `AxiomStrategyVaultAbi` type | `apps/frontend/src/abi/axiomStrategyVault.ts:6` | Still present |
| `ITransferFromAbi` type | `apps/frontend/src/abi/iTransferFrom.ts:56` | Still present |
| `useOrchestratorTick` hook | `apps/frontend/src/hooks/useOrchestratorTick.ts:31` | Still present |

These last three ABI types (`*Abi`) are re-exported type aliases. They may have value for consumers but appear to be imported by zero callers (they are re-exported alongside the value, and only the value is directly consumed).

---

## Summary of Recommendations

### 🔴 HIGH — Must Fix
| # | Finding | Action |
|---|---------|--------|
| 1 | `apps/backend/src/routers/create-route.ts` — entire file dead | **REMOVE** |

### 🟡 MEDIUM — Should Fix
| # | Finding | Action |
|---|---------|--------|
| 2 | `packages/config/src/types/collections.ts` — entirely unused | **REMOVE** |
| 3 | `packages/config/src/types/ethers.ts` — entirely unused | **REMOVE** |
| 4 | `packages/config/src/api/routes.ts` — entirely unused | **REMOVE** |
| 5 | `packages/config/src/api/responses.ts` — entirely unused | **REMOVE** |
| 6 | `packages/config/src/abis/*.ts` — all 5 ABI files unused | **REMOVE** |
| 7 | `apps/frontend/package.json` — `ethers` unused dep | **REMOVE** |
| 8 | `apps/oracle/src/crypto/ecies.ts:29` — `unsealKeyForReceiver` un-exported | **EXPORT** or inline in test |
| 9 | Backend test cross-app imports | **REFACTOR** into oracle package exports |

### 🟢 LOW — Consider Cleaning
| # | Finding | Action |
|---|---------|--------|
| 10 | `parseBigInt`, `extractBigIntArg`, `Serialized`, `Deserialized` | **REMOVE** |
| 11 | `fetchAndValidate`, `bytes32` from schemas | **REMOVE** |
| 12 | `ENV_KEYS` const | **REMOVE** |
| 13 | `resolveRpcUrl`, `resolveStorageRpc` from networks | **REMOVE** |
| 14 | `ethereum-cryptography` and `eciesjs` as backend prodDeps | Move to **devDependencies** |
| 15 | Contracts tsconfig stale includes | **UPDATE** |

---

### Files Requiring Updates If Removing Dead Exports

If removing the identified dead exports, the following files also need updates:

- `packages/config/src/types/index.ts` — remove the barrel re-exports for `collections.ts` and `ethers.ts`
- `packages/config/src/index.ts` — no change needed (consumers import subpaths directly)
- `packages/config/package.json` — remove `exports` entries for removed modules:
  - `"./types/ethers"` → remove
  - `"./types/collections"` → remove
  - `"./api/routes"` → remove
  - `"./api/responses"` → remove
  - `"./abis/agentNft"` → remove
  - `"./abis/vault"` → remove
  - `"./abis/paymentProcessor"` → remove
  - `"./abis/iTransferFrom"` → remove
  - `"./api"` → remove
