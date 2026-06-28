# Verification Wave 2: Dead Code & Smell Cross-Check — Closure Report

**Date:** 2026-06-28  
**Status:** 37 CONFIRMED, 3 DISPROVEN, 2 PARTIAL  

---

## Results

| Agent | Focus | Verdict | Key Insight |
|---|---|---|---|
| **V2-A1** | 48 dead functions (10 sampled) | **7 CONFIRMED, 3 DISPROVEN** | 3 OZ v5 hooks don't exist in this codebase — phantom claims. `buildMetadataJson` truly dead (no tokenURI override). AxiomMetadataJson entire library dead |
| **V2-A2** | 17 dead variables (7 sampled) | **ALL 7 CONFIRMED** | BLOCK_SCAN_RANGE, DEFAULT_MAX_TOKENS, 4 OGNetwork fields, mockUsdc, UploadResult/DownloadResult, AXIOM_COMPUTE_BASE_URL all zero references |
| **V2-A3** | 8 dead imports (6 sampled) | **5 CONFIRMED, 1 PARTIAL** | omnichron dead in 2 packages. createApiKeyAuth unused in oracle. IERC7857DataVerifier partially dead. EnumerableSet dead in one file but alive in another |
| **V2-A4** | 10 unreachable code (5 sampled) | **ALL 5 CONFIRMED** | Dead address(0) guard, chainId fallback, Zod-post-parse guards, self-acknowledged dead storage, NODE_ENV===production |
| **V2-A5** | ChatPage god component | **CONFIRMED** | Exactly 798 lines, 147-line sendMessage, 154-line useToolHandlers, 13 responsibilities |
| **V2-A6** | decodeAxiomLog switch | **PARTIALLY CONFIRMED** | 302 lines (close to 300), 29 cases (not 28), ~85% boilerplate duplication |
| **V2-A7** | 3+ critical error gaps | **ALL 5 CONFIRMED** | Indexer per-log decode kills tick, infinite retry with no circuit breaker, EventStore not flushable |

---

## V2-A7 Expanded Findings

Previously the audit listed 3 critical error gaps. V2 cross-check found 5:

| # | Finding | Severity | Verified |
|---|---|---|---|
| 1 | No `unhandledRejection` handler | CRITICAL | V1-A1 + V2-A7 |
| 2 | Oracle `/v1/ownership` 80 lines unprotected async | CRITICAL | V1-A2 + V2-A7 |
| 3 | Indexer per-log decode kills entire tick (new detail) | CRITICAL | V2-A7 |
| 4 | Indexer infinite retry loop, no circuit breaker | HIGH | V2-A7 (new) |
| 5 | EventStore not flushable on shutdown | HIGH | V2-A7 (new) |

---

## Corrections to Original Audit

| Original Claim | Verification Finding | Impact |
|---|---|---|
| `_beforeTokenTransfer`, `_afterTokenTransfer`, `_increaseBalance` dead | **DISPROVEN** — functions don't exist in codebase (OZ v5) | -3 from dead function count. Original count was overstated |
| `decodeAxiomLog` has 28 cases | **PARTIAL** — has 29 cases | Minor miscount, finding stands |
| OpenAI has no timeout | **DISPROVEN** (V1-A3) | Downgraded from P0 to P2 |
| 3 CRITICAL error gaps | **Expanded to 5** | Indexer tick crash + infinite retry are newly confirmed |

---

## Next Steps

Launching **Wave V3: Completeness & Missed Finding Scan** immediately.
