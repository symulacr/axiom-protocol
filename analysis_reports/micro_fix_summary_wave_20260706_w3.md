# Micro-Fix Summary — Wave 3 (2026-07-06)

**Orchestrator:** Fixing Orchestrator  
**Agents:** W3-A (Store), W3-B (Compute), W3-C (Server), W3-D (Config/Indexer/FE), W3-E (Orchestrator/CLI)  
**Manifest:** `analysis_reports/fix_manifest.md`

---

## Issues Fixed This Wave

### Critical / Blocker (1)

| ID | Issue | Agent | Evidence |
|----|-------|-------|----------|
| BLK-1 | Wave-2 regression: `append()` key redeclaration + wrong `seenKeys` key | W3-A | `fix_wave_20260706_w3a_store.md`; typecheck pass |

### High (1 completed, unblocks P1-2)

| ID | Issue | Agent |
|----|-------|-------|
| P1-2 | Event dedup on ingest | W2-partial + W3-A (dedupe key fix) |
| F-17-FE | `NULL_METRICS` missing `buyRate` | W3-D |

### Medium (12)

| ID | Issue | Agent |
|----|-------|-------|
| M-12 | `removeFromIndex` empty Map leak | W3-A |
| M-22 | `AXIOM_DATA_DIR` persist override | W3-A |
| M7 | Chain-aware provider cache | W3-B |
| M8 | Provider discovery race fix | W3-B |
| M9 | `clearBrokerCache` + invalidate hook | W3-B |
| M2 | `MAX_WS_CLIENTS` dedup | W3-C |
| M3 | `sendError` in 3 router sites | W3-C |
| M5 | `TTLCache<T>` extraction | W3-C |
| M6 | `settleOnChain` action logging | W3-E |
| M10 | `parseRecommendation` amount bounds | W3-E |
| M11 | Indexer re-buffer drops newest | W3-D |
| H8 | `getEnvWithAlias` deprecation warn | W3-D |
| L7 | Indexer sink retry + dedup return | W3-D |
| L11 | Auth `publicPaths` param | W3-D |

### Low (3)

| ID | Issue | Agent |
|----|-------|-------|
| L13 | Error truncation 64→128 | W3-E |
| L1, L4 | CLI TRANSFER_TOPIC + getSharedProvider | W3-E (already present) |

---

## Verification (Orchestrator)

```
pnpm --filter @axiom/config build     ✅
pnpm --filter @axiom/backend typecheck ✅
pnpm --filter @axiom/backend test     ✅ 7/7
pnpm --filter @axiom/indexer typecheck ✅
```

---

## Before → After Highlights

| Area | Before | After |
|------|--------|-------|
| EventStore dedup | Broken compile; `seenKeys` used bucket key | Compiles; dedupe uses `chainId:txHash:logIndex` |
| Provider cache | Single global cache, race-prone | Per-chainId Map + per-chain in-flight promises |
| Broker caches | No eviction API | `clearBrokerCache()` wired to `invalidateProviderCache()` |
| Server caches | Duplicated TTL patterns | Shared `TTLCache<T>` |
| Indexer buffer | `pop()` dropped newest on retry | `shift()` drops oldest; `push()` re-inserts batch |
| Indexer sink | Single attempt, duplicate return | Retries with backoff |
| Frontend batch | `NULL_METRICS` type error risk | `buyRate: 0` added |

---

## Agent Reports

- `fix_wave_20260706_w3a_store.md`
- `fix_wave_20260706_w3b_compute.md`
- `fix_wave_20260706_w3c_server.md`
- `fix_wave_20260706_w3d_config_indexer.md`
- `fix_wave_20260706_w3e_orchestrator_cli.md`

---

## Remaining (Next Wave)

### Phase 3 / Large
- P3-1..P3-7: EventStore performance, E2E decomposition, `fetchJson`
- P1-10: `EventPayload` ↔ `StoredEvent` type bridge

### implementation_plan_waves.md (not yet scheduled)
- Wave 1 oracle: M13, M14, M23 (mint ZodError, transfer schema)
- Wave 1 orchestrator: H1-H3, M21 (model cache, TEE best-effort, chatId, Promise.allSettled)
- Wave 2 config: M17, H3-config, M6-config, L9 (schema dedup, StorageAdapter, addresses dynamic)
- Wave 3 cosmetic: L5 buildEip712Domain, L10 ecies, L12 OwnershipProofResult, S1/S3 exports

### Low priority open
- F-19 agents unbounded `fromBlock: 0` scan
- Health oracle-down still `ok: true`
- Full `sendError` standardization across all server inline errors

---

*Wave 3 complete. Manifest updated.*