# Deep-07: Integration Map — External Endpoints, API Keys & Simplification Opportunities

**Status:** COMPLETE

**Scanned:** 2026-06-24  
**Scope:** All `apps/` and `packages/` directories in the Axiom Protocol monorepo  
**Focus:** External URLs, API keys/env secrets, integration consolidation

---

## 1. External URL Index

### 1.1 EVM RPC Endpoints

| URL | Locations (source files) | Configurable? |
|-----|--------------------------|---------------|
| `https://evmrpc-testnet.0g.ai` | `packages/config/src/networks.ts:19`, `apps/frontend/src/config/chains.ts:13`, `apps/frontend/src/config/wagmi.ts:15`, `apps/frontend/src/pages/SettingsPage.tsx:8`, `apps/contracts/hardhat.config.cjs:7`, `apps/contracts/package.json:18`, `apps/backend/src/server.ts:138` (fallback), `apps/indexer/src/index.ts:20`, `apps/contracts/script/DeployPaymentProcessor.s.sol:20`, `apps/contracts/script/RedeployTeeVerifier.s.sol:10`, `apps/contracts/script/DeployAristotle.s.sol:21`, `.env.example`, `apps/backend/.env.example`, `apps/oracle/src/env-schema.ts` (implicit via AXIOM_EVM_RPC) | ✅ Yes — overridable via `AXIOM_EVM_RPC` / `OG_RPC_URL` / `RPC_URL` |
| `https://evmrpc.0g.ai` | `packages/config/src/networks.ts:26`, `apps/frontend/src/config/chains.ts:32`, `apps/frontend/src/config/wagmi.ts:16`, `apps/frontend/src/pages/SettingsPage.tsx:49`, `apps/contracts/hardhat.config.cjs:14`, `apps/contracts/package.json:20`, `apps/contracts/script/DeployAristotle.s.sol:20,158`, `apps/backend/src/orchestrator/orchestrator-chainid.test.ts:48` | ✅ Yes — same env vars |
| `https://0g-galileo-testnet.drpc.org` | `apps/backend/src/storage/0g.test.ts:11`, `apps/contracts/test/FuzzAxiomStrategyVault.t.sol:48`, `apps/contracts/test/FuzzAxiomPaymentProcessor.t.sol:350,364`, `apps/contracts/test/FuzzAxiomAgentNFT.t.sol:82,414`, `apps/contracts/test/FuzzAxiomTeeVerifier.t.sol:41`, `apps/contracts/test/V12C3ValidUntil.t.sol:23` | ❌ No — hardcoded in test files only |

### 1.2 Storage Indexer RPC Endpoints

| URL | Locations | Configurable? |
|-----|-----------|---------------|
| `https://indexer-storage-testnet-turbo.0g.ai` | `packages/config/src/networks.ts:20`, `apps/backend/src/server.ts:138`, `apps/backend/src/cli/run-e2e.ts:22`, `apps/backend/src/storage/0g.test.ts:10`, `apps/backend/.env.example:9`, `apps/backend/src/orchestrator/orchestrator-chainid.test.ts:37`, `.env.example:29,41` | ✅ Yes — via `AXIOM_STORAGE_RPC` / `OG_STORAGE_RPC` |
| `https://indexer-storage-turbo.0g.ai` | `packages/config/src/networks.ts:27`, `apps/backend/src/orchestrator/orchestrator-chainid.test.ts:36`, `apps/contracts/script/DeployAristotle.s.sol:160` | ✅ Yes — via same env vars |

### 1.3 Compute Router Endpoints

| URL | Locations | Configurable? |
|-----|-----------|---------------|
| `https://router-api.0g.ai/v1` | `apps/backend/src/compute/router.ts:6` (DEFAULT_MAINNET_URL) | ✅ Yes — via `OG_COMPUTE_BASE_URL` |
| `https://router-api-testnet.integratenetwork.work/v1` | `apps/backend/src/compute/router.ts:7` (DEFAULT_TESTNET_URL), `.env.example:24` | ✅ Yes |
| `https://compute-network-6.integratenetwork.work/v1/proxy` | `apps/backend/src/compute/router.ts:70` (Direct SDK fallback), `apps/backend/.env.example:15,18`, `.env.example:25` | ✅ Yes — via `AXIOM_COMPUTE_BASE_URL` |
| `https://inference-0xa48f01287233509FD694a22Bf840225062E67836.testnet.0g.ai` | `apps/backend/src/compute/router.ts:11` (KNOWN_PROVIDERS) | ❌ No — hardcoded map |
| `https://inference-0x8e60d466FD16798Bec4868aa4CE38586D5590049.testnet.0g.ai` | `apps/backend/src/compute/router.ts:12` (KNOWN_PROVIDERS) | ❌ No — hardcoded map |

### 1.4 Oracle Endpoints

| URL | Locations | Configurable? |
|-----|-----------|---------------|
| `http://127.0.0.1:8787` | `apps/oracle/src/env-schema.ts:7` (default), `apps/backend/.env.example:3`, `.env.example:3`, `apps/backend/src/oracle/client.ts:23`, `apps/backend/src/orchestrator/orchestrator-chainid.test.ts:50,64,77,88` | ✅ Yes — via `AXIOM_ORACLE_URL` |

### 1.5 Backend HTTP Endpoints

| URL | Locations | Configurable? |
|-----|-----------|---------------|
| `http://127.0.0.1:3000` | `apps/frontend/src/config/env.ts:4`, `apps/backend/src/cli/run-e2e.ts:23` | ✅ Yes — via `BACKEND_URL` / `VITE_BACKEND_URL` |
| `http://localhost:3000` | `apps/frontend/.env.example:12`, `.env.example:47`, `apps/indexer/src/sink.ts:25` | ✅ Yes |

### 1.6 Frontend / CORS Origins

| URL | Locations | Configurable? |
|-----|-----------|---------------|
| `http://localhost:5173` | `apps/backend/src/server.ts:117,122`, `apps/oracle/src/server.ts:41,45` | ✅ Yes — via `AXIOM_FRONTEND_URL` |

### 1.7 Block Explorers & Faucet

| URL | Locations | Configurable? |
|-----|-----------|---------------|
| `https://chainscan-galileo.0g.ai` | `apps/frontend/src/config/chains.ts:19`, `apps/frontend/src/pages/MarketPage.tsx:50`, `apps/frontend/src/pages/HistoryPage.tsx:43`, `apps/contracts/hardhat.config.cjs:45-46` | ❌ No — hardcoded |
| `https://chainscan.0g.ai` | `apps/frontend/src/config/chains.ts:38`, `apps/frontend/src/pages/MarketPage.tsx:49`, `apps/frontend/src/pages/HistoryPage.tsx:45`, `apps/contracts/hardhat.config.cjs:53-54`, `apps/contracts/script/DeployAristotle.s.sol:159` | ❌ No — hardcoded |
| `https://chainscan-galileo.0g.ai/open/api` | `apps/contracts/hardhat.config.cjs:45` | ❌ No — hardcoded |
| `https://chainscan.0g.ai/open/api` | `apps/contracts/hardhat.config.cjs:53` | ❌ No — hardcoded |
| `https://faucet.0g.ai` | `apps/contracts/script/DeployAristotle.s.sol:68` | ❌ No — hardcoded inline |

### 1.8 gRPC / DA Endpoints

| URL | Locations | Configurable? |
|-----|-----------|---------------|
| `localhost:51001` (DA gRPC) | `.env.example:49` | ✅ Yes — via `DA_GRPC_URL` env var |
| (gRPC endpoint configurable) | `apps/indexer/src/da-client.ts:52` (constructor takes `grpcUrl`), `apps/indexer/src/da.ts:63` (`makeRealSubmitter`) | ✅ Yes |

### 1.9 WalletConnect

| URL | Locations | Configurable? |
|-----|-----------|---------------|
| `https://cloud.walletconnect.com` | `apps/frontend/.env.example:17` | ❌ N/A — documentation URL |
| WC Project ID `6f1ffc664e99b8191fb043890110f173` | `apps/frontend/.env.example:19` | ✅ Yes — via `VITE_WALLETCONNECT_PROJECT_ID` |

---

## 2. API Keys / Secret Env Vars

### 2.1 Private Keys

| Env Var | Canonical? | Used In | Purpose |
|---------|-----------|---------|---------|
| `AXIOM_TEE_SIGNER_PK` | ✅ Primary | `apps/backend/src/env-schema.ts:11`, `apps/oracle/src/env-schema.ts:6`, `apps/oracle/src/index.ts:17` | TEE oracle signing key |
| `DEPLOYER_PK` | ❌ Legacy | `apps/backend/src/env-schema.ts:12`, `apps/contracts/script/Deploy.s.sol:18`, `apps/indexer/src/index.ts:250`, `apps/backend/src/cli/run-e2e.ts:20` | Backend signer / deployer |
| `AXIOM_DEPLOYER_PK` | ✅ Primary | `apps/contracts/script/DeployAristotle.s.sol:42` | Deployer (Aristotle script) |
| `ORACLE_ADMIN_PK` | ❌ Legacy | `apps/contracts/script/Deploy.s.sol:19`, `apps/contracts/script/DeployPaymentProcessor.s.sol:34`, `apps/contracts/script/RedeployTeeVerifier.s.sol:26` | Oracle admin (contract owner) |
| `AXIOM_ORACLE_ADMIN_PK` | ✅ Primary | `apps/contracts/script/DeployAristotle.s.sol:43`, `apps/contracts/script/DeployPaymentProcessor.s.sol:20` | Oracle admin (Aristotle) |
| `RECEIVER_PK` | ❌ Test-only | `apps/backend/src/cli/run-e2e.ts` | E2E test receiver |
| `AXIOM_STORAGE_PRIVATE_KEY` | ✅ Optional | `apps/oracle/src/env-schema.ts:14`, `apps/oracle/src/index.ts:26` | Separate storage gas key |

### 2.2 Compute API Keys

| Env Var | Canonical? | Priority | Used In |
|---------|-----------|----------|---------|
| `AXIOM_COMPUTE_DIRECT_KEY` | ✅ Primary | 1st | `apps/backend/src/compute/router.ts:57` |
| `AXIOM_COMPUTE_API_KEY` | ✅ Primary | 2nd | `apps/backend/src/compute/router.ts:74` |
| `OG_COMPUTE_API_KEY` | ❌ Legacy | 3rd | `apps/backend/src/compute/router.ts:74` |

### 2.3 Other Auth

| Env Var | Canonical? | Used In | Purpose |
|---------|-----------|---------|---------|
| `AXIOM_API_KEY` | ✅ Primary | `packages/config/src/env-schema.ts:14`, `packages/config/src/middleware/auth.ts` | Optional bearer-token auth for HTTP endpoints |
| `VITE_WALLETCONNECT_PROJECT_ID` | ✅ Primary | `apps/frontend/src/config/wagmi.ts:22` | WalletConnect v2 project (currently has a default dev ID hardcoded in `.env.example`) |

### 2.4 Cross-Reference: `.env.example` vs Actual Usage

**Present in `.env.example` but unused in code:**
- None systematically — all vars have at least one consumer.

**Present in code but missing from `.env.example`:**
- `AXIOM_STORAGE_PRIVATE_KEY` — documented in `apps/backend/.env.example` but missing from root `.env.example`.
- `AXIOM_ORACLE_ADMIN_PK` — only in the Solidity deployment scripts, not in `.env.example`.
- `RECEIVER_PK` — e2e test only, not in `.env.example`.
- `AXIOM_LEGACY` — deployment script boolean flag, not in `.env.example`.
- `AXIOM_DEPLOYER_ADDRESS` — deployment script env var, not in `.env.example`.

---

## 3. Duplicate URL Definitions

### 3.1 Exact Duplicates

| URL | Count | All Locations |
|-----|-------|---------------|
| `https://evmrpc-testnet.0g.ai` | 15+ | Defined in `networks.ts`, `chains.ts`, `wagmi.ts`, `SettingsPage.tsx` (×3), `hardhat.config.cjs`, `package.json`, `server.ts`, `index.ts`, deploy scripts, `.env.example` files |
| `https://evmrpc.0g.ai` | 10+ | Same pattern across `networks.ts`, `chains.ts`, `wagmi.ts`, `hardhat.config.cjs`, deploy script |
| `https://indexer-storage-testnet-turbo.0g.ai` | 8+ | `networks.ts`, `server.ts`, `run-e2e.ts`, `.env.example` files |
| `https://indexer-storage-turbo.0g.ai` | 4+ | `networks.ts`, orchestrator test, deploy script |
| `http://127.0.0.1:8787` | 9+ | `env-schema.ts`, `.env.example`, orchestrator test (×4), `oracle/client.ts` |
| `http://localhost:5173` | 5+ | `server.ts` (×2), oracle `server.ts` (×2), `.env.example` |
| `http://127.0.0.1:3000` | 4+ | `env.ts`, `run-e2e.ts`, `.env.example` |

**Key finding:** The EVM RPC URLs are defined in **~15 separate locations** across the monorepo. While networking config is centralized in `packages/config/src/networks.ts`, many consumers duplicate the fallback/default string rather than importing the canonical function.

### 3.2 Common Patterns of Duplication

1. **`apps/frontend/src/config/chains.ts`** defines Galileo and Aristotle RPC URLs statically (for wagmi) that duplicate what's in `networks.ts`. The `wagmi.ts` config also has its own copies. These are not env-configurable at build time unless the user manually enters a URL.

2. **`apps/frontend/src/pages/SettingsPage.tsx`** hardcodes the RPC URLs for chain switching (`lines 46, 49`), duplicating the values from `chains.ts`.

3. **`apps/contracts/hardhat.config.cjs`** hardcodes RPC URLs with `||` fallback patterns that repeat the same strings as `networks.ts`.

4. **Solc deploy scripts** (`DeployAristotle.s.sol`) embed URLs in comment blocks and a VM-constructed JSON string (lines 158-160).

---

## 4. Hardcoded URLs That Should Be Configurable

### Medium Priority
1. **Block explorer URLs** (`chainscan-galileo.0g.ai`, `chainscan.0g.ai`) — hardcoded in 5+ frontend files + hardhat config. Should be centralized or env-configurable for different deployments.

2. **`KNOWN_PROVIDERS` in `apps/backend/src/compute/router.ts`** (lines 10-12) — hardcoded inference endpoint URLs for specific provider addresses. These are testnet-specific and would need updating for mainnet.

3. **`DEFAULT_MAINNET_URL` / `DEFAULT_TESTNET_URL`** in `router.ts` — While they have fallback to `OG_COMPUTE_BASE_URL`, the defaults themselves reference `integratenetwork.work` domains which may not be stable.

### Low Priority
4. **`https://faucet.0g.ai`** in `DeployAristotle.s.sol` — only in a console.log/error message, informational.
5. **`ipfs://axiom-storage`** in `Deploy.s.sol:38` — base URI for NFT metadata, somewhat acceptable to hardcode.
6. **`https://docs.0g.ai/` URLs** — documentation references, not functional endpoints.

---

## 5. Dead Integration Paths

### 5.1 gRPC DA Client — 95% complete, not wired in production
- `apps/indexer/src/da-client.ts` — Full gRPC `DaClient` with `disperseBlob`, `getBlobStatus`, `retrieveBlob`, `pollUntilFinalized`.
- `apps/indexer/src/da.ts` — `makeRealSubmitter()` factory, `submitEvent()` dispatcher.
- `apps/indexer/src/index.ts:264-270` — The `daConfig` logic chooses between `grpc`, `storage`, and `disabled` backends based on `INDEXER_DA_ENABLED` and `DA_GRPC_URL`.
- **Status:** Actively configurable but defaults to `disabled`. The gRPC client connects over insecure channel (`grpc.credentials.createInsecure()` in `da-client.ts:72`).
- README confirms: "gRPC client ready, sidecar TBD"

### 5.2 `integratenetwork.work` Domains
- `compute-network-6.integratenetwork.work` and `router-api-testnet.integratenetwork.work` are testnet-specific. They appear to be temporary/integration-network domains that may not be the final production URLs. **Risk of bitrot.**

---

## 6. Env Var Name Consolidation (Alias Chains)

The env var namespace has grown organically. Here is the full alias chain for each configuration axis:

| Canonical (AXIOM_*) | Aliases (legacy) | Used By |
|---------------------|-------------------|---------|
| `AXIOM_EVM_RPC` | `OG_RPC_URL`, `RPC_URL` | Backend, Indexer, Contracts |
| `AXIOM_STORAGE_RPC` | `OG_STORAGE_RPC` | Backend, Oracle, Indexer |
| `AXIOM_TEE_SIGNER_PK` | `TEE_SIGNER_PK` | Backend, Oracle |
| `AXIOM_COMPUTE_API_KEY` | `OG_COMPUTE_API_KEY` | Backend compute router |
| `AXIOM_ORACLE_URL` | `ORACLE_BASE_URL` | Backend orchestrator |
| `AXIOM_CHAIN_ID` | `OG_CHAIN_ID` | Backend, Indexer, Oracle |
| `AXIOM_AGENT_NFT_ADDRESS` | `AGENT_NFT_ADDRESS` | Backend |
| `AXIOM_STRATEGY_VAULT_ADDRESS` | `VAULT_ADDRESS` | Backend |
| `AXIOM_TEE_VERIFIER_ADDRESS` | `AXIOM_TEE_VERIFIER` | Backend, Oracle |
| `AXIOM_PAYMENT_PROCESSOR_ADDRESS` | `PAYMENT_PROCESSOR_ADDRESS`, `AXIOM_PAYMENT_PROCESSOR` | Backend |
| `AXIOM_MOCK_USDC_ADDRESS` | `AXIOM_PAYMENT_TOKEN` | Backend |

The alias resolution is centralized in `packages/config/src/env.ts` (function `getEnvWithAlias`) and `packages/config/src/addresses.ts`. This is good architecture.

---

## 7. Network Config Analysis (packages/config/src/networks.ts)

### Galileo (testnet, chainId 16602)
- **evmRpc:** `https://evmrpc-testnet.0g.ai` ✅
- **storageRpc:** `https://indexer-storage-testnet-turbo.0g.ai` ✅
- **flowContract:** `0x22E03a6A89B950F1c82ec5e74F8eCa321a105296` ✅

### Aristotle (mainnet, chainId 16661)
- **evmRpc:** `https://evmrpc.0g.ai` ✅
- **storageRpc:** `https://indexer-storage-turbo.0g.ai` ✅
- **flowContract:** `0x62D4144dB0F0a6fBBaeb6296c785C71B3D57C526` ✅

### Gaps
1. **No compute router URL in networks.ts** — `router.ts` has its own `DEFAULT_MAINNET_URL` / `DEFAULT_TESTNET_URL` duplication. These could live in `networks.ts` alongside evmRpc/storageRpc.
2. **No explorer URL in networks.ts** — Explorer URLs are scattered across frontend files and hardhat config. Adding `explorerUrl` to the `OGNetwork` interface would centralize this.
3. **No inference provider URLs in networks.ts** — The `KNOWN_PROVIDERS` map in `router.ts` is per-network data that logically belongs in `networks.ts`.
4. **No `oracleBaseUrl` per network** — default is `http://127.0.0.1:8787` everywhere, which is fine for dev but a mainnet oracle would have a different URL.

---

## 8. Recommendations

### 8.1 Centralize All Network URLs (High Priority)
Move compute router URLs and explorer URLs into `packages/config/src/networks.ts`:
```typescript
export interface OGNetwork {
  // existing fields...
  computeRouterUrl: string;
  directSdkProxyUrl: string;
  explorerUrl: string;
  explorerApiUrl: string;
}
```
This would eliminate ~10 hardcoded URL instances in the frontend and router code.

### 8.2 Make Provider Inference URLs Configurable (Medium Priority)
The `KNOWN_PROVIDERS` map in `router.ts` should either:
- Be moved to `networks.ts` as per-network data, OR
- Be read from an env var, OR
- Be fetched at runtime from the compute router's `/models` endpoint (the `/v1/compute/providers` route already calls the router)

### 8.3 Remove Duplicate Default Strings (Medium Priority)
Files that duplicate the Galileo fallback URL string instead of calling `resolveRpcUrl()`:
- `apps/frontend/src/config/chains.ts` — has hardcoded `http: ['https://evmrpc-testnet.0g.ai']`
- `apps/frontend/src/config/wagmi.ts:15` — `storedRpcUrl || 'https://evmrpc-testnet.0g.ai'`
- `apps/indexer/src/index.ts:20` — `OG_NETWORKS[GALILEO_CHAIN_ID]?.evmRpc ?? "https://evmrpc-testnet.0g.ai"`
- `apps/backend/src/server.ts:138` — `pickOGNetwork(ogChainId)?.storageRpc ?? "https://indexer-storage-testnet-turbo.0g.ai"`

These should all use the canonical `resolveRpcUrl()` / `resolveStorageRpc()` from `@axiom/config/networks`.

### 8.4 Consolidate Env Var Into Single `.env.example` (Low Priority)
Root `.env.example` has good coverage but is missing:
- `AXIOM_STORAGE_PRIVATE_KEY`
- `AXIOM_ORACLE_ADMIN_PK` / `AXIOM_DEPLOYER_PK`
- `AXIOM_DEPLOYER_ADDRESS`
- `AXIOM_LEGACY`
- `RECEIVER_PK` (maybe intentionally test-only)

### 8.5 Frontend RPC URLs Should Use Env Vars at Build Time (Medium Priority)
Currently the frontend hardcodes Galileo/Aristotle RPC URLs in `chains.ts` and `SettingsPage.tsx`. While users can override via localStorage, there's no build-time `VITE_EVM_RPC` to point the default at a different network. Consider adding `VITE_EVM_RPC_GALILEO` and `VITE_EVM_RPC_ARISTOTLE` to the `vite.config.ts` env.

### 8.6 DRPC Endpoint vs Official 0G RPC (Low Priority)
The test files use `https://0g-galileo-testnet.drpc.org` (a third-party DRPC gateway) while production uses `https://evmrpc-testnet.0g.ai` (official). For consistency, tests should default to the same official RPC as production code.

### 8.7 gRPC Security (Low Priority)
`apps/indexer/src/da-client.ts:72` uses `grpc.credentials.createInsecure()`. If the DA gRPC feature is activated for production, this should support TLS.

---

## Summary Statistics

| Category | Count |
|----------|-------|
| Unique external URLs | ~20 |
| Files with hardcoded URLs | ~25 across `apps/` and `packages/` |
| Private key env vars | 8 (3 canonical, 5 legacy/aliases) |
| API key env vars | 3 (1 for compute, 1 for HTTP auth) |
| Legacy alias chains | 11 documented |
| Dead/partial integrations | 1 (gRPC DA - code complete, not wired in prod) |
| Duplicate default URL strings | ~15 instances across codebase |

---

*End of deep-07 integration map. This map covers every external integration point discovered during a full-codebase scan.*
