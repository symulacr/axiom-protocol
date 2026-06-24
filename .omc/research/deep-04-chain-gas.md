# Deep Dive: Chain + Gas Configuration Audit

**Status:** HAS_GAPS

**Date:** 2026-06-24  
**Scope:** Axiom Protocol monorepo at `/home/eya/og`

---

## 1. RPC URLs

### 1.1 Canonical URLs

| Network | EVM RPC | Storage RPC |
|---------|---------|-------------|
| **Galileo** (testnet, 16602) | `https://evmrpc-testnet.0g.ai` | `https://indexer-storage-testnet-turbo.0g.ai` |
| **Aristotle** (mainnet, 16661) | `https://evmrpc.0g.ai` | `https://indexer-storage-turbo.0g.ai` |

### 1.2 Files Defining RPC URLs

All six locations below are consistent with the canonical URLs — **no old/hardcoded incorrect URLs found in production config**:

| File | Galileo EVM RPC | Aristotle EVM RPC | Notes |
|------|----------------|-------------------|-------|
| `packages/config/src/networks.ts` | ✅ `evmrpc-testnet.0g.ai` | ✅ `evmrpc.0g.ai` | Single source of truth |
| `apps/frontend/src/config/chains.ts` | ✅ `evmrpc-testnet.0g.ai` | ✅ `evmrpc.0g.ai` | viem `defineChain()` |
| `apps/frontend/src/config/wagmi.ts` | ✅ `evmrpc-testnet.0g.ai` | ✅ `evmrpc.0g.ai` | localStorage override supported |
| `apps/frontend/src/pages/SettingsPage.tsx` | ✅ `evmrpc-testnet.0g.ai` | ✅ `evmrpc.0g.ai` | Chain-switch updates RPC |
| `.env.example` | ✅ `evmrpc-testnet.0g.ai` | — | Root env |
| `apps/backend/.env.example` | ✅ `evmrpc-testnet.0g.ai` | — | Backend env |
| `apps/contracts/hardhat.config.cjs` | ✅ `evmrpc-testnet.0g.ai` | ✅ `evmrpc.0g.ai` | Uses `OG_RPC_URL` and `OG_RPC_MAINNET` env vars |
| `apps/contracts/package.json` | ✅ `evmrpc-testnet.0g.ai` | ✅ `evmrpc.0g.ai` | `deploy:galileo`/`deploy:mainnet` |
| `Makefile` | ✅ `evmrpc-testnet.0g.ai` | ✅ `evmrpc.0g.ai` | Lines 86, 92 |

### 1.3 FINDING: Alternative dRPC URL in Contract Tests

Seven Solidity test files use `https://0g-galileo-testnet.drpc.org` instead of the canonical `https://evmrpc-testnet.0g.ai`:

| File | Line(s) |
|------|---------|
| `apps/contracts/test/V12C3ValidUntil.t.sol` | 23 (constant `GALILEO_RPC`) |
| `apps/contracts/test/FuzzAxiomAgentNFT.t.sol` | 82, 414 |
| `apps/contracts/test/FuzzAxiomTeeVerifier.t.sol` | 41 |
| `apps/contracts/test/FuzzAxiomStrategyVault.t.sol` | 48 |
| `apps/contracts/test/FuzzAxiomPaymentProcessor.t.sol` | 350, 364 |
| `apps/backend/src/storage/0g.test.ts` | 11 (fallback for `OG_RPC_URL`) |

**Risk:** dRPC is a third-party RPC provider. If dRPC goes down or changes its URL scheme, all fork-based Solidity tests will break. Also, the dRPC endpoint may have different rate limits or data availability than the official 0G RPC.

**Recommendation:** Consider switching the test fork URLs to use the canonical `https://evmrpc-testnet.0g.ai` for consistency. If dRPC is intentionally used for higher rate limits or reliability, document the reason.

### 1.4 Storage RPC URLs

All storage RPC URLs are consistent:

| File | Galileo Storage | Aristotle Storage |
|------|----------------|-------------------|
| `packages/config/src/networks.ts` | ✅ `indexer-storage-testnet-turbo.0g.ai` | ✅ `indexer-storage-turbo.0g.ai` |
| `apps/backend/.env.example` | ✅ `indexer-storage-testnet-turbo.0g.ai` | — |
| `.env.example` | ✅ `indexer-storage-testnet-turbo.0g.ai` | — |
| `apps/backend/src/orchestrator/orchestrator-chainid.test.ts` | ✅ `indexer-storage-testnet-turbo.0g.ai` | ✅ `indexer-storage-turbo.0g.ai` |
| `apps/backend/src/cli/run-e2e.ts` | ✅ `indexer-storage-testnet-turbo.0g.ai` | — |
| `apps/contracts/script/DeployAristotle.s.sol` | — | ✅ `indexer-storage-turbo.0g.ai` (line 160) |

---

## 2. Chain ID Constants

### 2.1 Canonical Values

- **GALILEO_CHAIN_ID = 16602**
- **ARISTOTLE_CHAIN_ID = 16661**

### 2.2 Consistency Check

All 14+ references are **consistent** — no mismatches found:

| File | Value | Type |
|------|-------|------|
| `packages/config/src/networks.ts` | `16602` / `16661` | Constant (single source of truth) |
| `apps/frontend/src/config/chains.ts` | `GALILEO_CHAIN_ID` / `ARISTOTLE_CHAIN_ID` | viem config |
| `apps/frontend/src/pages/SettingsPage.tsx` | `GALILEO_CHAIN_ID` / `ARISTOTLE_CHAIN_ID` | Chain switch |
| `apps/frontend/src/pages/MarketPage.tsx` | `16661` hardcoded (line 48) | Explorer link — OK, conditional |
| `apps/frontend/src/pages/HistoryPage.tsx` | `16602` / `16661` hardcoded (lines 42-45) | Explorer link |
| `apps/backend/src/server.ts` | `GALILEO_CHAIN_ID` | Default fallback |
| `apps/backend/src/env-schema.ts` (shared) | `.default(16602)` | Zod schema |
| `apps/contracts/script/DeployAristotle.s.sol` | `16602` / `16661` | Solidity constants |
| `apps/contracts/script/DeployPaymentProcessor.s.sol` | `16602` | Solidity constant |
| `apps/contracts/script/RedeployTeeVerifier.s.sol` | `16602` | Solidity constant |
| `apps/contracts/test/V12C3ValidUntil.t.sol` | `16_602` (with underscore) | Solidity constant |
| `apps/contracts/hardhat.config.cjs` | `16602` / `16661` | Hardhat network |
| `apps/indexer/src/index.ts` | `GALILEO_CHAIN_ID` | Default |
| `.env.example` | `16602` | Env example |
| `apps/backend/.env.example` | `16602` | Env example |
| `apps/backend/src/compute/router.ts` | `16661` hardcoded in comment (line 42) | Comment-only |

### 2.2 FINDING: HistoryPage Uses Hardcoded Chain IDs Instead of Constants

**File:** `apps/frontend/src/pages/HistoryPage.tsx` (lines 42-45)
**File:** `apps/frontend/src/pages/MarketPage.tsx` (line 48-49)

These files use hardcoded `16602`/`16661` numbers instead of importing `GALILEO_CHAIN_ID`/`ARISTOTLE_CHAIN_ID` from `@axiom/config/networks`.

**Risk:** Low — these are switch/case discriminator checks for explorer URL construction. But if chain IDs ever change, these would be missed by a grep for the constant names.

**Recommendation:** Replace hardcoded `16602`/`16661` with `GALILEO_CHAIN_ID`/`ARISTOTLE_CHAIN_ID` imports in `HistoryPage.tsx` and `MarketPage.tsx`.

---

## 3. Gas Settings

### 3.1 Foundry Configuration (`apps/contracts/foundry.toml`)

```toml
evm_version = "cancun"
solc = "0.8.20"
optimizer = true
optimizer_runs = 200
via_ir = true
gas_reports = ["*"]
```

- Uses Cancun EVM (supports EIP-1559, transient storage, MCOPY, etc.)
- Solc 0.8.20 (compatible with 0G chain)
- Optimizer at 200 runs (gas-efficient for deployment, moderate for runtime)
- `gas_reports = ["*"]` — all contracts get gas reports in test output

### 3.2 Deployment Scripts Gas Flags

| Script | Gas Flags | Priority Tip |
|--------|-----------|-------------|
| `RedeployTeeVerifier.s.sol` | `--priority-gas-price 3000000000 --legacy --slow` | 3 Gwei |
| `DeployPaymentProcessor.s.sol` | `--priority-gas-price 2000000000 --legacy --slow` | 2 Gwei |
| `DeployAristotle.s.sol` | `--slow` (no explicit priority gas) | Default |
| `Deploy.s.sol` | No explicit flags | Default |

### 3.3 FINDING: Legacy Transaction Mode Used for Deployment

All deployment scripts in the project use `--legacy` flag, which means they send legacy (type-0) transactions instead of EIP-1559 (type-2) transactions. The `--priority-gas-price` flag in Forge modifies behavior depending on context:

- **With `--legacy`:** `--priority-gas-price` sets the `gasPrice` directly (acts as the full gas price, not just priority)
- **Without `--legacy`:** `--priority-gas-price` would set the `maxPriorityFeePerGas` in EIP-1559

The `--slow` flag uses automatic gas estimation (learns from recent blocks).

**Recommendation:** Verify that `--legacy` + `--priority-gas-price 3000000000` is intentional. If 0G chain supports EIP-1559 (it should with Cancun EVM), consider removing `--legacy` and using proper EIP-1559 fee estimation. The values 2-3 Gwei may be higher than needed for Galileo testnet — consider monitoring actual gas prices and adjusting.

### 3.4 Application-Level Gas Handling

There are **no explicit gas/priorityFee/maxFee configurations** anywhere in the application code (`apps/backend`, `apps/oracle`, `apps/frontend`).

- **Backend** (`ethers.js`): When sending transactions via `contract.mint()`, `contract.deposit()`, etc., ethers v6 will auto-estimate gas. No `gasLimit`, `maxFeePerGas`, or `maxPriorityFeePerGas` overrides are applied.
- **Orchestrator** (`apps/backend/src/orchestrator/index.ts`): No gas overrides on `vaultTc.contract.execute()`.
- **Oracle** (`apps/oracle/src/index.ts`): No gas configuration on the storage wallet comments ("In production this wallet must hold 0G tokens for gas").
- **Indexer**: Uses `ethers.JsonRpcProvider` with no custom gas settings.

**Risk:** Low for testnet (ether is freely available from the faucet). For mainnet, relying on auto-estimation could lead to stuck transactions if the 0G chain gas market behaves differently from Ethereum. Consider adding configurable `maxFeePerGas` / `maxPriorityFeePerGas` overrides for production use.

### 3.5 Gas Benchmark Tests

`apps/contracts/test/GasBenchmark.t.sol` provides Foundry gas snapshots for all core operations (deployments, mint, transfer, vault operations, payment operations). This is good for tracking gas costs over time.

---

## 4. 0G-Specific Precompiles

**No 0G-specific precompile references found anywhere in the codebase.**

- Zero search results for `precompile`, `PRE_COMPILE`, `precompiled`
- The `foundry.toml` uses `evm_version = "cancun"`, which is the standard Ethereum EVM version
- Contracts compile with standard Solidity — no 0G-specific assembly, precompile calls, or custom opcodes

**Assessment:** This is appropriate. 0G Chain is EVM-equivalent, meaning standard Ethereum precompiles (ecRecover, SHA256, RIPEMD160, identity, modexp, ecAdd, ecMul, ecPairing, blake2f, pointEvaluation) are available. No 0G-specific precompiles are documented or needed for this protocol.

---

## 5. Frontend Chain Config

### 5.1 `apps/frontend/src/config/chains.ts`

**Status: ✅ Correct**

```typescript
// Galileo Testnet
export const galileo = defineChain({
  id: 16602,                    // ✅ Correct
  name: '0G Galileo Testnet',   // ✅
  nativeCurrency: { name: 'OG', symbol: 'OG', decimals: 18 },  // ✅
  rpcUrls: { default: { http: ['https://evmrpc-testnet.0g.ai'] } },  // ✅
  blockExplorers: { default: { name: '0G Explorer', url: 'https://chainscan-galileo.0g.ai' } },  // ✅
  testnet: true,                // ✅
});

// Aristotle Mainnet
export const aristotle = defineChain({
  id: 16661,                    // ✅ Correct
  name: '0G Aristotle Mainnet', // ✅
  nativeCurrency: { name: 'OG', symbol: 'OG', decimals: 18 },  // ✅
  rpcUrls: { default: { http: ['https://evmrpc.0g.ai'] } },  // ✅
  blockExplorers: { default: { name: '0G Explorer', url: 'https://chainscan.0g.ai' } },  // ✅
  testnet: false,               // ✅
});
```

### 5.2 `apps/frontend/src/config/wagmi.ts`

**Status: ✅ Correct with one concern**

```typescript
const galileoRpc = storedRpcUrl || 'https://evmrpc-testnet.0g.ai';
const aristotleRpc = storedRpcUrl || 'https://evmrpc.0g.ai';
```

- Uses localStorage-stored RPC URL with sensible defaults
- Both Galileo and Aristotle share the same localStorage key (`axiom.rpcUrl`), meaning switching chains also requires re-saving the RPC URL
- The `SettingsPage.tsx` handles this correctly: switching chain automatically resets the RPC to the default for that chain

### 5.3 SettingsPage Chain Switching

**Status: ✅ Correct**

When user switches from Galileo to Aristotle or vice versa, `SettingsPage.tsx`:
1. Updates the `axiom.chainId` localStorage value
2. Resets the RPC URL to the correct default for that chain
3. User must reload the page for wagmi to pick up the new RPC URL

### 5.4 Hardcoded Chain IDs in Frontend Pages

**Finding:** `HistoryPage.tsx` (line 42: `case 16602:` / line 44: `case 16661:`) and `MarketPage.tsx` (line 48: `chainId === 16661 ? 'https://chainscan.0g.ai' : 'https://chainscan-galileo.0g.ai'`) use hardcoded chain IDs. See Section 2.2 above.

---

## Summary of Findings & Recommendations

| # | Finding | Severity | File(s) | Recommendation |
|---|---------|----------|---------|----------------|
| 1 | Contract tests use `https://0g-galileo-testnet.drpc.org` instead of canonical `evmrpc-testnet.0g.ai` | 🟡 Medium | 7 test files | Document why dRPC is used, or switch to official RPC for consistency |
| 2 | Deployment scripts use `--legacy` mode with explicit `--priority-gas-price` | 🟡 Medium | 2 deploy scripts | Verify 0G chain supports EIP-1559; if so, remove `--legacy` and use EIP-1559 fee estimation |
| 3 | No explicit gas limits/price overrides in application code | 🟢 Low | `apps/backend`, `apps/oracle` | Consider adding configurable `maxFeePerGas`/`maxPriorityFeePerGas` for mainnet robustness |
| 4 | Hardcoded chain IDs in `HistoryPage.tsx` and `MarketPage.tsx` | 🟢 Low | 2 frontend files | Import `GALILEO_CHAIN_ID`/`ARISTOTLE_CHAIN_ID` from `@axiom/config/networks` |
| 5 | No 0G-specific precompile references | 🟢 Info | N/A | OK — chain is EVM-equivalent |
| 6 | All canonical RPC URLs and chain IDs are consistent | ✅ OK | All files | No incorrect URLs found in production config |

---

## Files Checked (37 total)

### Core config
- `/home/eya/og/packages/config/src/networks.ts`
- `/home/eya/og/packages/config/src/env.ts`
- `/home/eya/og/packages/config/src/env-schema.ts`
- `/home/eya/og/packages/config/src/addresses.ts`
- `/home/eya/og/packages/config/src/index.ts`

### Frontend
- `/home/eya/og/apps/frontend/src/config/chains.ts`
- `/home/eya/og/apps/frontend/src/config/wagmi.ts`
- `/home/eya/og/apps/frontend/src/pages/SettingsPage.tsx`
- `/home/eya/og/apps/frontend/src/pages/MarketPage.tsx`
- `/home/eya/og/apps/frontend/src/pages/HistoryPage.tsx`

### Backend
- `/home/eya/og/apps/backend/src/index.ts`
- `/home/eya/og/apps/backend/src/server.ts`
- `/home/eya/og/apps/backend/src/env-schema.ts`
- `/home/eya/og/apps/backend/.env.example`
- `/home/eya/og/apps/backend/src/compute/router.ts`
- `/home/eya/og/apps/backend/src/orchestrator/index.ts`
- `/home/eya/og/apps/backend/src/orchestrator/orchestrator-chainid.test.ts`
- `/home/eya/og/apps/backend/src/cli/run-e2e.ts`
- `/home/eya/og/apps/backend/src/storage/0g.test.ts`

### Contracts
- `/home/eya/og/apps/contracts/foundry.toml`
- `/home/eya/og/apps/contracts/hardhat.config.cjs`
- `/home/eya/og/apps/contracts/package.json`
- `/home/eya/og/apps/contracts/script/Deploy.s.sol`
- `/home/eya/og/apps/contracts/script/DeployAristotle.s.sol`
- `/home/eya/og/apps/contracts/script/DeployPaymentProcessor.s.sol`
- `/home/eya/og/apps/contracts/script/RedeployTeeVerifier.s.sol`
- `/home/eya/og/apps/contracts/test/V12C3ValidUntil.t.sol`
- `/home/eya/og/apps/contracts/test/FuzzAxiomAgentNFT.t.sol`
- `/home/eya/og/apps/contracts/test/FuzzAxiomTeeVerifier.t.sol`
- `/home/eya/og/apps/contracts/test/FuzzAxiomStrategyVault.t.sol`
- `/home/eya/og/apps/contracts/test/FuzzAxiomPaymentProcessor.t.sol`
- `/home/eya/og/apps/contracts/test/GasBenchmark.t.sol`

### Oracle
- `/home/eya/og/apps/oracle/src/index.ts`
- `/home/eya/og/apps/oracle/src/env-schema.ts`

### Indexer
- `/home/eya/og/apps/indexer/src/index.ts`
- `/home/eya/og/apps/indexer/src/sink.ts`

### Root
- `/home/eya/og/.env.example`
- `/home/eya/og/Makefile`
