# Fix Wave W3-B — Compute Cache (M7, M8, M9)

**Agent:** W3-B  
**Date:** 2026-07-06  
**Files:** `apps/backend/src/compute/broker.ts`, `apps/backend/src/compute/provider-discovery.ts`

---

## M7 — Chain-aware provider cache

**Finding:** Single global `_cachedProviders` / `_cacheTimestamp` ignored the `chainId` argument, so discoveries for different chains could return stale cross-chain data.

### Before (`provider-discovery.ts:39-42, 56-57, 69-70`)

```typescript
let _cachedProviders: ServiceInfo[] | null = null;
let _cachePromise: Promise<ServiceInfo[]> | null = null;
let _cacheTimestamp = 0;

// ...
if (_cachedProviders && Date.now() - _cacheTimestamp < CACHE_TTL_MS)
  return _cachedProviders;
// ...
_cachedProviders = mapped;
_cacheTimestamp = Date.now();
```

### After

```typescript
interface CacheEntry {
  providers: ServiceInfo[];
  timestamp: number;
}

const _cache = new Map<number, CacheEntry>();

// ...
const cid = resolveChainId(chainId);
const cached = _cache.get(cid);
if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS)
  return cached.providers;
// ...
_cache.set(cid, { providers: mapped, timestamp: Date.now() });
```

**Notes:** `resolveChainId(chainId)` from `broker.ts` defaults via `AXIOM_CHAIN_ID` env or `GALILEO_CHAIN_ID` (16602). In-flight dedup uses a per-chain `_cachePromises` map so concurrent requests for different chains do not share one promise.

---

## M8 — Race condition fix

**Finding:** Concurrent callers could both observe a null in-flight slot and spawn duplicate RPC fetches.

### Before (`provider-discovery.ts:58-60`)

```typescript
if (_cachePromise) return _cachePromise;

_cachePromise = (async (): Promise<ServiceInfo[]> => {
```

### After

```typescript
const inflight = _cachePromises.get(cid);
if (inflight) return inflight;

const promise = (async (): Promise<ServiceInfo[]> => {
  // ... discovery body ...
})();
_cachePromises.set(cid, promise);
```

**Notes:** Promise object is created and registered in `_cachePromises` synchronously in the same tick (implementation_plan_waves.md pattern). Entry is cleared in `finally` after resolution so TTL cache serves subsequent hits.

---

## M9 — Broker cache eviction API

**Finding:** `_readOnlyCache` and `_brokerCache` in `broker.ts` grew without eviction; `invalidateProviderCache()` did not reset broker instances.

### Before (`broker.ts`)

No eviction API. `invalidateProviderCache()` only cleared provider-discovery globals:

```typescript
export function invalidateProviderCache(): void {
  _cachedProviders = null;
  _cachePromise = null;
  _cacheTimestamp = 0;
}
```

### After (`broker.ts`)

```typescript
export function clearBrokerCache(chainId?: number): void {
  if (chainId !== undefined) {
    _readOnlyCache.delete(chainId);
    _brokerCache.delete(chainId);
  } else {
    _readOnlyCache.clear();
    _brokerCache.clear();
  }
}
```

### After (`provider-discovery.ts`)

```typescript
export function invalidateProviderCache(): void {
  _cache.clear();
  _cachePromises.clear();
  clearBrokerCache();
}
```

**Notes:** `clearBrokerCache()` is exported for optional per-chain eviction; `invalidateProviderCache()` clears all chains (no breaking API change).

---

## Verification

```bash
pnpm --filter @axiom/backend typecheck
```

```
$ tsc --noEmit
```

**Result:** ✅ Exit code 0

---

## Summary

| ID  | Status | Change |
|-----|--------|--------|
| M7  | ✅ Done | Per-chainId `Map` cache keyed via `resolveChainId` |
| M8  | ✅ Done | Synchronous promise registration before async discovery |
| M9  | ✅ Done | `clearBrokerCache(chainId?)` + wired into `invalidateProviderCache()` |