# Fix Manifest — Axiom Backend Audit Remediation

**Orchestrator:** Fixing Orchestrator  
**Last updated:** 2026-07-06  
**Sources:** `backend_analysis_final_report.md`, sub-agent reports (20260705), `implementation_plan_waves.md`, wave-1 fix reports (`fix_wave_20260706_*.md`), `micro_fix_summary_wave_20260706.md`

---

## Wave History

| Wave | Date | Agents | Status |
|------|------|--------|--------|
| W1 | 2026-07-06 | Store, Server, Orchestrator, Config/Dedup | ✅ Verified (typecheck + 7/7 tests) |
| W2-partial | 2026-07-06 | (untracked agent edits) | ⚠️ Applied but **typecheck FAIL** — store.ts blocker |
| W3 | 2026-07-06 | A: EventStore, B: Compute cache, C: Server/utils, D: Config/indexer/frontend, E: Orchestrator/CLI | ✅ Verified (typecheck + 7/7 tests + indexer typecheck) |
| W4 | 2026-07-06 | A: Oracle, B: Orchestrator+router, C: Config package, D: Agents/health/tests, E: EventStore perf | ✅ Verified (config build + backend/oracle/indexer typecheck + 7/7 tests) |
| W5 | 2026-07-06 | A: EventStore arch, B: Payload types, C: fetch+E2E, D: Server/oracle polish, E: Config+indexer | ✅ Verified (config build + backend/oracle/indexer typecheck + 7/7 tests) |
| W6 | 2026-07-06 | C: Closure sweep (fetchJson tests, manifest, L-11) | ✅ Verified (config build + backend/oracle/indexer typecheck + 7/7 tests) |

---

## Critical

| ID | Finding | Microchange | Status | Agent | Evidence |
|----|---------|-------------|--------|-------|----------|
| C-1 | Silent corrupt persist discard | Log + `.bak` quarantine on load failure | Done | W1-Store | `fix_wave_20260706_store.md`; `store.ts:270-279` |
| C-2 | Query returns expose mutable arrays | Defensive `[...bucket]` copies | Done | W1-Store | `fix_wave_20260706_store.md` |
| C-3 | Debounced persist crash window | Atomic tmp→rename (partial mitigation) | Done | W1-Store | `store.ts:322-329` |
| C1 | Timing-vulnerable API key compare | `timingSafeEqual` in auth middleware | Done | W1-Config | `fix_wave_20260706_config_dedup.md` |
| **BLK-1** | **Wave-2 regression: `append()` redeclares `key`; `seenKeys.add` uses bucket key not dedupe key** | Rename vars; `seenKeys.add(dedupe)` | **Done** | **W3-A** | `fix_wave_20260706_w3a_store.md`; typecheck pass |

---

## High

| ID | Finding | Microchange | Status | Agent | Evidence |
|----|---------|-------------|--------|-------|----------|
| H-1 / P0-3 | Streaming ticks not persisted | `appendTickEvent` in stream path | Done | W1-Orchestrator | `fix_wave_20260706_orchestrator.md` |
| H-2 / P0-4 | Payment router after Sentry | Mount payment before Sentry handler | Done | W1-Server | `fix_wave_20260706_server.md` |
| H-3 / P0-7 | TEE uses `services[0]` | `selectProvider(services, { model })` | Done | W2-partial | `orchestrator/index.ts:308` |
| H-4 | Router provider selection | `selectProvider` in router | Done | W2-partial | `router.ts:182` |
| H-5 / P0-6 | Chain-id env precedence drift | `resolveChainId(config.chainId)` | Done | W1-Orchestrator | `fix_wave_20260706_orchestrator.md` |
| H-6 | Unchecked JSON.parse on load | `isStoredEvent` guard + skip invalid | Done | W2-partial | `store.ts:254-257` |
| H-15 / P1-5 | Vault execute no Zod | `vaultExecuteSchema` + route wiring | Done | W2-partial | `route-schemas.ts:37`, `server.ts:479` |
| H-18 / P0-5 | WS heartbeat without unregister | `unregisterClient(c)` on eviction | Done | W1-Server | `fix_wave_20260706_server.md` |
| H5 | `.env` quoted values | Quote-stripping regex | Done | W1-Config | `fix_wave_20260706_config_dedup.md` |
| P1-2 | Event dedup on ingest | `dedupeKey` + `seenKeys` Set | Done | W2-partial + W3-A | BLK-1 fixed; dedupe key correct |
| F-06 | `storageRpc` unwired | Remove from `ServerConfig` / `index.ts` | Done | W2-partial | Grep: no `storageRpc` in server config |
| F-15 | Chat SSE no disconnect abort | `clientClosed` flag on `req.close` | Done | W2-partial | `server.ts:292-297` |
| F-16 | Zero `modelDataRoot` placeholder | `resolveModelDataRoot()` from chain | Done | W2-partial | `routers/orchestrator.ts:19` |
| F-17 | `winRate` misleading metric | `buyRate` + deprecated `winRate` alias | Done | W2-partial + W3-D | `usePerformanceBatch.ts` `buyRate: 0` |

---

## Medium

| ID | Finding | Microchange | Status | Agent | Evidence |
|----|---------|-------------|--------|-------|----------|
| M-1 | `clear()` doesn't persist | `persist()` after clear | Done | W1-Store | `fix_wave_20260706_store.md` |
| M-12 | `removeFromIndex` empty Map leak | Delete key when bucket length 0 | Done | W3-A | `fix_wave_20260706_w3a_store.md` |
| M-22 | Persist path CWD-relative | `AXIOM_DATA_DIR` env override | Done | W3-A | `fix_wave_20260706_w3a_store.md` |
| M7 | Provider cache chain-agnostic | Per-chainId `Map` cache | Done | W3-B | `fix_wave_20260706_w3b_compute.md` |
| M8 | Provider discovery race | Per-chain promise Map | Done | W3-B | `fix_wave_20260706_w3b_compute.md` |
| M9 | Broker caches unbounded | `clearBrokerCache()` + hook in invalidate | Done | W3-B | `fix_wave_20260706_w3b_compute.md` |
| M2 | `MAX_WS_CLIENTS` duplicated | Import from `utils/constants.ts` | Done | W3-C | `fix_wave_20260706_w3c_server.md` |
| M3 | Inline error responses | `sendError` in 3 router sites | Done | W3-C | `fix_wave_20260706_w3c_server.md` |
| M5 | TTL cache duplicated | Extract `TTLCache<T>` util | Done | W3-C | `utils/cache.ts` created |
| M6 | `settleOnChain` ignores action | Log action + tokenId | Done | W3-E | `fix_wave_20260706_w3e_orchestrator_cli.md` |
| M10 | `parseRecommendation` no bounds | Finite + 0..1e18 amount guard | Done | W3-E | `fix_wave_20260706_w3e_orchestrator_cli.md` |
| M11 | Indexer re-buffer drops newest | `shift()` oldest + `push()` batch | Done | W3-D | `fix_wave_20260706_w3d_config_indexer.md` |
| M18 | `process.ts` duplicate err field | Already fixed (only `error` key) | Done | — | `process.ts:6-12` |
| H8 | `getEnvWithAlias` silent aliases | `console.warn` on deprecated alias | Done | W3-D | `fix_wave_20260706_w3d_config_indexer.md` |
| P2-2 | `createStaticProvider` shared | Extracted in broker | Done | W2-partial | `broker.ts:48` |
| P2-3 | Payment `sendAndWait` + `findParsedEvent` | Refactored processor | Done | W2-partial | `processor.ts:198` |
| P2-4 | Oracle `request<T>()` | Unified get/post | Done | W2-partial | `oracle/client.ts:120` |
| P2-5 | `buildOpenAIClient` | Extracted in router | Done | W2-partial | `router.ts` grep |
| P2-8 | Lazy vault contract | `getVaultContract` lazy | Done | W2-partial | `orchestrator/index.ts` |
| P3-8 | `GET /v1/routes` | Expose `REGISTERED_ROUTES` | Done | W2-partial | `server.ts:386` |

---

## Low / Cosmetic

| ID | Finding | Microchange | Status | Agent | Evidence |
|----|---------|-------------|--------|-------|----------|
| L1 | Hardcoded `transferTopic` in CLI | Import `TRANSFER_TOPIC` | Done | W3-E | Already present in `run-e2e.ts` |
| L4 | Provider dup in CLI | Use `getSharedProvider` | Done | W3-E | Already present in `run-e2e.ts` |
| L7 | Indexer sink no retry | Exponential backoff retries | Done | W3-D | `fix_wave_20260706_w3d_config_indexer.md` |
| L11 | Auth skips only `/health` | `publicPaths` param | Done | W3-D | `fix_wave_20260706_w3d_config_indexer.md` |
| L13 | Error truncation 64 chars | Increase to 128 | Done | W3-E | `fix_wave_20260706_w3e_orchestrator_cli.md` |
| F-17-FE | `NULL_METRICS` missing `buyRate` | Add `buyRate: 0` | Done | W3-D | `fix_wave_20260706_w3d_config_indexer.md` |

---

## Wave 4 Fixes (Done)

| ID | Finding | Agent | Evidence |
|----|---------|-------|----------|
| H1 | Model cache in `getClient` | W4-B | `fix_wave_20260706_w4b_orchestrator.md` |
| H2 | TEE best-effort try/catch | W4-B | same |
| H3 | chatId → `verifyTeeResponse` | W4-B | same |
| M21 | `Promise.allSettled` in runTick | W4-B | same |
| M13 | Oracle mint ZodError → 400 | W4-A | `fix_wave_20260706_w4a_oracle.md` |
| M14 | transfer schema to/nft required | W4-A | same |
| M23 | Remove redundant oracle validation | W4-A | same |
| M17 | HEX/ADDRESS regex dedup | W4-C | `fix_wave_20260706_w4c_config.md` |
| H3-config | StorageAdapter encryption param | W4-C | same |
| M6-config | Dynamic `getAddresses()` | W4-C | same |
| M15 | seenDataHashes cap | W4-C | same |
| L9, L10, L12, S3 | Config cosmetic/type cleanup | W4-C | same |
| F-19 | Bounded agent log scan | W4-D | `fix_wave_20260706_w4d_agents_health.md` |
| F-27 | Health ok requires oracle | W4-D | same |
| L5 | buildEip712Domain in tests | W4-D | same |
| P3-3 | Shallow copy vs structuredClone | W4-E | `fix_wave_20260706_w4e_store.md` |

---

## Phase 3 (W5/W6 Target — Final Clearance)

| ID | Finding | Status | Agent | Evidence |
|----|---------|--------|-------|----------|
| P3-1 | O(1) index removal on eviction | Done | W5-A | `fix_wave_20260706_w5a_store.md`; `store.ts` swap-with-last + `indexPositions` WeakMap |
| P3-2 | Owner index for `getTokenIdsByOwner` | Done | W5-A | `fix_wave_20260706_w5a_store.md`; `byTransferTo` index |
| P3-3 | Revisit `structuredClone` on append | Done | W4-E | `fix_wave_20260706_w4e_store.md` |
| P3-4 | Async persist | Done | W5-A | `fix_wave_20260706_w5a_store.md`; `persist.ts` + `enqueuePersist` chain |
| P3-5 | E2E `main()` decomposition | Done | W5-C | `fix_wave_20260706_w5c_e2e.md`; HTTP helpers in `cli/e2e/http.ts` |
| P3-6 | Split EventStore persist layer | Done | W5-A | `fix_wave_20260706_w5a_store.md`; `events/persist.ts` |
| P3-7 | Shared `fetchJson<T>` | Done | W5-C + W6-C | `utils/fetch-json.ts`; `run-e2e.ts`, `cli/e2e/http.ts`, `transfer.test.ts` |
| P1-10 | Wire `EventPayload` into `StoredEvent` | Done | W5-B | `fix_wave_20260706_w5b_payloads.md`; `StoredEventPayload` alias |

## W5 Follow-ups (Non-Phase-3)

| ID | Finding | Status | Agent | Evidence |
|----|---------|--------|-------|----------|
| W4-FU1 | `TransferValidityResult` → `OwnershipProofResultWithMeta` | Done | W5-D | `fix_wave_20260706_w5d_server.md`; `oracle/client.ts` |
| W4-FU2 | `sendError` in server.ts + performance.ts | Done | W5-D | `fix_wave_20260706_w5d_server.md` |
| S3-rename | `deriveRawPubkeyFromHex` + compat alias | Done | W5-E | `fix_wave_20260706_w5e_config_indexer.md` |
| L6 | Indexer reorg margin annotation | Done | W5-E | `fix_wave_20260706_w5e_config_indexer.md`; `REORG_SAFE_DEPTH` |
| L-11 | Use `DEFAULT_EVENT_LIMIT` in store cap default | Done | W6-C | `store.ts:2,96` — constructor default `DEFAULT_EVENT_LIMIT` |

---

## AUDIT STATUS: COMPLETE — 0 open items

All findings from `backend_analysis_final_report.md` and `implementation_plan_waves.md` are remediated across Waves 1–6. Zero Pending or Partial items remain in this manifest.

---

## W5 Agent Assignments

| Agent | Files | Tasks |
|-------|-------|-------|
| **W5-A** | `events/store.ts`, `events/persist.ts` (new) | P3-1, P3-2, P3-4, P3-6 |
| **W5-B** | `events/store.ts` (types only), `events/payloads.ts` | P1-10 |
| **W5-C** | `utils/fetch-json.ts` (new), `cli/e2e/http.ts` (new), `cli/run-e2e.ts` | P3-7, P3-5 (extract http helpers) |
| **W5-D** | `server.ts`, `routers/performance.ts`, `oracle/client.ts` | W4-FU1, W4-FU2 |
| **W5-E** | `packages/config/.../secp256k1.ts`, `index.ts`, `apps/indexer/.../watcher.ts` | S3-rename, L6 |

**Note:** W5-A and W5-B both touch store.ts — sequence: W5-B types first OR W5-A avoids type changes. Split: W5-B only touches payloads.ts + store.ts type line; W5-A does logic in store.ts + persist.ts. Agent B should only add type imports and `StoredEvent.payload` type alias; Agent A does indexes/persist.

---

## W4 Agent Assignments (Disjoint File Ownership)

| Agent | Files (exclusive) | Tasks |
|-------|-------------------|-------|
| **W4-A** | `apps/oracle/src/server.ts`, `route-schemas.ts` | M13, M14, M23 |
| **W4-B** | `apps/backend/src/orchestrator/index.ts`, `compute/router.ts` | H1, H2, H3, M21 |
| **W4-C** | `packages/config/src/types/hex.ts`, `types/schemas.ts`, `addresses.ts`, `storage/0g.ts`, `crypto/ecies.ts`, `eip712.ts`, `crypto/secp256k1.ts` | M17, H3-config, M6-config, L9, L10, L12, S3, M15 |
| **W4-D** | `apps/backend/src/routers/agents.ts`, `routers/health.ts`, `server/transfer.test.ts` | F-19, F-27, L5 (test site) |
| **W4-E** | `apps/backend/src/events/store.ts` | P3-3 (avoid structuredClone when safe) |

---

## W3 Agent Assignments (Disjoint File Ownership)

| Agent | Files (exclusive) | Tasks |
|-------|-------------------|-------|
| **W3-A** | `apps/backend/src/events/store.ts` | BLK-1, M-12, M-22 |
| **W3-B** | `apps/backend/src/compute/broker.ts`, `provider-discovery.ts` | M7, M8, M9 |
| **W3-C** | `apps/backend/src/server.ts`, `utils/cache.ts` (new), `routers/agents.ts`, `routers/orchestrator.ts`, `routers/route-factory.ts`, `routers/health.ts` | M2, M3, M5 |
| **W3-D** | `packages/config/src/env.ts`, `middleware/auth.ts`, `apps/indexer/src/sink.ts`, `apps/indexer/src/index.ts`, `apps/frontend/src/hooks/usePerformanceBatch.ts` | H8, L11, L7, M11, F-17-FE |
| **W3-E** | `apps/backend/src/orchestrator/index.ts`, `apps/backend/src/cli/run-e2e.ts` | M6, M10, L1, L4, L13 |

---

## Verification Protocol (per wave)

```bash
pnpm --filter @axiom/config build
pnpm --filter @axiom/backend typecheck
pnpm --filter @axiom/backend test
```

---

*Manifest maintained by Fixing Orchestrator. Agents update Status + Evidence on completion.*