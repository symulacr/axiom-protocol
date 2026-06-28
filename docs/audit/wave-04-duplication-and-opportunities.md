# Wave 4: Duplication, Quality & Refactoring Opportunities — Closure Report

**Protocol:** 7×4 Wave Codebase Audit  
**Date:** 2026-06-28  
**Monorepo:** Axiom Protocol (`/home/eya/og`)  
**Agents:** 7/7 completed | **Duration:** ~4 minutes  

---

## Executive Summary

Wave 4 found ~115 duplicated lines, 11 code smells, 20 observability gaps, and synthesized **30 prioritized recommendations**. The top structural issues are: (1) **ChatPage.tsx is a 798-line god component**, (2) **indexer `decodeAxiomLog` is a 28-case, 300-line switch**, (3) **the frontend has zero tests** despite being the largest app, and (4) **EIP-712 domain/types drift risk** across 3 independent locations.

---

## 1. Logic Duplication (~115 lines duplicated)

| Category | Details | Severity |
|---|---|---|
| Env access | 7+ files bypass `@axiom/config/env` → direct `process.env` with different defaults | MEDIUM |
| Address resolution | 3-way: `addresses.ts` → `env-schema.ts` → `index.ts` with conflicting fallbacks | MEDIUM |
| EIP-712 domain/types | Defined in `oracle/crypto/eip712.ts`, `frontend/abi/eip712.ts`, `backend/orchestrator` — manual sync risk | **HIGH** |
| ABI loading | 7 `parseAbi()` calls for 3 ABIs instead of reusing config exports | LOW |
| Fetch patterns | 5 similar fetch wrappers across frontend utils | LOW |
| ECIES implementation | `oracle/crypto/ecies.ts` wrapper vs raw `eciesjs` in `run-e2e.ts` | LOW |
| HTTP error handlers | Similar error middleware patterns in backend and oracle | LOW |

---

## 2. Module Responsibility Overlap

| Area | Status | Recommendation |
|---|---|---|
| Env loading | ✅ **Well-centralized** in `@axiom/config/env` | — |
| API key auth | ✅ **Well-centralized** in `@axiom/config/middleware/auth` | — |
| Hex/address utilities | ⚠️ **Centralized but imports inconsistent** | Standardize imports across apps |
| Contract method types | ❌ **3+ duplicated type interfaces** | Share via `@axiom/config/types` |
| Event definitions | ❌ **Signatures in both indexer `events.ts` and `watcher.ts`** | Centralize to `@axiom/config` |
| Address resolution | ❌ **Backend reimplements fallback chain** | Consolidate in `@axiom/config/addresses` |
| Crypto operations | ⚠️ **Minor gap** (run-e2e reimplements ecies) | Acceptable for test code |

---

## 3. Integration Quality Assessment

| Integration | Score | Key Issue |
|---|---|---|
| 0G Compute (OpenAI) | **Good** — clean wrapper | No per-request timeout |
| 0G Storage | **Fair** — thin adapter | No timeout, no tests |
| Wayback Machine | **Fair** — direct HTTP | Inconsistent error handling |
| WalletConnect (wagmi) | **Good** — well-configured | — |
| Ethers/viem | **Good** — TypedContract pattern | — |

---

## 4. Code Smells & Anti-Patterns (11 findings)

| Smell | File | Line Range | Severity |
|---|---|---|---|
| 28-case switch (300-line duplication) | `apps/indexer/src/watcher.ts` | 137-438 | **HIGH** |
| Stringly-typed route paths (30+ locations) | Throughout backend | Every route definition | **HIGH** |
| ChatPage.tsx god component (798 lines) | `apps/frontend/src/pages/ChatPage.tsx` | 1-798 | **HIGH** |
| Backend-oracle intimate coupling | `apps/backend` → `@axiom/oracle/signer` | Direct type import | MEDIUM |
| Magic numbers | Throughout | 86400, 2000, 2048 inline | MEDIUM |
| Inconsistent naming pattern | Throughout | `OG_` vs `AXIOM_` prefixes | MEDIUM |
| God router (server.ts routes) | `apps/backend/src/server.ts` | 49-297 | LOW |
| Test-reset hack on singleton | `events/store.ts` | Global mutable singleton | LOW |
| Hardcoded chain/network names | `frontend/config/chains.ts` | Raw strings | LOW |

---

## 5. Documentation & Observability (20 findings)

| Severity | Count | Key Items |
|---|---|---|
| **CRITICAL** | 5 | No `unhandledRejection` handler, no `uncaughtException` handler, indexer no health endpoint, oracle uses `console.log`, no tracing/x-request-id propagation |
| **HIGH** | 5 | OpenAI no timeout, backend no SIGTERM, indexer infinite retry loop, frontend zero TSDoc, no Prometheus metrics |
| **MEDIUM** | 6 | Mixed `OG_`/`AXIOM_` env prefix, no log aggregation, backend `wayback.ts` no structured retries, frontend no error boundary on all routes, indexer checkpoint not backed up, EventStore silently drops events |
| **LOW** | 4 | wayback.ts return-type inconsistency, unused EventStore methods, deprecated `usePoll` still exported, `route-schemas.ts` Zod comments stale |

---

## 6. Complexity Analysis

### Largest Files

| File | Lines | Risk |
|---|---|---|
| `packages/config/src/abis/generated.ts` | 2403 | Auto-generated (acceptable) |
| `apps/frontend/src/pages/ChatPage.tsx` | 798 | God component |
| `apps/indexer/src/watcher.ts` | 625 | God module |
| `apps/frontend/src/components/TransferModal.tsx` | 573 | Large but domain-coherent |
| `apps/frontend/src/components/ui.tsx` | 477 | Design system (expected size) |

### Longest Functions

| Function | Lines | Issue |
|---|---|---|
| `decodeAxiomLog` (watcher.ts) | 301 (137-438) | 28-case switch — worst offender |
| `sendMessage` (ChatPage.tsx) | 146 (492-638) | Multi-turn loop, SSE, tool executor inline |
| `useToolHandlers` (ChatPage.tsx) | 153 (270-423) | 11 handlers in one closure |
| `startServer` (server.ts) | 248 (49-297) | Middleware, routes, WS, error handler all in one |

### Test Coverage Gaps

| Module | Status | Key Files Missing Tests |
|---|---|---|
| `apps/frontend` | **ZERO tests** | ChatPage (798L), TransferModal (573L), PaymentPanel (452L), 18 hooks, 5 utils |
| `apps/indexer` | **ZERO tests** | watcher.ts (625L), sink.ts, events.ts |
| `packages/config` | **ZERO tests** | middleware/auth.ts, storage/0g.ts, types/* |
| `apps/backend` | **PARTIAL** | Only 2 tests (orchestrator chain-id, transfer) |
| `apps/oracle` | **PARTIAL** | 3 tests (server, signer, server-access-proof) |

---

## 7. Prioritized Refactoring Recommendations (30 total — synthesized from all 4 waves)

### P0 — Critical (security, data loss, or money risk)

| # | Recommendation | Source | Effort |
|---|---|---|---|
| 1 | Add `process.on('unhandledRejection')` + `process.on('uncaughtException')` to all 4 entry points | W2-A5, W4-A5 | 1h |
| 2 | Wrap oracle `POST /v1/ownership` and `POST /v1/agents/mint` in try/catch with structured error responses | W2-A5, W4-A5 | 30min |
| 3 | Add per-request timeout to OpenAI/0G Compute completion calls (hanging model blocks strategy runner) | W2-A5, W2-A7 | 1h |
| 4 | Add SIGTERM handler to backend (missing — oracle and indexer have it) | W2-A6, W4-A5 | 30min |

### P1 — High

| # | Recommendation | Source | Effort |
|---|---|---|---|
| 5 | Refactor `decodeAxiomLog` — 28-case, 300-line switch into event-type registry pattern | W4-A4, W4-A6 | 4h |
| 6 | Split `ChatPage.tsx` — extract SSE parser, tool handlers, message list into separate modules | W4-A4, W4-A6 | 4h |
| 7 | Centralize EIP-712 domain/types in `@axiom/config` (currently in 3 places — drift risk) | W4-A1, W4-A2 | 2h |
| 8 | Standardize env var prefix to `AXIOM_` and deprecate `OG_*` with runtime deprecation warnings | W1-A5, W3-A7, W4-A5 | 3h |
| 9 | Add tests to frontend (coverage: 0% for 2.6K+ lines of hooks + components) | W4-A6 | 2d+ |
| 10 | Add indexer health endpoint (currently none — dead container indistinguishable from healthy) | W4-A5, W2-A6 | 1h |
| 11 | Remove 3 dead components (MonoInput, MutedText, MetadataGrid) + 5 dead bench directories | W3-A1, W3-A3 | 30min |

### P2 — Medium

| # | Recommendation | Source | Effort |
|---|---|---|---|
| 12 | Consolidate address resolution (3-way duplication: addresses.ts → env-schema → index.ts) | W4-A1, W4-A2 | 2h |
| 13 | Event definition centralization — `watcher.ts` and `events.ts` define same event sigs | W4-A2 | 2h |
| 14 | Migrate oracle from `console.log` to structured logger | W4-A5 | 1h |
| 15 | Add API documentation (OpenAPI/Swagger) — 28+ routes undocumented | W1-A7 | 3h |
| 16 | Flush EventStore on shutdown (data loss risk on unclean exit) | W2-A6 | 1h |
| 17 | Remove `omnichron` from dependencies (unused in 2 packages) | W1-A3, W3-A5 | 30min |
| 18 | Confirm `AXIOM_DEPLOYER_ADDRESS` env var for deploy scripts (currently undocumented) | W4-A7 | 30min |
| 19 | Clean up 8 transient `tmp_*` scripts at repo root | W4-A7 | 15min |
| 20 | Indexer infinite retry loop — add max-fail threshold and circuit breaker | W4-A6 | 2h |
| 21 | Add CONTRIBUTING.md and root CHANGELOG.md | W1-A7 | 1h |

### P3 — Low

| # | Recommendation | Source | Effort |
|---|---|---|---|
| 22 | Route path constants — replace 30+ inline stringly-typed paths | W4-A4 | 3h |
| 23 | Remove `createApiKeyAuth` unused import from oracle server.ts | W3-A5, W4-A7 | 5min |
| 24 | Add `.npmrc` to bench directory (missing) | W4-A7 | 5min |
| 25 | Remove stale forge broadcast artifacts | W3-A7 | 15min |
| 26 | Clean up `dist-test/wayback.js` orphaned JS file | W3-A7 | 5min |
| 27 | Standardize hex/address import path across apps | W4-A2 | 1h |
| 28 | Live Vercel OIDC tokens in committed .env (should be .gitignored) | W4-A7 | 15min |
| 29 | Extract hardcoded magic numbers (86400, 2000, 2048) to named constants | W4-A4 | 1h |
| 30 | Add per-app README files (none exist for any sub-package) | W1-A7 | 2h |

---

## 8. Cross-Wave Themes

| Theme | Waves | Recommendation |
|---|---|---|
| **Naming migration** | W1-A5, W3-A7, W4-A5 | `OG_*` → `AXIOM_*` incomplete across 15+ sites |
| **Missing error handling** | W2-A5, W4-A5, W4-A6 | No unhandledRejection, oracle try/catch gaps, backend no SIGTERM |
| **Zero test coverage in largest modules** | W4-A6 | Frontend (0%), Indexer (0%), Config (0%) |
| **API documentation** | W1-A7, W4-A4 | 28+ routes undocumented; 30+ stringly-typed route paths |

---

## 9. Agent Reports Index

| Agent | Report | Key Metrics |
|---|---|---|
| W4-A1 Logic Duplication | `local://w4-a1-logic-duplication.md` | ~115 duplicated lines, 8 categories |
| W4-A2 Module Overlap | `local://w4-a2-module-overlap.md` | 7 areas assessed, 3 consolidation wins |
| W4-A3 Integration Quality | `local://w4-a3-integration-quality.md` | 7 integrations evaluated |
| W4-A4 Code Smells | `local://w4-a4-code-smells.md` | 11 findings, 62 files analyzed |
| W4-A5 Docs & Observability | `local://w4-a5-docs-observability.md` | 20 findings (5 critical, 5 high) |
| W4-A6 Complexity | `local://w4-a6-complexity.md` | Top 10 files, 4 long functions, test gaps mapped |
| W4-A7 Refactoring Opportunities | `local://w4-a7-refactoring-opportunities.md` | 30 recommendations across 4 priorities |

---

*End of Wave 4 Closure Report. All 4 waves complete — ready for FINAL_AUDIT_REPORT.md.*
