# Axiom On-Chain Security Audit — Group A

**Agent:** Sub-Agent 1 — Security & Vulnerability Agent  
**Date:** 2026-07-06  
**Scope:** `apps/contracts/src/` — Group A only  
**Files analyzed (line-by-line):**

| File | LOC | Path |
|------|-----|------|
| AxiomStrategyVault | 168 | `apps/contracts/src/AxiomStrategyVault.sol` |
| AxiomPaymentProcessor | 262 | `apps/contracts/src/AxiomPaymentProcessor.sol` |
| IAxiomAgentNFT | 13 | `apps/contracts/src/interfaces/IAxiomAgentNFT.sol` |

**Out of scope:** Frontend, backend, other contracts (AxiomAgentNFT, AxiomTeeVerifier, etc.)

---

## 1. Executive Summary

Group A implements two fund-bearing primitives: a per-agent native-OG vault with Merkle-gated execution (`AxiomStrategyVault`), and an ERC-20 payment router with pull-based creator earnings (`AxiomPaymentProcessor`). Both contracts lean on OpenZeppelin primitives (`Ownable`, `Pausable`, `ReentrancyGuard`, `SafeERC20`, `MerkleProof`) and generally follow checks-effects-interactions (CEI) on value-moving paths.

No **Critical** unprivileged direct-theft vector was identified in the reviewed logic. The dominant risk class is **privileged centralization** (mutable NFT registry on the vault, payment-token rotation on the processor) combined with **permissionless `execute()`** enabling MEV/griefing on pre-committed strategy actions.

### Finding counts by severity

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 3 |
| Medium | 7 |
| Low | 5 |
| Informational / positive | 12 |

---

## 2. Deployed Contract Context

**Network:** 0G Galileo testnet (chainId `16602`)

| Contract | Address (from `packages/config/src/addresses.ts`) |
|----------|---------------------------------------------------|
| AxiomStrategyVault | `0xB30061Ea93b60FCbAE11C2b06FE3Db3C84FAA367` |
| AxiomPaymentProcessor | `0x97a32707d948F91175706ca5509c7bfCC643a1dD` |
| AxiomAgentNFT (dependency) | `0x6f82d061a903E48Ce1810F8d42536C6A837ed684` |

**Deployment wiring (from `apps/contracts/script/Deploy.s.sol`):**

- Vault constructor: `(nftProxy, oracleAdmin)` — vault `owner` = oracle admin.
- Payment processor constructor: `(nftProxy, paymentToken, oracleAdmin, 100 bps, oracleAdmin)` — treasury and owner both oracle admin; default protocol fee 1%.
- Payment processor `AXIOM_NFT` is **immutable**; vault `nft` is **owner-mutable** via `setNFT()`.

**Trust boundaries (Group A):**

| Boundary | Vault | Payment Processor |
|----------|-------|-------------------|
| Token ownership | `IAxiomAgentNFT.ownerOf` for deposit / withdraw / setStrategy | `IAxiomAgentNFT.creatorOf` for pay routing; `ownerOf` for `setRoyaltyBpsPermitted` |
| Strategy authorization | Merkle root set by NFT owner; `execute()` is **ungated by caller identity** | N/A |
| Admin | `onlyOwner`: pause, `setNFT` | `onlyOwner`: pause, treasury, fee, payment token |
| TEE / oracle | Off-chain; strategy root committed on-chain by user | Not referenced in Group A |

---

## 3. Findings by Severity

### Critical

*None identified within Group A scope under standard “unprivileged attacker” assumptions.*

---

### High

#### H-1 — Vault owner can hijack all per-token access control via `setNFT()`

**Contract:** `AxiomStrategyVault`  
**Path:** `apps/contracts/src/AxiomStrategyVault.sol`  
**Lines:** 62–69, 47–52

**Evidence:**

```solidity
function setNFT(address newNft) external onlyOwner {
    if (newNft == address(0)) revert ZeroAddress();
    nft = IAxiomAgentNFT(newNft);
    emit RegistryUpdated(newNft);
}

modifier onlyTokenOwner(uint256 tokenId) {
    if (nft.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
    _;
}
```

**Severity:** High (centralization / admin compromise)

**Exploit scenario:**  
A compromised or malicious vault `owner` deploys a fake `IAxiomAgentNFT` whose `ownerOf(tokenId)` always returns the attacker for every `tokenId`. After `setNFT(fake)`, the attacker passes `onlyTokenOwner` for any vault and can `withdraw()` all native balances. This bypasses the real NFT ownership graph entirely.

**Microchange direction:**

- Make `nft` **immutable** (mirror payment processor’s `AXIOM_NFT`), **or**
- Gate `setNFT` behind a timelock + on-chain migration that freezes withdrawals during rotation, **or**
- Require a two-step commit-reveal with user opt-in per tokenId.

---

#### H-2 — Payment token migration can strand creator earnings and old-token balances

**Contract:** `AxiomPaymentProcessor`  
**Path:** `apps/contracts/src/AxiomPaymentProcessor.sol`  
**Lines:** 110–121, 178–182, 244–252

**Evidence:**

```solidity
function setPaymentToken(address newPaymentToken) external onlyOwner {
    if (newPaymentToken == address(0)) revert ZeroAddress();
    IERC20 old = _getStorage().paymentToken;
    _getStorage().paymentToken = IERC20(newPaymentToken);
    emit PaymentTokenUpdated(address(old), newPaymentToken);
}

function agentEarningsOf(address creator) external view returns (uint256) {
    return _getStorage().agentEarnings[creator];
}

function withdrawAgentEarnings() external nonReentrant {
    // ...
    $.paymentToken.safeTransfer(msg.sender, amount);
}
```

**Severity:** High (fund loss on negligent or malicious migration)

**Exploit scenario:**

1. Creators accumulate `agentEarnings[creator] = 1000e6` while payment token is `USDC.e`; contract physically holds 1000e6 `USDC.e`.
2. Owner calls `setPaymentToken(USDG)` without draining/sweeping old token (comment at L111–113 warns but **does not enforce**).
3. Creator calls `withdrawAgentEarnings()` → `safeTransfer` pulls **USDG**, not `USDC.e`. If contract lacks USDG, withdrawal reverts and earnings are **bricked**; if owner pre-funded USDG, creator is paid in a different asset than earned. Old `USDC.e` remains **permanently stuck** (no sweep function).

`agentEarnings` is a single scalar per creator with **no per-token denomination** — accounting cannot safely span multiple ERC-20s.

**Microchange direction:**

- Add `sweepOldPaymentToken()` callable only after migration epoch and zero outstanding earnings, **or**
- Store `paymentToken` version / asset tag alongside earnings, **or**
- Disable `setPaymentToken` while `agentEarnings` sum > 0 or contract ERC-20 balance > 0.

---

#### H-3 — Owner can redirect protocol revenue via `setProtocolTreasury()`

**Contract:** `AxiomPaymentProcessor`  
**Path:** `apps/contracts/src/AxiomPaymentProcessor.sol`  
**Lines:** 92–99, 221–223

**Evidence:**

```solidity
function setProtocolTreasury(address newTreasury) external onlyOwner {
    if (newTreasury == address(0)) revert ZeroAddress();
    address old = _getStorage().protocolTreasury;
    _getStorage().protocolTreasury = newTreasury;
    emit ProtocolTreasuryUpdated(old, newTreasury);
}

if (protocolCut > 0) {
    token.safeTransfer($.protocolTreasury, protocolCut);
}
```

**Severity:** High (centralization)

**Exploit scenario:** Compromised owner sets treasury to attacker EOA. All future `payForAgent` protocol cuts flow to attacker. Past earnings already in treasury are unaffected, but all new payments are diverted.

**Microchange direction:** Timelock on treasury changes; multisig owner; emit mandatory delay events.

---

### Medium

#### M-1 — `execute()` is permissionless — MEV, front-running, and forced execution

**Contract:** `AxiomStrategyVault`  
**Path:** `apps/contracts/src/AxiomStrategyVault.sol`  
**Lines:** 120–159

**Evidence:**

```solidity
function execute(
    uint256 tokenId,
    address target,
    uint256 value,
    bytes calldata data,
    bytes32[] calldata merkleProof
) external nonReentrant whenNotPaused returns (bytes memory) {
    // No onlyTokenOwner, no onlyAgent, no msg.sender check
    // ...
}
```

**Severity:** Medium

**Exploit scenario:**

- Any mempool observer seeing a valid `(tokenId, target, value, data, proof)` can front-run the agent/backend and submit the same call.
- For time-sensitive strategy actions (DEX swaps, liquidations, auction bids), adversaries can sandwich or force early execution while still staying within the Merkle-approved tuple.
- A griefer can repeatedly trigger zero-value approved calls, wasting gas and emitting events (state still consistent if calls succeed).

This is **by design** (agent need not hold keys), but it expands the trust surface beyond the NFT owner to **anyone who learns or infers strategy leaves**.

**Microchange direction:**

- Optional `onlyRole(EXECUTOR_ROLE)` for backend/TEE relayer, **or**
- Commit-reveal scheme for execution ordering, **or**
- Document that strategies must be MEV-safe (no slippage-sensitive calls without private relay).

---

#### M-2 — Per-agent royalty override fully bypasses `protocolFeeBps`

**Contract:** `AxiomPaymentProcessor`  
**Path:** `apps/contracts/src/AxiomPaymentProcessor.sol`  
**Lines:** 199–210, 123–151

**Evidence:**

```solidity
if (!$.agentRoyaltyBpsSet[agentTokenId]) {
    protocolCut = (amount * $.protocolFeeBps) / BPS_DENOMINATOR;
    creatorCut = amount - protocolCut;
} else {
    creatorCut = (amount * $.agentRoyaltyBps[agentTokenId]) / BPS_DENOMINATOR;
    protocolCut = amount - creatorCut;
}
```

**Severity:** Medium (economic / protocol revenue)

**Exploit scenario:** Agent creator or NFT owner calls `setRoyaltyBps` / `setRoyaltyBpsPermitted` with `10000` bps. All subsequent `payForAgent` payments route 100% to creator and **0% to protocol treasury**, permanently for that `agentTokenId`. Default `protocolFeeBps` is never consulted once override is set.

**Microchange direction:**

- Enforce `creatorCut + protocolCut` uses both royalty cap **and** minimum protocol fee, e.g. `protocolCut = max(amount * protocolFeeBps / 10000, amount - creatorCut)`.
- Cap `agentRoyaltyBps` at `10000 - minProtocolBps`.

---

#### M-3 — `setRoyaltyBpsPermitted` lets NFT owner override creator economics

**Contract:** `AxiomPaymentProcessor`  
**Path:** `apps/contracts/src/AxiomPaymentProcessor.sol`  
**Lines:** 130–141

**Evidence:**

```solidity
function setRoyaltyBpsPermitted(uint256 agentTokenId, uint256 newBps) external {
    if (IAxiomAgentNFT(AXIOM_NFT).ownerOf(agentTokenId) != msg.sender) revert NotCreator();
    _setRoyaltyBps(agentTokenId, newBps);
}
```

**Severity:** Medium

**Exploit scenario:** When NFT `owner` ≠ `creator` (marketplace custody, protocol-owned agent, transfer after mint), the owner can set royalty to `0`, forcing `creatorCut = 0` and `protocolCut = amount` on every payment — effectively depriving the creator of all future earnings without their consent. Reverts with misleading `NotCreator()` error (L139).

**Microchange direction:**

- Restrict royalty changes to `creatorOf` only, with optional owner consent multisig, **or**
- Split “payout recipient” from “NFT owner” explicitly on-chain.

---

#### M-4 — Native OG sent directly to vault is unrecoverable

**Contract:** `AxiomStrategyVault`  
**Path:** `apps/contracts/src/AxiomStrategyVault.sol`  
**Lines:** 34–42, 71–77 (no `receive`/`fallback`/sweep)

**Evidence:** Balances are tracked only via `deposit()`:

```solidity
function deposit(uint256 tokenId) external payable whenNotPaused onlyTokenOwner(tokenId) {
    if (msg.value == 0) revert ZeroAmount();
    vaults[tokenId].balance += msg.value;
    // ...
}
```

There is no `receive()`, no `fallback`, and no owner sweep. ETH/OG forced to the contract (e.g. `selfdestruct`, coinbase, user mistake) is **not credited** to any `tokenId` and **cannot be withdrawn**.

Fuzz invariant confirms `sum(balanceOf) <= address(vault).balance` (`FuzzAxiomStrategyVault.t.sol` L447–455) — excess native balance is expected but trapped.

**Severity:** Medium (fund lock / user error)

**Exploit scenario:** User sends OG to vault address without calling `deposit` → funds locked forever. Over time, `address(vault).balance` may exceed sum of internal balances, creating opaque “dust” reserves.

**Microchange direction:**

- Add `recoverExcessNative()` callable by owner that transfers `address(this).balance - sumVaultBalances` to treasury, **or**
- Explicit `receive()` that reverts with guidance to use `deposit()`.

---

#### M-5 — `execute()` external call failure after state debit bricks atomicity correctly but enables griefing via reverting targets

**Contract:** `AxiomStrategyVault`  
**Path:** `apps/contracts/src/AxiomStrategyVault.sol`  
**Lines:** 144–155

**Evidence:**

```solidity
v.balance -= value;
v.dailySpent += value;

// external call
require(ok, "Call failed");
```

**Severity:** Medium (operational / griefing)

**Exploit scenario:** If `target` is a contract that conditionally reverts (e.g. requires specific `msg.sender` context that differs when front-run), the full tx reverts — no state change. However, if `target` consumes gas or emits off-chain monitoring noise before revert, agent operations can be delayed. Paired with M-1, adversaries can race execution.

**Note:** CEI ordering here is correct — failed calls roll back debits. This finding is about **liveness**, not theft.

**Microchange direction:** Allow optional `try/catch` path with event-only failure mode (careful with reentrancy); or document relayer/private-tx requirements.

---

#### M-6 — Fee-on-transfer / rebasing payment tokens break accounting

**Contract:** `AxiomPaymentProcessor`  
**Path:** `apps/contracts/src/AxiomPaymentProcessor.sol`  
**Lines:** 191–223

**Evidence:**

```solidity
token.safeTransferFrom(msg.sender, address(this), amount);
// credits based on `amount`, not balance delta
if (protocolCut > 0) {
    token.safeTransfer($.protocolTreasury, protocolCut);
}
```

**Severity:** Medium (if non-standard token used)

**Exploit scenario:** If `paymentToken` is fee-on-transfer, the contract receives `< amount` but credits `agentEarnings` and attempts `protocolCut` transfers based on nominal `amount`. Second transfer can revert (DoS on payments) or leave contract undercollateralized for `withdrawAgentEarnings`.

Deploy script expects USDC.e / USDG (standard), but `setPaymentToken` allows owner to point at any ERC-20.

**Microchange direction:** Document allowlist; add `balanceBefore/after` checks on `transferFrom`; revert if `received != amount`.

---

#### M-7 — `payComputeProvider` has no role gate (intentional but trust-heavy)

**Contract:** `AxiomPaymentProcessor`  
**Path:** `apps/contracts/src/AxiomPaymentProcessor.sol`  
**Lines:** 228–238

**Evidence:**

```solidity
function payComputeProvider(address provider, uint256 amount) external nonReentrant whenNotPaused {
    if (provider == address(0)) revert ZeroAddress();
    if (amount == 0) revert ZeroAmount();
    _getStorage().paymentToken.safeTransferFrom(msg.sender, provider, amount);
    emit ComputeProviderPaid(provider, amount);
}
```

**Severity:** Medium (operational trust)

**Exploit scenario:** Any EOA can call this; funds always come from `msg.sender` (not protocol balance). Risk is **phishing / UX confusion** — users may approve the processor and call arbitrary `provider` addresses. No theft of protocol float, but malicious frontends could route user funds to attacker `provider`.

**Microchange direction:** Add `onlyOwner` or `COMPUTE_OPERATOR_ROLE`; maintain provider allowlist.

---

### Low

#### L-1 — `TokenNotInRegistry` error is declared but never used

**Contract:** `AxiomStrategyVault`  
**Path:** `apps/contracts/src/AxiomStrategyVault.sol`  
**Lines:** 24, 71–77, 99–111, 121–127

**Evidence:** `error TokenNotInRegistry();` at L24 — no revert path references it. Token existence is implicitly delegated to `nft.ownerOf(tokenId)` on gated functions; `execute()` has **no** existence check.

**Severity:** Low

**Exploit scenario:** Limited while NFT lacks burn. If future NFT upgrade adds burn without vault migration, `execute()` could still move residual vault funds post-burn.

**Microchange direction:** Call `nft.ownerOf(tokenId)` in `execute()` (or explicit `exists(tokenId)` if added to interface) and `revert TokenNotInRegistry()`.

---

#### L-2 — Insufficient balance on withdraw reuses `ZeroAmount` error

**Contract:** `AxiomStrategyVault`  
**Path:** `apps/contracts/src/AxiomStrategyVault.sol`  
**Lines:** 83–85

**Evidence:**

```solidity
if (amount == 0) revert ZeroAmount();
Vault storage v = vaults[tokenId];
if (v.balance < amount) revert ZeroAmount();
```

**Severity:** Low (observability / integrator confusion)

**Microchange direction:** Introduce `error InsufficientBalance();` for L85.

---

#### L-3 — `deposit()` lacks `nonReentrant` while `withdraw`/`execute` are guarded

**Contract:** `AxiomStrategyVault`  
**Path:** `apps/contracts/src/AxiomStrategyVault.sol`  
**Lines:** 71–77 vs 82, 127

**Severity:** Low

**Exploit scenario:** During `execute()`’s external call, a target contract that **owns the NFT** could reenter `deposit()`. `onlyTokenOwner` would pass if `msg.sender` is the owner contract. This **increases** balance mid-execution but does not bypass Merkle or daily limits on the in-flight debit. Fuzz tests confirm reentrant `deposit` from malicious receiver reverts when attempted via `withdraw` path; direct `deposit` reentrancy during `execute` is not tested but appears non-exploitable for theft.

**Microchange direction:** Add `nonReentrant` to `deposit()` for uniform cross-function guard.

---

#### L-4 — `setRoyaltyBpsPermitted` reverts with `NotCreator` for non-owner

**Contract:** `AxiomPaymentProcessor`  
**Path:** `apps/contracts/src/AxiomPaymentProcessor.sol`  
**Lines:** 138–140

**Severity:** Low

**Microchange direction:** Add `error NotTokenOwner();` for accurate diagnostics.

---

#### L-5 — `execute()` uses `ZeroAmount` when `value > balance`

**Contract:** `AxiomStrategyVault`  
**Path:** `apps/contracts/src/AxiomStrategyVault.sol`  
**Line:** 130

**Evidence:** `if (value > v.balance) revert ZeroAmount();`

**Severity:** Low

**Microchange direction:** Use `InsufficientBalance` or dedicated error.

---

### Informational (interface dependency)

#### I-1 — `IAxiomAgentNFT` exposes minimal surface; correctness is entirely implementation-dependent

**Contract:** `IAxiomAgentNFT`  
**Path:** `apps/contracts/src/interfaces/IAxiomAgentNFT.sol`  
**Lines:** 6–13

```solidity
interface IAxiomAgentNFT {
    function ownerOf(uint256 tokenId) external view returns (address);
    function creatorOf(uint256 tokenId) external view returns (address);
}
```

Both Group A contracts assume:

- `ownerOf` reverts or returns correctly for non-existent tokens (OZ ERC-721 behavior).
- `creatorOf` returns `address(0)` for unregistered agents (enforced in payment processor L200–201, not in vault).

No vulnerability in the interface itself; document deployment requirement that NFT implementation matches these semantics.

---

## 4. Cross-Cutting Notes (Group A Only)

| Topic | Observation |
|-------|-------------|
| **NFT mutability asymmetry** | Payment processor binds `AXIOM_NFT` at deploy (L64); vault allows hot-swap (L63–69). A vault `setNFT` attack does **not** affect payment routing, but splits trust assumptions across the protocol. |
| **Pause semantics** | Both contracts: owner can pause user entry (`deposit`, `payForAgent`, `execute`). **Withdrawals remain live** (`withdraw`, `withdrawAgentEarnings` omit `whenNotPaused`) — user-protective design. |
| **Reentrancy** | `nonReentrant` on all Group A value-exit paths except vault `deposit`. Fuzz suite (`FuzzAxiomStrategyVault.t.sol` L388–444, `FuzzAxiomPaymentProcessor.t.sol` L306–327) validates guard behavior. |
| **Integer safety** | `pragma solidity ^0.8.20` — arithmetic overflow reverts. `dailySpent + value` (L139) safe in practice. |
| **Merkle action encoding** | `keccak256(abi.encode(target, value, keccak256(data)))` (L141) matches backend orchestrator (`apps/backend/src/orchestrator/index.ts` L266–272) — cross-stack consistency reduces proof mismatch risk. |
| **ERC-7201 storage slot** | Payment processor uses namespaced storage (L44–62) despite being non-upgradeable. No collision with `immutable AXIOM_NFT`; slightly unusual but not exploitable. |
| **Oracle / TEE** | Group A never verifies TEE attestations on-chain. Strategy authorization is entirely “Merkle root committed by NFT owner.” TEE trust is off-chain. |
| **Dead error `TokenNotInRegistry`** | Suggests planned registry validation was never wired — documentation / implementation drift. |

---

## 5. Microchange Opportunities (Prioritized)

| Priority | ID | Change | Effort | Impact |
|----------|-----|--------|--------|--------|
| P0 | H-1 | Make vault `nft` immutable or timelocked migration | Low–Med | Eliminates largest vault centralization footgun |
| P0 | H-2 | Enforce payment-token migration only when earnings drained; add old-token sweep | Med | Prevents creator fund loss |
| P1 | M-1 | Add optional executor role or private-relay documentation | Low | Reduces MEV / forced execution |
| P1 | M-2 | Minimum protocol fee floor even when per-agent royalty set | Low | Protects protocol revenue |
| P1 | M-4 | `recoverExcessNative()` or reverting `receive()` | Low | Recovers stuck OG |
| P2 | M-3 | Align royalty setter authorization with `creatorOf` | Low | Fair creator economics |
| P2 | M-6 | Balance-delta checks for `payForAgent` | Low | Hardens against weird ERC-20s |
| P2 | M-7 | Role-gate `payComputeProvider` | Low | Reduces phishing surface |
| P3 | L-1–L-5 | Error hygiene, `nonReentrant` on deposit, existence checks | Low | DX and future-proofing |

---

## 6. Positive Findings

1. **CEI on native withdrawals** — `withdraw()` debits `v.balance` before `call{value}` (L86–90).
2. **CEI on strategy execution** — `execute()` debits balance and increments `dailySpent` before external call (L144–155); failed calls revert cleanly.
3. **CEI on earnings withdrawal** — `agentEarnings` zeroed before `safeTransfer` (L248–252); comment explicitly documents reentrancy rationale.
4. **ReentrancyGuard coverage** — Applied to `withdraw`, `execute`, `payForAgent`, `payComputeProvider`, `withdrawAgentEarnings`.
5. **SafeERC20 usage** — Payment processor uses OZ `SafeERC20` for all token transfers; fuzz test validates revert on `false`-returning tokens (`FuzzAxiomPaymentProcessor.t.sol` L227–248).
6. **Daily spend limit with UTC day rollover** — Auto-reset logic (L133–138) prevents stale-day bypass.
7. **Merkle leaf hardening** — Inner `keccak256(data)` (L141) mitigates second-preimage issues with variable-length calldata.
8. **Pull-based creator payouts** — Creators withdraw when ready; reduces push-payment reentrancy surface.
9. **Immutable payment NFT reference** — `AXIOM_NFT` cannot be swapped by owner (L64).
10. **Input validation** — Zero-address / zero-amount guards on constructors and user entrypoints.
11. **Withdrawals allowed while paused** — Users can exit positions during incident response.
12. **Fuzz / invariant coverage** — Live-fork vault fuzz (`FuzzAxiomStrategyVault.t.sol`) and processor unit/invariant suites exercise reentrancy, Merkle failure, daily limits, and earnings accounting.

---

## Appendix A — Function Access Control Matrix

### AxiomStrategyVault

| Function | Access | Pausable | Reentrancy |
|----------|--------|----------|------------|
| `setNFT` | `onlyOwner` | No | No |
| `deposit` | `onlyTokenOwner` | Yes | No |
| `withdraw` | `onlyTokenOwner` | No | Yes |
| `setStrategy` | `onlyTokenOwner` | Yes | No |
| `execute` | **Anyone** | Yes | Yes |
| `pause` / `unpause` | `onlyOwner` | — | No |

### AxiomPaymentProcessor

| Function | Access | Pausable | Reentrancy |
|----------|--------|----------|------------|
| `setProtocolTreasury` | `onlyOwner` | No | No |
| `setProtocolFeeBps` | `onlyOwner` | No | No |
| `setPaymentToken` | `onlyOwner` | No | No |
| `setRoyaltyBps` | `onlyAgentCreator` | No | No |
| `setRoyaltyBpsPermitted` | NFT `ownerOf` | No | No |
| `payForAgent` | Anyone (payer) | Yes | Yes |
| `payComputeProvider` | Anyone (payer) | Yes | Yes |
| `withdrawAgentEarnings` | Self (creator) | No | Yes |
| `pause` / `unpause` | `onlyOwner` | — | No |

---

## Appendix B — Integer / Accounting Review

| Location | Operation | Assessment |
|----------|-----------|------------|
| Vault L75, L87, L145 | `balance ± value` | Safe; guarded by checks |
| Vault L139 | `dailySpent + value` | Safe; reverts on overflow |
| Processor L205–209 | BPS multiplication | Rounding dust to protocol (default path) or creator (override path) |
| Processor L214 | `agentEarnings += creatorCut` | Safe; single-asset assumption |

---

*End of Group A security report.*