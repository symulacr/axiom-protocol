# Fix Wave — Agent W5-D (Server, Performance, Oracle Client)

**Date:** 2026-07-06  
**Scope:** `apps/backend/src/server.ts`, `routers/performance.ts`, `oracle/client.ts`  
**Audit refs:** W4-FU1, W4-FU2 (`fix_manifest.md` W5-D)

## Fixes Applied

### 1. W4-FU2 — `sendError` in `server.ts`

Imported `sendError` from `utils/response.js` and replaced all simple error-only inline responses.

| Location | Before | After |
|----------|--------|-------|
| `/v1/agents/:id/earnings` — missing AgentNFT | `res.status(500).json({ error: "AgentNFT address not configured" })` | `sendError(res, 500, "AgentNFT address not configured")` |
| `/v1/agents/:id/earnings` — no creator | `res.status(404).json({ error: "Agent creator not registered for token" })` | `sendError(res, 404, "Agent creator not registered for token")` |
| `/v1/agents/:id/metadata` — missing AgentNFT | `res.status(500).json({ error: "AgentNFT address not configured" })` | `sendError(res, 500, "AgentNFT address not configured")` |
| `/v1/agents/:id/metadata` — invalid body | `res.status(400).json({ error: "Missing or invalid datas array" })` | `sendError(res, 400, "Missing or invalid datas array")` |

**Retained as-is** (complex error objects with `code` / `details`):
- `/v1/compute/providers` upstream 502 (`code: "UPSTREAM_ERROR"`)
- Global error handler: Zod validation (`code: "VALIDATION_ERROR"`, `details`), HTTP status errors (`code: "HTTP_${status}"`), oracle upstream (`code: "UPSTREAM_ERROR"`), internal (`code: "INTERNAL_ERROR"`)

---

### 2. W4-FU2 — `sendError` in `performance.ts` batch route

**Before:**
```typescript
res.status(400).json({ error: "Maximum 50 agents per batch request" });
```

**After:**
```typescript
sendError(res, 400, "Maximum 50 agents per batch request");
```

---

### 3. W4-FU1 — `TransferValidityResult` extends `OwnershipProofResultWithMeta`

**Before** (`oracle/client.ts`):
```typescript
import { type OwnershipProofResult } from "@axiom/config";

export interface TransferValidityResult extends OwnershipProofResult {
  validUntil?: string;
}
```

**After:**
```typescript
import {
  type OwnershipProofResult,
  type OwnershipProofResultWithMeta,
} from "@axiom/config";

export interface TransferValidityResult extends OwnershipProofResultWithMeta {
  validUntil?: string;
}
```

`TransferValidityResult` now inherits optional `accessProofNonce`, `ownershipProofNonce`, and `signer` from `@axiom/config` (added in W4-C), while keeping the oracle-specific `validUntil` deadline field.

## Behavior Notes

- **No breaking changes** for API consumers: `sendError` emits the same `{ error: string }` JSON shape.
- Transfer-validity callers can now type-narrow on nonce/signer meta without casting.
- Remaining inline error responses in `server.ts` are intentionally complex (include `code` or `details`).

## Verification

```bash
pnpm --filter @axiom/backend typecheck  # pre-existing errors in cli/run-e2e.ts (out of scope)
pnpm --filter @axiom/backend test       # pass — 7/7
```