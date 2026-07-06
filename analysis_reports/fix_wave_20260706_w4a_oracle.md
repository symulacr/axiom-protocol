# Fix Wave — Agent W4-A (Oracle)

**Date:** 2026-07-06  
**Scope:** `apps/oracle/src/server.ts`, `apps/oracle/src/route-schemas.ts`  
**Audit refs:** M13, M14, M23 (`fix_manifest.md` W4-A)

## Fixes Applied

### 1. M14 — `transferValiditySchema`: require `to` and `nft`

**Before** (`route-schemas.ts`):
```typescript
  to: addressViem.optional(),
  nft: addressViem.optional(),
```

**After:**
```typescript
  to: addressViem,
  nft: addressViem,
```

Schema now matches handler requirements; missing or invalid addresses fail at Zod parse with 400-style messages when caught upstream.

---

### 2. M23 — Remove redundant `to`/`nft` manual checks in transfer-validity

**Before** (`server.ts` ~111-124):
```typescript
      if (!toIn || !isAddress(toIn)) {
        res.status(400).json({
          error:
            "'to' address is required and must be a valid non-zero address",
        });
        return;
      }
      if (!nftIn || !isAddress(nftIn)) {
        res.status(400).json({
          error:
            "'nft' address is required and must be a valid non-zero address",
        });
        return;
      }
```

**After:** *(removed — Zod `addressViem` enforces presence and format)*

**Retained checks** (not expressible in current Zod schema):
- `targetPubkey64.length === 130` (64-byte pubkey length)
- `oldDataEncryptionKey` presence (empty string guard) and 32-byte length after base64 decode

---

### 3. M13 — `/v1/agents/mint` ZodError → 400

**Before** (`server.ts`):
```typescript
  app.post("/v1/agents/mint", (req: Request, res: Response) => {
    const { dataHash } = mintDataHashSchema.parse(req.body);
    if (!/^0x[0-9a-fA-F]{64}$/.test(dataHash)) {
      ...
    }
    storage.markDataHashSeen(dataHash as `0x${string}`);
    res.json({ ok: true, dataHash, seen: true });
  });
```

**After:**
```typescript
  app.post("/v1/agents/mint", (req: Request, res: Response) => {
    try {
      const { dataHash } = mintDataHashSchema.parse(req.body);
      if (!/^0x[0-9a-fA-F]{64}$/.test(dataHash)) {
        ...
      }
      storage.markDataHashSeen(dataHash as `0x${string}`);
      res.json({ ok: true, dataHash, seen: true });
    } catch (err) {
      if (err instanceof ZodError) {
        res
          .status(400)
          .json({ error: err.issues[0]?.message ?? "Validation error" });
        return;
      }
      throw err;
    }
  });
```

`ZodError` import was already present at line 16; no new import required.

## Behavior Notes

- **No breaking changes** for valid clients: callers already supplied `to`/`nft`; schema now rejects absent fields earlier with consistent validation errors.
- Invalid mint payloads (missing/malformed `dataHash`) return **400** instead of bubbling to Express 500.
- `/v1/ownership` retains its manual `to`/`nft` checks (out of W4-A scope).

## Verification

```bash
pnpm --filter @axiom/oracle typecheck  # pass (exit 0)
```