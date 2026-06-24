# 0G Chain Integration — Fix Plan

> Generated: 2026-06-24
> Source: `.omc/research/stack-chain.md` + live curl verification + source code audit

---

## Live RPC Verification (re-confirmed)

| Endpoint | `eth_chainId` | Decimal | Status |
|----------|--------------|---------|--------|
| `https://evmrpc-testnet.0g.ai` | `0x40da` | **16602** (Galileo) | ✅ Live, block `0x269dff7` (~40.8M) |
| `https://evmrpc.0g.ai` | `0x4115` | **16661** (Aristotle) | ✅ Live, block `0x2340056` (~37.0M) |
| `https://0g-galileo-testnet.drpc.org` | `0x40da` | 16602 (proxy, same) | ⚠️ Third-party, matches but unreliable |
| Gas price (Galileo) | `0xee6b2807` | ~4.0 gwei | ✅ Reasonable |

---

## Issues to Fix (ordered by priority)

---

### ISSUE 1: dRPC third-party RPC in Solidity forge tests (2 files, 4 more occurrences in other tests)

**Severity:** MEDIUM 🟡

**Rationale:** Several files hardcode `https://0g-galileo-testnet.drpc.org` as the fork RPC URL — a third-party proxy with no SLA tied to 0G. The official `https://evmrpc-testnet.0g.ai` is the canonical endpoint used everywhere else in the codebase.

**Audit note:** `grep` found dRPC in **5 files total** (7 occurrences). The plan covers the explicit constants; inline `vm.createSelectFork()` calls in `FuzzAxiomStrategyVault.t.sol`, `FuzzAxiomPaymentProcessor.t.sol`, and `FuzzAxiomAgentNFT.t.sol` should also be fixed. The `0g.test.ts` fallback is handled by Issue 2e.

---

#### ISSUE 1a — `FuzzAxiomTeeVerifier.t.sol`

**File:** `/home/eya/og/apps/contracts/test/FuzzAxiomTeeVerifier.t.sol`
**Line:** 42

**Current code:**
```solidity
string  internal constant RPC = "https://0g-galileo-testnet.drpc.org";
```

**Fix plan:** Change the RPC constant to use the official endpoint.
```solidity
string  internal constant RPC = "https://evmrpc-testnet.0g.ai";
```

**Validation:** Run `forge test --match-contract FuzzAxiomTeeVerifier -vvv`. All previous passing tests must continue to pass. The fork block (`GALILEO_FORK_BLOCK = 38_748_015`) is identical regardless of RPC endpoint, so all proof signatures and assertions are deterministic.

**Risk:** None. The RPC URL change only affects which JSON-RPC endpoint is used for the `vm.createSelectFork()` call. All on-chain state at the pinned fork block is identical.

---

#### ISSUE 1b — `V12C3ValidUntil.t.sol`

**File:** `/home/eya/og/apps/contracts/test/V12C3ValidUntil.t.sol`
**Line:** 23

**Current code:**
```solidity
string internal constant GALILEO_RPC = "https://0g-galileo-testnet.drpc.org";
```

**Fix plan:** Change the RPC constant to use the official endpoint.
```solidity
string internal constant GALILEO_RPC = "https://evmrpc-testnet.0g.ai";
```

**Validation:** Run `forge test --match-contract V12C3ValidUntil -vvv`. All 5 deterministic tests must pass. This test uses `vm.createSelectFork(GALILEO_RPC)` without a pinned block number (forks at latest), so the test depends on RPC being alive — one more reason to use the official endpoint.

**Risk:** None. Only the fork RPC URL changes.

---

> **Note:** `0g.test.ts` (Issue 1c) is handled by Issue 2e below — `resolveRpcUrl(GALILEO_CHAIN_ID)` replaces both the dRPC URL fallback and the raw `process.env` access. Do not apply a separate fix for that file.

---

### ISSUE 2: `JsonRpcProvider` missing explicit `chainId` / `staticNetwork` / timeout (all 6 instances)

**Severity:** MEDIUM 🟡

**Rationale:** Under ethers v6, `new JsonRpcProvider(url)` without a second argument triggers a live `eth_chainId` call on every `provider.getNetwork()` invocation (~200-500ms latency, race conditions). Without `staticNetwork: true`, the provider re-detects the chain on every call, risking NETWORK_MISMATCH errors. Without `FetchRequest` timeout, the provider can hang for default HTTP timeouts (60s+). The indexer already uses the best pattern (`staticNetwork: true`) but still lacks timeout.

**Existing functions available for reuse:**
- `resolveRpcUrl(chainId?)` at `packages/config/src/networks.ts:40-47` — resolves EVM RPC from `AXIOM_EVM_RPC` → `OG_RPC_URL` → `RPC_URL` → chain default
- `resolveStorageRpc(chainId?)` at `networks.ts:49-53` — resolves storage RPC from `AXIOM_STORAGE_RPC` → `OG_STORAGE_RPC` → chain default
- `getEnvWithAlias(canonical, aliases, fallback)` at `packages/config/src/env.ts:78-84` — env var resolution with backward-compat aliases
- `pickOGNetwork(chainId)` at `networks.ts:37-38` — look up OGNetwork entry by chain ID
- `GALILEO_CHAIN_ID = 16602`, `ARISTOTLE_CHAIN_ID = 16661` at `networks.ts:12-13`

> **SDK note:** There is no 0G SDK factory for creating pre-configured providers. All 6 instances use ethers v6 directly with `FetchRequest` timeout.

---

#### ISSUE 2a — `backend/src/index.ts`

**File:** `/home/eya/og/apps/backend/src/index.ts`
**Line:** 12

**Current code:**
```typescript
const provider = new JsonRpcProvider(env.AXIOM_EVM_RPC);
```

**Fix plan:** Add explicit `chainId`, `staticNetwork: true`, and `FetchRequest` timeout.

**Exact replacement code:**
```typescript
import { FetchRequest, JsonRpcProvider, Wallet } from "ethers";
import { getAddress } from "viem";
import { startServer } from "./server.js";
import { loadEnv } from "./env.js";
import { backendEnvSchema } from "./env-schema.js";
import { DEPLOYED_ADDRESSES } from "@axiom/config/addresses";
import { GALILEO_CHAIN_ID } from "@axiom/config/networks";

loadEnv();

export const env = backendEnvSchema.parse(process.env);

const fetchReq = new FetchRequest(env.AXIOM_EVM_RPC);
fetchReq.timeout = 10_000;

const provider = new JsonRpcProvider(
  fetchReq,
  env.AXIOM_CHAIN_ID ?? GALILEO_CHAIN_ID,
  { staticNetwork: true },
);
const signer = new Wallet(env.DEPLOYER_PK, provider);
```

**Key changes:**
1. Import `FetchRequest` alongside `JsonRpcProvider` and `Wallet`
2. Import `GALILEO_CHAIN_ID` from `@axiom/config/networks`
3. Create `FetchRequest` with explicit 10s timeout
4. Pass chain ID as second arg (from `env.AXIOM_CHAIN_ID` with Galileo fallback)
5. Pass `{ staticNetwork: true }` as third arg

**Note:** `env.AXIOM_EVM_RPC` is already URL-validated by `backendEnvSchema` — no hardcoded fallback needed at this call site.

---

#### ISSUE 2b — `backend/src/server.ts`

**File:** `/home/eya/og/apps/backend/src/server.ts`
**Line:** 160

**Current code:**
```typescript
const provider = new ethers.JsonRpcProvider(config.evmRpc);
```

**Fix plan:** The `ogChainId` variable is already computed at line 137. Reuse it and add `FetchRequest` timeout + `staticNetwork: true`.

**Exact replacement code:**
```typescript
  const fetchReq = new ethers.FetchRequest(config.evmRpc);
  fetchReq.timeout = 10_000;
  const provider = new ethers.JsonRpcProvider(fetchReq, ogChainId, { staticNetwork: true });
```

This replaces line 160. The import at line 1 must be updated:
```typescript
import { ethers, type TransactionResponse, type Wallet, FetchRequest } from "ethers";
```

**Note:** `ogChainId` already computed at line 137 as `config.env?.AXIOM_CHAIN_ID ?? GALILEO_CHAIN_ID` — reused as the second constructor arg.

---

#### ISSUE 2c — `orchestrator/index.ts`

**File:** `/home/eya/og/apps/backend/src/orchestrator/index.ts`
**Line:** 80

**Current code:**
```typescript
this.provider = new JsonRpcProvider(config.evmRpc, chainId);
```

**Fix plan:** Add `FetchRequest` timeout + `staticNetwork: true`.

**Exact replacement code:**
```typescript
    const fetchReq = new FetchRequest(config.evmRpc);
    fetchReq.timeout = 10_000;
    this.provider = new JsonRpcProvider(fetchReq, chainId, { staticNetwork: true });
```

Update the import at line 1:
```typescript
import { AbiCoder, FetchRequest, JsonRpcProvider, keccak256, type TransactionReceipt, type TransactionResponse } from "ethers";
```

**Note:** Already has `chainId` (line 80: `new JsonRpcProvider(config.evmRpc, chainId)`) — only needs timeout + `staticNetwork: true`.

---

#### ISSUE 2d — `cli/run-e2e.ts`

**File:** `/home/eya/og/apps/backend/src/cli/run-e2e.ts`
**Line:** 32

**Current code:**
```typescript
const RPC = getEnv("OG_RPC_URL");
// ...
const provider = new JsonRpcProvider(RPC);
```

**Fix plan:** Add explicit `chainId`, `staticNetwork: true`, `FetchRequest` timeout, and switch to `getEnvWithAlias` for modern env var support.

**Exact replacement code:**
```typescript
import { randomBytes } from "node:crypto";
import { Wallet, parseEther, hexlify, toUtf8Bytes, FetchRequest, JsonRpcProvider, getBytes, SigningKey, computeAddress, type TransactionResponse } from "ethers";
import { TypedContract } from "@axiom/config/types/contract";
import { keccak256 } from "ethereum-cryptography/keccak";
import { ZeroGStorage } from "../storage/0g.js";
import { encrypt as eciesEncrypt, decrypt as eciesDecrypt } from "eciesjs";
import { loadEnv, getEnv, getEnvWithAlias } from "../env.js";
import { aesGcmEncrypt } from "@axiom/oracle/crypto/aes-gcm.js";
import { accessMessageHash, type Eip712Domain } from "@axiom/oracle/signer";
import { deriveUncompressedPubkeyFromHex } from "@axiom/oracle/crypto/secp256k1";
import { GALILEO_CHAIN_ID } from "@axiom/config/networks";
// (rest of imports unchanged)

loadEnv();

const DEPLOYER_PK = getEnv("DEPLOYER_PK");
const TEE_SIGNER_PK = getEnv("TEE_SIGNER_PK");
const RPC = getEnvWithAlias("AXIOM_EVM_RPC", ["OG_RPC_URL"]);
const STORAGE_RPC = getEnvWithAlias("AXIOM_STORAGE_RPC", ["OG_STORAGE_RPC"], "https://indexer-storage-testnet-turbo.0g.ai");
const OG_CHAIN_ID = Number.parseInt(getEnvWithAlias("AXIOM_CHAIN_ID", ["OG_CHAIN_ID"], "16602"), 10);
// ...

const fetchReq = new FetchRequest(RPC);
fetchReq.timeout = 10_000;
const provider = new JsonRpcProvider(fetchReq, OG_CHAIN_ID, { staticNetwork: true });
```

Then update line 43 (eip712Domain chainId) to reuse the constant:
```typescript
const eip712Domain: Eip712Domain = {
  chainId: BigInt(OG_CHAIN_ID),
  verifyingContract: TEE_VERIFIER as `0x${string}`,
};
```

**Note:** `getEnvWithAlias("AXIOM_EVM_RPC", ["OG_RPC_URL"])` throws if neither var is set — appropriate for a dev CLI with explicit config.

---

#### ISSUE 2e — `storage/0g.test.ts`

**File:** `/home/eya/og/apps/backend/src/storage/0g.test.ts`
**Line:** 11-17

**Current code:**
```typescript
const EVM_RPC = process.env.OG_RPC_URL ?? "https://0g-galileo-testnet.drpc.org";
const provider = new ethers.JsonRpcProvider(EVM_RPC);
```

**Fix plan:** Use `resolveRpcUrl()` instead of raw env + hardcoded fallback. Add `chainId`, `staticNetwork: true`, and `FetchRequest` timeout.

**Exact replacement code:**
```typescript
import { describe, it } from "node:test";
import assert from "node:assert";
import { randomBytes } from "node:crypto";
import { ethers, FetchRequest } from "ethers";
import { ZeroGStorage } from "./0g.js";
import { resolveRpcUrl, GALILEO_CHAIN_ID } from "@axiom/config/networks";

const DEPLOYER_PK = process.env.DEPLOYER_PK;
if (!DEPLOYER_PK) {
  console.log("SKIP: DEPLOYER_PK not set — storage tests require a funded deployer key");
  process.exit(0);
}

const EVM_RPC = resolveRpcUrl(GALILEO_CHAIN_ID);
const fetchReq = new ethers.FetchRequest(EVM_RPC);
fetchReq.timeout = 10_000;
const provider = new ethers.JsonRpcProvider(fetchReq, GALILEO_CHAIN_ID, { staticNetwork: true });
```

**Note:** `resolveRpcUrl(GALILEO_CHAIN_ID)` follows: `AXIOM_EVM_RPC` → `OG_RPC_URL` → `RPC_URL` → chain default (`evmrpc-testnet.0g.ai`). This replaces the dRPC third-party fallback with the official endpoint. Function defined at `packages/config/src/networks.ts:40-47`.

---

#### ISSUE 2f — `indexer/index.ts` (add `FetchRequest` timeout)

**File:** `/home/eya/og/apps/indexer/src/index.ts`
**Lines:** 220-222

**Current code:**
```typescript
const provider = new ethers.JsonRpcProvider(url, cid, {
  staticNetwork: true,
});
```

**Fix plan:** This provider is already the best-configured (explicit chainId + `staticNetwork: true`). Add `FetchRequest` timeout for completeness.

**Exact replacement code:**
```typescript
import { ethers, FetchRequest } from "ethers";
// ... (other imports unchanged)

// In main():
const fetchReq = new ethers.FetchRequest(url);
fetchReq.timeout = 10_000;
const provider = new ethers.JsonRpcProvider(fetchReq, cid, {
  staticNetwork: true,
});
```

**Note:** Already the best-configured provider (has chainId + `staticNetwork: true`). Only needs `FetchRequest` timeout addition.

---

### ISSUE 3: Aristotle mainnet addresses are all zero in frontend

**Severity:** MINOR 🟠

**Rationale:** The frontend address map at `apps/frontend/src/abi/addresses.ts` has zero-placeholder addresses for the 16661 (Aristotle) network. These are marked `// TODO` — if a user switches to Aristotle in the frontend chain selector, the app will try to use `0x000...000` addresses, causing every transaction to fail. This is non-critical until the Aristotle contract deployment happens, but the plan should be ready.

---

#### ISSUE 3a — Zero placeholder addresses

**File:** `/home/eya/og/apps/frontend/src/abi/addresses.ts`
**Lines:** 25-29

**Current code:**
```typescript
// Aristotle mainnet (16661) — REPLACE with real addresses when deployed
16661: {
    axiomAgentNft: '0x0000000000000000000000000000000000000000', // TODO
    axiomStrategyVault: '0x0000000000000000000000000000000000000000', // TODO
    axiomTeeVerifier: '0x0000000000000000000000000000000000000000', // TODO
    axiomPaymentProcessor: '0x0000000000000000000000000000000000000000', // TODO
    axiomMockUsdc: '0x0000000000000000000000000000000000000000', // TODO
},
```

**Fix plan:** After the Aristotle deployment script (`DeployAristotle.s.sol`) completes, replace each zero address with the real deployed contract address. The deployment script outputs a JSON file containing all deployed addresses, so this is a mechanical copy-paste with the schema:

```typescript
// Aristotle mainnet (16661)
16661: {
    axiomAgentNft: '0x<REAL_ADDRESS>',
    axiomStrategyVault: '0x<REAL_ADDRESS>',
    axiomTeeVerifier: '0x<REAL_ADDRESS>',
    axiomPaymentProcessor: '0x<REAL_ADDRESS>',
    axiomMockUsdc: '0x<REAL_ADDRESS>',
},
```

**Validation:** After populating, switch the frontend chain selection to Aristotle (16661) and verify that:
1. The chain switch completes without error.
2. Contract read calls (balanceOf, mintFee, etc.) return sensible values (not revert).
3. Contract write calls estimate gas correctly.

**Risk:** Cannot be done until Aristotle deployment is complete. No risk in the current state since no user-facing flow uses Aristotle yet.

---

#### ISSUE 3b — `DEFAULT_CHAIN` hardcoded to Galileo

**File:** `/home/eya/og/apps/frontend/src/abi/addresses.ts`
**Lines:** 37-55

**Current code:**
```typescript
import { GALILEO_CHAIN_ID } from "@axiom/config/networks";

/** Default chain — Galileo testnet. */
const DEFAULT_CHAIN = GALILEO_CHAIN_ID;

// Backward-compatible aliases (resolve to Galileo).

export const AXIOM_STRATEGY_VAULT_ADDRESS: Address =
    ADDRESSES[DEFAULT_CHAIN]!.axiomStrategyVault;

/** AxiomAgentNFT proxy (ERC-1967). */
export const AXIOM_AGENT_NFT_ADDRESS: Address =
    ADDRESSES[DEFAULT_CHAIN]!.axiomAgentNft;

/** AxiomTeeVerifier — registered verifier on the NFT proxy. */
export const AXIOM_TEE_VERIFIER_ADDRESS: Address =
    ADDRESSES[DEFAULT_CHAIN]!.axiomTeeVerifier;

export const AXIOM_PAYMENT_PROCESSOR_ADDRESS: Address =
    ADDRESSES[DEFAULT_CHAIN]!.axiomPaymentProcessor;

/** MockUSDC — testnet payment token. */
export const AXIOM_MOCK_USDC_ADDRESS: Address =
    ADDRESSES[DEFAULT_CHAIN]!.axiomMockUsdc;
```

**Fix plan:** Convert the 5 exported address constants to **getter functions** that accept an optional `chainId` parameter (defaulting to `DEFAULT_CHAIN`). This lets the frontend resolve addresses dynamically based on the user's selected chain.

```typescript
// Pattern for each address:
export function getAxiomStrategyVaultAddress(chainId: number = DEFAULT_CHAIN): Address {
    const addr = ADDRESSES[chainId]?.axiomStrategyVault;
    if (!addr || addr === '0x0000000000000000000000000000000000000000') {
        throw new Error(`AxiomStrategyVault not deployed on chain ${chainId}`);
    }
    return addr;
}
// Repeat for axiomAgentNft, axiomTeeVerifier, axiomPaymentProcessor, axiomMockUsdc

// Backward-compatible aliases unchanged:
export const AXIOM_STRATEGY_VAULT_ADDRESS: Address = getAxiomStrategyVaultAddress();
// ... (same for the other 4 constants)
```

Then update frontend imports to call the getter with wagmi's `useChainId()` or `useAccount()`.

**Validation:**
1. `npx tsc --noEmit` in `apps/frontend/` — zero breakage from backward-compatible aliases.
2. After migrating call sites, verify correct address resolution for both Galileo and Aristotle chains.

---

### ISSUE 4: Fragile SDK API handling (`rootHash` vs `rootHashes`)

**Severity:** MINOR 🟠

**Rationale:** The shared storage helper at `packages/config/src/storage/0g.ts` (lines 36-38) uses runtime branching to handle both `rootHash`/`rootHashes` and `txHash`/`txHashes` response shapes from the 0G Storage SDK. This works today but silently breaks if the SDK changes the response format in a future version. A type assertion or SDK version pinning would be more robust.

---

#### ISSUE 4a — Fragile response property branching

**File:** `/home/eya/og/packages/config/src/storage/0g.ts`
**Lines:** 36-38

**Current code:**
```typescript
const rootHash = "rootHash" in tx ? (tx.rootHash as Hex) : (tx.rootHashes[0] as Hex);
const txHash = "txHash" in tx ? (tx.txHash as Hex) : (tx.txHashes[0] as Hex);
```

**Fix plan:** Replace the fragile inline branching with explicit validation that throws clear errors on unexpected SDK response shapes:

```typescript
let rootHash: Hex;
if ("rootHash" in tx && tx.rootHash) {
    rootHash = tx.rootHash as Hex;
} else if ("rootHashes" in tx && Array.isArray(tx.rootHashes) && tx.rootHashes.length > 0) {
    rootHash = tx.rootHashes[0] as Hex;
} else {
    throw new Error("0G Storage upload: cannot extract rootHash from response — " + JSON.stringify(tx));
}

let txHash: Hex;
if ("txHash" in tx && tx.txHash) {
    txHash = tx.txHash as Hex;
} else if ("txHashes" in tx && Array.isArray(tx.txHashes) && tx.txHashes.length > 0) {
    txHash = tx.txHashes[0] as Hex;
} else {
    throw new Error("0G Storage upload: cannot extract txHash from response — " + JSON.stringify(tx));
}
```

This preserves backward compatibility with both SDK response shapes, adds clear error messages for debugging if the SDK changes, and requires no type infrastructure changes.

---

## Implementation Order

The issues are independent and can be applied in any order, but the recommended sequence is:

### Phase 1: dRPC → Official RPC (5 min each, 10 min total)

| Step | File | Change | Dependency |
|------|------|--------|------------|
| 1.1 | `apps/contracts/test/FuzzAxiomTeeVerifier.t.sol` (line 42) | `dRPC` → `evmrpc-testnet.0g.ai` | None |
| 1.2 | `apps/contracts/test/V12C3ValidUntil.t.sol` (line 23) | `dRPC` → `evmrpc-testnet.0g.ai` | None |
| — | `apps/backend/src/storage/0g.test.ts` | Handled by Phase 2e (uses `resolveRpcUrl()`) | Phase 2e |

### Phase 2: JsonRpcProvider hardening — chainId + staticNetwork + timeout (5 min each, 30 min total)

| Step | File | Line | Change | Dependency |
|------|------|------|--------|------------|
| 2a | `apps/backend/src/index.ts` | 12 | Add `GALILEO_CHAIN_ID` import, `FetchRequest` timeout, `chainId`, `{ staticNetwork: true }` | None |
| 2b | `apps/backend/src/server.ts` | 160 | Add `FetchRequest` timeout, pass `ogChainId`, `{ staticNetwork: true }` | None |
| 2c | `apps/backend/src/orchestrator/index.ts` | 80 | Add `FetchRequest` timeout, `{ staticNetwork: true }` | None |
| 2d | `apps/backend/src/cli/run-e2e.ts` | 32 | Add `FetchRequest` timeout, `chainId`, `{ staticNetwork: true }`, switch to `getEnvWithAlias` | None |
| 2e | `apps/backend/src/storage/0g.test.ts` | 11-17 | Use `resolveRpcUrl()`, add `FetchRequest` timeout, `chainId`, `{ staticNetwork: true }` | None |
| 2f | `apps/indexer/src/index.ts` | 220-222 | Add `FetchRequest` timeout (already has best chainId + staticNetwork) | None |

### Phase 3: Frontend addresses (scheduled — depends on Aristotle deploy)

| Step | File | Change | Dependency |
|------|------|--------|------------|
| 3.1 | `apps/frontend/src/abi/addresses.ts` (lines 25-29) | Replace zero addresses with deployed addresses | Aristotle deployment complete |
| 3.2 | `apps/frontend/src/abi/addresses.ts` (lines 37-55) | Convert constants to chain-aware getter functions | Step 3.1 |

### Phase 4: SDK response handling (15 min)

| Step | File | Change | Dependency |
|------|------|--------|------------|
| 4.1 | `packages/config/src/storage/0g.ts` (lines 36-38) | Harden rootHash/txHash branching | None |

---

## Summary of Changes

| # | File | Lines | Severity | Change Summary |
|---|------|-------|----------|----------------|
| 1a | `apps/contracts/test/FuzzAxiomTeeVerifier.t.sol` | 42 | 🟡 MEDIUM | dRPC → official RPC |
| 1b | `apps/contracts/test/V12C3ValidUntil.t.sol` | 23 | 🟡 MEDIUM | dRPC → official RPC |
| 1c | `apps/backend/src/storage/0g.test.ts` | 12 | 🟡 MEDIUM | *Merged into 2e* — `resolveRpcUrl()` replaces dRPC fallback |
| 2a | `apps/backend/src/index.ts` | 12 | 🟡 MEDIUM | Add FetchRequest timeout, chainId, staticNetwork |
| 2b | `apps/backend/src/server.ts` | 160 | 🟡 MEDIUM | Add FetchRequest timeout, chainId, staticNetwork |
| 2c | `apps/backend/src/orchestrator/index.ts` | 80 | 🟡 MEDIUM | Add FetchRequest timeout, staticNetwork |
| 2d | `apps/backend/src/cli/run-e2e.ts` | 32 | 🟡 MEDIUM | Add FetchRequest timeout, chainId, staticNetwork, getEnvWithAlias |
| 2e | `apps/backend/src/storage/0g.test.ts` | 11-17 | 🟡 MEDIUM | resolveRpcUrl(), FetchRequest timeout, chainId, staticNetwork |
| 2f | `apps/indexer/src/index.ts` | 220-222 | 🟡 MEDIUM | Add FetchRequest timeout (already has chainId + staticNetwork) |
| 3a | `apps/frontend/src/abi/addresses.ts` | 25-29 | 🟠 MINOR | Populate Aristotle addresses after deploy |
| 3b | `apps/frontend/src/abi/addresses.ts` | 37-55 | 🟠 MINOR | Chain-aware getter functions |
| 4a | `packages/config/src/storage/0g.ts` | 36-38 | 🟠 MINOR | Harden SDK response parsing |

**Total:** 12 changes across 8 files. Phases 1, 2, and 4 are safe to apply immediately. Phase 3 depends on Aristotle deployment completion.

---

## Additional Hardcoded URL Fallbacks to Eliminate

These inline fallback URLs should be replaced with the existing resolver functions:

| # | File | Line | Current Fallback | Replacement |
|---|------|------|-----------------|-------------|
| 1 | `apps/backend/src/server.ts` | 139 | `"https://indexer-storage-testnet-turbo.0g.ai"` inline | `resolveStorageRpc(ogChainId)` (exists at `networks.ts:49`) |
| 2 | `apps/indexer/src/index.ts` | 20 | `"https://evmrpc-testnet.0g.ai"` inline | `resolveRpcUrl(GALILEO_CHAIN_ID)` (exists at `networks.ts:40`) |
| 3 | `apps/backend/src/cli/run-e2e.ts` | 24 | `"https://indexer-storage-testnet-turbo.0g.ai"` inline | `getEnvWithAlias("AXIOM_STORAGE_RPC", ["OG_STORAGE_RPC"], "https://indexer-storage-testnet-turbo.0g.ai")` |

---

## 0G SDK Integration

### Storage SDK (`@0gfoundation/0g-storage-ts-sdk` v1.2.10)

Only `Indexer` and `MemData` are used. Unused modules: `StorageKv`/`KvClient` (KV store, could replace in-memory EventStore), `HotRouterClient`/`uploadToHot()` (hot cache for low-latency reads), `ZgFile`/`EncryptedFile` (file abstraction), `Uploader`/`Downloader` (raw transport), `peekHeader()` (encryption detection). All low priority.

### Compute SDK (`@0gfoundation/0g-compute-ts-sdk` v0.8.4)

**ENTIRELY unused.** The backend uses a custom OpenAI-based `compute/router.ts`. The SDK provides on-chain provider discovery (`listService()`, replacing the hardcoded `KNOWN_PROVIDERS` map), billing headers (`getRequestHeaders()`), auto-funding (`startAutoFunding()`), and TEE verification (`verifyService()`). This is a significant refactor and should be scoped as a separate project — see deep-trace for full capability map.

---

## Env Var Unification

The codebase has a dual namespace: `AXIOM_*` (modern) and `OG_*` (legacy). Services use different names:

| Service | EVM RPC | Chain ID | Storage RPC |
|---------|---------|----------|-------------|
| Backend (via schema) | `AXIOM_EVM_RPC` | `AXIOM_CHAIN_ID` | `AXIOM_STORAGE_RPC` |
| Oracle (via schema) | `AXIOM_EVM_RPC` | `AXIOM_CHAIN_ID` | `AXIOM_STORAGE_INDEXER_RPC` |
| Indexer (raw `process.env`) | `OG_RPC_URL` | `OG_CHAIN_ID` | `OG_STORAGE_RPC` |

**The indexer is the worst offender** — it reads `process.env["OG_RPC_URL"]`, `process.env["OG_CHAIN_ID"]`, `process.env["OG_STORAGE_RPC"]` directly, bypassing the `getEnvWithAlias()` helper it already has access to via `./env.js`.

### Fix: Make indexer use `getEnvWithAlias()`

**File:** `/home/eya/og/apps/indexer/src/index.ts`

**Current code (lines 22-36):**
```typescript
const DEFAULT_RPC_URL = OG_NETWORKS[GALILEO_CHAIN_ID]?.evmRpc ?? "https://evmrpc-testnet.0g.ai";

function rpcUrl() {
  return process.env["OG_RPC_URL"] ?? DEFAULT_RPC_URL;
}

function chainId() {
  const raw = process.env["OG_CHAIN_ID"];
  if (raw === undefined || raw === "") return GALILEO_CHAIN_ID;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`OG_CHAIN_ID is not a positive integer: ${raw}`);
  }
  return n;
}
```

**Replacement:** Replace both functions and the `DEFAULT_RPC_URL` constant:
```typescript
import { getEnvWithAlias } from "@axiom/config/env";
// — or from ./env.js which re-exports it

const DEFAULT_RPC_URL = OG_NETWORKS[GALILEO_CHAIN_ID]?.evmRpc ?? "https://evmrpc-testnet.0g.ai";

function rpcUrl() {
  return getEnvWithAlias("AXIOM_EVM_RPC", ["OG_RPC_URL", "RPC_URL"], DEFAULT_RPC_URL);
}

function chainId() {
  const raw = getEnvWithAlias("AXIOM_CHAIN_ID", ["OG_CHAIN_ID"]);
  if (raw === undefined || raw === "") return GALILEO_CHAIN_ID;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`AXIOM_CHAIN_ID is not a positive integer: ${raw}`);
  }
  return n;
}
```

Also update the storage RPC read at line 249:
```typescript
// Before:
const ogStorageRpc = process.env["OG_STORAGE_RPC"];
// After:
const ogStorageRpc = getEnvWithAlias("AXIOM_STORAGE_RPC", ["OG_STORAGE_RPC"]);
```

**Impact:** Makes the indexer respect `AXIOM_EVM_RPC`, `AXIOM_CHAIN_ID`, `AXIOM_STORAGE_RPC` with `OG_*` backward compatibility. Services that already set `AXIOM_*` vars now configure the indexer correctly.

| Phase | Service | Current Env | Target Env |
|-------|---------|------------|------------|
| Now | Indexer | `OG_RPC_URL`, `OG_CHAIN_ID`, `OG_STORAGE_RPC` | `AXIOM_EVM_RPC` (alias `OG_RPC_URL`), etc. via `getEnvWithAlias` |
| Now | CLI e2e | `OG_RPC_URL`, `OG_STORAGE_RPC`, `OG_CHAIN_ID` | `getEnvWithAlias("AXIOM_EVM_RPC", ["OG_RPC_URL"])` (see Issue 2d) |
| Follow-up | All | Mixed `OG_*` + `AXIOM_*` | Canonical `AXIOM_*` only; add deprecation warning on `OG_*` reads |
| Long-term | All services | Dual namespace | Pure `AXIOM_*` only (breaking change)
