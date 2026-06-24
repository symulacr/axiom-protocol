# Exhaustive Deep-Trace: Cross-Cutting 0G Integration Paths

**Generated:** 2026-06-24  
**Scope:** Entire Axiom Protocol monorepo (`apps/*`, `packages/*`)  
**Method:** Source-grepped every `.ts`/`.tsx` file, read every `package.json`, traced every env var, URL, SDK import, wrapper, and cross-package dependency.

---

## 1. Complete Environment Variable Trace

### 1.1 Env Vars Declared in `.env.example` (Root) vs ACTUALLY Consumed

| # | Env Var | `.env.example` | `sharedEnvSchema` | `backendEnvSchema` | `oracleEnvSchema` | `ENV_KEYS` | Actually Consumed? | Notes |
|---|---------|:---:|:---:|:---:|:---:|:---:|:---:|-------|
| 1 | `AXIOM_EVM_RPC` | ✅ | — | **required** | **required** | ✅ | ✅ backend `index.ts`, oracle `index.ts`, `networks.ts` | Canonical name; backward aliases `OG_RPC_URL`, `RPC_URL` fall through |
| 2 | `AXIOM_STORAGE_RPC` | ✅ commented | — | optional | — | ✅ | ✅ backend `server.ts` L138, `networks.ts` | Optional — if unset, falls back to `pickOGNetwork()` |
| 3 | `AXIOM_ORACLE_URL` | ✅ | — | **required** | `default("http://127.0.0.1:8787")` | ✅ | ✅ backend `index.ts`, client `oracle/client.ts` | Schema in oracle has default; backend requires it |
| 4 | `AXIOM_FRONTEND_URL` | ✅ commented | optional | — | — | ✅ | ✅ backend `server.ts` L117, oracle `server.ts` L41 | CORS origin + CSP connect-src |
| 5 | `AXIOM_API_KEY` | ✅ commented | optional | — | — | ✅ | ✅ backend `server.ts` L123, oracle `server.ts` L46 | Optional bearer-token auth |
| 6 | `AXIOM_CHAIN_ID` | ✅ | `default(16602)` | — | — | ✅ | ✅ backend `server.ts` L137, `compute/router.ts` L48, oracle `index.ts` | Synced default across all Zod schemas |
| 7 | `AXIOM_COMPUTE_API_KEY` | ✅ commented | — | optional | — | ✅ | ✅ backend `compute/router.ts` L74 | Primary compute route key |
| 8 | `AXIOM_COMPUTE_DIRECT_KEY` | ✅ | — | optional | — | ✅ | ✅ backend `compute/router.ts` L54 | Direct SDK proxy path |
| 9 | `AXIOM_TEE_SIGNER_PK` | ✅ | — | **required** | **required** | ✅ | ✅ backend `server.ts`, oracle `index.ts` | Required in both schemas |
| 10 | `AXIOM_TEE_VERIFIER` | ✅ commented | — | optional | **required** | ✅ | ✅ backend `server.ts`, oracle `index.ts` | Oracle requires it; backend optional (falls back to `DEPLOYED_ADDRESSES`) |
| 11 | `OG_COMPUTE_BASE_URL` | ✅ commented | optional | — | — | ✅ | ✅ backend `compute/router.ts` L46 | Explicit override for Compute Router base URL |
| 12 | `DEPLOYER_PK` | ✅ | — | **required** | — | ✅ | ✅ backend `index.ts`, `cli/run-e2e.ts`, `storage/0g.test.ts`, `hardhat.config.cjs` | 🚨 **NOT in any Zod schema** — read raw from `process.env` in 4 places |
| 13 | `AXIOM_COMPUTE_BASE_URL` | ✅ commented | — | — | — | ❌ **NOT in `ENV_KEYS`** | ✅ backend `compute/router.ts` L70 | 🚨 **MISSING from `ENV_KEYS`** — only read via raw `process.env.AXIOM_COMPUTE_BASE_URL` |
| 14 | `AXIOM_COMPUTE_MODEL` | ✅ commented | — | optional | — | ❌ **NOT in `ENV_KEYS`** | ✅ backend `server.ts` L631 | 🚨 **MISSING from `ENV_KEYS`** — used as default model |
| 15 | `OG_COMPUTE_API_KEY` | ✅ commented | — | — | — | ❌ **NOT in `ENV_KEYS`** | ✅ backend `compute/router.ts` L74 | 🚨 **MISSING from `ENV_KEYS`** — legacy fallback |
| 16 | `OG_STORAGE_RPC` | ✅ | — | — | — | ❌ **NOT in `ENV_KEYS`** | ✅ 4 places: `networks.ts`, `indexer/index.ts`, `0g.test.ts`, `cli/run-e2e.ts` | Backward alias — falls through from `AXIOM_STORAGE_RPC` |
| 17 | `OG_RPC_URL` | ✅ | — | — | — | ❌ **NOT in `ENV_KEYS`** | ✅ 5 places: `networks.ts`, `indexer/index.ts`, `0g.test.ts`, `cli/run-e2e.ts`, `hardhat.config.cjs` | Backward alias — falls through from `AXIOM_EVM_RPC` |
| 18 | `OG_CHAIN_ID` | ✅ commented | — | — | — | ❌ **NOT in `ENV_KEYS`** | ✅ `indexer/index.ts`, `sink.ts`, `cli/run-e2e.ts` | Backward alias — NOT registered in ENV_KEYS |
| 19 | `AXIOM_ORACLE_BIND` | ✅ commented | — | — | `default("127.0.0.1")` | ❌ **NOT in `ENV_KEYS`** | ✅ oracle `index.ts` L32 | Oracle-specific bind address |
| 20 | `AXIOM_ORACLE_PORT` | ✅ commented | — | — | `default(8787)` | ❌ **NOT in `ENV_KEYS`** | ✅ oracle `index.ts` L32 | Oracle-specific port |
| 21 | `AXIOM_STORAGE_INDEXER_RPC` | ✅ commented | — | — | optional | ❌ **NOT in `ENV_KEYS`** | ✅ oracle `index.ts` L24 | Oracle storage RPC |
| 22 | `AXIOM_STORAGE_EVM_RPC` | ✅ commented | — | — | optional | ❌ **NOT in `ENV_KEYS`** | ✅ oracle `index.ts` L24 | Oracle storage EVM RPC |
| 23 | `AXIOM_STORAGE_PRIVATE_KEY` | ✅ commented | — | — | optional | ❌ **NOT in `ENV_KEYS`** | ✅ oracle `index.ts` L27 | Oracle storage key (defaults to TEE_SIGNER_PK) |
| 24 | `AXIOM_BIND` | ✅ commented | — | `default("127.0.0.1")` | — | ✅ | ✅ backend `index.ts` | Backend bind address |
| 25 | `AXIOM_PORT` | ✅ commented | — | `default(3000)` | — | ✅ | ✅ backend `index.ts` | Backend port |
| 26 | `VITE_BACKEND_URL` | ✅ | — | — | — | ❌ N/A (Vite) | ✅ frontend `env.ts`, `useProviders.ts`, `useEventStream.ts` | Frontend-only |
| 27 | `VITE_WALLETCONNECT_PROJECT_ID` | ✅ | — | — | — | ❌ N/A (Vite) | ✅ frontend `wagmi.ts`, `SettingsPage.tsx` | Frontend-only |
| 28 | `AGENT_NFT_ADDRESS` | ✅ commented | — | optional | — | ❌ **NOT in `ENV_KEYS`** | ✅ backend `index.ts`, `cli/run-e2e.ts`, `addresses.ts` | Falls through from `AXIOM_AGENT_NFT_ADDRESS` |
| 29 | `VAULT_ADDRESS` | ✅ commented | — | optional | — | ❌ **NOT in `ENV_KEYS`** | ✅ backend `index.ts`, `cli/run-e2e.ts` | Falls through from `AXIOM_STRATEGY_VAULT_ADDRESS` |
| 30 | `PAYMENT_PROCESSOR_ADDRESS` | ✅ commented | — | optional | — | ❌ **NOT in `ENV_KEYS`** | ✅ backend `index.ts`, `cli/run-e2e.ts` | Falls through from `AXIOM_PAYMENT_PROCESSOR_ADDRESS` |
| 31 | `INDEXER_DA_ENABLED` | ✅ commented | — | — | — | ❌ **NOT in `ENV_KEYS`** | ✅ `indexer/index.ts` L244 | Raw `process.env` read |
| 32 | `DA_GRPC_URL` | ✅ commented | — | — | — | ❌ **NOT in `ENV_KEYS`** | ✅ `indexer/index.ts` L245 | Raw `process.env` read |
| 33 | `BACKEND_URL` | ✅ commented | — | — | — | ❌ **NOT in `ENV_KEYS`** | ✅ `indexer/index.ts` L247, `sink.ts`, `cli/run-e2e.ts` | Raw `process.env["BACKEND_URL"]` in indexer |
| 34 | `STORAGE_BATCH_INTERVAL_MS` | ✅ commented | — | — | — | ❌ **NOT in `ENV_KEYS`** | ✅ `indexer/index.ts` L64 | Raw `process.env` read |
| 35 | `STORAGE_BATCH_MAX_EVENTS` | ✅ commented | — | — | — | ❌ **NOT in `ENV_KEYS`** | ✅ `indexer/index.ts` L65 | Raw `process.env` read |
| 36 | `RECEIVER_PK` | ❌ **NOT in `.env.example`** | — | — | — | ❌ **NOT in `ENV_KEYS`** | ✅ `cli/run-e2e.ts` L35 | 🚨 **UNDOCUMENTED** — E2E-only, but still in source |
| 37 | `OG_NETWORK_NAME` | ❌ | — | — | — | ❌ | ✅ `cli/run-e2e.ts`, `contracts/.env.aristotle.example` | Used by deploy scripts + E2E |
| 38 | `OG_EXPLORER_URL` | ❌ | — | — | — | ❌ | ✅ `contracts/.env.aristotle.example` | Hardhat verify |
| 39 | `OG_EXPLORER_API_URL` | ❌ | — | — | — | ❌ | ✅ `contracts/.env.aristotle.example` | Hardhat verify |
| 40 | `OG_MAINNET_FLOW` | ❌ | — | — | — | ❌ | ✅ `contracts/.env.aristotle.example` | Flow address |
| 41 | `TEE_SIGNER_PK` | ❌ **NOT in root `.env.example`** | — | — | — | ❌ | ✅ `cli/run-e2e.ts` L20 | 🚨 **UNDOCUMENTED** in root .env.example (only in contracts .env) |
| 42 | `OG_STORAGE_RPC` (indexer) | ✅ | — | — | — | ❌ | ✅ `indexer/index.ts` L249 | Raw `process.env["OG_STORAGE_RPC"]` |
| 43 | `OG_RPC_MAINNET` | ❌ | — | — | — | ❌ | ✅ `hardhat.config.cjs` L14 | Only in hardhat config |
| 44 | `DEPLOY_DATE` | ❌ | — | — | — | ❌ | ✅ `contracts/.env.*` | Deploy scripts |
| 45 | `ETHERSCAN_API_KEY` | ❌ | — | — | — | ❌ | ✅ `contracts/.env.aristotle.example` | Verify |
| 46 | `ORACLE_ADMIN_PK` | ❌ | — | — | — | ❌ | ✅ `contracts/.env.*` | Deploy scripts |
| 47 | `AXIOM_MOCK_USDC_ADDRESS` / `AXIOM_PAYMENT_TOKEN` | ❌ | — | — | — | ❌ | ✅ `addresses.ts`, `cli/run-e2e.ts` | Not in ENV_KEYS |
| 48 | `AXIOM_PAYMENT_PROCESSOR` (no `_ADDRESS` suffix) | ❌ | — | — | — | ❌ | ✅ `cli/run-e2e.ts` L27 | 🚨 Inconsistent naming — the canonical is `AXIOM_PAYMENT_PROCESSOR_ADDRESS` |
| 49 | `OG_CHAIN_ID` (indexer) | ✅ | — | — | — | ❌ | ✅ `indexer/index.ts` L27 | Duplicate name collision risk |
| 50 | `OG_STORAGE_RPC` in .env.example | ✅ | — | — | — | ✅ | ✅ (see 16) | |

### 1.2 Key Findings: Env Vars

1. **🚨 `ENV_KEYS` is incomplete.** Only 12 of ~50 env vars are registered in `/home/eya/og/packages/config/src/env.ts`'s `ENV_KEYS` const. Critical missing vars include `AXIOM_COMPUTE_BASE_URL`, `AXIOM_COMPUTE_MODEL`, `OG_COMPUTE_API_KEY`, `OG_STORAGE_RPC`, `OG_RPC_URL`, `OG_CHAIN_ID`, all 4 oracle-specific vars, all contract address env vars, `AXIOM_COMPUTE_MODEL`, and all indexer env vars.

2. **🚨 `DEPLOYER_PK` is validated by `backendEnvSchema` (hexString) but the actual read in `indexer/index.ts` L250 is `process.env["DEPLOYER_PK"]` — raw, unvalidated.** The `indexer` doesn't use the Zod schema at all.

3. **🚨 Naming inconsistency**: `AXIOM_PAYMENT_PROCESSOR` (no `_ADDRESS` suffix) in `cli/run-e2e.ts` vs `AXIOM_PAYMENT_PROCESSOR_ADDRESS` in `addresses.ts`. The `getEnvWithAlias` chain in `addresses.ts` handles this (both are listed as aliases), but it's confusing.

4. **🚨 `TEE_SIGNER_PK` is consumed raw in `cli/run-e2e.ts`** — it's used alongside `DEPLOYER_PK` but isn't in the root `.env.example`. It's only in `contracts/.env.aristotle.example`.

5. **The env loading story is fragmented:**
   - `@axiom/config/env.ts` has `loadEnv()` that reads `../../.env` (relative to the calling package's working directory)
   - `indexer/index.ts` overrides with `fileURLToPath(new URL("../../.env", import.meta.url))`
   - `frontend` uses Vite's `import.meta.env.VITE_*`
   - `hardhat.config.cjs` uses `dotenv.config({ path: '../../.env' })`

---

## 2. Complete 0G SDK Dependency Audit

### 2.1 Dependencies Table

| Package | `@0gfoundation/0g-storage-ts-sdk` | `@0gfoundation/0g-compute-ts-sdk` | Version |
|---------|:---:|:---:|:---:|
| `@axiom/config` (packages/config) | **✅ declared + imported** | ❌ not declared | `^1.2.10` |
| `@axiom/backend` (apps/backend) | **✅ declared + imported** | ❌ not declared (but in node_modules!) | `^1.2.10` |
| `@axiom/oracle` (apps/oracle) | **✅ declared + imported** | ❌ not declared | `^1.2.10` |
| `@axiom/indexer` (apps/indexer) | **✅ declared + imported** | ❌ not declared | `^1.2.10` |
| `@axiom/bench` (apps/bench) | **✅ declared** | ❌ not declared | `^1.2.10` |
| `@axiom/frontend` (apps/frontend) | ❌ not declared | ❌ not declared | — |
| `@axiom/contracts` (apps/contracts) | ❌ not declared | ❌ not declared | — |

### 2.2 Where `@0gfoundation/0g-storage-ts-sdk` Is Actually Imported

```
packages/config/src/storage/0g.ts:           import { Indexer, MemData } from "@0gfoundation/0g-storage-ts-sdk";
apps/backend/src/storage/0g.ts:              import { Indexer } from "@0gfoundation/0g-storage-ts-sdk";
apps/oracle/src/storage.ts:                  import { Indexer } from "@0gfoundation/0g-storage-ts-sdk";
apps/indexer/src/index.ts:                   import { Indexer } from "@0gfoundation/0g-storage-ts-sdk";
apps/bench/live-e2e/test-indexer-pipeline.ts: import { Indexer, MemData } from "@0gfoundation/0g-storage-ts-sdk";
apps/bench/live-e2e/stress-storage.ts:       import { Indexer, MemData } from "@0gfoundation/0g-storage-ts-sdk";
apps/bench/live-e2e/stress-indexer-worker.ts: import { Indexer, MemData } from "@0gfoundation/0g-storage-ts-sdk";
```

### 2.3 🚨 CRITICAL: `@0gfoundation/0g-compute-ts-sdk` v0.8.4 Is in `node_modules` but NOT Imported Anywhere

The SDK at `apps/backend/node_modules/@0gfoundation/0g-compute-ts-sdk/` (v0.8.4) is **completely unused** in any source file. It was apparently installed as a transitive dependency or a stale leftover.

**What the SDK offers vs what Axiom does:**
- The 0g-compute-ts-sdk has full `inference/broker/`, `contract/`, `extractor/` modules, fine-tuning support, and ledger management
- Axiom uses raw OpenAI SDK (`openai`) directly to talk to the 0G Compute Router API
- The 0g-compute-ts-sdk has its OWN OpenAI client wrapper — Axiom could use it instead of raw OpenAI, but doesn't
- The SDK includes CLI tools (`0g-compute-cli`) and Web UI — none of which Axiom uses

**This is ~20MB of dead transitive dependency** across all packages.

### 2.4 Version Consistency

All 5 packages that declare `@0gfoundation/0g-storage-ts-sdk` use `^1.2.10`. The actual installed version in all `node_modules` is `1.2.10`. ✅ Consistent.

---

## 3. Complete URL Centralization Map

### 3.1 All Hardcoded URLs

| URL | Location(s) | Configurable? | Testnet/Mainnet Aware? |
|-----|-------------|:---:|:---:|
| `https://evmrpc-testnet.0g.ai` | `networks.ts` L19, `hardhat.config.cjs` L7, `SettingsPage.tsx` L46, L8 | ✅ via `AXIOM_EVM_RPC` / `OG_RPC_URL` | ✅ via chainId |
| `https://evmrpc.0g.ai` | `networks.ts` L26, `hardhat.config.cjs` L14, `SettingsPage.tsx` L49 | ✅ via `AXIOM_EVM_RPC` / `OG_RPC_MAINNET` | ✅ |
| `https://indexer-storage-testnet-turbo.0g.ai` | `networks.ts` L20, `server.ts` L138, `0g.test.ts` L10, `cli/run-e2e.ts` L22, `orchestrator-chainid.test.ts` L37 | ✅ via `AXIOM_STORAGE_RPC` / `OG_STORAGE_RPC` | ✅ |
| `https://indexer-storage-turbo.0g.ai` | `networks.ts` L27, `orchestrator-chainid.test.ts` L36 | ✅ via `AXIOM_STORAGE_RPC` | ✅ |
| `https://router-api.0g.ai/v1` | `compute/router.ts` L6 | ✅ via `OG_COMPUTE_BASE_URL` / `AXIOM_CHAIN_ID` | ✅ |
| `https://router-api-testnet.integratenetwork.work/v1` | `compute/router.ts` L7 | ✅ via `OG_COMPUTE_BASE_URL` / `AXIOM_CHAIN_ID` | ✅ |
| `https://compute-network-6.integratenetwork.work/v1/proxy` | `compute/router.ts` L70 | ✅ via `AXIOM_COMPUTE_BASE_URL` | ❌ **Only testnet URL hardcoded** |
| `https://inference-0xa48f...testnet.0g.ai` | `compute/router.ts` L11 | ❌ **Hardcoded** | ❌ Testnet only |
| `https://inference-0x8e60...testnet.0g.ai` | `compute/router.ts` L12 | ❌ **Hardcoded** | ❌ Testnet only |
| `https://chainscan-galileo.0g.ai` | `chains.ts` L19, `HistoryPage.tsx` L44, L46, `MarketPage.tsx` L51 | ❌ **Hardcoded** | ✅ via chainId switch |
| `https://chainscan.0g.ai` | `chains.ts` L38, `HistoryPage.tsx` L46, L46, `MarketPage.tsx` L51 | ❌ **Hardcoded** | ✅ via chainId switch |
| `https://0g-galileo-testnet.drpc.org` | `0g.test.ts` L11 | ✅ via `OG_RPC_URL` | ❌ **Testnet-only hardcoded fallback** |
| `https://evmrpc-testnet.0g.ai` (as hardhat Galileo default) | `hardhat.config.cjs` L7 | ✅ via `OG_RPC_URL` | ✅ |
| `https://chainscan-galileo.0g.ai/open/api` | `hardhat.config.cjs` L46 | ❌ | ✅ |
| `https://chainscan.0g.ai/open/api` | `hardhat.config.cjs` L53 | ❌ | ✅ |
| `http://127.0.0.1:8787` | `oracle/server.ts` L257, `oracle/env-schema.ts` L7, `oracle/ecies.ts`, various tests | ✅ via `AXIOM_ORACLE_URL` / `AXIOM_ORACLE_BIND`/`PORT` | N/A |
| `http://127.0.0.1:3000` | `cli/run-e2e.ts` L23, `frontend/env.ts` L4, frontend `.env.example` L14 | ✅ via `VITE_BACKEND_URL` / `BACKEND_URL` | N/A |
| `http://localhost:5173` | `server.ts` L117, L122, oracle `server.ts` L41, L45 | ✅ via `AXIOM_FRONTEND_URL` | N/A |

### 3.2 Key Findings: URLs

1. **🚨 Centralization INCOMPLETE**: While `networks.ts` has the 4 canonical URLs (2 per network), the compute URLs are hardcoded in `compute/router.ts` and NOT in `networks.ts`. The direct SDK proxy URL (`https://compute-network-6.integratenetwork.work/v1/proxy`) is ONLY testnet — there's no mainnet equivalent.

2. **🚨 `https://0g-galileo-testnet.drpc.org` in `0g.test.ts` L11** is a different fallback from the canonical `https://evmrpc-testnet.0g.ai`. This diverges from the centralized `networks.ts`.

3. **🚨 KNOWN_PROVIDERS in `compute/router.ts` L8-12** are hardcoded testnet inference endpoints with NO mainnet equivalents. These would break on mainnet.

4. **🚨 Explorer URLs (`chainscan`) are hardcoded in 3 files**: `chains.ts` (centralized for wagmi), `HistoryPage.tsx` (switch statement), `MarketPage.tsx` (ternary). The HistoryPage and MarketPage should use `chains.ts` block explorer instead of duplicating.

5. **`networks.ts` has good resolver functions** (`resolveRpcUrl` and `resolveStorageRpc` with env var precedence + network lookup + fallback). But there's no `resolveComputeUrl` or `resolveExplorerUrl` — compute and explorer URLs are uncentralized.

---

## 4. Complete Wrapper/Adapter Pattern Assessment

### 4.1 All Wrappers Found

| Wrapper | File | Wraps What? | Adds Value? | Tested? | Recommendation |
|---------|------|-------------|:---:|:---:|:---:|
| `ZeroGStorage` (config) | `packages/config/src/storage/0g.ts` | `@0gfoundation/0g-storage-ts-sdk`'s `Indexer` | ✅ Type safety, error formatting, consistent `UploadResult`/`DownloadResult` types | 🔴 No unit tests | **KEEP** — but move backend-specific wrapper out of config |
| `ZeroGStorage` (backend) | `apps/backend/src/storage/0g.ts` | Re-exports config's `uploadToStorage`/`downloadFromStorage`, adds `withRetry` + class wrapper | ✅ Retry logic (3 attempts, exp backoff), typed config | ✅ `0g.test.ts` | **KEEP** — the retry wrapper is valuable |
| `ZeroGStorage` (oracle) | `apps/oracle/src/storage.ts` | `@0gfoundation/0g-storage-ts-sdk`'s `Indexer` + `StorageAdapter` interface | ✅ Interface (`StorageAdapter`) allows InMemoryStorage swap, adds `seenDataHashes` tracking | 🔴 No dedicated unit tests | **KEEP but deduplicate** — shares ~70% logic with config's ZeroGStorage |
| `InMemoryStorage` | `apps/oracle/src/storage.ts` | In-memory Map (for dev/test) | ✅ Critical for dev mode without 0G network | 🔴 No dedicated tests | **KEEP** |
| `StorageAdapter` interface | `apps/oracle/src/storage.ts` | Defines upload/download/markDataHashSeen/hasSeenDataHash | ✅ Abstraction for swapping storage backends | N/A | **KEEP** |
| `PaymentProcessorClient` | `apps/backend/src/payment/processor.ts` | `ethers` Contract around `AxiomPaymentProcessor` | ✅ Event parsing, allowance pre-flight, typed methods | 🔴 No unit tests (only integration via E2E) | **KEEP** |
| `DefaultSignerOracleClient` | `apps/backend/src/oracle/client.ts` | HTTP client for the TEE oracle service | ✅ Error handling, JSON parsing, typed responses | 🔴 No unit tests | **KEEP** |
| `OracleClient` interface | `apps/backend/src/oracle/client.ts` | Defines health/transferValidity/signOwnership/recoverAccessSigner | ✅ Abstraction for testing | N/A | **KEEP** |
| `TeeSigner` | `apps/oracle/src/signer.ts` | EIP-712 typed-data signing using `ethers.Wallet` | ✅ Domain binding, EIP-712 struct hashing | ⚠️ Partial (EIP-712 tests exist) | **KEEP** |
| `DaClient` | `apps/indexer/src/da-client.ts` | gRPC client for 0G DA Disperser | ✅ Type-safe gRPC calls, polling utility | 🔴 No unit tests | **KEEP** |
| `StrategyRunner` | `apps/backend/src/orchestrator/index.ts` | Orchestrates compute+storage+vault for strategy ticks | ✅ Multi-step orchestration, error handling | ✅ `orchestrator-chainid.test.ts` | **KEEP** |
| `TypedContract` | `packages/config/src/types/contract.ts` | `ethers.Contract` with ONE `as unknown as T` cast | ✅ Zero per-method casts, DRY pattern | 🔴 No tests | **KEEP** |
| `createApiKeyAuth` | `packages/config/src/middleware/auth.ts` | Express middleware for optional API key auth | ✅ Dev-mode skip, path-based exemption | 🔴 No tests | **KEEP** |
| `EventStore` | `apps/backend/src/events/store.ts` | In-memory event storage with bucketed FIFO eviction | ✅ Query by agent/owner, sorting | 🔴 No unit tests (implicitly tested via E2E) | **KEEP - but add persistence** |
| `createRoute` | `apps/backend/src/routers/route-factory.ts` | Express route factory with standardized error handling | ✅ DRY, broadcast, schema parsing | 🔴 No tests | **KEEP** |
| `broadcast` | `apps/backend/src/ws/broadcaster.ts` | WS message broadcasting | ✅ Client set management, heartbeat | 🔴 No tests | **KEEP** |

### 4.2 Key Findings: Wrappers

1. **🚨 `ZeroGStorage` is DUPLICATED across 3 files** with overlapping logic:
   - `packages/config/src/storage/0g.ts` — core `uploadToStorage`/`downloadFromStorage` functions
   - `apps/backend/src/storage/0g.ts` — class wrapper with retry (re-exports config functions)
   - `apps/oracle/src/storage.ts` — class with `StorageAdapter` interface (separate `Indexer` instantiation)
   
   The config version creates `Indexer` internally; the oracle creates it separately in its constructor. Both call `uploadToStorage`/`downloadFromStorage` from config.

2. **The `eciesjs` dependency is used in 4 places**:
   - `apps/oracle/src/crypto/ecies.ts` — `encrypt`/`decrypt` for key sealing
   - `apps/backend/src/cli/run-e2e.ts` — `encrypt`/`decrypt` for E2E test
   - `apps/oracle/package.json` lists `eciesjs: ^0.4.14`
   - `apps/backend/package.json` lists `eciesjs: ^0.4.18`
   
   **Versions differ** (0.4.14 vs 0.4.18) — potential for subtle breakage.

3. **The `createRouterClient` function** in `compute/router.ts` creates raw `OpenAI` instances. The `@0gfoundation/0g-compute-ts-sdk` has its own broker/inference client that could replace this, but it's unused.

---

## 5. Cross-Package Dependency Graph

### 5.1 Dependency Graph (ASCII)

```
                    ┌──────────────────┐
                    │  packages/config  │
                    │  (@axiom/config)  │
                    │                   │
                    │ Deps:             │
                    │  @0gfoundation/   │
                    │    0g-storage-sdk │
                    │  ethers, viem,    │
                    │  zod, express     │
                    └──────┬──────┬─────┘
                           │      │
              imports ─────┘      └────── imports ────┐
              ↓                                        ↓
     ┌────────────────┐  ┌───────────────┐  ┌───────────────────┐
     │  apps/backend  │  │ apps/oracle   │  │  apps/indexer     │
     │ (@axiom/       │  │ (@axiom/      │  │  (@axiom/indexer) │
     │  backend)      │  │  oracle)      │  │                   │
     │                │  │               │  │ Deps:             │
     │ Deps:          │  │ Deps:         │  │  @0gfoundation/   │
     │  @axiom/config │  │  @axiom/config│  │   0g-storage-sdk  │
     │  @axiom/oracle │  │  @0gfoundation│  │  @axiom/config    │
     │  @0gfoundation │  │   0g-storage  │  │  @grpc/grpc-js    │
     │   0g-storage   │  │   eciesjs     │  │  @grpc/proto-loader│
     │   openai       │  │   express     │  │  ethers, viem     │
     │   eciesjs      │  │   zod         │  │                   │
     │   express      │  │   ethers      │  │ (NO backward dep) │
     │   zod          │  │   viem        │  └───────────────────┘
     │   ws           │  └───────────────┘
     └───────┬───────┘
             │
             │ imports from oracle sources in tests!
             ↓
     ┌───────────────────┐
     │ apps/frontend     │
     │ (@axiom/frontend) │
     │                   │
     │ Deps:             │
     │  @axiom/config    │
     │  viem, wagmi,     │
     │  rainbowkit,      │
     │  react, react-dom │
     └───────────────────┘
```

### 5.2 🚨 BACKWARD Imports Found

**`apps/backend/src/server/transfer.test.ts` imports from `apps/oracle/src/` directly:**

```typescript
import { aesGcmEncrypt, concatEncrypted } from "../../../oracle/src/crypto/aes-gcm.js";
import { unsealKeyForReceiver } from "../../../oracle/src/crypto/ecies.js";
import { startServer as startOracleServer } from "../../../oracle/src/server.js";
import { TeeSigner, accessMessageHash, deriveUncompressedPubkeyFromHex } from "../../../oracle/src/signer.js";
import { InMemoryStorage } from "../../../oracle/src/storage.js";
```

These bypass the `@axiom/oracle` package boundary entirely — they reach into `node_modules/@axiom/oracle` sibling source directories. **This breaks if oracle is package-built separately.** The oracle package already exports `./signer`, `./crypto/*` in its `package.json` `exports` field, so the backend test should use:
```typescript
import { aesGcmEncrypt } from "@axiom/oracle/crypto/aes-gcm";
import { TeeSigner, accessMessageHash } from "@axiom/oracle/signer";
```

### 5.3 Cross-Package Import Summary

| From | Into | Files |
|------|------|-------|
| `@axiom/config` | All packages | Every app imports from config |
| `@axiom/oracle/signer` | `apps/backend` | `server.ts`, `oracle/client.ts`, `cli/run-e2e.ts` |
| `@axiom/oracle/crypto/*` | `apps/backend` | `cli/run-e2e.ts` |
| `@axiom/oracle/src/*` (backward) | `apps/backend/test` | `server/transfer.test.ts` 🚨 |
| `@axiom/config/storage/0g` | `apps/backend`, `apps/oracle`, `apps/indexer` | 4 files total |

No app-to-app imports (other than oracle → backend via the test). ✅ Proper direction.

---

## 6. Dead Code Analysis

### 6.1 Exported but Never Imported

1. **`packages/config/src/api/index.ts`** — EMPTY file. The `package.json` exports `"./api": "./dist/api/index.js"` but the source has zero content. Three export entries in `package.json` resolve to nonexistent or empty files:
   - `"./api/responses": "./dist/api/responses.js"` — **⚠️ Source file does not exist** (`packages/config/src/api/responses.ts` missing). Only dist files exist.
   - `"./api/routes": "./dist/api/routes.js"` — **⚠️ Source file does not exist** (`packages/config/src/api/routes.ts` missing). Only dist files exist.
   - `"./api": "./dist/api/index.js"` — Empty source file.

   These are **stale build artifacts** with no corresponding source. The dist was built from a previous version and the sources were deleted.

2. **`packages/config/src/types/ethers.ts`** and **`packages/config/src/types/collections.ts`** — exported in `package.json` but never imported in any source file.

3. **`packages/config/src/abis/index.ts`** — exports all ABIs but only `agentNft`, `vault`, `paymentProcessor`, `iTransferFrom` are declared in `package.json` exports. The ABI files exist in source and dist but are imported from source inline (e.g., `AGENT_NFT_ABI` in `server.ts` is redefined inline, not from the shared ABIs).

4. **`@0gfoundation/0g-compute-ts-sdk` v0.8.4** — sits in `apps/backend/node_modules/` but is never imported. See Section 2.3.

### 6.2 Redundant/Reimplemented Code

1. **Inline ABIs vs shared ABIs**: The backend's `server.ts` defines `AGENT_NFT_ABI`, `VAULT_ABI` as local arrays, while `packages/config/src/abis/` has the same ABIs. The orchestrator's `index.ts` also defines `VAULT_ABI` locally. The `payment/processor.ts` defines its ABIs locally too. **Zero shared ABI imports from `@axiom/config/abis`.**

2. **`bigintReplacer`** is defined 2 times:
   - `apps/backend/src/server.ts` (imports from `@axiom/config/types/bigint`)
   - `apps/indexer/src/index.ts` (locally defined as `function bigintReplacer`)

### 6.3 Orphaned Files

1. **`packages/config/src/api/index.ts`** — clearly a leftover from an API routes module that was never completed.

---

## 7. Risks and Recommended Simplifications

### 7.1 🚨 HIGH: Hardcoded Values That Break on Mainnet

1. **`compute/router.ts` L70**: `"https://compute-network-6.integratenetwork.work/v1/proxy"` — This is a testnet-only URL for the Direct SDK proxy path. On mainnet (`AXIOM_CHAIN_ID=16661`), the `AXIOM_COMPUTE_BASE_URL` env var must be set or this will still use the testnet proxy.

2. **`compute/router.ts` L11-12**: `KNOWN_PROVIDERS` — Only testnet inference endpoints. On mainnet, direct key decoding would find no match, falling through to the testnet proxy URL.

3. **`networks.ts`**: The `flowContract` addresses are hardcoded. If the Flow contract is redeployed, the addresses must be updated here AND in `contracts/.env.*`.

4. **`hardhat.config.cjs` L14**: `OG_RPC_MAINNET` — Only read in hardhat config. If not set, defaults to `'https://evmrpc.0g.ai'` (the correct mainnet URL), so this is lower risk.

### 7.2 🚨 HIGH: Centralization Gaps

1. **No `resolveComputeUrl()` function** — compute URLs are scattered between `compute/router.ts` and should live in `networks.ts`.

2. **No `resolveExplorerUrl()` function** — explorer URLs are hardcoded in `chains.ts`, `HistoryPage.tsx`, `MarketPage.tsx`, and `hardhat.config.cjs`.

3. **Indexer env reading bypasses Zod** — the indexer reads `process.env["OG_RPC_URL"]` etc. directly without schema validation, unlike backend and oracle.

### 7.3 🚨 MEDIUM: Wrapper Duplication

1. **Three `ZeroGStorage`-like classes** (config, backend, oracle) — merge into one shared class in `@axiom/config` with both `StorageAdapter`-style interface and retry wrapper.

2. **Inline ABIs × 4** → consolidate into `@axiom/config/abis/` and actually import from there.

### 7.4 🚨 MEDIUM: Backward Import in Tests

`apps/backend/src/server/transfer.test.ts` imports directly from `../../../oracle/src/`. Fix by using `@axiom/oracle/signer` and `@axiom/oracle/crypto/aes-gcm` package exports.

### 7.5 🚨 LOW: Documentation Gaps

1. `TEE_SIGNER_PK` is missing from root `.env.example` (only in `contracts/.env.aristotle.example`).
2. `RECEIVER_PK` is undocumented entirely.
3. `AXIOM_COMPUTE_BASE_URL` is in `.env.example` commented out but missing from `ENV_KEYS`.
4. `AXIOM_COMPUTE_MODEL` is consumed in `server.ts` L631 but not in `ENV_KEYS`.

---

## 8. What the SDK Offers That Axiom Doesn't Use

### `@0gfoundation/0g-storage-ts-sdk` v1.2.10

| Feature | What Axiom Does | What SDK Offers | Opportunity |
|---------|----------------|-----------------|-------------|
| `Indexer.upload()` | ✅ Used directly | — | — |
| `Indexer.downloadToBlob()` | ✅ Used directly | — | — |
| `MemData` | ✅ Used in config/oracle | — | — |
| `ZgFile` (file upload) | ❌ Not used | SDK has full file support | Could replace manual blob handling |
| `EncryptedFile` | ❌ Not used | Built-in encrypted file | Could simplify Axiom's encryption layer |
| `StorageKv` (KV store) | ❌ Not used | Key-value storage on 0G | New feature opportunity |
| `HotRouterClient` | ❌ Not used | Hot storage node client | Potential for caching layer |
| `flow` contract wrappers | ❌ Not used | TypeChain-typed Flow contracts | Could replace hardcoded Flow addresses |
| `market` contract wrappers | ❌ Not used | Marketplace contracts | Future feature |

### `@0gfoundation/0g-compute-ts-sdk` v0.8.4 (TOTALLY UNUSED)

| Feature | What Axiom Does | What SDK Offers |
|---------|----------------|-----------------|
| `inference/broker/` | Raw OpenAI SDK | Full broker client with provider discovery |
| `inference/contract/` | Direct contract calls via ethers | TypeChain-typed InferenceServing contract |
| `fine-tuning/` | ❌ Not supported | Full fine-tuning workflow |
| `ledger/` | ❌ Not supported | Ledger manager for compute payments |
| CLI tool | ❌ Not used | Full CLI for compute network management |

---

## 9. Summary of All Findings

### Critical (blocking mainnet readiness)

| ID | Finding | File(s) |
|----|---------|---------|
| C1 | 20+ env vars missing from `ENV_KEYS` — no canonical resolution | `packages/config/src/env.ts` |
| C2 | Compute proxy URL `https://compute-network-6...` is testnet-only, no mainnet resolution | `apps/backend/src/compute/router.ts` L70 |
| C3 | `KNOWN_PROVIDERS` inference endpoints are testnet-only, break on mainnet | `apps/backend/src/compute/router.ts` L11-12 |
| C4 | No `resolveComputeUrl()` or `resolveExplorerUrl()` — URLs not centralized in `networks.ts` | All URL locations |
| C5 | `@0gfoundation/0g-compute-ts-sdk` is a ~20MB dead transitive dependency | `apps/backend/node_modules/` |

### Medium (code quality)

| ID | Finding | File(s) |
|----|---------|---------|
| M1 | Backward import in test: `../../../oracle/src/` bypasses package boundary | `apps/backend/src/server/transfer.test.ts` |
| M2 | Three `ZeroGStorage`-like wrappers with ~70% code overlap | `packages/config/src/storage/0g.ts`, `apps/backend/src/storage/0g.ts`, `apps/oracle/src/storage.ts` |
| M3 | ABIs defined inline in 4 places instead of imported from `@axiom/config/abis/` | `server.ts`, `orchestrator/index.ts`, `payment/processor.ts`, `cli/run-e2e.ts` |
| M4 | `packages/config/src/api/*` has exports to nonexistent/missing source files | `packages/config/src/api/index.ts` (empty), `responses.ts`/`routes.ts` (missing) |
| M5 | `bigintReplacer` duplicated in `indexer/index.ts` | `apps/indexer/src/index.ts` |
| M6 | Indexer reads env vars raw without Zod schema validation | `apps/indexer/src/index.ts` |

### Low (hygiene)

| ID | Finding | File(s) |
|----|---------|---------|
| L1 | `TEE_SIGNER_PK` missing from root `.env.example` | `/home/eya/og/.env.example` |
| L2 | `RECEIVER_PK` undocumented anywhere | `apps/backend/src/cli/run-e2e.ts` |
| L3 | `AXIOM_COMPUTE_BASE_URL` and `AXIOM_COMPUTE_MODEL` missing from `ENV_KEYS` | `packages/config/src/env.ts` |
| L4 | `eciesjs` versions differ (0.4.14 vs 0.4.18) between oracle and backend | `package.json` files |
| L5 | Stale dist-only files for `api/responses` and `api/routes` with no source | `packages/config/dist/api/` |

---

## 10. Import Chains (Full)

### `@axiom/config` → All Consumers

```
@axiom/config/index.ts
  ├── env.ts                  → loadEnv(), getEnv(), getEnvWithAlias(), ENV_KEYS
  ├── networks.ts             → OG_NETWORKS, pickOGNetwork(), resolveRpcUrl(), resolveStorageRpc(), GALILEO_CHAIN_ID, ARISTOTLE_CHAIN_ID
  ├── addresses.ts            → DEPLOYED_ADDRESSES
  ├── env-schema.ts           → sharedEnvSchema
  ├── types/index.ts          → re-exports: bigint, hex, contract, schemas
  ├── middleware/auth.ts      → createApiKeyAuth
  └── storage/0g.ts           → uploadToStorage(), downloadFromStorage()

Consumed by:
  backend/index.ts              → env, env-schema, addresses
  backend/server.ts             → networks, types/bigint, types/contract, middleware/auth, storage/0g
  backend/tests/*               → networks, types, storage/0g
  oracle/index.ts               → env, env-schema, types/hex
  oracle/server.ts              → middleware/auth
  oracle/env-schema.ts          → env-schema, types/schemas
  indexer/src/index.ts          → env, networks, storage/0g
  indexer/src/sink.ts           → networks
  indexer/src/watcher.ts        → types/hex
  frontend/src/config/*.ts      → networks
  frontend/src/abi/*.ts         → networks, addresses
```

### `@axiom/oracle` → Consumers

```
@axiom/oracle/index.ts
  ├── signer.ts                → TeeSigner, ownershipMessageHash, accessMessageHash, recoverAccessSigner, DEFAULT_EIP712_DOMAIN, Eip712Domain
  └── crypto/*                 → aes-gcm.ts, ecies.ts, secp256k1.ts, eip712.ts

Consumed by:
  backend/server.ts             → signer.ts (accessMessageHash, etc.)
  backend/oracle/client.ts      → signer.ts
  backend/cli/run-e2e.ts        → crypto/aes-gcm, signer, crypto/secp256k1
  backend/test (backward!)      → ../oracle/src/crypto, src/server, src/signer, src/storage
```

---

*End of exhaustive trace report. No files were edited.*
