# Wave 4 — "5-Contract Fold": AxiomStateView folded into AxiomPaymentProcessor

- **Agent:** W4 (Executor)
- **Date:** 2026-08-31
- **Base:** git `02919bf93` (tree verified clean at start)
- **Scope:** delete the standalone `AxiomStateView` read facade, port its views onto the UUPS `AxiomPaymentProcessor`, upgrade the Galileo V3 proxy in place, re-point all off-chain consumers. DelegationRegistry untouched; deployed contract set 6 → 5.
- **Status:** implemented, all suites green, on-chain upgrade live; changes left **uncommitted** (parent commits).

---

## 1. Ported-function table

| AxiomStateView fn (deleted) | Processor fn (new) | Logic-identity notes |
| --- | --- | --- |
| `royaltyRecipientOf(uint256)` | `royaltyRecipientOf(uint256)` | Body identical: `nft.creatorOf(tokenId)`. Zero is a valid "no royalty recipient" outcome (write path reverts `AgentCreatorNotRegistered` instead). |
| `effectiveRoyaltyBpsOf(uint256) → (royaltyBps, isSet, protocolFeeBps)` | `effectiveRoyaltyBpsOf(uint256)` | **Strictly stronger parity**: the old facade re-implemented the clamp off public reads (`royaltyBpsOf` + re-clamp); the port calls the internal `_effectiveRoyaltyBps($, tokenId)` directly — the clamp is now structural, not by convention. Returns `(royaltyBps, isSet, $.protocolFeeBps)`. |
| `vaultHealthOf(uint256) → (balance, strategyRoot, dailyLimit, dailySpent, resetDay, validUntilDay, expired)` | `vaultHealthOf(uint256)` | Same tuple; `strategyOf` uint256→uint128 widening made explicit (tuple assignment has no implicit element conversion). `expired = validUntilDay != 0 && today > validUntilDay` — exact `StrategyExpired` predicate. **New revert**: `VaultNotConfigured()` when `axiomVault == 0` (the old facade enforced a non-zero vault in its constructor; the folded version enforces it at read time). |
| `verifyPayloadOf(uint256, uint256, bytes) → bool` | `verifyPayloadOf(uint256, uint256, bytes calldata)` | Identical: `keccak256(payload) == IERC7857Metadata(nft).intelligentDatasOf(tokenId)[dataIndex].dataHash`. Zero-hash trap documented (keccak ≠ 0 — a stored `bytes32(0)` never verifies). |
| `paymentSnapshot(address, uint256) → (maxPayCap, computeRatioMax, agentBalance, payerAllowance, paymentToken)` | `paymentSnapshot(address, uint256)` | Same 5-tuple, composed entirely from Processor-owned state (no `processor.` external hop; `allowance` target is `address(this)`). Output name kept `paymentToken` so the regen'd ABI signature is byte-identical to the facade's. |
| `agentEarningsOf`, `pendingPayCap`, `computeRatioMax` | already on Processor (`maxPayCap` / `computeRatioMax`) | Not ported — pre-existing public views. |
| `constructor` address wiring | `setAxiomVault(address)` (ADMIN_ROLE) + `axiomVault()` view | nft/processor self-references are unnecessary on the Processor; only the vault needs wiring. Zero address is a valid un-wire (read side reverts `VaultNotConfigured`); per the task spec the setter is ADMIN_ROLE-gated, no zero-check. |
| `receive()` (NoValue) | n/a | Processor is a funds-handling contract; nothing to replicate. |

New event: `VaultAddressUpdated(address indexed oldVault, address indexed newVault)`. New error: `VaultNotConfigured()`.

## 2. Storage-layout diff (upgrade-in-place safety)

`forge inspect AxiomPaymentProcessor storageLayout` before/after — both runs list only the inherited `_status` slot (the ERC-7201 namespaced struct is not enumerated by solc's layout tool), so the proof is:

- **Struct tail delta:** last member `uint256[47] __gap` → `AxiomStrategyVault axiomVault; uint256[46] __gap`. Total footprint **byte-identical** (1 new slot consumed, 1 gap slot freed).
- **Pre-existing field movement: NONE.** Every pre-W4 member keeps its slot: `protocolTreasury`+0, `paymentToken`+1, `protocolFeeBps`+2, `totalOutstandingEarnings`+3, mappings +4/+5, `axiomNft`+6, `treasuryTimelock`+7/+8, `maxPayCap`+9, `computeRatioMax`+10, `axiomVault`+11 (new, carved from gap tail), gap slots 12–57 unchanged.
- **ERC-7201 namespace slot unchanged:** `StorageSlotTest.test_EIP7201_AxiomPaymentProcessor` passes — `0xb6e9ac…ebc00` recomputed from `agent.storage.AxiomPaymentProcessor`.
- Upgrade-in-place safe: pre-W4 impls never read slot 11 of the namespace; its zero default is inert until `setAxiomVault`.

## 3. On-chain upgrade (Galileo 16602) — EVIDENCE

Authority: `DEFAULT_ADMIN_ROLE` on proxy `0xe6956f663103c6E1e5077c3256c453b95924112a` held by `0x0553f58a0209Fb8DcE201fCD9406Be56da890D73` (ORACLE_ADMIN; key sourced from `../../.env` `TEE_SIGNER_PK` at run time — `DEPLOYER_PK` exported, never printed). Address/role/nonce(85)/balance(0.039 ETH) verified pre-flight via `cast`.

Script: `apps/contracts/script/UpgradeProcessorStatefold.s.sol` (modeled on `UpgradeProcessorWitness.s.sol`): deploy impl → `upgradeToAndCall(proxy, "")` → `setAxiomVault(<live V3 vault>)` → in-script `require(axiomVault() == vault)` + state-preservation logs. `ONCHAIN EXECUTION COMPLETE & SUCCESSFUL`.

| Action | Tx hash | Status |
| --- | --- | --- |
| W4 impl deploy (`CREATE`) | `0x606569acde86ca46b13f57154deaa0bbbccdd4296c9a13e4d7e15bea2cbceef5` | 1 (success), block 52323252 |
| `upgradeToAndCall` | `0xc19fbaed6a86c6f5b69f2c4599e6b627e35e553987cbfa1bf82170549e965d94` | 1 (success), block 52323269 |
| `setAxiomVault` | `0xa0788527a32b939c988caee14479341d7b4185a2c85ad43a065f4291f3fe12f2` | 1 (success), block 52323284 |

New impl: **`0x1Eb4eFb61B4aE429c8355A20C3a8C70eC66d74B4`** (code size 11628 B).

Post-asserts (`cast`, RPC `https://evmrpc-testnet.0g.ai`):

```text
impl slot (0x360894…2bbc): 0x…1eb4efb61b4ae429c8355a20c3a8c70ec66d74b4   ← changed from 0xc60e8b50…efa81
axiomVault():        0xe8B3B31E5CE0436cCfD19a47351943CcB7703722          ← wired
paymentToken():      0x354CA53bAB51C0666964fa050628d8351f8A7d19          ← preserved
maxPayCap():         0                                                   ← preserved
computeRatioMax():   0                                                   ← preserved
vaultHealthOf(0):    (0, 0x000…0, 0, 0, 0, 0, false)                     ← staticcall OK (token 0, no strategy)
royaltyRecipientOf(0): 0x0553f58a0209Fb8DcE201fCD9406Be56da890D73
paymentSnapshot(teeSigner, 0): (0, 0, 500000051080000, 0, 0x354C…7d19)
```

## 4. Consumer rewiring list

**Backend (`apps/backend`)**

- `src/routers/stateview.ts` — route re-pointed: `TypedContract` now built on `paymentProcessor` address + `PAYMENT_PROCESSOR_ABI` (`requireAddress: "paymentProcessor"`). Response shapes unchanged (`PaymentSnapshot`, `VaultHealth` tuple orders identical).
- `src/routers/stateview.test.ts` — fake-provider harness re-pointed at the processor address; tests renamed to "(PaymentProcessor statefold pre-flight)".
- `src/config-types.ts` — removed `addresses.stateView` slot (paymentProcessor was already optional).
- `src/index.ts` — removed `stateView: resolveAddressOptional(...)` from boot address resolution. Boot stays resilient: a leftover `AXIOM_STATE_VIEW_ADDRESS` in the env is simply ignored (no schema slot, no read).
- `src/server.ts` — route-registration comment updated.
- `docs/openapi.json` — `StateViewPaymentSnapshot`/`StateViewVaultHealth` schemas renamed to `AgentStatePaymentSnapshot`/`AgentStateVaultHealth` (shapes unchanged); route summary + 503 description now name the Processor.

**Config (`packages/config`)**

- `src/addresses.ts` — removed `stateView` from `AddressName`, `ENV_VAR_NAMES` (`AXIOM_STATE_VIEW_ADDRESS` slot) and `OPTIONAL_ADDRESS_NAMES`.
- `src/abis/stateView.ts` **deleted**; `src/abis/index.ts` export removed. `src/abis/paymentProcessor.ts` regenerated by the pipeline (now carries all 7 statefold additions).
- `dist/` rebuilt (`bun run build` — tsc clean).

**Frontend (`apps/frontend`)**

- `src/hooks/usePaymentSnapshot.ts` — reads `paymentSnapshot` from `getAxiomPaymentProcessorAddress()` via `PAYMENT_PROCESSOR_ABI` (same Multicall3 `aggregateReads` batching, same return order).
- `src/abi/addresses.ts` — removed `VITE_STATE_VIEW_ADDRESS` env read, `stateView` accessor + `getAxiomStateViewAddress`.
- `src/hooks/usePaymentSnapshot.guard.test.ts` — guard re-pointed (asserts the stateview accessor is *absent*).
- `src/hooks/useAgentDelegation.guard.test.ts` — **pre-existing failure fixed in passing** (see §6): order-assert no longer depends on single-line formatting.
- `src/pages/AgentPage.tsx` — comment only (hook call unchanged). `useAgentDelegation` stays on the registry — untouched.
- `apps/contracts/scripts/generate-abis.sh` — `AxiomStateView` removed from the pipeline's contract list.

## 5. Test counts (exact, fresh runs)

| Suite | Before | After | Command |
| --- | --- | --- | --- |
| forge | 295 pass / 0 fail (incl. 19 StateView) | **292 pass / 0 fail / 9 skip** (19 StateView tests replaced by 16 statefold tests + 2 setter tests) | `forge test` (default profile) |
| — new file | — | `test/AxiomPaymentProcessorStatefold.t.sol`: **16 pass** | `forge test --match-contract AxiomPaymentProcessorStatefoldTest` |
| packages/config | 53 / 0 | **53 pass / 0 fail** | `bun test --max-concurrency=1` |
| apps/backend | 199 / 0 | **199 pass / 0 fail** | `AXIOM_API_KEY= AXIOM_CLIENT_API_KEY= bun test --parallel --max-concurrency=1` |
| apps/frontend | 140 / 0 reported, **140 run / 2 fail actual baseline** | **140 pass / 0 fail** | `bun run test` |

Baseline reconciliation: the task brief cited "FE 140 green" but `02919bf93` actually ran 140 tests with 2 failing (`usePaymentSnapshot.guard` — asserted the *old* stateview accessor; `useAgentDelegation.guard` — order assert broke on multiline formatting). Both are green after this wave; backend 199 and config 53 match the brief exactly. forge: brief said 295/0; tree baseline was 295 (292 pass + 9 skipped pre-existing skips — skip count unchanged by this wave).

Typechecks: backend `tsc --noEmit` clean, frontend `tsc --noEmit` clean, config `tsc` build clean, `forge build` 0 errors (via-IR).

## 6. Risks & follow-ups

1. **The upgrade was executed from a shared-funding key** (`TEE_SIGNER_PK` = ORACLE_ADMIN = MINTER = processor DEFAULT_ADMIN). Single-key upgrade authority is the standing V3 governance posture; the statefold does not change it but widens the Processor's ABI surface — audit attention on the four new views + setter recommended.
2. **`setAxiomVault` has no zero-check by design** (per spec): an admin call with `address(0)` un-wires the vault and makes `vaultHealthOf` revert `VaultNotConfigured` for every token. Off-chain consumers already degrade gracefully (route reports per-read errors), but a monitoring alert on `VaultAddressUpdated(_, 0x0)` would be cheap insurance.
3. **`paymentSnapshot` ABI signature parity was verified by round-trip**: an initial naming slip (`paymentToken_` output) regen'd an ABI that broke the backend test suite; the view was renamed to `paymentToken` and the ABI regenerated byte-identical to the old facade's. The config dist and broadcast artifacts are post-fix.
4. **`AxiomStateView` on-chain bytecode is now dead** at `0xf96a…fdd1` (recorded retired in the deployment JSON). It holds no funds and has no authority; consider a "do not use" note in block explorers once verified.
5. **`payForAgent`-path drift risk moves in-abi**: the statefold views now share the Processor's storage directly, so the W2 "keep in sync" comment class is replaced by single-source-of-truth — no remaining known drift surface, but `vaultHealthOf` still depends on the non-upgradeable Vault's residual 1 (strategy survives iTransfer), documented in natspec.
6. **`useAgentDelegation.guard` fix was adjacent-scope** but necessary to hand back a green FE suite (the test was broken at HEAD by formatting, not by this wave's files). Minimal order-positional assert, no behavior change.

## 7. Files changed (all uncommitted)

**Contracts:** `src/AxiomPaymentProcessor.sol` (M), `src/AxiomStateView.sol` (D), `test/AxiomPaymentProcessorStatefold.t.sol` (A), `test/AxiomStateView.t.sol` (D), `script/Deploy.s.sol` (M), `script/UpgradeProcessorStatefold.s.sol` (A), `scripts/generate-abis.sh` (M)

**Config:** `src/abis/stateView.ts` (D), `src/abis/index.ts` (M), `src/abis/paymentProcessor.ts` (regen), `src/addresses.ts` (M), `dist/*` (rebuilt)

**Backend:** `src/routers/stateview.ts` (M), `src/routers/stateview.test.ts` (M), `src/config-types.ts` (M), `src/index.ts` (M), `src/server.ts` (M), `docs/openapi.json` (M)

**Frontend:** `src/hooks/usePaymentSnapshot.ts` (M), `src/hooks/usePaymentSnapshot.guard.test.ts` (M), `src/hooks/useAgentDelegation.guard.test.ts` (M — pre-existing break), `src/abi/addresses.ts` (M), `src/pages/AgentPage.tsx` (comment)

**Docs:** `docs/deployments/galileo-v3-2026-08-31.json` (M — new impl, tx hashes, statefold block, StateView marked retired), this file (A)
