# Axiom Onchain Gas Optimization Analysis — Group A

**Agent:** Sub-Agent 2 — Gas Optimization & Efficiency  
**Date:** 2026-07-06  
**Scope:** `AxiomStrategyVault.sol`, `AxiomPaymentProcessor.sol`, `IAxiomAgentNFT.sol`  
**Solidity:** `^0.8.20`

---

## Executive Summary

Group A contracts are generally well-structured for gas: CEI ordering is respected, hot-path functions cache storage pointers where it matters, `AxiomPaymentProcessor` uses an `immutable` NFT reference and a deliberate single-`transferFrom` payment pattern, and `execute()` correctly uses `calldata` plus an empty-data fast path.

The largest recurring savings opportunities are **storage layout** and **reducing per-call storage reads**:

| Area | Contract | Est. recurring impact |
|------|----------|----------------------|
| Unpacked `Vault` struct (5 slots/token) | `AxiomStrategyVault` | **High** — extra SLOAD/SSTORE on every `execute` / `setStrategy` |
| Unpacked `protocolTreasury` + `paymentToken` | `AxiomPaymentProcessor` | **High** — extra SLOAD on every `payForAgent` |
| Dual royalty mappings (`agentRoyaltyBps` + `agentRoyaltyBpsSet`) | `AxiomPaymentProcessor` | **High** — extra SLOAD/SSTORE per payment & royalty set |
| Mutable `nft` vs `immutable` | `AxiomStrategyVault` | **Medium–High** — storage read on every owner-gated call |
| Missing batch entry points | Both | **Medium** — amortize fixed costs (modifiers, NFT lookup, reentrancy) |
| `unchecked` blocks after explicit bounds checks | Both | **Low–Medium** — small per-tx savings on arithmetic |

`IAxiomAgentNFT.sol` is a minimal two-function interface with no on-chain gas surface of its own; findings below focus on the two implementation contracts.

---

## Findings by Impact

### High

#### G-01 — `Vault` struct uses 5 storage slots; `dailyLimit` / `dailySpent` / `resetDay` are packable

**Contract:** `AxiomStrategyVault`  
**Lines:** 34–40, 104–111, 128–146  
**Functions:** `setStrategy`, `execute`, `strategyOf`, `deposit`, `withdraw`

**Current behavior:**

```34:40:apps/contracts/src/AxiomStrategyVault.sol
    struct Vault {
        uint256 balance; // native (OG) balance
        uint256 dailyLimit; // max value executable per UTC day
        uint256 dailySpent; // running spend in current day
        uint64 resetDay; // day number of last reset
        bytes32 strategyRoot; // Merkle root of approved action hashes
    }
```

Each `Vault` occupies **5 slots**: three full `uint256` words, a `uint64` alone in slot 3 (24 bytes wasted), and `bytes32 strategyRoot`. `execute()` reads `strategyRoot`, `balance`, `resetDay`, `dailySpent`, and `dailyLimit` every call; day rollover adds up to two extra SSTOREs.

**Optimization:** Pack limit fields into fewer words, e.g.:

```solidity
struct Vault {
    uint256 balance;
    uint128 dailyLimit;
    uint128 dailySpent;
    bytes32 strategyRoot;
    uint64 resetDay;
}
```

This reduces the struct to **4 slots** (saves one slot). If daily limits are provably bounded to 64-bit ranges, `uint64 dailyLimit`, `uint64 dailySpent`, and `uint64 resetDay` can share one 32-byte slot (3 slots total besides `balance` and `strategyRoot`).

**Estimated savings:** ~100 warm gas per avoided SLOAD; ~5,000–20,000 gas on first write to a new slot. On `execute()`, expect **~100–300 warm gas per call** from fewer reads; larger savings on cold first-touch paths.

---

#### G-02 — `protocolTreasury` and `paymentToken` each occupy a full slot

**Contract:** `AxiomPaymentProcessor`  
**Lines:** 45–51, 191–223  
**Function:** `payForAgent` (and all admin/view paths touching both fields)

**Current behavior:**

```45:51:apps/contracts/src/AxiomPaymentProcessor.sol
    struct PaymentProcessorStorage {
        address protocolTreasury;
        IERC20 paymentToken; // ERC-20 stable (USDC.e / USDG); non-immutable for migration
        uint256 protocolFeeBps; // default protocol cut on every payForAgent
        mapping(uint256 => uint256) agentRoyaltyBps; // optional override per agent
        mapping(uint256 => bool) agentRoyaltyBpsSet; // whether royalty was explicitly set
        mapping(address => uint256) agentEarnings; // creator earnings (pull)
    }
```

Two `address`-sized values (20 bytes each) sit in **separate slots**. `payForAgent` loads `paymentToken` every call and reads `protocolTreasury` when `protocolCut > 0`.

**Optimization:** Pack `address protocolTreasury` and `address paymentToken` into a single slot (40 bytes). Optionally store `protocolFeeBps` as `uint16` in remaining space if a second packing slot is designed (max value 10_000 fits in 16 bits).

**Estimated savings:** **~100 warm gas** per avoided SLOAD on the hot payment path; one fewer cold slot on deploy/first use.

---

#### G-03 — Dual royalty mappings force two storage touches per payment

**Contract:** `AxiomPaymentProcessor`  
**Lines:** 49–50, 143–151, 204–210  
**Functions:** `_setRoyaltyBps`, `payForAgent`

**Current behavior:**

```204:210:apps/contracts/src/AxiomPaymentProcessor.sol
        if (!$.agentRoyaltyBpsSet[agentTokenId]) {
            protocolCut = (amount * $.protocolFeeBps) / BPS_DENOMINATOR;
            creatorCut = amount - protocolCut;
        } else {
            creatorCut = (amount * $.agentRoyaltyBps[agentTokenId]) / BPS_DENOMINATOR;
            protocolCut = amount - creatorCut;
        }
```

Every `payForAgent` performs an SLOAD on `agentRoyaltyBpsSet`; the override branch adds a second SLOAD on `agentRoyaltyBps`. `_setRoyaltyBps` writes **both** mappings.

**Optimization:** Collapse to a single mapping with a sentinel encoding, e.g. store `bps + 1` where `0` means “unset, use `protocolFeeBps`”. Eliminates `agentRoyaltyBpsSet` entirely (saves one SLOAD per payment, one SSTORE per royalty update, and one mapping slot root).

**Estimated savings:** **~100+ warm gas per `payForAgent`**; **~20,000 gas** on first royalty write to a new agent (one fewer cold slot). Breaking change to storage layout — only viable pre-mainnet or via migration.

---

#### G-04 — `nft` is mutable storage; `onlyTokenOwner` pays SLOAD on every gated call

**Contract:** `AxiomStrategyVault`  
**Lines:** 44–45, 47–51, 62–68  
**Functions:** `deposit`, `withdraw`, `setStrategy` (via `onlyTokenOwner`)

**Current behavior:**

```44:51:apps/contracts/src/AxiomStrategyVault.sol
    /// @notice The AxiomAgentNFT contract whose tokens are vaults
    IAxiomAgentNFT public nft;

    modifier onlyTokenOwner(
        uint256 tokenId
    ) {
        if (nft.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
```

`nft` is a storage variable. Each `onlyTokenOwner` invocation incurs a warm SLOAD (~100 gas) before the external `ownerOf` call. `setNFT` allows owner rotation, which motivates mutability.

**Optimization:** If NFT address rotation is rare or can be handled by redeploying the vault, declare `IAxiomAgentNFT public immutable nft` (mirroring `AXIOM_NFT` in `AxiomPaymentProcessor`). Immutable reads cost ~3 gas vs ~100 for warm SLOAD.

**Estimated savings:** **~100 warm gas per owner-gated call** (`deposit`, `withdraw`, `setStrategy`). Trade-off: lose in-place `setNFT` upgrade path.

---

### Medium

#### G-05 — `execute()` hashes `data` via memory expansion (`keccak256(data)`)

**Contract:** `AxiomStrategyVault`  
**Lines:** 125–126, 141–142  
**Function:** `execute`

**Current behavior:**

```141:142:apps/contracts/src/AxiomStrategyVault.sol
        bytes32 actionHash = keccak256(abi.encode(target, value, keccak256(data)));
        if (!MerkleProof.verify(merkleProof, v.strategyRoot, actionHash)) revert InvalidMerkleProof();
```

`data` is `calldata`, but `keccak256(data)` copies calldata into memory for hashing. Large calldata payloads incur linear memory-cost growth (quadratic in the EVM memory model for large expansions).

**Optimization:** Use assembly to hash calldata in place without copying, or OZ `EfficientHash` / `calldataKeccak256` patterns. Keep the empty-data branch (lines 150–154) — it already avoids this cost when `data.length == 0`.

**Estimated savings:** **Linear in `data.length`** — negligible for small calls; **material for large strategy calldata** (kilobyte-scale payloads).

---

#### G-06 — Merkle proof verification cost scales with proof length (unavoidable loop)

**Contract:** `AxiomStrategyVault`  
**Lines:** 126, 142  
**Function:** `execute`

**Current behavior:** `MerkleProof.verify(merkleProof, v.strategyRoot, actionHash)` iterates `merkleProof.length` times (OpenZeppelin implementation). Each level is a `keccak256` pair hash.

**Optimization:** Not eliminable without changing the trust model. Mitigations: (1) keep Merkle trees shallow at the application layer, (2) expose a **batch `execute`** that verifies multiple proofs in one tx to amortize modifier / day-reset / `strategyRoot` SLOAD costs, (3) document expected proof depth for operators.

**Estimated savings:** Batch amortization only; per-proof loop cost is inherent.

---

#### G-07 — `payForAgent` performs two ERC-20 transfers when `protocolCut > 0`

**Contract:** `AxiomPaymentProcessor`  
**Lines:** 217–223  
**Function:** `payForAgent`

**Current behavior:**

```217:223:apps/contracts/src/AxiomPaymentProcessor.sol
        token.safeTransferFrom(msg.sender, address(this), amount);

        if (protocolCut > 0) {
            token.safeTransfer($.protocolTreasury, protocolCut);
        }
```

Full `amount` is pulled to the contract; `protocolCut` is forwarded to treasury. The in-code comment (lines 217–218) correctly notes a single `transferFrom` is cheaper than split pulls. Creator share remains as internal accounting (`agentEarnings`).

**Optimization:** Current design is sound for gas. Alternative “pull split” (`transferFrom` to creator + `transferFrom` to treasury) would cost **more** (two `transferFrom` + two allowance checks). Optional micro-optimization: if `protocolCut == amount`, transfer directly to treasury and skip `agentEarnings` update — niche case only.

**Estimated savings:** None recommended on the happy path; pattern is already optimal for standard ERC-20 semantics.

---

#### G-08 — Admin setters call `_getStorage()` twice without caching the storage pointer

**Contract:** `AxiomPaymentProcessor`  
**Lines:** 92–98, 101–107, 114–120  
**Functions:** `setProtocolTreasury`, `setProtocolFeeBps`, `setPaymentToken`

**Current behavior:**

```96:97:apps/contracts/src/AxiomPaymentProcessor.sol
        address old = _getStorage().protocolTreasury;
        _getStorage().protocolTreasury = newTreasury;
```

Each setter invokes `_getStorage()` twice. The ERC-7201 assembly slot assignment is cheap, but caching `PaymentProcessorStorage storage $ = _getStorage();` is cleaner and avoids duplicate slot binding.

**Optimization:** Cache `storage $` once per function (as already done in `payForAgent` line 196).

**Estimated savings:** **Low per call** (~tens of gas); admin-only, so **Medium** only in aggregate migration scenarios.

---

#### G-09 — `deposit()` does not cache `Vault storage` reference

**Contract:** `AxiomStrategyVault`  
**Lines:** 71–76  
**Function:** `deposit`

**Current behavior:**

```75:75:apps/contracts/src/AxiomStrategyVault.sol
        vaults[tokenId].balance += msg.value;
```

Uses direct mapping access. `withdraw` and `execute` cache `Vault storage v = vaults[tokenId]`.

**Optimization:** `Vault storage v = vaults[tokenId]; v.balance += msg.value;` — consistent with other functions; compiler may partially optimize already.

**Estimated savings:** **Low–Medium** (~marginal; consistency benefit).

---

#### G-10 — Day rollover in `execute()` writes two storage fields

**Contract:** `AxiomStrategyVault`  
**Lines:** 134–138  
**Function:** `execute`

**Current behavior:**

```134:138:apps/contracts/src/AxiomStrategyVault.sol
        uint64 today = uint64(block.timestamp / 1 days);
        if (today != v.resetDay) {
            v.dailySpent = 0;
            v.resetDay = today;
        }
```

On UTC day change, two SSTOREs occur before limit check. Unavoidable for correct accounting unless `resetDay` is packed with `dailySpent` and reset via a single-word overwrite trick.

**Optimization:** Packing `dailySpent` + `resetDay` into one slot (see G-01) can reduce rollover from two slot writes to one in some layouts.

**Estimated savings:** **~100–5,000 gas** on rollover days depending on warm/cold state.

---

#### G-11 — No batch entry points for high-frequency operations

**Contract:** `AxiomStrategyVault`, `AxiomPaymentProcessor`  
**Lines:** N/A (missing APIs)  
**Functions:** `payForAgent`, `execute`, `withdrawAgentEarnings`

**Current behavior:** Each operation pays full fixed overhead: `nonReentrant`, `whenNotPaused`, external NFT lookup (`creatorOf` / `ownerOf`), event emission.

**Optimization:** Add optional batch functions, e.g.:

- `payForAgents(uint256[] calldata ids, uint256[] calldata amounts)` — single reentrancy lock, amortized NFT reads if same creator
- `executeBatch(...)` — shared day-reset and `strategyRoot` load per `tokenId`

**Estimated savings:** **Medium** for integrators — fixed ~2,000–5,000+ gas per additional item avoided (modifier + call overhead).

---

#### G-12 — `require(ok, "string")` instead of custom errors on failure paths

**Contract:** `AxiomStrategyVault`  
**Lines:** 90, 155  
**Functions:** `withdraw`, `execute`

**Current behavior:**

```90:90:apps/contracts/src/AxiomStrategyVault.sol
        require(ok, "Transfer failed");
```

```155:155:apps/contracts/src/AxiomStrategyVault.sol
        require(ok, "Call failed");
```

Elsewhere the contract uses custom errors (`NotTokenOwner`, `InvalidMerkleProof`, etc.). String reverts cost more deployment bytecode and higher revert gas.

**Optimization:** `error TransferFailed();` / `error CallFailed();` with `if (!ok) revert TransferFailed();`

**Estimated savings:** **Revert-path only** (~hundreds of gas on failure); no hot-path win. Consistency with the rest of the codebase.

---

### Low

#### G-13 — Redundant interface cast in `onlyAgentCreator`

**Contract:** `AxiomPaymentProcessor`  
**Lines:** 66–71  
**Function:** `onlyAgentCreator` modifier

**Current behavior:**

```69:69:apps/contracts/src/AxiomPaymentProcessor.sol
        address creator = IAxiomAgentNFT(AXIOM_NFT).creatorOf(agentTokenId);
```

`AXIOM_NFT` is already typed `IAxiomAgentNFT public immutable`.

**Optimization:** `AXIOM_NFT.creatorOf(agentTokenId)` — drop explicit cast.

**Estimated savings:** Negligible (compile-time / marginal).

---

#### G-14 — `unchecked` arithmetic safe after explicit bounds checks

**Contract:** Both  
**Lines:** `AxiomStrategyVault` 85–87, 139, 145–146; `AxiomPaymentProcessor` 205–209, 214  

**Current behavior:** Subtractions and additions are checked by default in Solidity 0.8+. Prior guards make overflow/underflow impossible, e.g. `v.balance -= amount` after `v.balance < amount` check (line 85), `creatorCut = amount - protocolCut` when `protocolFeeBps <= BPS_DENOMINATOR`.

**Optimization:** Wrap post-check arithmetic in `unchecked { ... }` blocks.

**Estimated savings:** **~20–80 gas per operation** — small but free on hot paths.

---

#### G-15 — `execute()` allocates `bytes memory result` and copies returndata

**Contract:** `AxiomStrategyVault`  
**Lines:** 148–158  
**Function:** `execute`

**Current behavior:** Return data from `target.call` is copied into memory for emit + return. Large return payloads are expensive.

**Optimization:** If callers do not need full returndata on-chain, emit a truncated hash or use assembly to forward returndata without duplication. Only worth it if agents return large blobs.

**Estimated savings:** **Low** default; **Medium** only for large return data.

---

#### G-16 — View getters repeat `_getStorage()` per call

**Contract:** `AxiomPaymentProcessor`  
**Lines:** 154–182  

**Current behavior:** Each view (`protocolTreasury`, `royaltyBpsOf`, etc.) calls `_getStorage()` independently.

**Optimization:** No change needed for views (off-chain / staticcall). Could batch into a single `getConfig()` multicall-style view for RPC efficiency — off-chain ergonomics, not execution gas.

**Estimated savings:** N/A on-chain.

---

#### G-17 — `protocolFeeBps` stored as `uint256`

**Contract:** `AxiomPaymentProcessor`  
**Lines:** 48, 205  

**Current behavior:** Full word for values bounded by `10_000`.

**Optimization:** `uint16 protocolFeeBps` with packing (see G-02).

**Estimated savings:** Slot sharing benefit; **Low** isolated.

---

#### G-18 — `setRoyaltyBpsPermitted` duplicates `ownerOf` external call pattern

**Contract:** `AxiomPaymentProcessor`  
**Lines:** 135–140  

**Current behavior:** Separate code path from `onlyAgentCreator` for frontend signing convenience — intentional. Same external call cost as `creatorOf` path.

**Optimization:** None without product change.

**Estimated savings:** N/A.

---

## Per-Contract Analysis

### `AxiomStrategyVault.sol`

| Function | Dominant gas drivers | Notes |
|----------|---------------------|-------|
| `deposit` | `onlyTokenOwner` → `ownerOf` external call; `SSTORE` on `balance` | No reentrancy guard (ETH receive path); pausable |
| `withdraw` | `nonReentrant`; CEI balance update; ETH `call` | Custom error would help revert path (G-12) |
| `setStrategy` | 4–5 `SSTORE`s on strategy fields | Benefits from G-01 packing |
| `execute` | 5+ `SLOAD`s; day reset `SSTORE`s; double `keccak256`; Merkle loop; ETH `call`; returndata copy | Hottest function; G-01, G-05, G-11 |
| `balanceOf` / `strategyOf` | Pure `SLOAD`s | View — cheap |

**Storage hot path (`execute`):** Reads `strategyRoot`, `balance`, `resetDay`, `dailySpent`, `dailyLimit`; writes `balance`, `dailySpent`, optionally `dailySpent`+`resetDay` on rollover. Unpacked struct amplifies cost.

**External calls:** `nft.ownerOf` (owner flows); `target.call{value}` (agent execution). No redundant external calls in a single function beyond necessity.

---

### `AxiomPaymentProcessor.sol`

| Function | Dominant gas drivers | Notes |
|----------|---------------------|-------|
| `payForAgent` | `creatorOf`; royalty mapping(s); `agentEarnings` SSTORE; `safeTransferFrom` + optional `safeTransfer` | Hot path; G-02, G-03 |
| `withdrawAgentEarnings` | CEI zero balance; single `safeTransfer` | Well optimized |
| `payComputeProvider` | Direct `transferFrom` to provider | Skips intermediate custody — good |
| `_setRoyaltyBps` | Two mapping writes | G-03 |
| Admin setters | Owner check; double `_getStorage` | G-08 |

**Immutable:** `AXIOM_NFT` avoids storage read on every `creatorOf` — positive contrast with vault’s mutable `nft`.

**ERC-7201:** Namespaced storage adds minimal assembly overhead; worthwhile for upgrade-adjacent layout safety.

---

### `IAxiomAgentNFT.sol`

Minimal interface — two `external view` functions (`ownerOf`, `creatorOf`). No storage, no loops, no optimization surface. Gas cost is entirely borne by the NFT implementation at call sites.

---

## Microchange Opportunities

Quick wins with minimal behavioral change:

1. **Cache `_getStorage()` in admin setters** (`AxiomPaymentProcessor` L92–120).
2. **Cache `Vault storage` in `deposit`** (`AxiomStrategyVault` L75).
3. **Remove `IAxiomAgentNFT(...)` cast** in `onlyAgentCreator` (L69).
4. **Add `unchecked` blocks** after `v.balance < amount`, `v.dailySpent + value > v.dailyLimit`, and BPS math when `protocolFeeBps <= 10_000`.
5. **Replace `require(ok, "...")` with custom errors** in `withdraw` / `execute`.
6. **Consider `immutable nft`** in vault if `setNFT` is deprecated.

Layout changes (higher effort, pre-mainnet best):

7. **Pack `Vault` struct** (G-01).
8. **Pack treasury + token (+ optional `uint16` bps)** (G-02, G-17).
9. **Sentinel-based single royalty mapping** (G-03).

---

## Positive Patterns

1. **`immutable AXIOM_NFT`** — `AxiomPaymentProcessor` L64; cheap reads on every payment.
2. **`BPS_DENOMINATOR` constant** — L42; avoids storage for math denominator.
3. **Single `transferFrom` in `payForAgent`** — L217–218 comment documents deliberate gas choice vs split pulls.
4. **Direct `transferFrom` in `payComputeProvider`** — L236; no custodial hop.
5. **CEI ordering** — `withdraw` (L86–89), `execute` (L144–146), `withdrawAgentEarnings` (L248–252), `payForAgent` (L212–219).
6. **`calldata` parameters in `execute`** — L125–126; avoids memory copies for `data` and `merkleProof` inputs.
7. **Empty `data` fast path in `execute`** — L150–151; skips passing empty bytes to call.
8. **Storage pointer caching** — `payForAgent` (L196–197), `execute` (L128), `withdraw` (L84).
9. **Custom errors (majority)** — both contracts; cheaper than strings on revert.
10. **ERC-7201 namespaced storage** — `AxiomPaymentProcessor` L44–61; isolation without proxy overhead in this standalone contract.
11. **Minimal `IAxiomAgentNFT` interface** — reduces call ABI surface and implementation coupling.
12. **`ReentrancyGuard` only where needed** — vault `deposit` omits it (no external call before state finalization beyond ETH accounting); guarded on ETH/token outbound paths.

---

## Summary Table

| ID | Impact | Contract | Function(s) | Category |
|----|--------|----------|-------------|----------|
| G-01 | High | `AxiomStrategyVault` | `execute`, `setStrategy` | Storage packing |
| G-02 | High | `AxiomPaymentProcessor` | `payForAgent` | Storage packing |
| G-03 | High | `AxiomPaymentProcessor` | `payForAgent`, `_setRoyaltyBps` | Redundant SLOAD/SSTORE |
| G-04 | High | `AxiomStrategyVault` | `onlyTokenOwner` flows | Immutable vs storage |
| G-05 | Medium | `AxiomStrategyVault` | `execute` | Calldata hashing |
| G-06 | Medium | `AxiomStrategyVault` | `execute` | Loop (Merkle) |
| G-07 | Medium | `AxiomPaymentProcessor` | `payForAgent` | External calls (already optimal) |
| G-08 | Medium | `AxiomPaymentProcessor` | Admin setters | Redundant storage binding |
| G-09 | Medium | `AxiomStrategyVault` | `deposit` | Storage pointer |
| G-10 | Medium | `AxiomStrategyVault` | `execute` | Day rollover SSTORE |
| G-11 | Medium | Both | — | Batching |
| G-12 | Medium | `AxiomStrategyVault` | `withdraw`, `execute` | Custom errors |
| G-13–G-18 | Low | Various | Various | Micro-optimizations |

---

*End of report. All line references cite `apps/contracts/src/` as of analysis date 2026-07-06.*