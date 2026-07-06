# Axiom On-Chain Smart Contract Analysis — Final Consolidated Report

**Main Agent:** Consolidation  
**Date:** 2026-07-06  
**Scope:** `apps/contracts/src/` production Solidity only (14 files, ~1,750 LOC)  
**Stack:** Solidity `^0.8.20`, Foundry, OpenZeppelin 5.x, UUPS (iNFT), standalone vault/verifier  
**Network:** 0G Galileo testnet (chainId `16602`); Aristotle mainnet deployment path documented  

**Sub-agent reports:**
- [`onchain_analysis_security_20260706.md`](onchain_analysis_security_20260706.md) — Security, Group A
- [`onchain_analysis_gas_20260706.md`](onchain_analysis_gas_20260706.md) — Gas, Group A
- [`onchain_analysis_architecture_20260706.md`](onchain_analysis_architecture_20260706.md) — Architecture, Group B

**Status:** Analysis + planning only — no fixes or deployments implemented.

---

## 1. Contract Partition (3 Groups — Zero Overlap)

| Group | Contracts | LOC (approx) | Sub-agent coverage |
|-------|-----------|--------------|-------------------|
| **A — Core protocol & payments** | `AxiomStrategyVault.sol`, `AxiomPaymentProcessor.sol`, `IAxiomAgentNFT.sol` | ~443 | SA1 Security + SA2 Gas |
| **B — iNFT / ERC-7857 stack** | `AxiomAgentNFT.sol`, `ERC7857Upgradeable.sol`, `ERC7857AuthorizeUpgradeable.sol`, `ERC7857CloneableUpgradeable.sol`, `ERC7857IDataStorageUpgradeable.sol`, `IERC7857.sol`, `IERC7857Authorize.sol`, `IERC7857Cloneable.sol`, `IERC7857Metadata.sol` | ~913 | SA3 Architecture |
| **C — Verifiers & metadata** | `AxiomTeeVerifier.sol`, `BaseVerifier.sol`, `IERC7857DataVerifier.sol`, `AxiomMetadataJson.sol` | ~709 | Main-agent consolidation (security + gas + quality) |

**Explicitly excluded:** `apps/contracts/test/`, `apps/contracts/script/`, `lib/`, frontend, backend, indexer.

---

## 2. Deployed State vs Source

| Contract | Galileo address | Upgrade model | Notes |
|----------|-----------------|---------------|-------|
| AxiomAgentNFT | `0x6f82d061a903E48Ce1810F8d42536C6A837ed684` | UUPS proxy | Verifier wired at init; `OPERATOR_ROLE` can rotate |
| AxiomStrategyVault | `0xB30061Ea93b60FCbAE11C2b06FE3Db3C84FAA367` | Non-upgradeable | `nft` mutable via `setNFT()`; holds native OG |
| AxiomPaymentProcessor | `0x97a32707d948F91175706ca5509c7bfCC643a1dD` | Non-upgradeable (namespaced storage) | `AXIOM_NFT` immutable; payment token mutable |
| AxiomTeeVerifier | `0x63Edfd4CD68A77AEdC4A56550Ae94e7F86d497B7` | Non-upgradeable (proxy-ready Ownable) | `maxProofAgeSeconds` immutable; signer rotatable |

Source matches broadcast artifacts under `apps/contracts/broadcast/`. Vault and payment processor `owner` / treasury wired to oracle admin at deploy (`Deploy.s.sol`).

---

## 3. Overall Assessment

| Dimension | Grade | Summary |
|-----------|-------|---------|
| **Security (unprivileged)** | B+ | No critical unprivileged fund-theft path in reviewed logic. Dominant risks are **privileged centralization** (owner/signer rotation) and **permissionless `execute()`** MEV surface. |
| **Security (privileged / ops)** | C+ | Mutable NFT registry on vault, payment-token migration without enforced drain, TEE signer rotation — all can cause total loss if admin key compromised. |
| **Gas efficiency** | B | CEI, immutables, calldata used well; struct packing and dual royalty mappings are main savings levers. |
| **Architecture / upgradeability** | B− | ERC-7201 namespaces are sound; missing `__gap` arrays, pause incompleteness on iNFT paths, dual governance (Ownable vs AccessControl). |
| **EIP-7857 conformance** | B | Proof pipeline and 3-arg verifier binding are correct; event-order and ERC-721 bypass are integration deviations. |
| **Test coverage** | A− | Unit, fuzz, invariant, gas benchmarks present for all four core contracts. |

**Consolidated severity totals (deduplicated across groups):**

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 8 |
| Medium | 22 |
| Low | 14 |
| Cosmetic | 5 |

---

## 4. System-Wide Cross-Cutting Patterns

### X-01: Privileged key = full protocol control

**Contracts:** Vault `owner`, Payment `owner`, TEE `owner`, NFT `owner` + `DEFAULT_ADMIN_ROLE`  
**Impact:** Single compromised admin can redirect fees, rotate NFT registry, rotate TEE signer, or upgrade iNFT implementation.  
**Microchange:** Multisig + timelocks on all rotation/upgrade functions; document ops runbook.

### X-02: Immutable vs mutable registry inconsistency

**Evidence:** `AxiomPaymentProcessor.AXIOM_NFT` is immutable; `AxiomStrategyVault.nft` is owner-mutable (`setNFT`).  
**Impact:** Vault trust model strictly weaker than payment processor.  
**Microchange:** Align vault to immutable NFT or two-step migration with withdrawal freeze.

### X-03: Pause semantics incomplete on iNFT

**Evidence:** SA3 H-01 — `whenNotPaused` on mint/update only; transfers/clones/authorize remain live.  
**Impact:** Emergency stop does not halt ownership movement or proof-gated transfers.  
**Microchange:** Override `_update` with `whenNotPaused` (OZ `ERC721Pausable` pattern).

### X-04: ERC-721 compatibility vs EIP-7857 proof transfers

**Evidence:** SA3 M-01 — bare `transferFrom` bypasses `PublishedSealedKey` / re-encryption.  
**Impact:** Integrators using standard ERC-721 flows can brick agent decryptability without stealing the NFT.  
**Microchange:** Revert non-proof transfers or emit strong warnings; document integrator requirements.

### X-05: Verifier is the trust root for all iNFT movement

**Evidence:** `registerSigner` (`AxiomTeeVerifier.sol:86-93`), `updateVerifier` (`AxiomAgentNFT.sol:148-155`).  
**Impact:** Signer or verifier rotation invalidates or redirects entire transfer security model.  
**Microchange:** Timelock + dual-signer transition period; on-chain notice events.

---

## 5. All Findings by Severity

### Critical

*None identified under standard unprivileged-attacker assumptions.*

---

### High

| ID | Issue | Location | Agent | Exploit / impact summary |
|----|-------|----------|-------|--------------------------|
| H-A1 | Vault `setNFT()` hijacks `onlyTokenOwner` | `AxiomStrategyVault.sol:62-69` | SA1 | Malicious owner points vault at fake NFT → drain all balances |
| H-A2 | `setPaymentToken()` strands earnings | `AxiomPaymentProcessor.sol:110-121` | SA1 | Scalar `agentEarnings` without per-token asset → brick or mis-pay on migration |
| H-A3 | `setProtocolTreasury()` redirects fees | `AxiomPaymentProcessor.sol:92-99` | SA1 | All future protocol cuts to attacker EOA |
| H-B1 | Pause does not block transfers/clones | `AxiomAgentNFT.sol` + `_update` | SA3 | “Paused” NFT still transferable |
| H-B2 | Dual governance: UUPS `onlyOwner` vs `AccessControl` | `AxiomAgentNFT.sol:86-96, 208-210` | SA3 | Upgrade authority diverges from ops roles |
| H-C1 | `registerSigner` centralization | `AxiomTeeVerifier.sol:86-93` | Main | Owner rotates TEE key → forge proofs → steal sealed keys on transfer |
| H-C2 | `registeredSigner` hot storage (ops risk) | `AxiomTeeVerifier.sol:46` | Main | Same as H-C1; no timelock on rotation |
| H-C3 | Verifier rotatable by `OPERATOR_ROLE` | `AxiomAgentNFT.sol:148-155` | SA3 | Atomic trust-root swap for all future transfers |

---

### Medium (representative — full detail in sub-agent reports)

| ID | Issue | Location |
|----|-------|----------|
| M-A1 | Permissionless `execute()` — MEV/front-run | `AxiomStrategyVault.sol:120-159` |
| M-A2 | Royalty override bypasses `protocolFeeBps` | `AxiomPaymentProcessor.sol:199-210` |
| M-A3 | `setRoyaltyBpsPermitted` — owner ≠ creator economics | `AxiomPaymentProcessor.sol:130-141` |
| M-A4 | Native OG sent without `deposit()` is trapped | `AxiomStrategyVault.sol` (no receive/sweep) |
| M-A5 | Fee-on-transfer ERC-20 breaks payment splits | `AxiomPaymentProcessor.sol` `payForAgent` |
| M-A6 | `execute()` reverts after debit — griefing | `AxiomStrategyVault.sol:144-155` |
| M-A7 | `validUntil` on strategy not enforced in `execute` | `AxiomStrategyVault.sol:100-111` (emitted but unused) |
| M-B1 | ERC-721 transfer bypasses proof path | Group B (no override) |
| M-B2 | CEI: `_safeMint` before metadata on mint/clone | `ERC7857CloneableUpgradeable.sol:46-51`, `AxiomAgentNFT.sol:220-224` |
| M-B3 | Verifier called before ERC-721 auth in `_transfer` | `ERC7857Upgradeable.sol:90-151` |
| M-B4 | No `__gap` in ERC-7201 structs | All Group B storage namespaces |
| M-B5 | `AuthorizationRevoked` event order ≠ EIP-7857 | `IERC7857Authorize.sol:19` |
| M-B6 | `iTransferFrom` lacks early `_checkAuthorized` | `ERC7857Upgradeable.sol:155-173` |
| M-C1 | No explicit `accessSigner == to` check | `AxiomTeeVerifier.sol:227-228` |
| M-C2 | `usedProofs` storage growth (mitigated by `cleanExpiredProofs`) | `BaseVerifier.sol:11-37` |
| M-G1 | Vault struct unpacking (5 slots) | `AxiomStrategyVault.sol:34-40` |
| M-G2 | Dual royalty mappings (+1 SLOAD/SSTORE) | `AxiomPaymentProcessor.sol:84-85` |

---

### Low / Cosmetic

Documented in sub-agent reports: custom errors vs `require` strings, `msg.sender` vs `_msgSender()` inconsistency, `AxiomMetadataJson` string-concat gas in pure view (off-chain only), NatSpec gaps, misleading `NotCreator` error name, etc.

---

## 6. Positive Findings

1. **CEI on value exits** — Vault `withdraw` and payment `withdrawAgentEarnings` update state before external calls.
2. **ReentrancyGuard** on vault withdraw/execute and payment withdraw paths.
3. **SafeERC20** on all ERC-20 transfers in payment processor.
4. **Merkle leaf hardening** — `keccak256(data)` inside action hash prevents malleability (`AxiomStrategyVault.sol:141`).
5. **EIP-712 domain binding** — TEE verifier binds `to`, `nft`, `chainId`, `verifyingContract` in digests.
6. **Proof replay + expiry** — `BaseVerifier` nonce marking + `maxProofAgeSeconds` + `validUntil` gates.
7. **Cross-proof consistency check** — Ownership/access field alignment (`AxiomTeeVerifier.sol:170-177`).
8. **ERC-7201 namespaced storage** — Isolated upgradeable modules in Group B.
9. **Pull-based creator earnings** — Reduces reentrancy surface vs push payments.
10. **Withdrawals allowed while paused** on payment processor (creators not griefed by pause).
11. **Fuzz + invariant tests** — Vault balance invariant, proof expiry tests, payment fuzz suites.
12. **`BaseVerifier.__gap[50]`** — Upgrade headroom in verifier base (Group C).

---

## 7. Microchange Plan (Prioritized)

### Phase 0 — Security & ops (before mainnet)

| # | Change | Files | Effort |
|---|--------|-------|--------|
| P0-1 | Make vault `nft` **immutable** (or timelocked 2-step migration) | `AxiomStrategyVault.sol` | S |
| P0-2 | Enforce payment-token migration: drain old token + zero earnings | `AxiomPaymentProcessor.sol` | M |
| P0-3 | Timelock `registerSigner`, `setProtocolTreasury`, `updateVerifier` | TEE + Payment + NFT | M |
| P0-4 | Add `whenNotPaused` to `_update` (all transfers) | `AxiomAgentNFT.sol` | S |
| P0-5 | Unify governance: `_authorizeUpgrade` same role as `DEFAULT_ADMIN_ROLE` | `AxiomAgentNFT.sol` | S |
| P0-6 | Explicit `accessSigner == to` in TEE verifier | `AxiomTeeVerifier.sol` | S |

### Phase 1 — Economic & MEV hardening

| # | Change | Files | Effort |
|---|--------|-------|--------|
| P1-1 | Optional `onlyExecutor` or private-relay doc for `execute()` | `AxiomStrategyVault.sol` | S–M |
| P1-2 | Cap `agentRoyaltyBps` with minimum protocol fee floor | `AxiomPaymentProcessor.sol` | S |
| P1-3 | Restrict royalty changes to `creatorOf` only | `AxiomPaymentProcessor.sol` | S |
| P1-4 | `recoverExcessNative()` or reverting `receive()` | `AxiomStrategyVault.sol` | S |
| P1-5 | Enforce `strategyOf.validUntil` in `execute` if intended | `AxiomStrategyVault.sol` | S |

### Phase 2 — Gas & storage

| # | Change | Files | Effort |
|---|--------|-------|--------|
| P2-1 | Pack `Vault` struct (4→3 slots) | `AxiomStrategyVault.sol` | S |
| P2-2 | Pack treasury + paymentToken; `uint16` fee bps | `AxiomPaymentProcessor.sol` | S |
| P2-3 | Single royalty mapping with sentinel/default | `AxiomPaymentProcessor.sol` | M |
| P2-4 | Custom errors replace `require` strings | Both core contracts | S |

### Phase 3 — Architecture & upgrade safety

| # | Change | Files | Effort |
|---|--------|-------|--------|
| P3-1 | Add `__gap[50]` to all ERC-7201 structs | Group B | S |
| P3-2 | `_checkAuthorized` at start of `_transfer` / `iTransferFrom` | `ERC7857Upgradeable.sol` | S |
| P3-3 | Metadata before `_safeMint` or `_mint` for EOAs | Clone + mint paths | M |
| P3-4 | Align `AuthorizationRevoked` event with EIP-7857 (major version) | Interfaces + extension | M |
| P3-5 | Document or block bare ERC-721 transfers | `AxiomAgentNFT.sol` | S–M |

**Effort:** S = <1 day, M = half-week, L = multi-week

---

## 8. Before/After — Highest-Impact Microchanges

### 8.1 Vault NFT registry (P0-1)

**Before:**
```solidity
IAxiomAgentNFT public nft;
function setNFT(address newNft) external onlyOwner { nft = IAxiomAgentNFT(newNft); }
```

**After:**
```solidity
IAxiomAgentNFT public immutable nft; // set in constructor only
```

**Impact:** Eliminates fake-NFT drain vector; aligns with payment processor trust model.

---

### 8.2 Pause covers transfers (P0-4)

**Before:** Only `mint` / `update` use `whenNotPaused`.

**After:**
```solidity
function _update(...) internal override whenNotPaused returns (address) {
    return super._update(to, tokenId, auth);
}
```

**Impact:** Emergency pause actually freezes ownership movement.

---

### 8.3 TEE access proof recipient binding (P0-6)

**Before:**
```solidity
address accessSigner = _recoverSigner(accessMessage, p.accessProof.proof);
if (accessSigner == address(0)) revert AxiomInvalidAccessProof();
```

**After:**
```solidity
if (accessSigner != to) revert AxiomInvalidAccessProof();
```

**Impact:** Defense-in-depth that recovered signer is the intended recipient.

---

### 8.4 Vault struct packing (P2-1)

**Before:** 5 storage slots per `Vault` mapping entry.

**After:** 3–4 slots with packed `dailyLimit`/`dailySpent`/`resetDay`.

**Impact:** ~100–300 warm gas saved per `execute` / `setStrategy` on hot paths.

---

## 9. Prioritization Matrix

```
                    IMPACT (security / funds)
                    High ─────────────────────────────►
              ┌─────┬───────────────────────────────────┐
         High │ P2  │ P0-1..P0-6, P1-1..P1-3            │
              │     │ H-A1, H-C1, H-B1                 │
    EFFORT    ├─────┼───────────────────────────────────┤
         Low  │ P3  │ P1-4, P1-5, P2-1..P2-4, P3-1..P3-2│
              └─────┴───────────────────────────────────┘
```

**Recommended order:** P0 (all) → P1 → P2 → P3. Do not deploy to mainnet without P0-1, P0-3, P0-4, P0-5 at minimum.

---

## 10. Sub-Agent Report Index

| Report | Focus | Group | Findings |
|--------|-------|-------|----------|
| `onchain_analysis_security_20260706.md` | Security & vulnerabilities | A | 0C / 3H / 7M / 5L |
| `onchain_analysis_gas_20260706.md` | Gas & storage efficiency | A | 4 high / 8 med / 6 low gas items |
| `onchain_analysis_architecture_20260706.md` | Patterns & upgradeability | B | 0C / 2H / 7M / 6L / 5 cosmetic |

Group C analysis (TEE verifier, `BaseVerifier`, `AxiomMetadataJson`, `IERC7857DataVerifier`) is integrated in Sections 4–5 above (H-C1..C3, M-C1..C2).

---

## 11. Conclusion

The Axiom on-chain system is **well-tested and thoughtfully structured** for a buildathon-grade deployment: OpenZeppelin primitives, CEI discipline, EIP-712 proof binding, and fuzz coverage are strengths. No critical unprivileged exploit was found in source review.

The primary risks are **operational and governance**: mutable trust roots (vault NFT, TEE signer, payment token, verifier), incomplete pause on iNFT transfers, and permissionless strategy execution enabling MEV. These are addressable through small, incremental microchanges without architectural rewrites.

**No fixes were implemented in this analysis phase.** Ready for an on-chain fix wave starting with Phase P0.

---

*End of consolidated on-chain report.*