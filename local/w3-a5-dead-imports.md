# W3-A5 Dead Imports & Dependencies Report

**Agent:** W3A5-DeadImports  
**Date:** 2026-06-28  
**Scope:** Unused imports and unnecessary external dependencies across Axiom Protocol  

---

## 1. UNUSED PRODUCTION DEPENDENCIES

Dependencies declared in `package.json` `dependencies` but never imported in any source file.

### 1.1 `omnichron` — @axiom/config

| Field | Detail |
|-------|--------|
| **File** | `packages/config/package.json:39` |
| **Dependency** | `omnichron: ^0.3.1` |
| **Evidence** | Grep of all source files under `packages/config/src/` returns zero matches for `omnichron`. The import `import { createArchive, providers } from "omnichron"` appears only in dist/test artefacts (`apps/backend/dist-test/wayback.js`), not in any source file. |
| **Severity** | 🔴 HIGH — adds ~2.5MB (38 sub-deps per lockfile: c12, consola, defu, rc9, etc.) to config builds for zero production use. |
| **Action** | Remove from `packages/config/package.json` dependencies. |

### 1.2 `omnichron` — @axiom/backend

| Field | Detail |
|-------|--------|
| **File** | `apps/backend/package.json:28` |
| **Dependency** | `omnichron: ^0.3.1` |
| **Evidence** | Grep of all source files under `apps/backend/src/` returns zero matches for `omnichron`. The Wayback service (`apps/backend/src/services/wayback.ts`) wraps it, but that file is **never imported** by any production code path. |
| **Severity** | 🔴 HIGH — same transitive weight as config's omnichron. Duplicated across two packages compounds the issue. |
| **Action** | Remove from `apps/backend/package.json` dependencies. |

### 1.3 `@0gfoundation/0g-storage-ts-sdk`, `@axiom/config`, `ethers` — @axiom/bench

| Field | Detail |
|-------|--------|
| **File** | `apps/bench/package.json:23-25` |
| **Dependencies** | `@0gfoundation/0g-storage-ts-sdk: ^1.2.10`, `@axiom/config: workspace:*`, `ethers: 6.16.0` |
| **Evidence** | Bench only ships k6 scripts under `apps/bench/scripts/`. All three scripts (transfer.js, health.js, orchestrator-tick.js) import only from `k6` and `k6/http`. No `src/` directory exists. No `.ts` source files reference any of these deps. The packages are installed but dead weight. |
| **Severity** | 🟡 MEDIUM — unused on every bench install. However, bench is not a deployment target, so no production impact. |
| **Action** | Remove all three from `apps/bench/package.json` dependencies. |

---

## 2. DEPENDENCY MISCLASSIFICATION

### 2.1 `eciesjs` and `ethereum-cryptography` in @axiom/backend — already correctly classified

| Field | Detail |
|-------|--------|
| **File** | `apps/backend/package.json:39-40` |
| **Current section** | `devDependencies` |
| **Reality** | ✅ Correctly placed. Both are only imported by `apps/backend/src/cli/run-e2e.ts` (a developer CLI script, not production server code). `eciesjs` (`eciesEncrypt`/`eciesDecrypt`) and `ethereum-cryptography` (`keccak256`) are each used exactly once. |
| **Note on redundancy** | The `ethereum-cryptography/keccak` import is **doubly redundant** — `ethers` already exports `keccak256`. The import could be replaced with `ethers.keccak256` and the `ethereum-cryptography` devDependency removed entirely. |
| **Severity** | 🟢 LOW — correctly classified, no change needed. |

---

## 3. UNUSED SOLIDITY IMPORTS

### 3.1 `EnumerableSet` — ERC7857IDataStorageUpgradeable.sol

| Field | Detail |
|-------|--------|
| **File** | `apps/contracts/src/extensions/ERC7857IDataStorageUpgradeable.sol:10` |
| **Import** | `import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";` |
| **Evidence** | The contract body never references `EnumerableSet` — it manages `IntelligentData[]` using raw dynamic arrays. The `EnumerableSet` type is not used in any storage struct, function parameter, or local variable. |
| **Severity** | 🟢 LOW — linter-level finding; zero runtime impact. |
| **Action** | Remove the import. |

### 3.2 `IntelligentData` — ERC7857AuthorizeUpgradeable.sol

| Field | Detail |
|-------|--------|
| **File** | `apps/contracts/src/extensions/ERC7857AuthorizeUpgradeable.sol:15` |
| **Import** | `import {IntelligentData} from "../interfaces/IERC7857Metadata.sol";` |
| **Evidence** | The contract handles authorization (grant/revoke usage rights) and never references `IntelligentData` type. The `_update()` override (line 106) delegates to `super._update()` and calls `_clearAuthorized()` — no data references. |
| **Severity** | 🟢 LOW — zero runtime impact. |
| **Action** | Remove the import (which is the only import from IERC7857Metadata in this file). |

### 3.3 `IERC7857DataVerifier` — ERC7857CloneableUpgradeable.sol

| Field | Detail |
|-------|--------|
| **File** | `apps/contracts/src/extensions/ERC7857CloneableUpgradeable.sol:14` |
| **Import** | `import {IERC7857DataVerifier, TransferValidityProof} from "../interfaces/IERC7857DataVerifier.sol";` |
| **Evidence** | `TransferValidityProof` is used (function parameters). `IERC7857DataVerifier` as a type is never referenced in the contract body — the inherited `_proofCheck()` handles verifier interaction via the parent `ERC7857Upgradeable`. |
| **Severity** | 🟢 LOW — negligible impact since it's imported alongside the actually-used `TransferValidityProof`. |
| **Action** | Change to `import {TransferValidityProof} from "../interfaces/IERC7857DataVerifier.sol";` |

---

## 4. UNUSED TYPESCRIPT IMPORTS

### 4.1 `createApiKeyAuth` — oracle/src/server.ts

| Field | Detail |
|-------|--------|
| **File** | `apps/oracle/src/server.ts:11` |
| **Import** | `import { createApiKeyAuth } from "@axiom/config/middleware/auth";` |
| **Evidence** | `createApiKeyAuth` is imported but never invoked in the function body. The backend's `server.ts` uses it correctly (`app.use(createApiKeyAuth(...))` on line 83), but the oracle server imports it without ever calling it. |
| **Severity** | 🟡 MEDIUM — API key auth for the oracle is silently missing. Either the import should be removed (if intentionally omitted) or the middleware should be applied. |
| **Action** | Apply the middleware with `app.use(createApiKeyAuth(config.env?.AXIOM_API_KEY));` or remove the import. |

---

## 5. BARREL RE-EXPORT DEAD CODE

ABI exports from `packages/config/src/abis/generated.ts` that are re-exported through `abis/index.ts` but never consumed by application code:

| Export | Defined in | Consumed by | Status |
|--------|-----------|-------------|--------|
| `axiomMockUsdcAbi` | `generated.ts:1239` | `abis/index.ts` only (re-export barrel) | ❌ Dead re-export |
| `axiomTeeVerifierAbi` | `generated.ts:2156` | `abis/index.ts` only (re-export barrel) | ❌ Dead re-export |
| `axiomPaymentProcessorAbi` | `generated.ts:1411` | `abis/index.ts` only (re-export barrel) | ❌ Dead re-export |

The hand-written ABIs (`PAYMENT_PROCESSOR_ABI`, `ITRANSFER_FROM_ABI`, etc.) are used; these generated variants are vestigial.

**Severity:** 🟢 LOW — generated files, zero maintenance cost. Flagged for awareness.

---

## 6. CROSS-PACKAGE DUPLICATE DEPENDENCIES (INFORMATIONAL)

Packages that declare the same external dependencies, creating version drift risk:

### High-value duplicates

| Dependency | Declared In | Versions |
|------------|-------------|----------|
| **ethers** | @axiom/backend, @axiom/oracle, @axiom/indexer, @axiom/config (deps) + @axiom/contracts (devDeps) + @axiom/bench (deps) | `^6.16.0` (×4), `^6.13.4` (contracts), `6.16.0` exact (bench) |
| **eciesjs** | @axiom/backend (devDep) + @axiom/oracle (dep) | `^0.4.18` vs `^0.4.14` |
| **eslint** | root (devDep) + @axiom/frontend (devDep) | `^9.10.0` vs `^9.14.0` |
| **solhint** | root (devDep) + @axiom/contracts (devDep) | both `^5.0.0` |

### Expected duplicates (same-version, standard practice)

`cors`, `express-rate-limit`, `helmet`, `zod` — duplicated across backend and oracle for independent service packaging. No issue.

---

## 7. UNUSED DEV DEPENDENCIES (tooling, always-present)

These are build/lint/type tooling devDeps that are not directly imported in source code but are always expected:
- `typescript` (in every package)
- `tsx` (in backend, oracle, indexer, bench)
- `eslint` (root, frontend)
- `@types/*` (type declarations used by tsconfig)
- `solhint` (contracts)
- `ts-prune` (bench)
- `@vitejs/plugin-react` (frontend)
- `vite` (frontend)

All are **correctly classified** and expected. No action needed.

---

## 8. SUMMARY TABLE

| # | Finding | File | Severity | Action |
|---|---------|------|----------|--------|
| 1 | `omnichron` unused in @axiom/config | `packages/config/package.json:39` | 🔴 HIGH | Remove |
| 2 | `omnichron` unused in @axiom/backend | `apps/backend/package.json:28` | 🔴 HIGH | Remove |
| 3 | `@0gfoundation/0g-storage-ts-sdk`, `@axiom/config`, `ethers` unused in @axiom/bench | `apps/bench/package.json:23-25` | 🟡 MEDIUM | Remove all 3 |
| 4 | `EnumerableSet` unused import in IDatastorage | `ERC7857IDataStorageUpgradeable.sol:10` | 🟢 LOW | Remove import |
| 5 | `IntelligentData` unused import in AuthorizeUpgradeable | `ERC7857AuthorizeUpgradeable.sol:15` | 🟢 LOW | Remove import |
| 6 | `IERC7857DataVerifier` unused import in CloneableUpgradeable | `ERC7857CloneableUpgradeable.sol:14` | 🟢 LOW | Narrow import |
| 7 | `createApiKeyAuth` imported but never called | `apps/oracle/src/server.ts:11` | 🟡 MEDIUM | Apply or remove |
| 8 | `axiomMockUsdcAbi`, `axiomTeeVerifierAbi`, `axiomPaymentProcessorAbi` dead re-exports | `packages/config/src/abis/index.ts` | 🟢 LOW | Note only |

### Confirmed from W1-A3 Cross-Reference

The Wave 01 audit flagged three items:
- ❌ `omnichron` in backend and config — **CONFIRMED** (findings 1, 2)
- ✅ `ethereum-cryptography` in backend devDeps — **ALREADY CORRECT** (section 2.1)
- ❌ `@0gfoundation/0g-storage-ts-sdk` in bench — **CONFIRMED** (finding 3)
