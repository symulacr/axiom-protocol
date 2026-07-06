# Fix Manifest — Axiom On-Chain Audit Remediation

**Orchestrator:** Fixing Orchestrator  
**Last updated:** 2026-07-06  
**Sources:** `onchain_analysis_final_report.md`, `onchain_analysis_security_20260706.md`, `onchain_analysis_gas_20260706.md`, `onchain_analysis_architecture_20260706.md`

**AUDIT STATUS:** NEAR COMPLETE — **Critical: 0** | **High: 0** ✅ | **P1–P3 (actionable): complete** ✅ | M-B5 + Low/cosmetic deferred

**Note (O6-R):** O6-C agent had accidentally left contracts at pre-O1 baseline; restoration agents re-applied O1–O5 in same session.

---

## Wave History

| Wave | Date | Agents | Scope | Status |
|------|------|--------|-------|--------|
| O1 | 2026-07-06 | O1-A, O1-B, O1-C, O1-D | P0-1, P0-2, P0-4, P0-6 (disjoint files) | ✅ Verified (120 passed, 0 failed) |
| O2 | 2026-07-06 | O2-A, O2-B, O2-C | P0-3, P0-5, H-A3, H-B2, H-C1/C2/C3 | ✅ Verified (138 passed, 0 failed) |
| O3 | 2026-07-06 | O3-A, O3-B | P1-2, P1-3, P1-4 | ✅ Verified (149 passed, 0 failed) |
| O4 | 2026-07-06 | O4-A, O4-B | P1-1, P1-5, M-A5, M-A6 | ✅ Verified (152 passed, 0 failed) |
| O5 | 2026-07-06 | O5-A, O5-B | P2-1, P2-2, P2-3, P2-4 (vault) | ✅ Verified (154 passed, 0 failed) |
| O6 | 2026-07-06 | O6-A, O6-B, O6-C, O6-R×4 | P3-1..P3-3, P3-5 + restore O1–O5 | ✅ Verified (149 passed, 0 failed) |

---

## Critical

*None identified in audit.*

---

## High — Phase P0 (Security & Ops)

| ID | Finding | Microchange | Status | Agent | Verification |
|----|---------|-------------|--------|-------|--------------|
| H-A1 / P0-1 | Vault `setNFT()` hijacks `onlyTokenOwner` | Make `nft` `immutable`; remove `setNFT()` + `RegistryUpdated` event | Done | O1-A | `forge test` 120/120; `AxiomStrategyVault.sol` immutable nft |
| H-A2 / P0-2 | `setPaymentToken()` strands earnings | Block migration when `totalOutstandingEarnings > 0` OR old token balance > 0 | Done | O1-B | `MigrationBlocked` + counter; 11 processor tests pass |
| H-A3 / P0-3 | `setProtocolTreasury()` redirects fees | Two-step timelock (`propose` + `execute` after 1 day) | Done | O2-A | 11 new treasury timelock tests |
| H-B1 / P0-4 | Pause does not block transfers | Add `whenNotPaused` to `_update` in `AxiomAgentNFT` | Done | O1-D | `test_pause_blocks_transfer` added |
| H-B2 / P0-5 | Dual governance UUPS vs AccessControl | `_authorizeUpgrade` uses `DEFAULT_ADMIN_ROLE` | Done | O2-C | 36 AxiomAgentNFT tests pass |
| H-C1 / P0-3 | `registerSigner` centralization | Two-step timelock on signer rotation | Done | O2-B | `proposeSigner`/`executeSigner`; 31 TEE tests |
| H-C2 | `registeredSigner` hot storage | Same as H-C1 (timelock) | Done | O2-B | Covered by O2-B |
| H-C3 / P0-3 | Verifier rotatable by `OPERATOR_ROLE` | Two-step timelock on `updateVerifier` | Done | O2-C | `proposeVerifier`/`executeVerifier` |
| M-C1 / P0-6 | No `accessSigner == to` check | Explicit recipient binding in `AxiomTeeVerifier` | Done | O1-C | `accessSigner != to` revert; fuzz tests fixed |

---

---

## Medium — Phase P1 (Economic & MEV)

| ID | Finding | File | Status |
|----|---------|------|--------|
| M-A1 / P1-1 | Permissionless `execute()` MEV | `AxiomStrategyVault.sol` | Done (O4-A) — NatSpec MEV/private-relay guidance |
| M-A2 / P1-2 | Royalty override bypasses protocol fee | `AxiomPaymentProcessor.sol` | Done (O3-B) |
| M-A3 / P1-3 | `setRoyaltyBpsPermitted` owner ≠ creator | `AxiomPaymentProcessor.sol` | Done (O3-B) — **backend** `payment/processor.ts` may need creator-signer path |
| M-A4 / P1-4 | Native OG trapped without `deposit()` | `AxiomStrategyVault.sol` | Done (O3-A) |
| M-A5 | Fee-on-transfer ERC-20 breaks splits | `AxiomPaymentProcessor.sol` | Done (O4-B) — `TransferAmountMismatch` guard |
| M-A6 | `execute()` reverts after debit griefing | `AxiomStrategyVault.sol` | Done (O4-A) — NatSpec liveness note |
| M-A7 / P1-5 | `validUntil` not enforced in `execute` | `AxiomStrategyVault.sol` | Done (O4-A) — `validUntilDay` + `StrategyExpired` |
| M-B1 / P3-5 | ERC-721 bypasses proof path | `AxiomAgentNFT.sol` | Done (O6-C) — NatSpec integrator warning |
| M-B2 / P3-3 | CEI: mint before metadata | Group B | Done (O6-C) — `_updateData` before `_safeMint` |
| M-B3 / P3-2 | Verifier before ERC-721 auth | `ERC7857Upgradeable.sol` | Done (O6-B) — `_checkAuthorized` in `_transfer` |
| M-B4 / P3-1 | No `__gap` in ERC-7201 structs | Group B | Done (O6-A) — `uint256[50] __gap` per namespace |
| M-B5 / P3-4 | `AuthorizationRevoked` event order | Interfaces | Deferred — breaking EIP-7857 ABI change |
| M-B6 / P3-2 | `iTransferFrom` lacks early auth | `ERC7857Upgradeable.sol` | Done (O6-B) — via `_transfer` guard |
| M-C2 | `usedProofs` storage growth | `BaseVerifier.sol` | Pending |
| M-G1 / P2-1 | Vault struct unpacking | `AxiomStrategyVault.sol` | Done (O5-A) — 5→4 slots, uint128 limits |
| M-G2 / P2-2 | Treasury + paymentToken packing | `AxiomPaymentProcessor.sol` | Done (O5-B) |
| M-G2 / P2-3 | Dual royalty mappings | `AxiomPaymentProcessor.sol` | Done (O5-B) — sentinel `bps+1` |
| P2-4 | Custom errors (vault) | `AxiomStrategyVault.sol` | Done (O5-A) — `TransferFailed`, `CallFailed` |

---

## Low / Cosmetic

Tracked in sub-agent reports (custom errors, NatSpec, `msg.sender` vs `_msgSender()`, etc.). Scheduled Phase P2–P3 after High complete.

---

## Cross-Cutting (X-01..X-05)

| ID | Pattern | Mitigation wave |
|----|---------|-----------------|
| X-01 | Privileged key = full control | O2 timelocks + ops doc |
| X-02 | Immutable vs mutable NFT registry | O1-A (P0-1) |
| X-03 | Pause incomplete on iNFT | O1-D (P0-4) |
| X-04 | ERC-721 vs EIP-7857 | P3-5 |
| X-05 | Verifier trust root | O2 timelocks |

---

## Verification Commands (per wave)

```bash
cd apps/contracts && forge test -vv
```

Post-wave: regenerate ABIs if vault events/functions removed (`packages/config/src/abis/generated.ts` — note for integration wave).

---

## Agent Assignment Rules

- One microchange at a time per agent; show before/after; no dead code; no duplication.
- Disjoint file ownership per wave to avoid merge conflicts.
- Orchestrator does **not** edit source — agents only.