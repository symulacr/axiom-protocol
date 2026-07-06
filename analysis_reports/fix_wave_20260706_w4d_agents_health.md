# Fix Wave — Agent W4-D (Agents, Health, Transfer Tests)

**Date:** 2026-07-06  
**Scope:** `apps/backend/src/routers/agents.ts`, `routers/health.ts`, `server/transfer.test.ts`  
**Audit refs:** F-19, F-27, L5 (`fix_manifest.md` W4-D)

## Fixes Applied

### 1. F-19 — Bounded agent Transfer log scan
**File:** `routers/agents.ts`

**Before:**
```typescript
const transferLogs = await provider.getLogs({
  address: nftAddr,
  fromBlock: 0,
  toBlock: "latest",
  topics: [TRANSFER_TOPIC, null, paddedOwner],
});
```

**After:**
```typescript
const AGENT_LOG_SCAN_BLOCKS = 50_000; // module-level const

const latest = await provider.getBlockNumber();
const fromBlock = Math.max(0, latest - AGENT_LOG_SCAN_BLOCKS);
const transferLogs = await provider.getLogs({
  address: nftAddr,
  fromBlock,
  toBlock: "latest",
  topics: [TRANSFER_TOPIC, null, paddedOwner],
});
```

Limits RPC `getLogs` range to the most recent 50k blocks instead of scanning from genesis.

### 2. F-27 — Health `ok` reflects chain AND oracle
**File:** `routers/health.ts`

**Before:**
```typescript
const healthy = chainHead > 0;
res.status(healthy ? 200 : 503).json({
  ok: healthy,
  // ...
  oracle: oracleHealth?.ok === true ? "up" : "down",
});
```

**After:**
```typescript
const healthy = chainHead > 0;
const ok = healthy && oracleHealth?.ok === true;
res.status(ok ? 200 : 503).json({
  ok,
  // ...
  oracle: oracleHealth?.ok === true ? "up" : "down",
});
```

HTTP 200 is returned only when both chain head is positive and the oracle health check succeeds. The `oracle` field remains `"up"` / `"down"` string.

### 3. L5 — `buildEip712Domain` in transfer tests
**File:** `server/transfer.test.ts`

**Before (2 sites):**
```typescript
const testDomain: Eip712Domain = {
  chainId: 16602n,
  verifyingContract: MOCK_ADDRESSES.verifier,
};
```

**After:**
```typescript
import { buildEip712Domain, GALILEO_CHAIN_ID, ... } from "@axiom/config";

const testDomain = buildEip712Domain(GALILEO_CHAIN_ID, MOCK_ADDRESSES.verifier);
```

Aligns test EIP-712 domain construction with `server.ts` and `run-e2e.ts`, preventing drift from the canonical factory.

## Verification

```bash
pnpm --filter @axiom/backend typecheck  # PASS
pnpm --filter @axiom/backend test       # PASS (7/7)
```

## Evidence

| ID | Location |
|----|----------|
| F-19 | `agents.ts:13-14` (const), `agents.ts:70-75` (bounded scan) |
| F-27 | `health.ts:22-25` |
| L5 | `transfer.test.ts:11`, `transfer.test.ts:148`, `transfer.test.ts:300` |