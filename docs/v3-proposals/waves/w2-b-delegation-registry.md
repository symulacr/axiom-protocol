# Wave 2, Lane B — AxiomDelegationRegistry

**Agent:** Executor (lane B) · **Date:** 2026-08-31 · **Base commit:** `7dd19a90` (tree verified clean at start)
**Deliverables:** `apps/contracts/src/AxiomDelegationRegistry.sol` (new, non-upgradeable), `apps/contracts/test/AxiomDelegationRegistry.t.sol` (31 tests), `packages/config/src/abis/delegationRegistry.ts` + index export. Changes left **uncommitted**.

---

## 1. Firecrawl Research Findings

Raw outputs saved to `.firecrawl/` (`search-7579-spendlimit.json`, `eip-7715.md`, `search-delegation-audit.json`).

### 1.1 ERC-7579 spend-limit patterns (search + top results)

- <https://eips.ethereum.org/EIPS/eip-7579> — validator/hook module taxonomy; a session key is typically a **validator** paired with a **spending-limit hook**.
- <https://docs.zerodev.app/blog/why-7579-over-6900> — Kernel's argument for 7579; session-key implementations are account-coupled.
- <https://erc7579.com/modules> — module interface surface.
- <https://docs.nethereum.com/docs/account-abstraction/guide-modular-accounts/> — session keys as "temporary, scoped permissions" (expiry + limits).

**Adopted:** the 7579/ZeroDev spend-limit model of *per-call cap + periodic cap + expiry + scoped selector allowlist* maps 1:1 onto our `perTxCap` / `windowCap`+`windowSeconds` / `expiresAt` / `allowedSelectorsRoot`. We deliberately did **not** adopt module interfaces — 7579 presupposes a 7579 smart account, and the merged proposal (§3, option A) explicitly ships an EOA-compatible registry now, with the struct kept portable to 4337/7579 accounts later.

### 1.2 EIP-7715 permissions model (scrape)

- <https://eips.ethereum.org/EIPS/eip-7715> — `PermissionObject` with **expiry rules** (`type: "expiry", data: { timestamp }`), **permission scopes**, and per-permission rule composition; Security Considerations §"Limited Permission Scope": "DApps should only request the permissions they need, with a reasonable expiration time"; §"Phishing Attacks": wallet/host MUST enforce — on-chain enforcement must not assume off-chain UI correctness.

**Adopted:** hard `expiresAt` (matches 7715's expiry-rule-as-timestamp), minimal scope = one Merkle root of `(target,selector)` leaves, and least-privilege defaults: the registry **rejects** zero selector roots and rejects installing already-expired delegations (a 7715-style "no silent over-permission" posture).

### 1.3 Audit pitfalls — replay/nonces (search)

- <https://www.cyfrin.io/blog/solodit-checklist-explained-9-replay-attack> — SOL-AM-ReplayAttack-*: nonce must be consumed **in every execution path** (their PoC increments the nonce only on success → replay-after-failure); domain-separator binding needed to prevent cross-contract/cross-chain replay; consume-before-effect ordering.

**Adopted:** single-use nonce consumed *after* full validation but *before* any state replacement (a reverted install never burns the nonce — strictly stronger than "consume in every path" since we revert-and-restore atomically); EIP-712 domain binds `name/version/chainId/verifyingContract` (see §2.1). No contradiction with this brief was found; research validated the design and added two hardening checks (fail-fast zero-root and expired-at-install reverts).

---

## 2. Design Decisions

### 2.1 Signer model — owner EIP-712 signature over the full struct

- Domain: `EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)` = `("AxiomDelegationRegistry","1",block.chainid,address(this))`, computed in the **constructor and stored as `immutable`** (valid because the contract is non-upgradeable: verifyingContract and chainid cannot change). Mirrors `AxiomTeeVerifier._domainSeparator()` but without the per-call recompute.
- `installDelegation(d, ownerSig)` requires `ECDSA.recover(digest, ownerSig) == nft.ownerOf(d.agentTokenId)` — the owner is read **live at install time**, so a signature signed before a token transfer becomes unusable (tested: `test_install_staleSig_afterOwnerChange_reverts`).
- Nonce is per-token, single-use (`usedNonces[agentTokenId][nonce]`), marked only after signature/structural validation pass.
- Install is permissionless: the owner signature is the authority (a relayer can submit).

### 2.2 Delegate authorization — `msg.sender == delegate` (chosen over delegateSig)

The brief offered either `msg.sender == delegate` or a per-call `delegateSig`; **`msg.sender == delegate` was chosen**, reasons:

1. **No added replay surface.** A per-call signature must itself be nonced + domain-bound; the audit research (§1.3) shows every signature layer is a replay hazard. `msg.sender` cannot be replayed.
2. **Accountability.** The delegate is the paying, gas-bearing account; the delegate role is meant for the agent's own key or a trusted relayer service, not for signature-delegated sub-calls.
3. **Circumvention value is zero.** A `delegateSig` path would let anyone submit *for* the delegate — but the caps (`perTxCap`, window, selector root, expiry) already bound whatever the delegate could do; the signature adds no restriction, only ceremony.

### 2.3 Execution model — execution-carried, zero-float registry

- The registry holds **no funds** and no approvals. `delegatedExecute` forwards the delegate's own native `msg.value` (enforced equal to the declared `value` via `ValueMismatch`).
- Whitelisted targets call out and may return native to `msg.sender` (the registry). To keep the zero-float posture, any native left on the registry after the call is forwarded to the delegate in the same tx (`test_integration_vaultPayoutViaDelegate_forwardedToDelegate`).
- `AxiomStrategyVault.execute` leg: the vault spends **its own tracked balance under its own daily limit**; the registry's caps are an independent second layer (integration test `test_integration_delegatedVaultExecute_underCaps` carries value 0 through the registry and lets the vault pay).
- Target restriction: `allowedSelectorsRoot` is **mandatory non-zero** — enforced at install (fail-fast) and re-checked at execute (defense-in-depth against a hypothetical storage-slot corruption path; tested via direct `vm.store`). The Merkle root **is** the whitelist of, e.g., `AxiomStrategyVault.execute` and `AxiomPaymentProcessor.payForAgent`.
- Modifiers: `nonReentrant` + `whenNotPaused` (own non-upgradeable `Pausable`, owner `pause()/unpause()`); CEI — all state (window debit) precedes the external call; a reverting target rolls everything back atomically (tested).

### 2.4 Leaf encoding — matches `AxiomStrategyVault.execute` exactly

`leaf = keccak256(abi.encode(target, bytes4(data[:4])))` — the vault's fixed-`abi.encode` leaf shape (`AxiomStrategyVault.sol` `execute`, `actionHash = keccak256(abi.encode(target, value, keccak256(data)))` with the Merkle leaf being `(target, bytes4 selector)` in the delegation design per the merged proposal). OZ `MerkleProof.verify` with **sorted pairs**, empty proof for a single-leaf root (same as the vault). Verified independently in Python (pycryptodome keccak) that the multi-leaf root from the test equals the on-chain computation.

### 2.5 Window accounting — vault `dailySpent/resetDay` pattern, generalized

`WindowState { uint128 spent; uint64 windowId; }` keyed by `agentTokenId`; `windowId = block.timestamp / windowSeconds`; on window-id change `spent` resets before the cap check (same lazy-reset shape as `AxiomStrategyVault.vaults` `dailySpent/resetDay`). `windowCap == 0 ⇔ windowSeconds == 0` is enforced at install (`InvalidWindowConfig`) — "0 = unlimited" is deliberately impossible, echoing proposal finding L2.

---

## 3. Function Inventory

| Function | Access | Semantics |
| --- | --- | --- |
| `constructor(IAxiomAgentNFT, address owner)` | deploy | zero-address checks, caches `domainSeparator` immutable. Non-upgradeable, no proxy, no initializer (mirrors the vault's fund-custody posture; this contract holds no funds at all). |
| `installDelegation(AgentDelegation calldata d, bytes calldata ownerSig)` | permissionless (sig-gated) | validates delegate/root/window-config/expiry, checks nonce unused, recovers owner over EIP-712 digest == `nft.ownerOf` **live**, burns nonce, stores/`replace`s the single active delegation per token. Emits `DelegationInstalled`. |
| `revokeDelegation(uint256 agentTokenId)` | current NFT owner (`nft.ownerOf` live) | immediate `delete` — mirrors `AxiomTeeVerifier.revokeSigner` containment; transfers auto-strip the seller's delegate (new owner can revoke; buyer is protected either way by the live-ownerOf install check). Emits `DelegationRevoked`. |
| `delegatedExecute(uint256 agentTokenId, address target, uint256 value, bytes calldata data, bytes32[] calldata merkleProof)` payable → `bytes` | delegate only | checks: active, non-zero root, `msg.sender == delegate`, `block.timestamp <= expiresAt`, `value == msg.value`, `data.length >= 4`, `value <= perTxCap`, window accrual/`windowCap`, Merkle `(target,bytes4(data[:4]))` against root; forwards call, forwards any returned native to the delegate; emits `DelegatedExecuted(agentTokenId, delegate, target, value, actionHash)` with `actionHash = keccak256(abi.encode(target, value, keccak256(data)))` (vault-shaped). |
| `getDelegation(uint256)` view / `isDelegationActive(uint256)` view / `usedNonces(uint256,uint256)` view / `windows(uint256)` view / `domainSeparator()` view / `nft()` view | — | introspection. |
| `pause()` / `unpause()` | registry `owner()` | global kill switch (separate from the NFT/vault owners' switches). |

Errors: `NoActiveDelegation, DelegationExpired, CapExceeded, WindowExceeded, SelectorNotAllowed, DelegationNonceUsed, NotDelegate, NotTokenOwner, InvalidMerkleProof, ZeroAddress` + `InvalidWindowConfig, ValueMismatch(uint256,uint256), CallFailed`.

Events: `DelegationInstalled(uint256 indexed agentTokenId, address indexed delegate, uint64 expiresAt, uint256 perTxCap, uint256 windowCap)`, `DelegationRevoked(uint256 indexed agentTokenId)`, `DelegatedExecuted(uint256 indexed agentTokenId, address indexed delegate, address indexed target, uint256 value, bytes32 actionHash)`.

Storage layout (documented in the test that pokes it): slots 0/1 = `Ownable._owner` / `Pausable._paused`; `_delegations` = 2, `usedNonces` = 3, `windows` = 4; `nft`/`domainSeparator` are immutables. One active delegation per token (install replaces; replacement needs a fresh owner sig + unused nonce by construction).

---

## 4. Tests

`apps/contracts/test/AxiomDelegationRegistry.t.sol` — 31 tests, all passing:

| # | Test | Covers |
| --- | --- | --- |
| 1 | `test_install_happyPath` | owner-signed install, event, storage, nonce burned |
| 2 | `test_install_wrongSigner_reverts` | non-owner signer → `NotTokenOwner` |
| 3 | `test_install_staleSig_afterOwnerChange_reverts` | live `ownerOf` invalidates pre-transfer sig |
| 4 | `test_install_nonceReplay_reverts` | `DelegationNonceUsed` on second use |
| 5 | `test_install_expired_reverts` | `expiresAt <= now` rejected at install |
| 6 | `test_install_zeroSelectorRoot_reverts` | fail-fast unrestricted-root rejection |
| 7 | `test_install_invalidWindowConfig_reverts` | 0/0 or set/set only (`InvalidWindowConfig`) |
| 8 | `test_install_replacesPrevious_withFreshSig` | one active delegation per token; fresh nonce |
| 9 | `test_execute_happyPath_forwardsValue` | value forwarded, registry empty, delegate debited |
| 10 | `test_execute_emitsActionHash` | `DelegatedExecuted` with vault-shaped actionHash |
| 11 | `test_execute_notDelegate_reverts` | even the NFT owner ≠ delegate → `NotDelegate` |
| 12 | `test_execute_noDelegation_reverts` | `NoActiveDelegation` |
| 13 | `test_execute_expiry` | `DelegationExpired` after `expiresAt` |
| 14 | `test_execute_perTxCap` | `CapExceeded` |
| 15 | `test_execute_windowAccumulation_thenExceeded` | accumulate to exact cap, next call `WindowExceeded` |
| 16 | `test_execute_windowReset_afterWindowElapses` | perTxCap binds across windows; window advance only on successful debit |
| 17 | `test_execute_zeroWindowConfig_skipsWindowAccounting` | perTxCap-only mode |
| 18 | `test_execute_zeroRootDelegate_revertsSelectorNotAllowed` | defense-in-depth guard via direct storage injection |
| 19 | `test_execute_wrongProof_reverts` | `InvalidMerkleProof` |
| 20 | `test_execute_unlistedTarget_reverts` | target not in root |
| 21 | `test_execute_unlistedSelector_reverts` | selector not in root |
| 22 | `test_execute_multiLeafRoot_correctProof` | 2-leaf root, sorted-pair proof, Python-verified math |
| 23 | `test_execute_valueMismatch_reverts` | declared `value` ≠ `msg.value` |
| 24 | `test_execute_shortData_reverts` | `data.length < 4` |
| 25 | `test_execute_paused_reverts` | `pause()` blocks execution |
| 26 | `test_execute_failingTarget_revertsAndRollsBackWindow` | `CallFailed` + full window rollback, reinstall works |
| 27 | `test_revoke_immediacy` | same-block revoke blocks the delegate |
| 28 | `test_revoke_nonOwner_reverts` | delegate cannot self-perpetuate |
| 29 | `test_revoke_byNewOwner_afterTransfer` | transfer strips seller's delegate |
| 30 | `test_integration_delegatedVaultExecute_underCaps` | end-to-end: delegation → `AxiomStrategyVault.execute` → sink paid, vault debited, registry empty; root whitelists only `vault.execute` |
| 31 | `test_integration_vaultPayoutViaDelegate_forwardedToDelegate` | leftover native forwarded, zero float |

### Forge output

```text
forge build            → Compiler run successful (0 errors)
forge test (full repo) → 20 suites: 295 passed, 0 failed, 9 skipped
                         (baseline was 231 pass / 8 skip; lane A added suites in
                          parallel — its Permit2/state-view work; my suite adds 31)
AxiomDelegationRegistryTest → Suite result: ok. 31 passed; 0 failed; 0 skipped
```

No suppressions, no TODO/HACK/console/debugger in any changed file (`forge fmt` applied).

---

## 5. Security Analysis

| Vector | Mitigation |
| --- | --- |
| **Install replay** | Per-token single-use nonce burned after validation; EIP-712 domain binds name+version+chainid+verifyingContract → no cross-chain/cross-contract replay (Cyfrin/Solodit §1.3). Nonce not burned on reverted installs. |
| **Stale signature** | Signer must equal `ownerOf` **at install time** — a sale invalidates every pre-signed delegation. |
| **Execute replay** | `delegatedExecute` takes no signature; authorization is `msg.sender == delegate`, which is unreplayable. The vault layer adds its own one-shot `usedActions`. |
| **Expiry** | `expiresAt` hard-checked on every execute; expired installs rejected. No perpetual delegation can exist (fixes the `delegateAccess`/`authorizeUsage` no-expiry gap, proposal H2/H3). |
| **Cap bypass** | `value == msg.value` enforced → cannot spend vault/registry-held value in the same call; `perTxCap` + lazy-resetting window bound every value-carrying call; failed targets roll back the window debit atomically (no partial-spend drift). |
| **Arbitrary-target execution** | The delegate of an agent could otherwise call anything. Root is mandatory non-zero (install fail-fast + execute re-check), leaf = `(target, bytes4(data[:4]))` — a whitelisted selector cannot be swapped for another on the same target, and vice versa. Multi-leaf proofs use OZ sorted pairs. |
| **Reentrancy** | `nonReentrant` + CEI (all state before the external call) + `CallFailed` revert on failure. The leftover-forward is last, after all state effects. |
| **Global stop** | Registry `whenNotPaused` is independent of vault/processor pauses; containment of a compromised delegate = owner `revokeDelegation` (immediate, same philosophy as `AxiomTeeVerifier.revokeSigner`). |
| **Native trapping** | Any native returned by a whitelisted target is forwarded to the delegate same-tx; registry balance is invariantly 0 post-execute (asserted in tests). |

## 6. Risks / Residuals

1. **Root management UX:** the owner chooses the `(target,selector)` whitelist; a too-broad root (e.g. whitelisting `AxiomPaymentProcessor.payForAgent` with any `agentTokenId`) is still bounded by perTxCap/window but not by intent. Backend should mirror the root construction in TS (like `strategyGuard`) in Wave 3.
2. **perTxCap vs vault layers are independent:** a delegated `vault.execute` carries value 0 through the registry; the *vault's* daily limit (owner-set, refreshable — known vault residual #2 in `AxiomStrategyVault` docs) is the binding cap there. Wave 3's "clear strategy on transfer" fix composes.
3. **Native-value delegations to a pay target (e.g. `payForAgent`) spend delegate-owned funds**, not the agent's vault balance; wiring `payForAgent` to pull from the vault is Wave 3 address-wiring territory.
4. **windowSeconds granularity** is per-delegation (not global UTC day); two delegations installed at different times have different window phases. Acceptable — each install is owner-authorized explicitly.
5. **Storage-slot-poked test** (`test_execute_zeroRootDelegate_revertsSelectorNotAllowed`) hardcodes the mapping slot (2). If storage layout is ever re-ordered, that one test breaks loudly — intentionally, as a layout-change tripwire.

## 7. Files Changed (all uncommitted)

- `apps/contracts/src/AxiomDelegationRegistry.sol` — new
- `apps/contracts/test/AxiomDelegationRegistry.t.sol` — new (31 tests)
- `packages/config/src/abis/delegationRegistry.ts` — new ABI export (hand-maintained pattern per `teeVerifier.ts`)
- `packages/config/src/abis/index.ts` — one added export line (lane A had already modified this file in parallel; both lines coexist)

Deploy scripts were **not** touched (Wave 3 wires addresses). `AxiomMockUSDC.sol` untouched.
