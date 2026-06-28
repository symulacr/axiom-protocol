# Dead Classes & Components Report — Axiom Protocol

**Agent:** W3A3-DeadClasses  
**Date:** 2026-06-28  
**Scope:** React components, TypeScript classes, Solidity contracts in `/home/eya/og`

---

## React Components — Dead (Unused)

### 1. `MonoInput.tsx` — NEVER IMPORTED
- **File:** `apps/frontend/src/components/MonoInput.tsx`
- **Export:** `export const MonoInput = forwardRef(...)` (line 6)
- **Evidence:** Zero import references across the entire `apps/frontend/src/` tree.
- **Status:** **DEAD** — monospace hex input (addresses, keys, hashes) that nothing uses.

### 2. `MetadataGrid.tsx` — NEVER IMPORTED
- **File:** `apps/frontend/src/components/MetadataGrid.tsx`
- **Export:** `export function MetadataGrid({ children })` (line 9)
- **Evidence:** Zero import references across the entire `apps/frontend/src/` tree. Utils `format.ts` does not reference it.
- **Status:** **DEAD** — standardized `<dl>` definition list grid, never rendered anywhere.

### 3. `MutedText.tsx` — NEVER IMPORTED
- **File:** `apps/frontend/src/components/MutedText.tsx`
- **Export:** `export function MutedText({ children, style })` (line 10)
- **Evidence:** Zero import references across the entire `apps/frontend/src/` tree.
- **Status:** **DEAD** — muted `<p>` wrapper that nothing uses (inline `<p style={{color: COLORS.textMuted}}>` is used instead everywhere).

---

## React Components — Alive (Verified)

| Component | File | Used By | How |
|-----------|------|---------|-----|
| `ErrorBoundary` | `ErrorBoundary.tsx` | `App.tsx:236` | `<ErrorBoundary>` wraps `<Routes>` |
| `HealthBadge` | `HealthBadge.tsx` | `App.tsx:191` | `<HealthBadge />` in header |
| `COLORS` (from ui.tsx) | `ui.tsx` | `App.tsx:7`, `main.tsx:9`, all pages | Constants import |
| `ExecutePanel` | `ExecutePanel.tsx` | `AgentDetail.tsx:9` | Lazy import |
| `TransferModal` | `TransferModal.tsx` | `AgentDetail.tsx:11` | Lazy import |
| `ProviderCard` | `ProviderCard.tsx` | `MarketPage.tsx:6` | Direct import |
| `MintForm` | `MintForm.tsx` | `MintAgentPage.tsx:5` | Direct import |
| `PaymentPanel` | `PaymentPanel.tsx` | `AgentDetail.tsx:10` | Lazy import |
| `TradeHistory` | `TradeHistory.tsx` | `AgentDetail.tsx:14` | Lazy import |
| `EmptyState` | `EmptyState.tsx` | `AgentDetail.tsx:15`, `TradeHistory.tsx:4` | Direct import |
| `PerformanceMetrics` | `PerformanceMetrics.tsx` | `AgentDetail.tsx:13` | Lazy import |
| `DepositForm` | `DepositForm.tsx` | `AgentDetail.tsx:12` | Lazy import |
| `EventTimeline` | `EventTimeline.tsx` | `AgentDetail.tsx:8` | Lazy import |
| `ui.tsx` components | `ui.tsx` | All pages + App.tsx | Various (Skeleton, Card, PageHeader, etc.) |

**Pages** (all lazy-loaded in `App.tsx` routes, all alive):

| Page | Route | App.tsx line |
|------|-------|-------------|
| `AgentDetail` | `/agents/:tokenId` | 10, 250 |
| `MarketPage` | `/market` | 11, 251 |
| `AgentsBrowser` | `/agents` | 12, 248 |
| `MintAgentPage` | `/agents/new` | 13, 249 |
| `ChatPage` | `/chat` | 14, 252 |
| `NotFound` | `*` | 15, 254 |

---

## TypeScript Classes — All Alive

| Class | File | Instantiated At | Notes |
|-------|------|-----------------|-------|
| `EventStore` | `apps/backend/src/events/store.ts:44` | `store.ts:285` via `getEventStore()` | Singleton pattern, persistence |
| `StrategyRunner` | `apps/backend/src/orchestrator/index.ts:55` | `apps/backend/src/server.ts:99` | Created on orchestrator init |
| `PaymentProcessorClient` | `apps/backend/src/payment/processor.ts:49` | `apps/backend/src/server.ts:118` | Payment operations |
| `Watcher` | `apps/indexer/src/watcher.ts:497` | `apps/indexer/src/index.ts:231` | Block event watcher |
| `TeeSigner` | `apps/oracle/src/signer.ts:57` | `apps/oracle/src/index.ts:20` | Oracle signing |
| `ErrorBoundary` | `apps/frontend/src/components/ErrorBoundary.tsx:14` | `App.tsx:236` as `<ErrorBoundary>` | React class component |
| `InMemoryStorage` | `packages/config/src/storage/0g.ts:37` | `apps/oracle/src/index.ts:36` | Dev/test fallback |
| `ZeroGStorage` | `packages/config/src/storage/0g.ts:97` | Backend `orchestrator/index.ts:74`, `cli/run-e2e.ts:119`, Oracle `index.ts:33` | Production storage |
| `TypedContract<T>` | `packages/config/src/types/contract.ts:7` | Multiple: `server.ts:116,227`, `run-e2e.ts:255`, `orchestrator/index.ts:164,239`, `processor.ts:60,61`, `agents.ts:130` | Generic contract wrapper |

**No dead TypeScript classes found.**

---

## Solidity Contracts — All Alive (src/)

### Contracts Deployed via Scripts

| Contract | File | Deployed By | Status |
|----------|------|-------------|--------|
| `AxiomPaymentProcessor` | `src/AxiomPaymentProcessor.sol` | `Deploy.s.sol:50`, `DeployPaymentProcessor.s.sol:63`, `DeployAristotle.s.sol` | **ALIVE** |
| `AxiomStrategyVault` | `src/AxiomStrategyVault.sol` | `Deploy.s.sol:45`, `DeployAristotle.s.sol` | **ALIVE** |
| `AxiomAgentNFT` | `src/AxiomAgentNFT.sol` | `Deploy.s.sol:29` (implementation), `DeployAristotle.s.sol` | **ALIVE** |
| `AxiomTeeVerifier` | `src/verifiers/AxiomTeeVerifier.sol` | `Deploy.s.sol:27`, `RedeployTeeVerifier.s.sol:38`, `DeployAristotle.s.sol` | **ALIVE** |

### Abstract Base / Extension Contracts (All Imported by Deployed Contracts)

| Contract | File | Imported By | Status |
|----------|------|-------------|--------|
| `ERC7857Upgradeable` | `src/ERC7857Upgradeable.sol` | `AxiomAgentNFT.sol:21` (via `import`) | **ALIVE** |
| `BaseVerifier` | `src/verifiers/BaseVerifier.sol` | `AxiomTeeVerifier.sol:6` | **ALIVE** |
| `ERC7857AuthorizeUpgradeable` | `src/extensions/ERC7857AuthorizeUpgradeable.sol` | `AxiomAgentNFT.sol:23` | **ALIVE** |
| `ERC7857CloneableUpgradeable` | `src/extensions/ERC7857CloneableUpgradeable.sol` | `AxiomAgentNFT.sol:22` | **ALIVE** |
| `AxiomMetadataJson` | `src/extensions/AxiomMetadataJson.sol` | `AxiomAgentNFT.sol:27`, used at `:62` | **ALIVE** |
| `ERC7857IDataStorageUpgradeable` | `src/extensions/ERC7857IDataStorageUpgradeable.sol` | `AxiomAgentNFT.sol:24` | **ALIVE** |

### Interfaces (All Imported by Alive Contracts)

| Interface | File | Imported By |
|-----------|------|-------------|
| `IERC7857` | `src/interfaces/IERC7857.sol` | `ERC7857Upgradeable.sol:7` |
| `IERC7857Authorize` | `src/interfaces/IERC7857Authorize.sol` | `ERC7857AuthorizeUpgradeable` |
| `IERC7857Metadata` | `src/interfaces/IERC7857Metadata.sol` | `ERC7857Upgradeable.sol:8`, `AxiomAgentNFT.sol:26` |
| `IERC7857Cloneable` | `src/interfaces/IERC7857Cloneable.sol` | `ERC7857CloneableUpgradeable` |
| `IERC7857DataVerifier` | `src/interfaces/IERC7857DataVerifier.sol` | `BaseVerifier.sol:4`, `ERC7857Upgradeable.sol:9` |
| `IAxiomAgentNFT` | `src/interfaces/IAxiomAgentNFT.sol` | `AxiomPaymentProcessor.sol:10`, `AxiomStrategyVault.sol:11` |

### Test Contracts (Not Deployed in Production — Test-Only, Alive)

| Contract | File | Used By Test |
|----------|------|-------------|
| `MockERC20FalseReturn` | `apps/bench/discovery/sol/src/MockERC20FalseReturn.sol` | Bench: `payment-processor-bench.ts:204` |
| `MockERC20FeeOnTransfer` | `apps/bench/discovery/sol/src/MockERC20FeeOnTransfer.sol` | Bench: `payment-processor-bench.ts:205` |
| `MockERC20NoReturn` | `apps/bench/discovery/sol/src/MockERC20NoReturn.sol` | Bench: `payment-processor-bench.ts:203` |
| `GasBurner` | `apps/bench/discovery/sol/src/GasBurner.sol` | Bench: `strategy-vault-bench.ts` |
| `PaymentProcessorBenchHelper` | `apps/bench/discovery/sol/src/PaymentProcessorBenchHelper.sol` | Bench: `payment-processor-bench.ts:206` |

---

## Lib Contracts (0g-agent-nft) — Summary

These reside in `apps/contracts/lib/0g-agent-nft/contracts/` as a vendored git dependency.

### Used from Lib
- `Utils.sol` — imported as `@0g-agent-nft/Utils.sol` by `src/ERC7857Upgradeable.sol:11`
- `interfaces/IERC7857Metadata.sol` — imported by `src/interfaces/IERC7857Metadata.sol:4` (re-export)

### Unused from Lib (Not Imported by Any Project Code)
| Contract | Reason |
|----------|--------|
| `AgentMarket.sol` | Axiom uses its own payment processor |
| `AgentNFT.sol` | Axiom has custom `AxiomAgentNFT` |
| `TeeVerifier.sol` | Axiom has custom `AxiomTeeVerifier` |
| `Verifier.sol` | Not referenced; BaseVerifier is adapted separately |
| `BaseVerifier.sol` (under `verifiers/base/`) | Not referenced; Axiom has its own copy |
| `ERC7857Upgradeable.sol` | Axiom has forked copy at `src/ERC7857Upgradeable.sol` |
| `ERC7857AuthorizeUpgradeable.sol` | Axiom has forked copy |
| `ERC7857CloneableUpgradeable.sol` | Axiom has forked copy |
| `ERC7857IDataStorageUpgradeable.sol` | Axiom has forked copy |
| `IERC7857.sol` | Axiom has re-implementation |
| `IERC7857Authorize.sol` | Axiom has re-implementation |
| `IERC7857Cloneable.sol` | Axiom has re-implementation |
| `IERC7857DataVerifier.sol` | Axiom has re-implementation |
| `IERC7857Legacy.sol` | Not needed; legacy format |
| `IERC7857MetadataLegacy.sol` | Not needed; legacy format |
| `IERC7857Metadata.sol` | Axiom wraps with singular alias |
| `IAgentMarket.sol` | Not referenced |
| `BeaconProxy.sol` | Not deployed; Axiom uses ERC1967Proxy |
| `UpgradeableBeacon.sol` | Not deployed |

**Note:** These are *inactive vendored dependency code*, not actively dead project code. They exist because the project forked several contracts from `0g-agent-nft` and keeps the original as a reference/remapping dependency.

---

## Summary

| Category | Total | Dead | Alive |
|----------|-------|------|-------|
| React Components (excluding ui.tsx sub-components) | 16 | **3** | 13 |
| TypeScript Classes | 9 | **0** | 9 |
| Solidity Contracts (src/) | 12 | **0** | 12 |
| Solidity Test/Bench Contracts | 5 | **0** | 5 |
| Lib Contracts (0g-agent-nft) | 18 | **18** (not imported by project code) | 0 |

### Actionable Dead Code

**3 React components are unused and candidates for removal:**
1. `apps/frontend/src/components/MonoInput.tsx` — monospace hex input, never imported
2. `apps/frontend/src/components/MetadataGrid.tsx` — definition list grid, never imported
3. `apps/frontend/src/components/MutedText.tsx` — muted text paragraph, never imported

These carry no dependencies and can be safely deleted without impacting any page or component.
