# Fix Wave — Agent W4-B (Orchestrator + Router)

**Date:** 2026-07-06  
**Scope:** `apps/backend/src/orchestrator/index.ts`, `apps/backend/src/compute/router.ts`  
**Audit refs:** H1, H2, H3, M21 (Wave 1 Agent 2)

## Fixes Applied

### 1. H1 — Model cache invalidates on model change
**Before:** `getClient()` cached `this.openai` on first call; subsequent ticks with a different `computeModel` reused the stale client.  
**After:** Added `private openaiModel: string | undefined`; recreate client when `model` differs from cached value.

```typescript
if (this.openai && this.openaiModel === model) return this.openai;
this.openai = await createRouterClient(model);
this.openaiModel = model;
```

### 2. H2 — TEE verification best-effort in `runTick`
**Before:** `verifyTeeAsync` throws propagated and aborted the tick (contradicted `tee-verifier.ts` docstring).  
**After:** Wrapped call in `try/catch`; logs `warn` and continues tick on failure.

### 3. H3 — chatId plumbing for TEE verification
**Before:** `verifyTeeResponse` called without `chatId`; router had no WeakMap export.  
**After:**
- `router.ts`: exported `clientChatIdMap` + `setClientChatId(client, chatId)`
- `runInference`: after completions (stream + non-stream via `.withResponse()`), captures `x-chat-id` / `chat-id` from response headers
- `verifyTeeAsync`: passes `clientChatIdMap.get(this.openai)` as 5th arg to `verifyTeeResponse`

### 4. M21 — `Promise.allSettled` preserves partial tick results
**Before:** `Promise.all` — any on-chain or storage failure discarded inference result.  
**After:** `Promise.allSettled` with per-field handling:
- Inference failure → still throws (tick cannot proceed without model output)
- On-chain failure → `{ vaultBalance: 0n, recentEvents: [] }`
- Storage failure → `{ rootHash: strategy.modelDataRoot, size: 0 }`

## Verification

```bash
pnpm --filter @axiom/backend typecheck   # pass
pnpm --filter @axiom/backend test        # 7/7 pass
```

## Files Changed

| File | Changes |
|------|---------|
| `compute/router.ts` | `clientChatIdMap`, `setClientChatId` |
| `orchestrator/index.ts` | H1 model cache, H2 TEE try/catch, H3 chatId capture + pass-through, M21 allSettled |

## Manifest Status Updates

| ID | Status |
|----|--------|
| H1 | Done |
| H2 | Done |
| H3 | Done |
| M21 | Done |