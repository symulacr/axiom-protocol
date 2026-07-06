# Micro-Fix Summary — Wave 2026-07-06

**Main Agent:** Consolidation & verification  
**Audit sources read:**
- `analysis_reports/backend_analysis_final_report.md`
- `analysis_reports/analysis_duplication_patterns_20260705.md`
- `analysis_reports/analysis_data_flow_missing_logic_20260705.md`
- `analysis_reports/analysis_quality_types_architecture_20260705.md`
- `analysis_reports/implementation_plan_waves.md` (Wave 1 security items)

**Fix agent reports:**
- `fix_wave_20260706_store.md`
- `fix_wave_20260706_server.md`
- `fix_wave_20260706_orchestrator.md`
- `fix_wave_20260706_config_dedup.md`

---

## Issues Fixed (by Priority)

### Critical (4 fixed)

| ID | Issue | Files | Agent |
|----|-------|-------|-------|
| C-1 | Silent corrupt persist discard | `events/store.ts` | Store |
| C-2 | Mutable array leak via query returns | `events/store.ts` | Store |
| C1 | Timing-vulnerable API key compare | `packages/config/.../auth.ts` | Config |
| — | Atomic persist write (crash mid-write) | `events/store.ts` | Store |

### High (12 fixed)

| ID | Issue | Files | Agent |
|----|-------|-------|-------|
| P0-3 / H-1 | Streaming ticks not persisted | `routers/orchestrator.ts` | Orchestrator |
| P0-4 / H-2 | Payment router after Sentry | `server.ts` | Server |
| P0-5 / H-18 | WS heartbeat without unregister | `server.ts` | Server |
| P0-6 / H-5 | Chain-id env precedence drift | `orchestrator/index.ts` | Orchestrator |
| P0-7† | TEE uses cached `discoverProviders` | `orchestrator/index.ts` | Orchestrator |
| P1-6 / F-14 | Compute providers no `resp.ok` | `server.ts` | Server |
| P1-7 / F-05 | `broadcast` ignored WS topics | `routers/orchestrator.ts` | Orchestrator |
| P1-4 / F-10 | Non-numeric `:id` → 500 | `route-factory.ts` | Orchestrator |
| P1-9 / F-18 | Batch perf error as HTTP 200 | `performance.ts` | Orchestrator |
| H5 | `.env` quoted values | `packages/config/env.ts` | Config |
| F-01 | Wayback CDX copy-paste | `wayback.ts` | Config/Dedup |
| H-9‡ | `payloadNumber` NaN leak | `payloads.ts` | Store |

† Partial P0-7 — still uses `services[0]` but via shared cache  
‡ Medium severity, fixed opportunistically

### Medium / Low (6 fixed)

| ID | Issue | Files |
|----|-------|-------|
| M-1 | `clear()` didn't sync disk | `events/store.ts` |
| P1-3 / F-11 | Unbounded events query limit | `events.ts`, `constants.ts` |
| P1-8 / F-07 | Dead `paySchema` export | `route-schemas.ts` |
| P2-6 / F-03 | Zero-hash magic literal | `constants.ts`, orchestrator files |
| F-19 | Logger name collision `"compute"` | `router.ts`, `provider-discovery.ts` |
| F-26 | Unused `GALILEO_CHAIN_ID` import | `router.ts` |

**Dedup eliminated:** `appendTickEvent` helper, `fetchCdxRows`, `waybackTimestampToIso`, removed `paySchema`.

---

## Verification Results

```
pnpm --filter @axiom/config build     ✅
pnpm --filter @axiom/backend typecheck ✅
pnpm --filter @axiom/backend test      ✅ 7/7 pass
```

No file conflicts between agents — disjoint file ownership confirmed.  
No new duplication introduced; 3 dedup extractions added.

---

## Before → After (Codebase State)

| Area | Before | After |
|------|--------|-------|
| Event persistence | Silent corruption loss; mutable query refs; non-atomic writes | Logged quarantine; defensive copies; tmp+rename persist |
| Orchestrator ticks | Streamed runs invisible to performance API | All ticks appended via `appendTickEvent` |
| WS registry | Heartbeat left stale `_clientMap` entries | Full `unregisterClient` on eviction |
| Sentry | Payment routes after error handler | Payment routes registered before Sentry |
| Chain config | Orchestrator ignored `AXIOM_CHAIN_ID` env | Uses `resolveChainId()` like compute stack |
| API validation | Bad token ids → 500; batch errors → 200 | 400 for invalid ids and batch overflow |
| Security | String `!==` API key compare | `timingSafeEqual` |
| Wayback | 2× identical CDX fetch blocks | Single `fetchCdxRows` helper |
| Dead code | `paySchema` exported unused | Removed |

---

## Remaining Open Issues (Next Waves)

### Phase 0 residual
- **P0-7 complete:** Central `selectProvider(services, { model, mode })` — still `services[0]` in TEE path

### Phase 1
- P1-1: Runtime validation on `store.load()`
- P1-2: Event dedup `(chainId, txHash, logIndex)`
- P1-5: `vaultExecuteSchema`
- P1-10: Wire `EventPayload` into `StoredEvent`
- F-06: `storageRpc` unwired — remove or use
- F-15: Chat SSE disconnect abort
- F-16: Load real `modelDataRoot` from chain
- F-17: Rename/fix `winRate` metric semantics

### Phase 2
- P2-2: `createStaticProvider` shared factory
- P2-3: Payment `findParsedEvent` + `sendAndWait`
- P2-4: Oracle `request<T>()`
- P2-5: `buildOpenAIClient`
- P2-8: Lazy vault contract on runner

### Phase 3
- EventStore index performance (O(1) removal, owner index)
- E2E `main()` decomposition
- `GET /v1/routes` from `REGISTERED_ROUTES`

### Other audit domains (not touched this wave)
- Frontend UX findings (`audit-reports/03_frontend_ux_demo_readiness.md`)
- Backend/contract friction (`audit-reports/02_backend_contract_friction.md`)
- Onchain/contract items (Foundry — out of backend scope)
- Indexer/oracle Wave 1 items from `implementation_plan_waves.md`

---

## Conflict & Duplication Check

| Check | Result |
|-------|--------|
| Overlapping file edits between agents | None |
| New dead code introduced | None (`paySchema` removed) |
| New duplication introduced | None (3 helpers extracted) |
| Breaking API changes | None — WS tick delivery now topic-scoped (bug fix per audit) |
| Tests regressions | None |

---

*Wave 2026-07-06 complete. Ready for Wave 2 targeting Phase 1 residual + Phase 2 duplication.*