# Duplication & Pattern Analysis — Backend Compute / Orchestrator Partition

**Agent:** Sub-Agent 1 (Duplication & Pattern)  
**Date:** 2026-07-05  
**Scope:** 9 assigned files only (line-by-line read + targeted grep)

---

## 1. Executive Summary

Across the 9 assigned files (~1,450 LOC), **28 duplication/pattern findings** were identified:

| Category | Count | Severity |
|----------|-------|----------|
| Exact / near-exact copy-paste | 6 | High |
| Near-duplicate functions | 4 | High |
| Duplicated logic blocks | 8 | Medium–High |
| Repeated boilerplate patterns | 7 | Medium |
| Semantic duplication (same intent, different surface) | 3 | High |

**Highest-impact clusters:**

1. **Provider discovery via `getReadOnlyBroker` + `listService()`** is reimplemented in 4 places (`provider-discovery.ts`, `router.ts` ×2, `orchestrator/index.ts`) instead of routing through one helper.
2. **`JsonRpcProvider` construction** is duplicated 3 ways (`broker.ts`, `router.ts`, `orchestrator/index.ts`) with inconsistent timeout/static-network handling.
3. **Wayback CDX fetch pipeline** is copy-pasted between `lookupSnapshots` and `lookupAccountTweets`.
4. **Event-log parsing** in `payment/processor.ts` and `orchestrator/index.ts` follows the same topic-find → `parseLog` recipe twice each.
5. **Chain-id defaulting** is split: `broker.resolveChainId()` vs inline `config.chainId ?? GALILEO_CHAIN_ID` in orchestrator.

Most duplication is **maintainable today** because files are small, but several paths (TEE verification, Direct-mode provider resolution) create **semantic drift risk** — the same chain query can return different providers depending on which copy runs.

---

## 2. Partition Scope

Files analyzed (and only these):

| # | File | LOC | Role |
|---|------|-----|------|
| 1 | `apps/backend/src/compute/broker.ts` | 158 | Shared SDK broker factory, chain/RPC resolution, auto-funding |
| 2 | `apps/backend/src/compute/provider-discovery.ts` | 73 | Cached provider list discovery |
| 3 | `apps/backend/src/compute/router.ts` | 172 | OpenAI client factory (Direct + Router modes) |
| 4 | `apps/backend/src/compute/tee-verifier.ts` | 56 | TEE `processResponse` wrapper |
| 5 | `apps/backend/src/orchestrator/index.ts` | 446 | Strategy tick runner |
| 6 | `apps/backend/src/orchestrator/orchestrator-chainid.test.ts` | 94 | ChainId wiring tests |
| 7 | `apps/backend/src/oracle/client.ts` | 148 | Oracle HTTP client |
| 8 | `apps/backend/src/payment/processor.ts` | 234 | Payment processor contract wrapper |
| 9 | `apps/backend/src/services/wayback.ts` | 133 | Wayback Machine CDX service |

**Out of scope:** All other backend files (e.g. `server.ts`, routers).

---

## 3. Detailed Findings

### 3.1 Exact Copy-Paste

---

#### F-01: Wayback CDX fetch-and-parse block (exact duplicate)

**Files:** `services/wayback.ts`

**Snippet A** (`lookupSnapshots`, lines 50–55):
```ts
try {
  const resp = await fetch(cdxUrl, { signal: AbortSignal.timeout(20_000) });
  if (!resp.ok) throw new Error(`CDX returned ${resp.status}`);
  const rows = (await resp.json()) as string[][];
  if (!Array.isArray(rows) || rows.length < 2) return [];
  return rows.slice(1).map((row) => normalizeCdxRow(url, row));
```

**Snippet B** (`lookupAccountTweets`, lines 74–79):
```ts
try {
  const resp = await fetch(cdxUrl, { signal: AbortSignal.timeout(20_000) });
  if (!resp.ok) throw new Error(`CDX returned ${resp.status}`);
  const rows = (await resp.json()) as string[][];
  if (!Array.isArray(rows) || rows.length < 2) return [];
  return rows.slice(1).map((row) => normalizeCdxRow(baseUrl, row));
```

**Why duplication:** Identical fetch, timeout, status check, JSON parse, header-row skip, and map — only `cdxUrl` and the `normalizeCdxRow` URL argument differ.

**Impact:** Bug fixes (timeout, CDX response shape, error messages) must be applied twice. High copy-paste drift risk.

**Microchange:** Extract `fetchCdxRows(cdxUrl): Promise<string[][]>` and reuse in both callers.

---

#### F-02: Wayback timestamp → ISO string conversion (exact duplicate)

**Files:** `services/wayback.ts`

**Snippet A** (`normalizeCdxRow`, lines 31–34):
```ts
iso: timestamp
  ? new Date(
      `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}T${timestamp.slice(8, 10)}:${timestamp.slice(10, 12)}:${timestamp.slice(12, 14)}Z`,
    ).toISOString()
  : "",
```

**Snippet B** (`closestSnapshot`, lines 124–126):
```ts
iso: new Date(
  `${closest.timestamp.slice(0, 4)}-${closest.timestamp.slice(4, 6)}-${closest.timestamp.slice(6, 8)}T${closest.timestamp.slice(8, 10)}:${closest.timestamp.slice(10, 12)}:${closest.timestamp.slice(12, 14)}Z`,
).toISOString(),
```

**Why duplication:** Same 14-char Wayback timestamp parsing logic inlined twice.

**Impact:** If timestamp format handling changes (e.g. timezone, sub-second), two sites must update.

**Microchange:** Extract `waybackTimestampToIso(ts: string): string`.

---

#### F-03: Zero-hash sentinel check (exact duplicate)

**Files:** `orchestrator/index.ts`

**Snippet A** (`runTick`, line 129):
```ts
strategy.modelDataRoot === "0x" + "0".repeat(64)
```

**Snippet B** (`fetchStoragePeek`, line 431):
```ts
if (strategy.modelDataRoot === "0x" + "0".repeat(64)) {
```

**Why duplication:** Same magic zero-hash expression computed inline in two methods.

**Impact:** If the sentinel changes (e.g. shared constant from config), both call sites must be found manually.

**Microchange:** `const ZERO_ROOT = "0x" + "0".repeat(64) as const` or import from shared constants.

---

#### F-04: `fetchOnchainState` empty-state return (triplicate)

**Files:** `orchestrator/index.ts`

**Lines 372, 381, 393** — identical return:
```ts
return { vaultBalance: 0n, recentEvents: [] };
```

**Why duplication:** Three early-exit guard clauses return the exact same object literal.

**Impact:** If the empty-state shape changes (new fields on `TickResult["onchain"]`), three edits required.

**Microchange:** `const EMPTY_ONCHAIN = { vaultBalance: 0n, recentEvents: [] } as const` or local helper `emptyOnchain()`.

---

#### F-05: OpenAI client construction options (near-exact duplicate)

**Files:** `compute/router.ts`

**Snippet A** (Direct mode, lines 125–130):
```ts
return new OpenAI({
  baseURL: `${providerUrl.url}/v1/proxy`,
  apiKey: directKey,
  timeout,
  maxRetries: 2,
});
```

**Snippet B** (Router mode, lines 140–145):
```ts
return new OpenAI({
  baseURL: getComputeBaseUrl(),
  apiKey: routerKey,
  timeout,
  maxRetries: 2,
});
```

**Why duplication:** Same constructor shape; only `baseURL` and `apiKey` differ.

**Impact:** Retry/timeout policy changes need two edits.

**Microchange:** `function buildOpenAIClient(baseURL: string, apiKey: string, timeout: number): OpenAI`.

---

#### F-06: Test wallet hex literal (exact duplicate pattern)

**Files:** `orchestrator/orchestrator-chainid.test.ts`

**Line 43:**
```ts
return new Wallet("0x" + "11".repeat(32));
```

**Also in assigned scope:** Same `"0x" + repeat(32)` pattern as orchestrator zero-hash (`"0x" + "0".repeat(64)`). Not cross-file copy-paste, but identical string-building idiom.

**Why note:** Repeated magic hex construction pattern across test + production code in partition.

**Impact:** Low within test file; pattern consistency opportunity.

**Microchange:** Shared test fixture `TEST_PRIVATE_KEY` constant.

---

### 3.2 Near-Duplicate Functions

---

#### F-07: `resolveProviderUrl` vs `resolveProviderUrlFromKey` (same broker pipeline)

**Files:** `compute/router.ts`

**`resolveProviderUrl`** (lines 73–76):
```ts
const rpcUrl = resolveEvmRpc();
const broker = await getReadOnlyBroker(rpcUrl);
const services = await broker.listService();
```

**`resolveProviderUrlFromKey`** (lines 163–164):
```ts
const broker = await getReadOnlyBroker(resolveEvmRpc());
const services = await broker.listService();
```

**Why duplication:** Both functions start with identical broker acquisition and `listService()` call; divergence is only in how they pick from `services` (address match vs `services[0]`).

**Impact:** RPC/chainId handling changes must be mirrored. `resolveProviderUrlFromKey` silently uses first provider — divergent selection logic on same data source.

**Microchange:** `async function listOnChainServices(): Promise<Service[]>` shared private helper; selection logic stays in callers.

---

#### F-08: `discoverProviders` vs orchestrator `verifyTeeAsync` provider lookup

**Files:** `compute/provider-discovery.ts` vs `orchestrator/index.ts`

**provider-discovery** (lines 40–47):
```ts
const broker = await getReadOnlyBroker(rpcUrl, chainId);
const services = await broker.listService();
const mapped: ServiceInfo[] = services.map(
  (s: { provider?: string; model?: string }) => ({
    provider: s.provider ?? "",
    model: s.model ?? "unknown",
  }),
);
```

**orchestrator `verifyTeeAsync`** (lines 281–283):
```ts
const broker = await getReadOnlyBroker(this.evmRpc, this.chainId);
const services = await broker.listService();
providerAddress = services[0]?.provider;
```

**Why duplication:** Same on-chain query; orchestrator bypasses `discoverProviders()` cache and mapping, reimplements discovery inline, then takes first provider only.

**Impact:** **High semantic risk** — TEE verification may target a different provider than Direct-mode routing (`resolveProviderUrl` matches by address) or API discovery (`discoverProviders` returns full list). Cache TTL in `provider-discovery` is also bypassed.

**Microchange:** Orchestrator should call `discoverProviders(this.evmRpc, this.chainId)` or a shared `getPrimaryProvider()` with documented selection rules.

---

#### F-09: `parsePaymentProcessed` vs `withdrawEarnings` event extraction

**Files:** `payment/processor.ts`

**`withdrawEarnings`** (lines 135–145):
```ts
const topic = this.payment.iface.getEvent("EarningsWithdrawn")?.topicHash;
const log = topic
  ? receipt.logs.find((l: Log | EventLog) => l.topics[0] === topic)
  : undefined;
// ...
const parsed = this.payment.iface.parseLog(
  log as unknown as { topics: string[]; data: string },
);
amount = (parsed?.args.amount as bigint) ?? null;
```

**`parsePaymentProcessed`** (lines 207–214):
```ts
const topic = this.payment.iface.getEvent("PaymentProcessed")?.topicHash;
const log = topic
  ? receipt.logs.find((l: Log | EventLog) => l.topics[0] === topic)
  : undefined;
// ...
const parsed = this.payment.iface.parseLog(
  log as unknown as { topics: string[]; data: string },
);
```

**Why duplication:** Identical event-log lookup recipe; only event name and extracted fields differ.

**Impact:** Cast workaround (`as unknown as { topics... }`) duplicated; log-parsing bug fixes need two edits.

**Microchange:** `private findParsedEvent(receipt, eventName): ParsedLog | null` on `PaymentProcessorClient`.

---

#### F-10: Oracle `get<T>` vs `post<T>` HTTP helpers

**Files:** `oracle/client.ts`

**`get`** (lines 120–127):
```ts
const timeout = this.config.timeoutMs ?? ORACLE_TIMEOUT_MS;
const res = await fetch(`${this.baseUrl}${path}`, {
  headers: this.headers(),
  signal: AbortSignal.timeout(timeout),
});
if (!res.ok) throw new Error(`Oracle ${path} returned ${res.status}`);
return (await res.json()) as T;
```

**`post`** (lines 130–145):
```ts
const timeout = this.config.timeoutMs ?? ORACLE_TIMEOUT_MS;
// ... method POST, headers with Content-Type, body ...
const res = await fetch(`${this.baseUrl}${path}`, { ... });
if (!res.ok) { const text = await res.text(); throw new Error(...); }
return (await res.json()) as T;
```

**Why duplication:** Shared timeout resolution, base URL join, abort signal, ok-check, JSON parse — classic near-duplicate HTTP client methods.

**Impact:** Timeout/error-handling policy drift between GET and POST (POST includes body snippet; GET does not).

**Microchange:** `private async request<T>(method, path, body?): Promise<T>`.

---

### 3.3 Duplicated Logic Blocks

---

#### F-11: `JsonRpcProvider` + `staticNetwork: true` construction (3 variants)

**Files:** `broker.ts`, `router.ts`, `orchestrator/index.ts`

| Location | Lines | Variant |
|----------|-------|---------|
| `broker.ts` `createProviderAndSigner` | 55–57 | `new JsonRpcProvider(config.evmRpc, chainId, { staticNetwork: true })` |
| `router.ts` `createRouterClient` | 119–121 | `new JsonRpcProvider(resolveEvmRpc(), resolveChainId(), { staticNetwork: true })` |
| `orchestrator/index.ts` constructor | 88–92 | `new JsonRpcProvider(fetchReq, chainId, { staticNetwork: true })` + **10s FetchRequest timeout** |

**Why duplication:** Three independent provider constructors for the same chain; orchestrator adds `FetchRequest` timeout that broker/router lack.

**Impact:** RPC timeout behavior inconsistent across modules. Chain-id source differs (`resolveChainId()` vs `config.chainId ?? GALILEO_CHAIN_ID`).

**Microchange:** Route all provider creation through `broker.createProviderAndSigner` or a shared `createStaticProvider(rpc, chainId, opts?)`.

---

#### F-12: `signer.connect(provider) as Wallet` (duplicate)

**Files:** `broker.ts:58`, `router.ts:122`

```ts
// broker.ts
return { provider, signer: config.signer.connect(provider) as Wallet };

// router.ts
const signer = opts.signer.connect(provider) as Wallet;
```

**Why duplication:** Same ethers v6 wallet-connection idiom in two compute modules.

**Impact:** If connection semantics change (e.g. nonce manager), two sites.

**Microchange:** Use `createProviderAndSigner` from `router.ts` Direct path.

---

#### F-13: Lazy `Map<number, T>` broker cache (structural duplicate)

**Files:** `broker.ts`

**Read-only cache** (lines 63–75):
```ts
const _readOnlyCache = new Map<number, ReadOnlyInferenceBroker>();
// get → if cached return → create → set → return
```

**Authenticated cache** (lines 80–92):
```ts
const _brokerCache = new Map<number, ZGComputeNetworkBroker>();
// identical get-or-create structure
```

**Why duplication:** Same cache-aside pattern copy-pasted for two broker types.

**Impact:** Low today (intentional symmetry); invalidation/eviction logic would need duplicating.

**Microchange:** Generic `getOrCreateCached<K,V>(map, key, factory)` helper (optional).

---

#### F-14: Two-layer provider caching (semantic overlap)

**Files:** `broker.ts` + `provider-discovery.ts`

- **Layer 1:** `getReadOnlyBroker` caches SDK broker per `chainId` (no TTL, lines 63–75).
- **Layer 2:** `discoverProviders` caches mapped `ServiceInfo[]` with 5-min TTL + in-flight promise dedup (lines 18–51).

**Why duplication:** Both layers wrap the same underlying `listService()` RPC; callers in `router.ts` and `orchestrator/index.ts` hit layer 1 only and re-fetch services every call.

**Impact:** Inconsistent cache behavior — `discoverProviders` is stale-tolerant; direct `listService()` paths are not. Extra RPC load on hot paths (TEE verify, URL resolve).

**Microchange:** Single `listServicesCached(chainId, rpcUrl)` owning TTL + broker cache.

---

#### F-15: `try/catch` + `extractErrorMessage` + degraded return (5 instances)

**Files:** compute partition

| File | Lines | On error |
|------|-------|----------|
| `broker.ts` `ensureProviderFunded` | 134–139 | `log.warn` → `return false` |
| `broker.ts` `stopAutoFunding` | 152–155 | `log.warn` → void |
| `tee-verifier.ts` | 48–53 | `log.warn` → `return null` |
| `provider-discovery.ts` | 56–61 | `log.warn` → `return []` |
| `router.ts` `resolveProviderUrl` | 82–87 | `log.warn` → `return null` |

**Pattern:**
```ts
} catch (err) {
  log.warn("<context>", { error: extractErrorMessage(err), ... });
  return <fallback>;
}
```

**Why duplication:** Identical best-effort error-downgrade recipe across compute stack.

**Impact:** Inconsistent fallback types (`false` / `null` / `[]`); logging context strings differ but structure is uniform.

**Microchange:** `withComputeGuard<T>(label, fn, fallback)` utility (optional; keep typed fallbacks).

---

#### F-16: Wayback error re-wrap pattern (triplicate)

**Files:** `services/wayback.ts`

**Lines 57–59, 81–83, 98–100:**
```ts
} catch (err) {
  throw new Error(
    `Wayback <operation> failed: ${extractErrorMessage(err)}`,
  );
}
```

**Why duplication:** Same catch-and-rethrow with operation-specific prefix in three exported functions.

**Impact:** `confirmArchived` wraps errors from `lookupSnapshots` again — potential double-wrapping (`Wayback confirm failed: Wayback lookup failed: ...`).

**Microchange:** Let `lookupSnapshots` throw domain errors; `confirmArchived` catches only if adding context.

---

#### F-17: `payForAgent` / `payComputeProvider` / `withdrawEarnings` write flow

**Files:** `payment/processor.ts`

**Repeated block:**
```ts
const tx = await this.payment.contract.<method>(...);
const receipt = (await tx.wait()) as ContractTransactionReceipt;
```

**Lines:** 103–104, 122–123, 134–135

**Why duplication:** Same submit-and-wait-for-receipt pattern for every write method.

**Impact:** Confirmation count, receipt typing, or retry logic would need 3+ edits.

**Microchange:** `private async sendAndWait(txPromise): Promise<ContractTransactionReceipt>`.

---

#### F-18: Vault `TypedContract` instantiation (duplicate)

**Files:** `orchestrator/index.ts`

**`settleOnChain`** (lines 230–234):
```ts
const vaultTc = new TypedContract<StrategyVaultMethods>(
  vaultAddr,
  VAULT_ABI,
  this.signer,
);
```

**`fetchOnchainState`** (lines 374–378):
```ts
const vaultTc = new TypedContract<StrategyVaultMethods>(
  vaultAddr,
  VAULT_ABI,
  this.provider,
);
```

**Why duplication:** Same contract type + ABI bound to different ethers signers/providers on every call (not cached).

**Impact:** ABI/address changes need two edits; per-tick double instantiation.

**Microchange:** Lazy `private getVaultContract(mode: 'read' | 'write')` field on `StrategyRunner`.

---

### 3.4 Repeated Patterns / Boilerplate

---

#### F-19: `createLogger` + module-level `const log` (5 files)

| File | Line | Logger name |
|------|------|-------------|
| `broker.ts` | 25 | `"compute-broker"` |
| `provider-discovery.ts` | 11 | `"compute"` |
| `router.ts` | 61 | `"compute"` |
| `tee-verifier.ts` | 14 | `"tee-verifier"` |
| `orchestrator/index.ts` | 23 | `"orchestrator"` |

**Collision:** `provider-discovery.ts` and `router.ts` both use `createLogger("compute")` — log lines from both modules appear under the same label.

**Impact:** Debugging ambiguity in production logs.

**Microchange:** Rename to `"provider-discovery"` and `"compute-router"`.

---

#### F-20: `extractErrorMessage` import + usage (6 files, 15 call sites)

**Import sites:** `broker.ts:23`, `provider-discovery.ts:9`, `router.ts:11`, `tee-verifier.ts:12`, `orchestrator/index.ts:21`, `wayback.ts:16`

**Notable double-call** — `orchestrator/index.ts:286-289`:
```ts
log.info("TEE verification: provider discovery failed", {
  error: extractErrorMessage(err),
});
throw new Error(
  `TEE verification: provider discovery failed: ${extractErrorMessage(err)}`,
);
```

**Why duplication:** Same error string extracted twice in one catch block.

**Impact:** Minor perf/noise; if `extractErrorMessage` ever becomes expensive, redundant.

**Microchange:** `const msg = extractErrorMessage(err)` once in catch.

---

#### F-21: “Local contract types” comment + `TypedContract` pattern (2 files)

**`orchestrator/index.ts:24-34`:**
```ts
// Local contract types (avoid shared contract-types.ts drift).
type StrategyVaultMethods = { ... };
```

**`payment/processor.ts:12-39`:**
```ts
// Local contract method types derived from the ABIs above (avoid shared contract-types.ts drift).
type PaymentProcessorMethods = { ... };
type ERC20Methods = { ... };
```

**Why duplication:** Same architectural workaround documented and applied independently.

**Impact:** Intentional drift-avoidance, but method typings may diverge from ABIs separately.

**Microchange:** Codegen or shared `contract-types` package (larger change); or shared comment module documenting the policy once.

---

#### F-22: API key / `x-api-key` documentation (2 files)

**`orchestrator/index.ts:70-71`:**
```ts
/** API key for oracle authenticated endpoints (sent as x-api-key header). */
apiKey?: string;
```

**`oracle/client.ts:17-18`:**
```ts
/** API key for authenticated endpoints (sent as x-api-key header). */
apiKey?: string;
```

**Implementation:** `oracle/client.ts:78-81` `headers()` method.

**Why duplication:** Config field + JSDoc duplicated at orchestrator boundary and oracle client.

**Impact:** Doc drift if header name changes.

**Microchange:** Single `OracleAuthConfig` type exported from `oracle/client.ts`, referenced by `OrchestratorConfig`.

---

#### F-23: Chain / network resolution precedence (3 implementations)

| Function | File | Precedence |
|----------|------|------------|
| `resolveChainId` | `broker.ts:34-37` | arg → `AXIOM_CHAIN_ID` env → `GALILEO_CHAIN_ID` |
| `resolveEvmRpc` | `broker.ts:41-44` | `AXIOM_EVM_RPC` env → `pickOGNetwork` → hardcoded fallback |
| `getComputeBaseUrl` | `router.ts:21-29` | `OG_COMPUTE_BASE_URL` env → `pickOGNetwork` → hardcoded fallback |
| Orchestrator ctor | `index.ts:86-97` | `config.chainId ?? GALILEO_CHAIN_ID` (no env) |

**Why duplication:** Env-vs-config precedence rules differ between orchestrator and compute modules.

**Impact:** Orchestrator may run on chain 16602 default while router uses `resolveChainId()` from env — **cross-module misconfiguration risk** if `OrchestratorConfig.chainId` omitted but `AXIOM_CHAIN_ID` set.

**Microchange:** Orchestrator should use `resolveChainId(config.chainId)` from `broker.ts`.

---

#### F-24: Env var alias pairs (router)

**`router.ts:137-138`:**
```ts
const routerKey =
  process.env.AXIOM_COMPUTE_API_KEY ?? process.env.OG_COMPUTE_API_KEY;
```

**`router.ts:147-148` error message lists both names again.**

**Why pattern:** Backward-compat dual env var names (also seen with model: `AXIOM_COMPUTE_MODELS` / `AXIOM_COMPUTE_MODEL`).

**Impact:** Documentation burden; callers may set wrong var.

**Microchange:** `readEnvFirst(...keys: string[])` helper + single canonical name in docs.

---

#### F-25: Test `StrategyRunner` construction boilerplate (4×)

**File:** `orchestrator/orchestrator-chainid.test.ts`

**Lines 47-52, 61-66, 74-78, 85-89** — repeated config object:
```ts
new StrategyRunner({
  evmRpc: "<varies>",
  signer: makeSigner(),
  oracleBaseUrl: "http://127.0.0.1:8787",
  chainId: <varies or omitted>,
});
```

**Why duplication:** Four tests repeat signer + oracle URL setup.

**Impact:** Test maintenance noise only.

**Microchange:** `function makeRunner(overrides: Partial<OrchestratorConfig>)`.

---

#### F-26: Unused import `GALILEO_CHAIN_ID` in router

**File:** `router.ts:3`
```ts
import { pickOGNetwork, GALILEO_CHAIN_ID } from "@axiom/config/networks";
```

`GALILEO_CHAIN_ID` is imported but **never referenced** in `router.ts` (chain default delegated to `resolveChainId()` in `broker.ts`).

**Impact:** Dead import; suggests incomplete refactor from inline defaulting.

**Microchange:** Remove unused import.

---

### 3.5 Semantic Duplication

---

#### F-27: “First on-chain provider” fallback (2 call sites, different purposes)

**`router.ts:165-167` (`resolveProviderUrlFromKey`):**
```ts
const first = services[0];
if (!first?.provider || !first?.url) return null;
return { provider: first.provider, url: first.url };
```

**`orchestrator/index.ts:283`:**
```ts
providerAddress = services[0]?.provider;
```

**Why semantic duplication:** Both assume `services[0]` is the correct provider without model/address matching — for legacy `app-sk-*` keys and TEE verification respectively.

**Impact:** **High bug risk** if multiple providers registered; TEE may verify against provider A while inference routes to provider B.

**Microchange:** Document and centralize `selectDefaultProvider(services, context)` with explicit policy.

---

#### F-28: Provider list mapping vs raw SDK services

**`provider-discovery.ts`** maps SDK rows to `ServiceInfo` with defaults (`""`, `"unknown"`).

**`router.ts:77-79`** reads raw `provider` and `url` with inline optional chaining.

**`orchestrator/index.ts:283`** reads raw `services[0]?.provider`.

**Why semantic duplication:** Three representations of the same on-chain service list with different null-handling.

**Impact:** Empty-string provider in discovery vs `undefined` in orchestrator may behave differently in downstream checks.

**Microchange:** Single `OnChainService` type + normalizer used everywhere.

---

## 4. Positive Findings

Well-structured areas that **reduce** duplication:

1. **`broker.ts` as shared factory** — Comments (lines 1–10) explicitly centralize SDK workarounds; `getReadOnlyBroker` / `getBroker` prevent direct SDK imports elsewhere. Good layering intent.

2. **`tee-verifier.ts` thin wrapper** — Single responsibility; delegates to `getBroker` + `processResponse` without reimplementing crypto (lines 28–54).

3. **`provider-discovery.ts` cache with in-flight dedup** — `_cachePromise` pattern (lines 37–51) correctly prevents thundering herd on concurrent discovery calls.

4. **`oracle/client.ts` façade methods** — Public API methods (`health`, `transferValidity`, `signOwnership`) are thin one-liners delegating to `get`/`post` (lines 84–102); good surface/transport separation.

5. **`payment/processor.ts` `ensureAllowance`** — Approval pre-flight extracted once and reused by both pay methods (lines 101, 120, 194–201).

6. **`wayback.ts` `normalizeCdxRow`** — CDX row normalization extracted (lines 26–38) so duplicate fetch blocks at least share row mapping.

7. **`orchestrator-chainid.test.ts`** — Focused pure config test with no RPC mocks (lines 22–23); good isolation for chainId regression.

8. **`resolveChainId` / `resolveEvmRpc` exports** — Single env-precedence implementation in `broker.ts` (when used) beats scattered `process.env` reads.

---

## 5. Microchange Opportunities (Prioritized)

| Priority | ID | Change | Effort | Impact |
|----------|-----|--------|--------|--------|
| **P0** | F-08, F-27 | Unify provider discovery; replace `services[0]` hacks with shared selector | Small | Fixes TEE/routing provider mismatch risk |
| **P0** | F-23 | Orchestrator uses `resolveChainId(config.chainId)` | Trivial | Aligns env-based chain config across stack |
| **P1** | F-01 | Extract `fetchCdxRows` in wayback | Small | Removes largest exact copy-paste |
| **P1** | F-11 | Single `createStaticProvider` with optional timeout | Medium | Consistent RPC timeout behavior |
| **P1** | F-07, F-14 | `listOnChainServices()` with shared cache/TTL | Small | Cuts redundant `listService()` RPC |
| **P1** | F-09, F-17 | `findParsedEvent` + `sendAndWait` in payment processor | Small | DRY contract interaction |
| **P2** | F-02, F-03, F-04 | Small constants/helpers (zero-hash, empty onchain, timestamp ISO) | Trivial | Reduces magic literals |
| **P2** | F-05, F-10 | `buildOpenAIClient`, oracle `request()` | Small | Transport-layer DRY |
| **P2** | F-18 | Cache vault `TypedContract` on runner | Small | Per-tick allocation savings |
| **P2** | F-19, F-20 | Distinct logger names; single `extractErrorMessage` in catch | Trivial | Log clarity |
| **P2** | F-16 | Avoid double error wrapping in wayback confirm | Trivial | Cleaner error messages |
| **P3** | F-25 | Test helper `makeRunner` | Trivial | Test readability |
| **P3** | F-26 | Remove unused `GALILEO_CHAIN_ID` import in router | Trivial | Lint cleanliness |
| **P3** | F-13 | Generic cache helper | Optional | Marginal unless cache invalidation added |
| **P3** | F-21, F-22 | Shared config types for oracle auth + contract typing policy | Medium | Architectural consistency |

---

## 6. Grep Summary (Assigned Files Only)

Patterns searched and hit counts:

| Pattern | Files hit | Notes |
|---------|-----------|-------|
| `getReadOnlyBroker` + `listService` | 3 (`provider-discovery`, `router`×2, `orchestrator`) | Core duplication cluster |
| `extractErrorMessage` | 6 files, 15+ sites | Consistent utility, some redundant calls |
| `createLogger` | 5 files | 2× `"compute"` collision |
| `JsonRpcProvider` + `staticNetwork` | 3 files | 3 construction variants |
| `TypedContract` + local types | 2 files | Parallel workaround pattern |
| `AbortSignal.timeout` | `oracle/client`, `wayback` | 10s / 20s / config — no shared constants |
| `receipt.logs.find` + `parseLog` | `processor`, `orchestrator` | 3 event-parse sites |
| `"0x" + "0".repeat(64)` | `orchestrator` ×2 | Exact duplicate sentinel |
| CDX fetch block | `wayback` ×2 | Exact duplicate |

---

*End of report. No fixes implemented per agent scope.*