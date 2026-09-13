# Wave 5 Lane A — `AxiomGasTank` + ERC-2771 retrofit: implementation report

- **Lane:** W5-A (contract lane)
- **Date:** 2026-08-31
- **Base HEAD:** `8a0f253a618725619635b2e81d98a03df352fe70` (verified clean before work)
- **Result:** `forge build` clean (solc 0.8.36, via_ir ON, Cancun); full `forge test` **316 passed / 0 failed / 9 skipped** (baseline 292/0/9 → **+24 new tests**). All changes left **uncommitted**. On-chain execution deliberately NOT performed (Wave 5 orchestration runs the deploy scripts after tests are green).

---

## 1. Files changed

### New

| File | Purpose |
| --- | --- |
| `apps/contracts/src/AxiomGasTank.sol` (373 LOC) | Non-upgradeable gas tank: `Ownable + Pausable + ReentrancyGuard + EIP712("AxiomGasTank","1")`. Sequential per-user nonces, lazy 0.01 grant inside `relay`, `grantCredit()` self-serve claim, grant/deposit split accounting, daily window, ERC-1271 dual-path sig verification, `receive()` reverts `UseDeposit`, `recoverReserve` bounded by tracked funds. |
| `apps/contracts/script/DeployGasTank.s.sol` | Deploys tank (env: `GAS_TANK_ADMIN`, `MAX_GAS_PER_OP`, `GAS_RESERVE_FUNDING`, optional `GAS_GRANT`/`GRANTS_CAP`/`DAILY_LIMIT`), upgrades Processor to the 2771 impl, wires forwarder, funds reserve, asserts every wiring fact + zero untracked balance. Documents the NFT-leg split (timelock) in its header. |
| `apps/contracts/script/UpgradeProcessor2771.s.sol` | `DEPLOYER_PK` (from `../../.env` `TEE_SIGNER_PK`, never printed) → deploy impl → `upgradeToAndCall(proxy, "")` → `setTrustedForwarder(gasTank)` → post-checks incl. preserved state (paymentToken, maxPayCap, computeRatioMax). Modeled on `UpgradeProcessorStatefold.s.sol` (chain assert 16602, `--legacy --gas-price 2000000000 --slow`). |
| `apps/contracts/script/UpgradeNFT2771Propose.s.sol` | `proposeUpgrade(newImpl)` ONLY — the 1-day `TimelockManager.DELAY` means execution is a later step; logs `pendingUpgradeExecutableAt()`. |
| `apps/contracts/script/UpgradeNFT2771Execute.s.sol` | Executes at T+1d (reverts `TimelockNotElapsed` otherwise), then `setTrustedForwarder(gasTank)` + wiring asserts. |
| `apps/contracts/test/AxiomGasTank.t.sol` (578 LOC) | Unit suite T1–T16 + T22 (18 tests incl. 2 fuzz). |
| `apps/contracts/test/AxiomGasTank2771Integration.t.sol` (352 LOC) | Integration suite T17–T21 + forwarder wiring guards (6 tests). |
| `packages/config/src/abis/gasTank.ts` | Generated `GAS_TANK_ABI`. |

### Modified

| File | Change |
| --- | --- |
| `apps/contracts/src/AxiomPaymentProcessor.sol` | ERC-2771 retrofit (§2 below). Gap `uint256[46]` → `uint256[45]` (`:131`), `trustedForwarder` field at namespace gap tail (`:127`), 9 `msg.sender` → `_msgSender()` sites, forwarder setter/overrides (`:283-320`), diamond overrides (`:306-320`), Permit2 NatSpec "NOT ERC-2771-relayable" (`:500-502`). |
| `apps/contracts/src/AxiomAgentNFT.sol` | Same pattern: gap `uint256[44]` → `uint256[43]` (`:79`), field (`:75`), 2 `_msgSender()` sites, setter/overrides (`:335-368`), diamond overrides (`:359-368`). `mintWithRole` untouched. |
| `apps/contracts/scripts/generate-abis.sh` | `CONST_NAMES[AxiomGasTank]=GAS_TANK_ABI`, appended to `CONTRACTS`, case map `AxiomGasTank) ts_name="gasTank"`. Script run: 7 ABIs generated. |
| `packages/config/src/abis/index.ts` | `export { GAS_TANK_ABI } from "./gasTank.js";` |
| `packages/config/src/addresses.ts` | `AddressName` gains `"gasTank"`; env var `AXIOM_GAS_TANK_ADDRESS`; added to `OPTIONAL_ADDRESS_NAMES` (OPTIONAL during rollout per §5 item 8 — resolveAddressOptional returns undefined pre-deploy). |
| `packages/config/abi/AxiomGasTank.json` (+ regenerated `paymentProcessor.json`, `agentNft.json`) | Raw ABI JSONs from `forge inspect`. |
| `dist/` | Refreshed via `bun run build` (config → chat-runtime → backend all exit 0). |

Untouched by this lane: `AxiomMockUSDC.sol`, `AxiomStrategyVault.sol`, `AxiomDelegationRegistry.sol`. Other dirty files in the worktree (`apps/backend/*`, `apps/frontend/*`, `packages/config/src/{constants,eip712,chat-tools,env-schema,middleware/auth}.*`) belong to a parallel Wave 5 lane — not modified here.

---

## 2. AxiomGasTank contract spec (as built)

- **Constructor:** `AxiomGasTank(address admin_, uint256 maxGasPerOp_)` — zero admin reverts `ZeroAddress`; `maxGasPerOp_ == 0` reverts `ZeroGasCap` (non-zero floor, W1-A maxPayCap=0 lesson). Defaults in code: `gasGrant = 0.01 ether`, `grantsCap = 3`, `dailyLimit = 0` (disabled sentinel), tunable by owner-only setters `setGasGrant` (0 reverts `ZeroAmount`), `setGrantsCap` (0 reverts), `setMaxGasPerOp` (0 reverts `ZeroGasCap`), `setDailyLimit` (**0 allowed** — documented asymmetry: a disabled per-op cap can drain the pooled reserve in one op, a disabled daily limit only suspends rate-limiting on per-op-capped, user-signed spend; monitor `DailyLimitUpdated(_, 0)`).
- **EIP-712:** OZ non-upgradeable `EIP712("AxiomGasTank", "1")` (immutable domain, same trust model as `AxiomDelegationRegistry`'s cached separator). Typehash: `ForwardRequest(address user,address target,bytes data,uint256 maxGasCost,uint256 nonce,uint256 deadline)`. `forwardRequestDigest(req)` view exposed for off-chain parity.
- **Signatures (G-5 dual path):** `_verifySig` — contract users (code.length > 0) go through `IERC1271.isValidSignature` (accept `0x1626ba7e`), EOAs through `ECDSA.recover`. Wrong signer → `InvalidUserSignature`.
- **Nonces:** SEQUENTIAL per user (`mapping(user => uint256) nonces`; `nonces[u]` = next expected). Burned **before** the target call. Out-of-order / replayed → `InvalidNonce`.
- **relay() phases** (all atomic, CEI: state precedes every external call):
  1. auth — zero user/target (`ZeroAddress`), `data.length < 4` or `maxGasCost == 0` (`ZeroAmount`), deadline (`DeadlineExpired`), sig verify, nonce burn;
  2. lazy grant — fires only when `tank[u] < maxGasCost`: `grantsUsed >= grantsCap` → `TankExhausted`; `gasReserve < gasGrant` → `ReserveExhausted`; else `grantsUsed++`, `tank += gasGrant`, `grantBalance += gasGrant`, `gasReserve -= gasGrant`;
  3. solvency — still `tank < maxGasCost` → `TankExhausted` (grant rolls back atomically);
  4. daily window — `dailyLimit != 0` only: Vault-pattern reset on `block.timestamp / 1 days` boundary, pre-execution check `dailySpent + maxGasCost > dailyLimit` → `DailyLimitExceeded`;
  5. measured call — `gasleft()` delta; **appends the 20-byte ERC-2771 sender suffix (`bytes20(req.user)`)** to the target calldata so the retrofitted Processor/NFT resolve `_msgSender()` to the signed user; target revert does NOT bubble (`success = false`);
  6. reimbursement — `min(measured × tx.gasprice, maxGasCost, maxGasPerOp × tx.gasprice)`; debit-then-pay: `grantBalance` (spend-only grant wei) first, remainder from the tank's deposit share; `dailySpent += reimburse` (post-measurement); relayer paid last (`RelayerRefundFailed` on failure); `emit Relayed(user, relayer, target, success, measured, reimburse, nonce)`; returns `success` for composability.
- **Funding:** `depositReserve()` (owner-only, `ZeroAmount` on 0), `deposit()` (caller's own tank only — no `depositFor`, deliberate), `withdrawTank(amount)` (nonReentrant, whenNotPaused, over-balance or grant-backed portion → `InsufficientTankBalance`; TransferFailed-safe). **Grant/deposit split (G-6):** explicit `grantBalance[user]` tracks unspent grant wei; grants are spend-only — `withdrawTank` can only pull `balance − grantBalance`; relay debits grant wei before deposit wei.
- **`grantCredit()`** (permissionless, whenNotPaused): full-grant tank → `TankExhausted`, empty reserve → `ReserveExhausted`, capped → `TankExhausted`; otherwise mints one grant from the reserve.
- **`recoverReserve(to)`** (owner-only): pays out ONLY `address(this).balance − (gasReserve + totalTankBalance)` (zero surplus → `ZeroAmount`; transfer failure → `TransferFailed`), so tracked funds are structurally unreachable.
- **`receive()`** reverts `UseDeposit()` — all native enters via explicit accounting paths.
- **Views:** `balanceOf`, `tank`, `grantBalance`, `grantsUsed`, `nonces`, `dailySpent`, `resetDay`, `dailyWindowOf`, `reserve`, `capSettings`, `gasReserve`, `totalTankBalance`, `maxGasPerOp`, `gasGrant`, `grantsCap`, `dailyLimit`, `forwardRequestDigest`.

## 3. ERC-2771 retrofit

### Divergences from the plan (documented)

1. **No `__ERC2771Context_init()` exists in the vendored OZ 5.0.2.** Verified by reading `lib/openzeppelin-contracts-upgradeable/contracts/metatx/ERC2771ContextUpgradeable.sol`: it is `Initializable, ContextUpgradeable` with an **immutable** `_trustedForwarder` (constructor-injected) — no namespaced storage, no init hook. The task brief's "namespaced `__ERC2771ContextStorage` + `__ERC2771Context_init()`" does not match the vendored source (that shape is OZ 5.3+ / community variants). The implementation therefore follows the plan file's §3.2 (which read the same vendored source): the base is inherited with `address(0)` (inert — never read), and `trustedForwarder()` / `isTrustedForwarder()` are **overridden to read a storage-backed, ADMIN-gated field** appended at each contract's namespace gap tail. Net behavior matches the task spec exactly: admin-settable forwarder, zero allowed as un-wire, `isTrustedForwarder` guards zero.
2. **solc ≥0.8.28 diamond-override requirement.** Inheriting `ERC2771ContextUpgradeable` alongside any base that also brings `ContextUpgradeable` (AccessControl on the Processor; ERC721 on the NFT) fails with error 6480 ("derived contract must override `_msgSender`/`_msgData`/`_contextSuffixLength`") on every solc we tested (0.8.28, 0.8.36) AND with the official solc 0.8.36 static binary — i.e. a compiler correctness requirement, not a foundry artifact. Both contracts add the three explicit overrides delegating to `ERC2771ContextUpgradeable` (Processor `:306-320`, NFT `:359-368`), which is also what wires the inherited call sites through forwarder resolution.
3. **`relay()` appends the 2771 suffix.** Without it, `_msgSender()` on the retrofitted targets would resolve to the GasTank and the whole retrofit would be inert for relaid ops. `relay()` appends `bytes20(req.user)` to the target calldata (Phase 5); covered by T17/T19.
4. **Grant accounting via explicit `grantBalance`** rather than a `grantsUsed × gasGrant` derivation — the derivation breaks if the admin changes `gasGrant` after grants were issued; the explicit tracker is invariant-safe and fuzz-verified (T22).

### Exact `msg.sender` → `_msgSender()` anchors (current line numbers, verified post-edit)

**AxiomPaymentProcessor.sol — 9 sites:**

| Site | Line(s) now | Original plan line |
| --- | --- | --- |
| P2 `onlyAgentCreator` check | 147 | 137 |
| P1 `payForAgent` payer | 551 | 492 |
| P5 `payComputeProvider` payer | 560 | 501 |
| P3 `payForAgentAndCompute` payer (split) | 580 | 521 |
| P3 `payForAgentAndCompute` payer (compute pull) | 582 | 523 |
| P4 `withdrawAgentEarnings` read | 589 | 530 |
| P4 `withdrawAgentEarnings` clear | 591 | 532 |
| P4 `withdrawAgentEarnings` event | 593 | 534 |
| P4 `withdrawAgentEarnings` transfer | 594 | 535 |

**AxiomAgentNFT.sol — 2 sites:**

| Site | Line(s) now | Original plan line |
| --- | --- | --- |
| N1 `update` owner check | 380 | 320 |
| N2 `_refundExcess` refund recipient | 459 | 395 |

Deliberately left as raw `msg.sender`: `payForAgentWithPermit2` (no raw msg.sender in its body; Permit2 binds the spender to raw msg.sender inside its hash — NatSpec documents it as NOT ERC-2771-relayable, Processor `:500-502`), `mintWithRole` (MINTER_ROLE path), ERC-721 internal machinery, and every admin/role-gated function (relaying role checks would attribute them to the signed user).

## 4. Storage-layout proof

`forge inspect --json … storageLayout`, before (HEAD 8a0f253a6) vs after:

| Contract | Top-level storage before | after | prefix-identical |
| --- | --- | --- | --- |
| AxiomPaymentProcessor | 1 slot (`_status`, ReentrancyGuard) | 1 slot | **YES (byte-identical)** |
| AxiomAgentNFT | 2 slots (`_status`, `_iTransferDepth`) | 2 slots | **YES (byte-identical)** |

All Axiom state lives in ERC-7201 namespaces (`0xb6e9ac…ebc00`, `0xe982fe…4a900`); the new `trustedForwarder` field consumes a former gap slot **inside** each namespace. Namespace math asserted on-chain in T21:

- Processor: 4 single-word fields + 3 × `TimelockManager.State` (2 slots each) + 3 prior appends (maxPayCap, computeRatioMax, axiomVault) = 13 → 13 + 45 gap = **58 slots (unchanged footprint, gap 46→45)**.
- NFT: 2 single-word fields + 3 timelocks + 1 prior append = 9 → 9 + 43 gap = **52 slots (unchanged footprint, gap 44→43)**.

Namespace slot constants unchanged (T21 asserts the exact ERC-7201 hashes). Upgrade-in-place safe: pre-W5 impls never read the new tail slot; its zero default = "no forwarder trusted" = today's behavior until `setTrustedForwarder` runs. No `__ERC2771ContextStorage` slot exists (divergence #1).

## 5. Test inventory (24 new tests)

### `AxiomGasTank.t.sol` (18)

| # | Test | Covers |
| --- | --- | --- |
| T1 | `test_relay_lazyGrant_firstRelay` | first relay: grant minted from reserve, tank/grantBalance debited, reimburse clamped, nonce advanced |
| T2 | `test_relay_secondRelay_usesTank_noNewGrant` | deposit-funded tank → no grant consumed |
| T3 | `test_relay_grantsCapExhaustion_revertsTankExhausted` | cap exhaustion → TankExhausted, nonce NOT burned, same-nonce retry after deposit succeeds |
| T4 | `test_relay_nonceReplay_reverts` | replay + out-of-order nonce → InvalidNonce |
| T5 | `test_relay_deadline_reverts` | expired deadline, nonce preserved |
| T6 | `test_reimburse_onTargetRevert_relaySucceeds` | target revert → relay succeeds, success=false, relayer paid, user debited, nonce burned |
| T7 | `test_reimburse_clampedToMaxGasCost_andMaxGasPerOp` | both clamps exact |
| T8 | `test_reimburse_clampedToReserve_relayerNeverEatsLoss` | one-grant reserve: grant covers spend, reserve fully drained, no revert |
| T9 | `test_reimburse_dailyWindow_resetAndLimit` | window debit (reimbursed wei), pre-execution cap check, day-boundary reset |
| T10 | `test_setMaxGasPerOp_zeroReverts` | zero floors (ZeroGasCap/ZeroAmount), dailyLimit(0) allowed, Ownable gate |
| T11 | `test_relay_invalidSignature_reverts` | wrong EOA key → InvalidUserSignature |
| T12 | `test_deposit_withdrawTank_receiveGuard` | CEI deposit/withdraw, over-withdraw, receive() → UseDeposit, zero guards |
| T13 | `test_recoverReserve_onlySurplus` | tracked funds unreachable, TransferFailed path, exact surplus, Ownable gate |
| T14 | `testFuzz_reimburse_minOfThree` (257 runs) | reimburse ≤ maxGasCost ∧ ≤ maxGasPerOp×gasprice, > 0 |
| T15a | `test_relay_erc1271_contractSigner` | ERC-1271 accept path (0x1626ba7e) |
| T15b | `test_relay_erc1271_invalidContractSig_reverts` | ERC-1271 reject path |
| T16 | `test_grantCredit_claimAndCap` | self-serve claim, full-tank guard, post-spend re-claim |
| T22 | `testFuzz_solvency_trackedFundsNeverExceedBalance` (257 runs) | gasReserve + totalTankBalance ≤ address(this).balance after arbitrary deposit/op |

### `AxiomGasTank2771Integration.t.sol` (6)

| # | Test | Covers |
| --- | --- | --- |
| T17 | `test_T17_relayedPayForAgent_payerIsSignedUser` | relaid payForAgent debits the SIGNED user's allowance (97.5 creator earnings credited, 2.5 treasury, relayer reimbursed, 0 relayer tokens) |
| T18 | `test_T18_permit2NotRelayable_suffixIgnored` | (a) non-forwarder + 20-byte suffix does NOT impersonate (spoof reverts); (b) relayed payForAgentWithPermit2 fails at the Permit2 leg (spender binds raw msg.sender = tank) |
| T19 | `test_T19_relayedNftUpdate_ownerCheckViaSuffix` | relaid `update` passes the owner check for the signed user; signed-user-key-but-attacker-identity request reverts InvalidUserSignature |
| T20 | `test_T20_selfRelay` | user relays own op; payment executes; tank never increases |
| T21 | `test_T21_namespaceSlotsUnchanged_andGapTail` | ERC-7201 slots + namespace footprint math (46→45, 44→43) |
| — | `test_trustedForwarder_wiringAndUnwiring` | wiring, zero un-wire, spoof address rejected, non-admin gate |

### Forge output

```text
Ran 22 test suites in 14.06s (33.23s CPU time):
  316 tests passed, 0 failed, 9 skipped (325 total tests)
```

(baseline at HEAD 8a0f253a6: 292 passed / 0 failed / 9 skipped — no regressions; 24 tests added)

## 6. Verification evidence

- `forge build` (solc 0.8.36, via_ir, Cancun): **Compiler run successful** (warnings only, all from vendored OZ libs — the pre-existing ECDSA `error`-keyword and memory-safe-assembly notices).
- `bun run build` (config → chat-runtime → backend): all exit 0.
- `bash scripts/generate-abis.sh`: 7 ABIs generated incl. `gasTank.ts`; `paymentProcessor.ts`/`agentNft.ts` gained `trustedForwarder`/`setTrustedForwarder`/`isTrustedForwarder`.
- No TODOs, no debug code, no console.log in committed sources (a temporary `Dbg*.t.sol` used during investigation was deleted).
- Keys: no key material read, printed, or committed; deploy scripts document the `../../.env` `TEE_SIGNER_PK` runtime-export discipline.

## 7. Open items for the orchestrator

1. **On-chain execution** (this lane stopped before it, per assignment): run `DeployGasTank.s.sol` (+ `UpgradeProcessor2771.s.sol`, or the combined deploy path) with `GAS_TANK_ADMIN = ORACLE_ADMIN`; run `UpgradeNFT2771Propose.s.sol` at T-0 and `UpgradeNFT2771Execute.s.sol` at T+1d; then update `docs/deployments/galileo-v3-2026-08-31.json` with the tank address / impl hashes / tx hashes.
2. **Initial selector allowlist**: `relay()` currently has no on-chain Merkle root (deferred with the Merkle-proof parameter per the authoritative plan — the TankExhausted/ReserveExhausted/selector-root machinery from the older plan-file §2.4 was superseded). If a (target,selector) allowlist is required before mainnet, add `selectorsRoot` + `setSelectorsRoot` in a follow-up; until then the trusted forwarder + caps bound exposure.
3. **Cross-lane**: backend relayer + FE grant/refill UX consume `GAS_TANK_ABI`, `capSettings()`, `dailyWindowOf`, `nonces`, `forwardRequestDigest` (all exported in `packages/config/src/abis/gasTank.ts`); `AXIOM_GAS_TANK_ADDRESS` is optional until deploy lands.
