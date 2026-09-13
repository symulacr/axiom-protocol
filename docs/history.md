# Project history

Timestamped records. Current state lives in the
[README](../README.md#networks--deployment); this file preserves the V2-era
narratives verbatim so nothing is lost when the README stays current-only.

## What V2 changed (2026-08 era)

Fresh deploy per [ADR 004](adr/004-contract-rewrite-plan.md). Every item below is a
closed audit finding, proven by test.

| Surface | Before | Now |
| --- | --- | --- |
| Fee withdrawal + upgrades | instant, single admin key | 1-day timelock, propose/execute/cancel |
| Payment splits | three divergent copies | one `_paySplit()`, wrappers only |
| Pay bound | app-level caps only | `MAX_PAY` chain invariant, reverts on-chain |
| Verifier signer | single key, compromise forges transfers for a day | allowlist, revoke in one tx |
| Payment governance | Ownable | AccessControl, matching the NFT |
| Dead surfaces | `authorizeDelegateAndRevoke`, `OPERATOR_ROLE`, `payAndWithdrawEarnings` | removed |
| Strategy invariants | hand-mirrored Solidity ↔ TS, drifted silently | 12-case machine-pinned parity test |

## Guarantees, proven on the live chain (V2 era)

Every invalid path was driven against the deployed V2 contracts and asserts the exact
revert. This is the failure matrix, not a wish list.

| Failure | On-chain result | Proof |
| --- | --- | --- |
| Execute over daily limit | `DailyLimitExceeded()` | e2e + 12 chain-parity tests |
| Pay over MAX_PAY | `PayAmountExceedsCap(amount, cap)` | live tx on V2 |
| Stale proof replay | `AxiomProofExpired()` | e2e, exact selector |
| Compromised signer forges transfer | revoke in one tx blocks it | verifier allowlist tests |
| Rogue admin upgrades or drains | blocked 1 day by timelock | NFT timelock tests |
| Wrong-key blob download | typed `WrongKeyOrCorruptError`, canary | storage tests |
| 0G RPC outage | wagmi + ethers degrade to dRPC/Ankr | live-proven, dual-endpoint abort |
