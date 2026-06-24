# Deep Trace: 0G Chain Integration in Axiom Protocol

> Generated: 2026-06-24
> Scope: All RPC provider creation, env-var wiring, SDK utilization, and chain-config assumptions.

---

## 1. EXECUTIVE SUMMARY

The codebase has **6 separate `JsonRpcProvider` instances**, **3 `Indexer` (0G Storage SDK) instances**, and **2 wagmi/viem chain definitions**. All providers connect to 0G Galileo testnet (chainId 16602) by default, with partial support for Aristotle mainnet (chainId 16661). The integration works for testnet but has **multiple hardcoded assumptions, missing timeout/retry configurations, dead code paths, and completely unused SDK capabilities**.

**Risk Level**: MEDIUM-HIGH. The code will mostly function on testnet, but mainnet deployment requires changes in at least 8 files.

---

## 2. FULL CALL CHAIN OF EVERY RPC CONNECTION

### 2.1 Backend `apps/backend/src/index.ts`

```
env.AXIOM_EVM_RPC
         │
         ▼
new JsonRpcProvider(env.AXIOM_EVM_RPC)      ← NO chainId, NO staticNetwork
         │
         ├──► new Wallet(DEPLOYER_PK, provider)
         │
         └──► passed to startServer() as config.evmRpc
```

**File**: `/home/eya/og/apps/backend/src/index.ts:12`
```typescript
const provider = new JsonRpcProvider(env.AXIOM_EVM_RPC);
const signer = new Wallet(env.DEPLOYER_PK, provider);
```

| Property | Value |
|----------|-------|
| URL source | `env.AXIOM_EVM_RPC` (required, URL-validated) |
| chainId | **NOT passed** → ethers v6 auto-detects via `eth_chainId` |
| staticNetwork | **NOT passed** → network can change mid-session |
| pollingInterval | Default (4000ms) |
| timeout | Default (none — relies on FetchRequest defaults) |

**Risk**: No `staticNetwork` means ethers v6 will re-detect the chain on every `getNetwork()` call. If the RPC temporarily returns a different chainId, all transaction signing could fail with NETWORK_MISMATCH.

---

### 2.2 Backend `apps/backend/src/server.ts`

#### Provider A — Main HTTP provider (line 160)
```
config.evmRpc (from index.ts)
         │
         ▼
new ethers.JsonRpcProvider(config.evmRpc)    ← NO chainId, NO staticNetwork
         │
         ├──► Used by createHealthRouter (getBlockNumber)
         ├──► Used by PaymentProcessorClient (view functions)
         └──► Used by read-only TypedContract instances
```

**File**: `/home/eya/og/apps/backend/src/server.ts:160`
```typescript
const provider = new ethers.JsonRpcProvider(config.evmRpc);
```

#### Provider B — Orchestrator StrategyRunner (line 80)
```
config.evmRpc (from index.ts) + ogChainId (from env or 16602 default)
         │
         ▼
new JsonRpcProvider(config.evmRpc, chainId)  ← YES chainId, NO staticNetwork
```

**File**: `/home/eya/og/apps/backend/src/orchestrator/index.ts:80`
```typescript
this.provider = new JsonRpcProvider(config.evmRpc, chainId);
```

| Property | Value |
|----------|-------|
| chainId | `config.chainId ?? 16602` — explicit |
| staticNetwork | **NOT passed** → network detected, but chainId provided means it'll match |

This is the **only** backend provider that passes an explicit chainId. Still no `staticNetwork: true`.

---

### 2.3 Indexer `apps/indexer/src/index.ts`

```
OG_RPC_URL env var → DEFAULT_RPC_URL fallback
         │
         ▼
new ethers.JsonRpcProvider(url, cid, { staticNetwork: true })
         │
         ├──► Storage signer Wallet creation
         └──► Watcher class for event polling
```

**File**: `/home/eya/og/apps/indexer/src/index.ts:220-222`
```typescript
const provider = new ethers.JsonRpcProvider(url, cid, {
  staticNetwork: true,
});
```

This is the **BEST-configured provider** in the entire codebase — explicit chainId + staticNetwork. It also verifies the chainId on startup:

**File**: `/home/eya/og/apps/indexer/src/index.ts:226-236`
```typescript
const liveChainId = Number((await provider.getNetwork()).chainId);
if (liveChainId !== cid) {
  // error and exit(1)
}
```

---

### 2.4 Oracle `apps/oracle/src/index.ts`

The oracle does NOT create a JsonRpcProvider directly. It creates a `Wallet` without a provider:

**File**: `/home/eya/og/apps/oracle/src/index.ts:25`
```typescript
const wallet = new Wallet(storagePk);
```

The wallet is passed to `ZeroGStorage` which uses it only for the storage SDK's `upload()` method. The storage SDK internally creates its own provider for the EVM RPC.

---

### 2.5 Backend CLI `apps/backend/src/cli/run-e2e.ts`

```
OG_RPC_URL env var (required, no fallback)
         │
         ▼
new JsonRpcProvider(RPC)                     ← NO chainId, NO staticNetwork
```

**File**: `/home/eya/og/apps/backend/src/cli/run-e2e.ts:32`
```typescript
const provider = new JsonRpcProvider(RPC);
```

| Property | Value |
|----------|-------|
| chainId | **NOT passed** — auto-detect only |
| staticNetwork | **NOT passed** |

---

### 2.6 Storage test `apps/backend/src/storage/0g.test.ts`

```
OG_RPC_URL env → "https://0g-galileo-testnet.drpc.org" fallback
         │
         ▼
new ethers.JsonRpcProvider(EVM_RPC)          ← HARDCODED FALLBACK URL
```

**File**: `/home/eya/og/apps/backend/src/storage/0g.test.ts:11-18`
```typescript
const EVM_RPC = process.env.OG_RPC_URL ?? "https://0g-galileo-testnet.drpc.org";
const provider = new ethers.JsonRpcProvider(EVM_RPC);
```

| Property | Value |
|----------|-------|
| Fallback URL | `https://0g-galileo-testnet.drpc.org` — different from all other fallbacks |
| chainId | **NOT passed** |
| staticNetwork | **NOT passed** |

---

### 2.7 Frontend wagmi config

```
storedRpcUrl (localStorage) → resolveRpcUrl(GALILEO_CHAIN_ID)
                                           │
                                           ▼
                                   getEnvWithAlias("AXIOM_EVM_RPC", ["OG_RPC_URL", "RPC_URL"])
                                           │
                                  chain default → "https://evmrpc-testnet.0g.ai"
                                           │
                                           ▼
                                  http(galileoRpc) in wagmi transport
```

**File**: `/home/eya/og/apps/frontend/src/config/wagmi.ts:14-15`
```typescript
const galileoRpc = storedRpcUrl || resolveRpcUrl(GALILEO_CHAIN_ID);
const aristotleRpc = storedRpcUrl || resolveRpcUrl(ARISTOTLE_CHAIN_ID);
```

**File**: `/home/eya/og/apps/frontend/src/config/chains.ts:4-40`
```typescript
export const galileo = defineChain({
  id: GALILEO_CHAIN_ID,  // 16602
  // ...
});

export const aristotle = defineChain({
  id: ARISTOTLE_CHAIN_ID,  // 16661
  // ...
});
```

**Critical observation**: Both galileo and aristotle use the same `resolveRpcUrl()` function. If `AXIOM_EVM_RPC` is set, BOTH chains use the SAME RPC URL. The localStorage override also applies to BOTH chains simultaneously — there's no per-chain RPC configuration.

---

### 2.8 Flowchart Summary

```
                        ┌─────────────────────────────────┐
                        │      .env / env vars             │
                        │  AXIOM_EVM_RPC, OG_RPC_URL, etc  │
                        └──────────┬──────────────────────┘
                                   │
            ┌──────────────────────┼──────────────────────┐
            ▼                      ▼                      ▼
   ┌──────────────┐      ┌──────────────────┐    ┌──────────────┐
   │ backend/     │      │ backend/server.ts│    │ frontend/    │
   │ index.ts     │      │                  │    │ wagmi.ts     │
   │              │      │ PROVIDER A       │    │              │
   │ new Provider │      │ new Provider()   │    │ http(RPC)    │
   │ (no chainId) │      │ (no chainId)     │    │ (viem)       │
   │              │      │                  │    │              │
   │ Wallet(sign) │      │ PROVIDER B       │    │ 2 chains,    │
   │              │      │ StrategyRunner   │    │ 1 RPC URL    │
   │              │      │ new Provider()   │    └──────────────┘
   │              │      │ (WITH chainId)   │
   └──────┬───────┘      └──────────────────┘
          │
          ▼
   ┌──────────────┐      ┌──────────────────┐
   │ indexer/     │      │ backend/         │
   │ index.ts     │      │ cli/run-e2e.ts   │
   │              │      │                  │
   │ NEW Provider │      │ new Provider()   │
   │ chainId+     │      │ (no chainId)     │
   │ staticNet.   │      │                  │
   │ ★ BEST ★     │      └──────────────────┘
   └──────────────┘
```

---

## 3. EVERY FILE THAT TOUCHES CHAIN CONFIG

### 3.1 `packages/config/src/networks.ts`

**Path**: `/home/eya/og/packages/config/src/networks.ts`

```typescript
export const GALILEO_CHAIN_ID = 16602;
export const ARISTOTLE_CHAIN_ID = 16661;

const _OG_NETWORKS = {
  16602: {
    name: "galileo",
    chainId: 16602,
    evmRpc: "https://evmrpc-testnet.0g.ai",
    storageRpc: "https://indexer-storage-testnet-turbo.0g.ai",
    flowContract: "0x22E03a6A89B950F1c82ec5e74F8eCa321a105296",
  },
  16661: {
    name: "aristotle",
    chainId: 16661,
    evmRpc: "https://evmrpc.0g.ai",
    storageRpc: "https://indexer-storage-turbo.0g.ai",
    flowContract: "0x62D4144dB0F0a6fBBaeb6296c785C71B3D57C526",
  },
} as const;
```

**resolveRpcUrl()** precedence chain:
```
1. AXIOM_EVM_RPC (env)
2. OG_RPC_URL (env, backward compat alias)
3. RPC_URL (env, backward compat alias)
4. chain default evmRpc from OG_NETWORKS
5. hardcoded "https://evmrpc-testnet.0g.ai" ← Galileo testnet fallback
```

**resolveStorageRpc()** precedence chain:
```
1. AXIOM_STORAGE_RPC (env)
2. OG_STORAGE_RPC (env, backward compat alias)
3. chain default storageRpc from OG_NETWORKS
4. hardcoded "https://indexer-storage-testnet-turbo.0g.ai" ← Galileo testnet fallback
```

**Critical**: Both `resolveRpcUrl()` and `resolveStorageRpc()` hardcode Galileo testnet URLs as final fallbacks. If `AXIOM_EVM_RPC` is not set and `OG_RPC_URL` is not set and `chainId` is not provided (or not recognized), the system silently falls back to Galileo testnet — even if the user intended mainnet.

---

### 3.2 `packages/config/src/env-schema.ts`

**Path**: `/home/eya/og/packages/config/src/env-schema.ts`

```typescript
export const sharedEnvSchema = z.object({
  AXIOM_FRONTEND_URL: z.string().url().optional(),
  AXIOM_API_KEY: z.string().optional(),
  AXIOM_CHAIN_ID: z.coerce.number().int().positive().default(16602),  // ← HARDCODED DEFAULT
  OG_COMPUTE_BASE_URL: z.string().url().optional(),
});
```

**Dead config**: `sharedEnvSchema` defines `AXIOM_CHAIN_ID` with a Zod default of 16602. This is the canonical default, but:

- Backend `env-schema.ts` merges `sharedEnvSchema` but does NOT add AXIOM_EVM_RPC, AXIOM_ORACLE_URL — these are in the backend-specific schema only.
- Oracle `env-schema.ts` merges `sharedEnvSchema` and adds AXIOM_EVM_RPC, AXIOM_STORAGE_INDEXER_RPC, etc.
- The indexer does NOT use this schema at all — it reads raw `process.env`.

---

### 3.3 `packages/config/src/env.ts`

**Path**: `/home/eya/og/packages/config/src/env.ts`

Defines `getEnvWithAlias(canonical, aliases, fallback)`.

**Alias chains**:
```
AXIOM_EVM_RPC ← OG_RPC_URL ← RPC_URL
AXIOM_STORAGE_RPC ← OG_STORAGE_RPC
AXIOM_CHAIN_ID ← OG_CHAIN_ID
AXIOM_TEE_SIGNER_PK ← TEE_SIGNER_PK
AXIOM_ORACLE_URL ← ORACLE_BASE_URL
```

**Observation**: The codebase still uses legacy `OG_*` env var names in many places (indexer uses `OG_RPC_URL`, `OG_CHAIN_ID`, `OG_STORAGE_RPC` directly), creating a dual-namespace problem where some services use `AXIOM_*` and others use `OG_*`.

---

### 3.4 Backend `apps/backend/src/env-schema.ts`

**Path**: `/home/eya/og/apps/backend/src/env-schema.ts`

```typescript
export const backendEnvSchema = sharedEnvSchema.merge(z.object({
  AXIOM_EVM_RPC: z.string().url(),
  AXIOM_ORACLE_URL: z.string().url(),
  AXIOM_STORAGE_RPC: z.string().url().optional(),
  // ...
  AXIOM_CHAIN_ID: ... from sharedEnvSchema (default 16602)
}));
```

**Consumers of env vars at runtime**:
- `AXIOM_EVM_RPC` → `index.ts:12` → `new JsonRpcProvider(env.AXIOM_EVM_RPC)`
- `AXIOM_CHAIN_ID` → `server.ts:137` → `config.env?.AXIOM_CHAIN_ID ?? GALILEO_CHAIN_ID`
- `AXIOM_STORAGE_RPC` → `server.ts:139` → `pickOGNetwork(ogChainId)?.storageRpc ?? fallback`
- `AXIOM_ORACLE_URL` → `server.ts:141` → `DefaultSignerOracleClient`
- `AXIOM_TEE_SIGNER_PK` → Defined in schema but **NEVER READ directly in backend**. Only `AXIOM_TEE_VERIFIER` is used.

### 3.5 Oracle `apps/oracle/src/env-schema.ts`

**Path**: `/home/eya/og/apps/oracle/src/env-schema.ts`

```typescript
export const oracleEnvSchema = sharedEnvSchema.merge(z.object({
  AXIOM_TEE_SIGNER_PK: hexString,
  AXIOM_STORAGE_INDEXER_RPC: z.string().url().optional(),  // NOT in shared schema
  AXIOM_STORAGE_EVM_RPC: z.string().url().optional(),       // NOT in shared schema
  AXIOM_EVM_RPC: z.string().url(),
  AXIOM_TEE_VERIFIER: address,
  AXIOM_STORAGE_PRIVATE_KEY: hexString.optional(),
}));
```

**Observations**:
- The oracle has its OWN `AXIOM_STORAGE_INDEXER_RPC` and `AXIOM_STORAGE_EVM_RPC` — separate from the backend's `AXIOM_STORAGE_RPC`. This means **two separate env vars control the same concept** in different services.
- The oracle does NOT use `AXIOM_STORAGE_RPC` at all — only `AXIOM_STORAGE_INDEXER_RPC`.

### 3.6 Indexer `apps/indexer/src/env.ts`

**Path**: `/home/eya/og/apps/indexer/src/env.ts`

```typescript
// Just re-exports from @axiom/config/env
export { loadEnv, getEnv } from "@axiom/config/env";
```

The indexer reads env vars directly rather than using the Zod schema:

```typescript
// From index.ts:
process.env["OG_RPC_URL"]       // NOT AXIOM_EVM_RPC
process.env["OG_CHAIN_ID"]      // NOT AXIOM_CHAIN_ID
process.env["OG_STORAGE_RPC"]   // NOT AXIOM_STORAGE_RPC
process.env["INDEXER_DA_ENABLED"]
process.env["DA_GRPC_URL"]
process.env["BACKEND_URL"]
process.env["DEPLOYER_PK"]
```

**Critical**: The indexer uses the **old** `OG_*` env var namespace entirely. It never reads `AXIOM_EVM_RPC`, `AXIOM_CHAIN_ID`, or `AXIOM_STORAGE_RPC`. This means setting only the modern `AXIOM_*` vars will NOT configure the indexer.

---

## 4. MISSING TIMEOUT/RETRY ON PROVIDERS

| Provider Location | Timeout? | Retry? | Notes |
|------------------|----------|--------|-------|
| backend/index.ts | ❌ | ❌ | Default ethers behavior (no timeout) |
| backend/server.ts (A) | ❌ | ❌ | No timeout on provider creation |
| backend/server.ts (B) orchestrator | ❌ | ❌ | No timeout on provider creation |
| indexer/index.ts | ❌ (provider) | ❌ | Has retry on Watcher tick error (backoff), but not on provider itself |
| cli/run-e2e.ts | ❌ | ❌ | No timeout |
| frontend wagmi | ❌ | wagmi default | wagmi v2 has built-in retry but 0G-specific config missing |

**Risk**: If the RPC endpoint is slow or unresponsive, `JsonRpcProvider` will hang for default HTTP timeouts. The only place with explicit request timeouts is in the `DefaultSignerOracleClient` class (10s timeout on fetch to oracle).

---

## 5. DEAD CODE PATHS

### 5.1 Config Defined But Never Consumed

| Config/Symbol | Defined In | Still Used? | Notes |
|--------------|-----------|-------------|-------|
| `ARISTOTLE_CHAIN_ID` (16661) | `networks.ts` | ⚠️ PARTIAL | Used in chains.ts (frontend) but backend has no Aristotle-specific logic |
| `OG_NETWORKS[16661].flowContract` | `networks.ts` | **DEAD** | `flowContract` is never read by any consumer file |
| `resolveStorageRpc()` | `networks.ts` | **DEAD** | Exported but never called by any file |
| `AXIOM_TEE_SIGNER_PK` in backend schema | `env-schema.ts` | **DEAD** | Defined in backend schema but never read |
| `sharedEnvSchema.AXIOM_FRONTEND_URL` | `env-schema.ts` | **DEAD** | Read by server.ts only via `env.AXIOM_FRONTEND_URL` — but server.ts uses `config.env?.AXIOM_FRONTEND_URL` |
| `OG_NETWORKS` as an exported constant | `networks.ts` | ⚠️ | Used by indexer only via `OG_NETWORKS[GALILEO_CHAIN_ID]` |

### 5.2 SDK Exports Never Imported

The `@0gfoundation/0g-storage-ts-sdk` exports at least 10 top-level modules:

| SDK Module | Used? | Notes |
|-----------|-------|-------|
| `Indexer` | ✅ | Used throughout (upload, download) |
| `MemData` | ✅ | Used in storage/0g.ts |
| `kv/` (StorageKv, KvClient, KvIterator) | **NEVER** | Full KV store API unused |
| `hot/` (HotRouterClient) | **NEVER** | Hot cache / prefetch API unused |
| `transfer/` (Uploader, Downloader) | **NEVER** | Raw transfer layer unused |
| `contracts/flow/` (FixedPriceFlow) | **NEVER** | Flow contract bindings unused |
| `contracts/market/` (FixedPrice) | **NEVER** | Market contract bindings unused |
| `node/` (StorageNode, StorageKv) | **NEVER** | Direct storage node access unused |
| `file/` (ZgFile, EncryptedFile) | **NEVER** | File abstraction layer unused |
| `utils/` (getFlowContract, getMarketContract) | **NEVER** | Utility functions unused |
| `peekHeader()` on Indexer | **NEVER** | Encryption header peek unused |
| `uploadToHot()` on Indexer | **NEVER** | Hot storage upload unused |

### 5.3 `@0gfoundation/0g-compute-ts-sdk` — Entire SDK Unused

The compute SDK (`0.8.4`) is installed in `apps/backend/node_modules/@0gfoundation/0g-compute-ts-sdk` but:

| Feature | Used? | Notes |
|---------|-------|-------|
| `ZGComputeNetworkBroker` | **NEVER** | Full broker for compute network on-chain interaction |
| `createZGComputeNetworkBroker()` | **NEVER** | Factory with automatic network detection |
| `ZGComputeNetworkReadOnlyBroker` | **NEVER** | Read-only broker for listing providers |
| `createZGComputeNetworkReadOnlyBroker()` | **NEVER** | Read-only broker factory (no wallet needed) |
| `InferenceBroker` | **NEVER** | Full inference broker with auth |
| `ReadOnlyInferenceBroker` | **NEVER** | Read-only provider listing |
| `LedgerBroker` | **NEVER** | Ledger management (create, deposit, transfer, refund) |
| `FineTuningBroker` | **NEVER** | Fine-tuning operations |
| `createInferenceBroker()` | **NEVER** | Factory |
| `createReadOnlyInferenceBroker()` | **NEVER** | Factory |
| `getNetworkType()` | **NEVER** | Chain ID → network type utility |
| `CONTRACT_ADDRESSES` | **NEVER** | All known contract addresses for all networks |

The backend uses a **completely custom** OpenAI-based approach (`compute/router.ts`) that bypasses the official 0G Compute SDK entirely. The official SDK provides:
- On-chain provider discovery via `listService()`
- Billing headers via `getRequestHeaders()`
- Auto-funding via `startAutoFunding()`
- TEE verification via `verifyService()`
- Ledger management for deposits

None of these capabilities are used.

### 5.4 Dead Code from Earlier Iterations

From `apps/bench/discovery/wave12-a-deadcode-backend.txt`:
- `src/compute/0g-broker.ts` — earlier compute broker implementation (deleted from current source)
- `src/compute/audio.ts` — audio transcription (deleted)
- `src/compute/chat-completion.ts` — typed chat completions (deleted)
- `src/compute/image.ts` — text-to-image (deleted)
- `src/compute/funding.ts` — compute funding (deleted)
- `src/i-nft/verify-data-hash.ts` — data hash verification (deleted)
- `src/storage/stream.ts` — streaming storage operations (deleted)
- `src/storage/range.ts` — range-based storage (deleted)
- `src/storage/chain-id.ts` — chain ID storage config (deleted, moved to networks.ts)

---

## 6. EVERY HARDCODED CHAIN ASSUMPTION THAT COULD BREAK ON MAINNET

### RISK CRITICAL

| # | File | Line | Code | Problem |
|---|------|------|------|---------|
| 1 | `packages/config/src/env-schema.ts` | 16 | `.default(16602)` | Backend and Oracle default to Galileo testnet. Aristotle mainnet requires explicit `AXIOM_CHAIN_ID=16661`. |
| 2 | `packages/config/src/networks.ts` | 47 | `return network?.evmRpc ?? "https://evmrpc-testnet.0g.ai"` | If `AXIOM_EVM_RPC` is unset AND no recognized chainId, falls back to Galileo testnet URL. |
| 3 | `packages/config/src/networks.ts` | 53 | `return network?.storageRpc ?? "https://indexer-storage-testnet-turbo.0g.ai"` | Same pattern — testnet fallback. |
| 4 | `apps/backend/src/server.ts` | 137 | `const ogChainId = config.env?.AXIOM_CHAIN_ID ?? GALILEO_CHAIN_ID` | Galileo is the hardcoded fallback. |
| 5 | `apps/backend/src/orchestrator/index.ts` | 78 | `const chainId = config.chainId ?? 16602` | Default Galileo. |
| 6 | `apps/indexer/src/index.ts` | 20 | `const DEFAULT_RPC_URL = OG_NETWORKS[GALILEO_CHAIN_ID]?.evmRpc ?? "https://evmrpc-testnet.0g.ai"` | Indexer defaults to Galileo. |
| 7 | `apps/indexer/src/index.ts` | 28 | `if (raw === undefined \|\| raw === "") return GALILEO_CHAIN_ID` | Indexer chainId defaults to Galileo. |
| 8 | `apps/backend/src/compute/router.ts` | 48 | `const chainId = Number(process.env.AXIOM_CHAIN_ID) \|\| 16602;` | Compute router defaults to Galileo. |
| 9 | `apps/backend/src/server.ts` | 139 | `pickOGNetwork(ogChainId)?.storageRpc ?? "https://indexer-storage-testnet-turbo.0g.ai"` | Hardcoded Galileo storage fallback. |

### RISK HIGH

| # | File | Line | Code | Problem |
|---|------|------|------|---------|
| 10 | `apps/frontend/src/config/wagmi.ts` | 14-16 | Both galileo and aristotle use the same `resolveRpcUrl()` | Single RPC URL for both chains. No per-chain RPC config. |
| 11 | `apps/frontend/src/config/wagmi.ts` | 14 | localStorage `axiom.rpcUrl` overrides BOTH chains | User cannot configure different RPCs for testnet vs mainnet. |
| 12 | `apps/backend/src/index.ts` | 12 | `new JsonRpcProvider(env.AXIOM_EVM_RPC)` — no chainId | Provider auto-detects chain, could mismatch. |
| 13 | `apps/backend/src/server.ts` | 160 | `new ethers.JsonRpcProvider(config.evmRpc)` — no chainId | Same — no chainId validation. |
| 14 | `apps/backend/src/server.ts` | 144 | `eip712Domain.chainId = BigInt(ogChainId)` | If ogChainId doesn't match actual chain, EIP-712 signing fails. |

### RISK MEDIUM

| # | File | Line | Code | Problem |
|---|------|------|------|---------|
| 15 | `packages/config/src/addresses.ts` | 14-18 | All 5 deployed addresses hardcoded to Wave E-5 Galileo testnet values | Mainnet will have different addresses. |
| 16 | `apps/indexer/src/events.ts` | 10-13 | `ADDRESSES` uses `DEPLOYED_ADDRESSES` which defaults to testnet | Indexer will watch wrong addresses on mainnet. |
| 17 | `apps/indexer/src/sink.ts` | 86 | `const chainId = Number(process.env["OG_CHAIN_ID"] ?? GALILEO_CHAIN_ID)` | Hardcoded Galileo default. |
| 18 | `apps/backend/src/compute/router.ts` | 45-48 | `const chainId = Number(process.env.AXIOM_CHAIN_ID) \|\| 16602; return chainId === 16661 ? DEFAULT_MAINNET_URL : DEFAULT_TESTNET_URL` | Router URL selection hardcodes testnet URL. |

### RISK LOW

| # | File | Line | Code | Problem |
|---|------|------|------|---------|
| 19 | `apps/backend/src/storage/0g.ts` | 4 | `export { OG_NETWORKS, pickOGNetwork }` — re-export from networks.ts | Not a problem per se, but the re-export creates confusion about the canonical source |
| 20 | `.env.example` | multiple | Default values point to Galileo testnet | Documentation defaults are testnet-aligned, which is fine but needs updates for mainnet docs |

---

## 7. UNUSED 0G CHAIN SDK FEATURES

### 7.1 Storage SDK (`@0gfoundation/0g-storage-ts-sdk` v1.2.10)

**Installed in**: `packages/config/`, `apps/backend/`, `apps/indexer/`, `apps/oracle/`

| Capability | Why It Matters |
|-----------|---------------|
| **KV Store API** (`StorageKv`, `KvClient`) | 0G Storage supports key-value operations. Could replace the in-memory EventStore for persistence. |
| **Hot Storage** (`HotRouterClient`, `uploadToHot()`) | Files can be prefetched into hot cache for low-latency reads. Currently, all reads go through consensus. |
| **Flow Contract** | Direct interaction with `FixedPriceFlow` for storage pricing. Currently unused. |
| **Market Contract** (`FixedPrice`) | Storage marketplace — could enable dynamic pricing. |
| **Encryption Header Peek** (`peekHeader()`) | Detect encryption type before downloading full blob. Could optimize transfer flow. |
| **Uploader/Downloader** | Raw transport layer with custom node selection. |
| **StorageNode** | Direct node interaction for advanced operations. |

### 7.2 Compute SDK (`@0gfoundation/0g-compute-ts-sdk` v0.8.4)

**Installed in**: `apps/backend/` (but NEVER imported)

| Capability | Why It Matters |
|-----------|---------------|
| **On-chain Provider Discovery** (`listService()`) | Currently provider list is hardcoded in `KNOWN_PROVIDERS` map. The SDK can query the on-chain inference contract for all registered providers. |
| **Billing Headers** (`getRequestHeaders()`) | The SDK generates proper billing headers for provider payment. Current approach is custom OpenAI-compatible. |
| **Auto-Funding** (`startAutoFunding()`) | Automatically maintains sufficient balance for compute requests. |
| **TEE Verification** (`verifyService()`) | Verifies provider TEE attestation. Currently no verification exists. |
| **Ledger Management** | Create ledgers, deposit/withdraw funds on-chain for compute. |
| **Network Auto-Detection** | The SDK automatically detects testnet vs mainnet. |
| **Contract Address Registry** (`CONTRACT_ADDRESSES`) | All known contract addresses for testnet, testnetDev, mainnet, hardhat. |

---

## 8. ENV VAR NAMESPACE INCONSISTENCIES

| Modern Name | Legacy Name | Backend | Oracle | Indexer | Frontend |
|------------|-------------|---------|--------|---------|----------|
| `AXIOM_EVM_RPC` | `OG_RPC_URL` / `RPC_URL` | ✅ | ✅ | ❌ (uses `OG_RPC_URL`) | N/A (uses `resolveRpcUrl`) |
| `AXIOM_CHAIN_ID` | `OG_CHAIN_ID` | ✅ | ✅ | ❌ (uses `OG_CHAIN_ID`) | N/A (hardcoded) |
| `AXIOM_STORAGE_RPC` | `OG_STORAGE_RPC` | ✅ | ❌ (uses `AXIOM_STORAGE_INDEXER_RPC`) | ❌ (uses `OG_STORAGE_RPC`) | N/A |
| `AXIOM_TEE_SIGNER_PK` | `TEE_SIGNER_PK` | ❌ (never read) | ✅ | ❌ | N/A |
| `AXIOM_ORACLE_URL` | `ORACLE_BASE_URL` | ✅ | N/A | N/A | N/A |

**The indexer is the worst offender** — it uses `OG_RPC_URL`, `OG_CHAIN_ID`, `OG_STORAGE_RPC` directly from `process.env` without going through `getEnvWithAlias()`.

---

## 9. PROVIDER CONFIGURATION COMPARISON

| Instance | URL Source | chainId | staticNetwork | Timeout/Retry | Polling Interval |
|----------|-----------|---------|---------------|---------------|-----------------|
| backend/index.ts | `env.AXIOM_EVM_RPC` | ❌ none | ❌ none | ❌ none | 4000ms (default) |
| backend/server.ts A | `config.evmRpc` | ❌ none | ❌ none | ❌ none | 4000ms (default) |
| backend/server.ts B | `config.evmRpc` | ✅ `chainId` param | ❌ none | ❌ none | 4000ms (default) |
| indexer/index.ts | `OG_RPC_URL` → fallback | ✅ `cid` param | ✅ `staticNetwork: true` | ❌ none (has retry on watcher tick) | 4000ms (default) |
| cli/run-e2e.ts | `OG_RPC_URL` (required) | ❌ none | ❌ none | ❌ none | 4000ms (default) |
| storage/0g.test.ts | `OG_RPC_URL` → drpc.org fallback | ❌ none | ❌ none | ❌ none | 4000ms (default) |
| frontend (viem) | `resolveRpcUrl()` | viem handles | viem handles | wagmi defaults | wagmi handles |

---

## 10. 0G-SPECIFIC PREKNOWN ISSUES

### 10.1 0G Precompiles Never Integrated

From `apps/bench/discovery/chain-precompiles.ts`, 0G has 3 known precompiles:
- `DAEntrance` (0xE75A073dA5bb7b0eC622170Fd268f35E675a957B) — epoch/quorum operations
- `DASigners` (0x0000000000000000000000000000000000001000) — signer verification
- `WrappedOGBase` (0x0000000000000000000000000000000000001001) — deposit/withdraw OG

None of these are used by any production code. Only the bench discovery script probes them.

### 10.2 0G Storage Flow Contract Not Used

The `flowContract` addresses hardcoded in `networks.ts` (0x22E0... for testnet, 0x62D4... for mainnet) are never read by any runtime code. These are storage payment contracts used by the storage SDK internally via `indexer.upload()`, but the Axiom code doesn't interact with them directly.

### 10.3 Galileo RPC Behavior

From code comments in `watcher.ts`:
- eth_getLogs rejects ranges past chain head with error code -32000
- Galileo requires legacy transactions (EIP-1559 not fully supported)
- Priority gas price minimum of 2 gwei on Galileo

The watcher handles the range issue but there's no gas price management code in the main apps (only in forge deploy scripts).

---

## 11. RECOMMENDATIONS

### Must Fix Before Mainnet

1. **Add `staticNetwork: true`** to all `JsonRpcProvider` constructors (especially backend/index.ts:12, server.ts:160)
2. **Make the indexer use `getEnvWithAlias()`** instead of raw `process.env["OG_*"]` calls
3. **Add per-chain RPC configuration in frontend** — wagmi transports should support different URLs for galileo vs aristotle
4. **Export `resolveStorageRpc()` properly** — it's currently exported but never called (the USED code in `server.ts:139` inlines its own fallback)
5. **Remove the dead `AXIOM_TEE_SIGNER_PK`** from backendEnvSchema, or wire it up

### Should Fix

1. **Unify env var namespace** — either all `AXIOM_*` or all `OG_*`, not both
2. **Create mainnet deployment config** — a separate `.env.mainnet.example` with Aristotle values
3. **Add provider-level timeout** — `fetchRequest` timeout on ethers providers
4. **Hardened default chainId** — consider removing the `?? 16602` default in critical paths and requiring explicit config
5. **Remove dead code** — dead `resolveStorageRpc()`, dead export of `OG_NETWORKS`, dead schema fields

### Nice to Have

1. **Evaluate `@0gfoundation/0g-compute-ts-sdk`** for on-chain provider discovery instead of hardcoded `KNOWN_PROVIDERS`
2. **Evaluate `StorageKv`** for event persistence instead of in-memory EventStore
3. **Evaluate `HotRouterClient`** for low-latency storage reads
4. **Evaluate `peekHeader()`** for optimizing transfer flow encryption detection

---

## 12. FILES INDEX

Files that touch 0G chain configuration:

| File | Role |
|------|------|
| `/home/eya/og/packages/config/src/networks.ts` | Chain IDs, RPC URLs, network definitions |
| `/home/eya/og/packages/config/src/env.ts` | Env var loading with alias resolution |
| `/home/eya/og/packages/config/src/env-schema.ts` | Zod validation for shared env vars |
| `/home/eya/og/packages/config/src/addresses.ts` | Deployed contract addresses |
| `/home/eya/og/packages/config/src/index.ts` | Re-exports |
| `/home/eya/og/apps/backend/src/index.ts` | Primary provider creation |
| `/home/eya/og/apps/backend/src/server.ts` | Secondary provider, StrategyRunner init |
| `/home/eya/og/apps/backend/src/env-schema.ts` | Backend-specific env validation |
| `/home/eya/og/apps/backend/src/orchestrator/index.ts` | StrategyRunner with chainId config |
| `/home/eya/og/apps/backend/src/compute/router.ts` | Compute router URL by chain |
| `/home/eya/og/apps/backend/src/storage/0g.ts` | 0G Storage wrapper with retry |
| `/home/eya/og/apps/backend/src/payment/processor.ts` | PaymentProcessor provider usage |
| `/home/eya/og/apps/backend/src/routers/health.ts` | Health check with provider |
| `/home/eya/og/apps/indexer/src/index.ts` | Indexer provider creation (BEST config) |
| `/home/eya/og/apps/indexer/src/env.ts` | Indexer env var loading |
| `/home/eya/og/apps/indexer/src/watcher.ts` | Watcher with provider for log polling |
| `/home/eya/og/apps/indexer/src/sink.ts` | Event sink reads OG_CHAIN_ID |
| `/home/eya/og/apps/oracle/src/index.ts` | Oracle entry (Wallet without provider) |
| `/home/eya/og/apps/oracle/src/env-schema.ts` | Oracle-specific env validation |
| `/home/eya/og/apps/oracle/src/storage.ts` | Oracle storage with 0G Storage SDK |
| `/home/eya/og/apps/frontend/src/config/wagmi.ts` | wagmi config with chain RPCs |
| `/home/eya/og/apps/frontend/src/config/chains.ts` | viem chain definitions |
| `/home/eya/og/.env.example` | Root env template |
| `/home/eya/og/apps/frontend/.env.example` | Frontend env template |
| `/home/eya/og/apps/contracts/.env.galileo-deploy.example` | Galileo deploy env |
| `/home/eya/og/apps/contracts/.env.aristotle.example` | Aristotle mainnet deploy env |
| `/home/eya/og/apps/backend/src/cli/run-e2e.ts` | E2E CLI with RPC |

---

*End of Deep Trace Report*
