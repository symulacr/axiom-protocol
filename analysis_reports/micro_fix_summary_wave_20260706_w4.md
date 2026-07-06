# Micro-Fix Summary — Wave 4 (2026-07-06)

**Orchestrator:** Fixing Orchestrator  
**Agents:** W4-A (Oracle), W4-B (Orchestrator), W4-C (Config), W4-D (Agents/Health), W4-E (EventStore)  
**Manifest:** `analysis_reports/fix_manifest.md`

---

## Issues Fixed (22 items)

### High (4)

| ID | Issue | Agent |
|----|-------|-------|
| H1 | Model param ignored after first `getClient` call | W4-B |
| H2 | TEE verification throws despite best-effort doc | W4-B |
| H3 | chatId not passed to `verifyTeeResponse` | W4-B |
| H3-config | `StorageAdapter.upload` missing encryption param | W4-C |

### Medium (11)

| ID | Issue | Agent |
|----|-------|-------|
| M13 | Oracle mint returns 500 on ZodError | W4-A |
| M14 | transfer-validity `to`/`nft` optional in schema | W4-A |
| M23 | Oracle double-validates after Zod | W4-A |
| M21 | `Promise.all` loses partial tick results | W4-B |
| M17 | Duplicate regex in schemas vs hex.ts | W4-C |
| M6-config | `getAddresses` hardcoded keys | W4-C |
| M15 | `seenDataHashes` unbounded growth | W4-C |
| F-19 | Agent listing `fromBlock: 0` unbounded scan | W4-D |
| F-27 | Health `ok: true` when oracle down | W4-D |
| P3-3 | `structuredClone` on every append | W4-E |

### Low / Cosmetic (7)

| ID | Issue | Agent |
|----|-------|-------|
| L5 | EIP-712 domain dup in transfer.test | W4-D |
| L9 | `toViemHex` unnecessary double cast | W4-C |
| L10 | ecies hex round-trip | W4-C |
| L12 | OwnershipProofResult all-optional meta | W4-C |
| S3 | `export *` from crypto in config index | W4-C |

---

## Verification (Orchestrator)

```
pnpm --filter @axiom/config build      ✅
pnpm --filter @axiom/backend typecheck ✅
pnpm --filter @axiom/backend test      ✅ 7/7
pnpm --filter @axiom/oracle typecheck  ✅
pnpm --filter @axiom/indexer typecheck ✅
```

---

## Before → After Highlights

| Area | Before | After |
|------|--------|-------|
| Orchestrator | Stale model client; TEE aborts tick; no chatId | Per-model client cache; TEE best-effort; chatId from headers |
| Oracle mint | ZodError → 500 | ZodError → 400 |
| Oracle transfer | Schema optional to/nft + manual re-check | Required in schema; redundant checks removed |
| Agent scan | Full chain history from block 0 | Last 50k blocks |
| Health | `ok` if chain only | `ok` requires chain + oracle |
| EventStore | `structuredClone` every append | Shallow copy (payload spread) |
| Config | Duplicated regex; unbounded hash set | Shared regex; 10k cap with eviction |

---

## Agent Reports

- `fix_wave_20260706_w4a_oracle.md`
- `fix_wave_20260706_w4b_orchestrator.md`
- `fix_wave_20260706_w4c_config.md`
- `fix_wave_20260706_w4d_agents_health.md`
- `fix_wave_20260706_w4e_store.md`

---

## Remaining (Wave 5+)

### Phase 3 (large)
- P3-1 O(1) index removal
- P3-2 Owner index
- P3-4 Async persist
- P3-5 E2E decomposition
- P3-6 EventStore layer split
- P3-7 `fetchJson<T>` helper
- P1-10 Full `EventPayload` ↔ `StoredEvent` bridge

### Follow-ups noted by agents
- `apps/backend/src/oracle/client.ts` → `OwnershipProofResultWithMeta` for nonce/signer fields
- Full `sendError` rollout across `server.ts` inline errors
- S3 secp256k1 rename (`deriveRawPubkeyFromHex`)
- Indexer reorg handling (L6)
- H7 `loadEnv` hardcoded fallback removal (if applicable to current env.ts)

---

*Wave 4 complete.*