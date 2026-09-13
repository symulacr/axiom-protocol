# Wave 2 — Lane A: Permit2-Based Settlement

- **Status:** COMPLETE (uncommitted, per brief)
- **Date:** 2026-08-31
- **Base:** git HEAD `7dd19a90` (tree was clean at lane start)
- **Files touched:** `apps/contracts/src/AxiomPaymentProcessor.sol`, NEW `apps/contracts/src/permit2/ISignatureTransfer.sol`, NEW `apps/contracts/test/AxiomPaymentProcessorPermit2.t.sol`, NEW `apps/contracts/test/AxiomPaymentProcessorPermit2Fork.t.sol`, `.gitignore` (+`.firecrawl/`)
- **Untouched (as required):** `AxiomMockUSDC.sol`, ABI JSONs (Wave 3), no redeployments, no suppressions/TODOs.

---

## 1. Firecrawl research findings (run BEFORE coding, raw dumps in `.firecrawl/`)

Tool note: the `forge` shell name is aliased to `tmux attach -t omp-fheforge` on this box — all foundry commands were run via `bash -c`.

### 1.1 Canonical integration pattern (search 1: "Uniswap permit2 solidity integration SignatureTransfer permitWitnessTransferFrom example")

- **<https://developers.uniswap.org/docs/protocols/permit2/concepts/signature-transfer>** — canonical docs: `permitWitnessTransferFrom(PermitTransferFrom, SignatureTransferDetails, owner, witness, witnessTypeString, signature)`; witness type string must follow EIP-712 nested-struct ordering and include the `TokenPermissions` definition.
- **<https://blog.uniswap.org/permit2-integration-guide>** — spender-contract pattern: your contract calls `permit2.permitWitnessTransferFrom(...)`; **`spender` inside the signed message is `msg.sender` of the Permit2 call** (i.e., the settlement contract, never a relayer).
- **<https://github.com/Uniswap/permit2>** (also scraped: `.firecrawl/scrape-permit2-repo.md`) — architecture: `AllowanceTransfer` + `SignatureTransfer`; deployment via deterministic CREATE2.
- **<https://www.cyfrin.io/blog/how-to-implement-permit2>** — worked witness example; type string construction `"PermitWitnessTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline,Witness witness)TokenPermissions(address token,uint256 amount)Witness(address user)"`.
- Raw sources also scraped for exactness (raw.githubusercontent.com @ main): `src/interfaces/ISignatureTransfer.sol`, `src/SignatureTransfer.sol`, `src/EIP712.sol`, `src/libraries/PermitHash.sol` — the implementation was written directly against these.

### 1.2 Domain separator + interface details (scrape 2)

From `src/EIP712.sol`: domain = `keccak256(abi.encode(_TYPE_HASH, keccak256("Permit2"), block.chainid, address(this)))` with `_TYPE_HASH = keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)")` — **no version field**. From `PermitHash.sol`: single-witness typehash stub is exactly `"PermitWitnessTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline,"` concatenated with the witness type string + `"TokenPermissions(address token,uint256 amount)"`, hashed over `(typeHash, tokenPermissionsHash, msg.sender, nonce, deadline, witness)`.

**Brief contradiction found and handled:** the brief said "pulling paymentToken from `permit.owner` (the struct's owner field)" — **upstream `PermitTransferFrom` has NO `owner` field** (struct = `{permitted, nonce, deadline}`). Owner is a separate call parameter and Permit2 reverts unless the signature recovers to it. Implemented canonically: `payForAgentWithPermit2(..., address owner, PermitTransferFrom calldata permit, bytes signature)`. This deviation is deliberate and documented in-code.

### 1.3 Security best practices / audit status (search 2)

- **Audit status:** Permit2 is the audited, battle-tested industry standard (deployed by UniswapX — ABDK/OpenZeppelin/Spearbit audits — plus Blur/OpenSea/Seaport). Not itself a risk surface; integration misuse is.
- **<https://www.cyfrin.io/blog/how-to-implement-permit2>** — pitfalls: the dominant real-world drain vector is **signature phishing at fake frontends** (type(uint256).max approvals to malicious spenders), not Permit2 bugs. Mitigations used here: exact-amount witness binding, spender = settlement contract, Permit2 one-tx-lifetime signatures (no standing Permit2-side allowance drift beyond the user's approval).
- **docs/v3-proposals/04-web-research-digest.md** (prior-wave research, Q2 + Q7 + actionable facts): Permit2 verified on-chain at `0x000000000022D473030F116dDEE9F6B43aC78BA3` on Galileo; UniswapX "gather-then-execute" witness pattern recommended for 7857 marketplaces; witness data binds the order to defeat signature redirection.
- **<https://eco.com/support/en/articles/12005545-what-is-permit2-a-2026-guide-to-token-approvals>** — hygiene: users should audit standing Permit2 allowances (Revoke.cash); N/A to contract design but noted for user docs.

**Research vs. brief deltas (explicit):** (1) `owner` outside the signed struct (above); (2) no audit or doc source supports adding our own nonce on top of Permit2's — confirmed the brief's "do NOT add our own nonce"; (3) witness hashing must use Permit2's exact stub-string concatenation, not a hand-rolled full typehash — matched byte-for-byte in tests.

---

## 2. Design decisions

### 2.1 `permit2` — storage vs constant → **CONSTANT** (`address public constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3`)

Justification: Permit2 is at the identical CREATE2 address on every chain UniswapX supports (per research 1.1/1.3) and is verified on Galileo (prior-wave on-chain check). A constant is chain-invariant, saves an SLOAD per permit pay, cannot drift via `initialize()` (which is already past its `initializer` window on the deployed proxy), and forces a conscious redeploy+upgrade if a chain ever lacks Permit2 there. The brief allowed either; constant is the smaller, safer primitive.

### 2.2 Factoring → `_paySplit` (pull) + `_paySplitReceived` (already-held) with shared split math

Wave 1's `_paySplit` = cap-checked pull via `_payTransferFrom` + balance-delta verification + inline split math. New shape:

- `_paySplit(payer, tokenId, amount)` — keeps cap + zero-guard + pull + `TransferAmountMismatch` delta check, then delegates to `_paySplitReceived` with `received`. Used by `payForAgent` and `payForAgentAndCompute` (unchanged behavior).
- `_paySplitReceived(payer, tokenId, amount)` — creator resolution + royalty/fee split math + earnings credit + treasury forward + `PaymentProcessed`. **No cap, no transfer-in** — the permit lane enforces the cap *before* Permit2 moves tokens (mirroring how `_payTransferFrom` front-runs the pull), and Permit2's `requestedAmount` pull makes a delta check redundant (Permit2 reverts on shortfall; the exact `amount` is what's requested).
- `_enforcePayCap(amount)` — extracted cap + zero-guard used by the permit lane so `PayAmountExceedsCap` fires before any state changes (verified by test: a cap-blocked signature is still redeemable after the cap is raised).

The capped transfer stays only in `_paySplit`'s pull path, exactly as the brief requires.

### 2.3 Witness design

`AgentPaymentWitness{agentTokenId, amount}` with `keccak256("AgentPayment(uint256 agentTokenId,uint256 amount)")` = `0x276d0fdb23abe75e231455932314e625fc515aa5a37c6e73a306d719c2184e7e` (verified with `cast keccak`), witness type string `"AgentPayment witness)TokenPermissions(address token,uint256 amount)"`. Together with Permit2's built-in hash fields this binds: **token, permitted amount, requested amount, spender (= processor), nonce, deadline, owner (recovered), agentTokenId, amount**. No separate salt: Permit2's unordered nonce already makes each signature single-use, so identical-parameter re-signing is the normal UX and a salt adds signing friction for zero security gain. Witness binding means a phished/observed signature cannot be redirected to another agent or amount (test: `test_payForAgentWithPermit2_witnessBindsAgentTokenId`).

### 2.4 Nonce/replay (documented, not implemented — per brief)

Replay protection is entirely Permit2's unordered nonce bitmap: word = `nonce >> 8`, bit = `1 << (nonce & 255)`, consumed atomically inside `permitWitnessTransferFrom`. The Processor deliberately holds **zero** nonce state; signature theft is bounded by deadline + witness binding, and reuse reverts inside Permit2.

---

## 3. Storage-layout diff

`forge inspect AxiomPaymentProcessor storageLayout` (before/after identical; note: foundry only reports the non-namespaced `_status` uint256 @ slot 0 — the ERC-7201 namespaced struct is not surfaced by this command):

| | Before (Wave 1) | After (W2-A) |
| --- | --- | --- |
| Namespaced `agent.storage.AxiomPaymentProcessor` @ `0xb6e9ac8a…bc00` | `…maxPayCap`, `computeRatioMax`, `uint256[47] __gap` | **identical** — `…maxPayCap`, `computeRatioMax`, `uint256[47] __gap` |
| Non-namespaced | `_status` slot 0 | `_status` slot 0 |

**Zero new storage vars**: PERMIT2 is a constant, WITNESS strings/typehash are constants, and the permit lane introduces no state. Gap stays 47; upgrade-in-place layout is byte-identical to Wave 1. (An early draft considered a `minPermitSplitBps` var for fee-change races — cut as unnecessary admin surface; see §5 risks.) The EIP-7201 namespace pin is enforced by the existing `StorageSlotTest` (unchanged, passing).

---

## 4. Test inventory + forge output

### 4.1 Unit: `test/AxiomPaymentProcessorPermit2.t.sol` (14 tests, all PASS)

Strategy per brief preference: **stub Permit2** for speed. `MockPermit2` implements `permitWitnessTransferFrom` with the *exact upstream hashing* (stub-string typehash, `msg.sender` as spender, domain name "Permit2" / chainid / verifyingContract) and the *exact upstream nonce bitmap*, and is `vm.etch`-ed onto the **canonical PERMIT2 address** so the domain and call path match production. Payer's EIP-712 signature is produced with a minimal signer (`vm.sign` over Permit2's domain).

| Test | Covers |
| --- | --- |
| `test_payForAgentWithPermit2_creditsCreatorAndTransfersToken` | happy path: pull → split → earnings/treasury/event |
| `test_payForAgentWithPermit2_nonceSingleUse_revertsOnReuse` | Permit2 nonce burned (replay protection) |
| `test_payForAgentWithPermit2_nonceIndependence` | distinct nonces both redeemable |
| `test_payForAgentWithPermit2_revertsWhenPermitTokenMismatch` | `InvalidPermitToken` |
| `test_payForAgentWithPermit2_revertsWhenPermittedBelowRequested` | `InvalidPermitAmount` |
| `test_payForAgentWithPermit2_revertsWhenDeadlineExpired` | `PermitExpired` |
| `test_payForAgentWithPermit2_revertsOnZeroAmount` | cap guard → `ZeroAmount` |
| `test_payForAgentWithPermit2_revertsWhenCreatorNotRegistered` | `AgentCreatorNotRegistered` |
| `test_payForAgentWithPermit2_revertsWhenPaused` | `EnforcedPause` |
| `test_payForAgentWithPermit2_revertsWhenWrongSigner` | owner≠signer rejected inside Permit2 |
| `test_payForAgentWithPermit2_witnessBindsAgentTokenId` | wrong agentId → InvalidSigner; correct one OK |
| `test_payForAgentWithPermit2_enforcesMaxPayCap_beforePermitConsumption` | Wave-1 cap on permit lane; cap-check precedes nonce burn (retry works after raise) |
| `test_payForAgentWithPermit2_permittedAboveRequested_usesRequestedOnly` | over-permitted permit pulls only `amount` |
| `test_payForAgentWithPermit2_splitMatchesPayForAgent` | permit lane splits == approval lane splits |

### 4.2 Fork-gated: `test/AxiomPaymentProcessorPermit2Fork.t.sol` (1 test, SKIPs without env)

Follows the repo's `LiveForkTest` pattern (`FOUNDRY_LIVE_FORK=1`, `OG_RPC_URL`, `FOUNDRY_FORK_BLOCK`). Signs a real witness permit and runs the full lane against **production Permit2 on the Galileo fork**, using the deployed AxiomMockUSDC (`0x354CA53bAB51C0666964fa050628d8351f8A7d19`, docs/deployments/galileo-v2-2026-08-28.json; override with `PERMIT2_TOKEN`) and a funded key from `PERMIT2_FUNDED_KEY`. **Not executed this lane** (no funded Galileo key available in-env) — it compiles and is wired, and is the one item requiring operator follow-up.

### 4.3 Forge output (fresh, final)

```text
$ forge build                     → 0 errors (0 warnings in touched src files)
$ forge test                      (full monorepo suite, 20 test suites)
Ran 20 test suites in 14.44s: 295 tests passed, 0 failed, 9 skipped (304 total tests)
$ forge test --match-contract "Permit2|PaymentProcessor"
Ran 5 test suites: 88 passed, 0 failed, 3 skipped (91 total tests)
```

**Attribution note:** the baseline was 231 passed / 8 skipped; the tree now also contains *concurrent Wave-2 lanes'* in-flight work (AxiomDelegationRegistry, StateView, frontend hooks) that appeared mid-session. My lane's attributable delta is **+14 passing unit tests, +1 fork-gated skip**; all pre-existing suites remain green. During verification, transient failures (1–3/run, flaky, all in `AxiomDelegationRegistryTest`) were observed from that concurrent lane and were gone by the final run — none touched Processor or Permit2 files.

---

## 5. Security notes

- **Witness binding:** signature is unusable for any other agentId/amount (test-enforced); spender binding is upstream (`msg.sender` inside Permit2's hash), so a captured signature cannot be redeemed by a different contract.
- **Deadline:** double-enforced — Permit2 checks its own expiry, and the Processor pre-checks `permit.deadline < block.timestamp → PermitExpired` *before* Permit2, so an expired permit fails with a clean domain error and no nonce burn.
- **Cap inheritance:** the permit lane enforces Wave-1 `MAX_PAY_CAP` (`PayAmountExceedsCap`) and the zero-amount guard **before** any token movement or nonce consumption (test-verified). Split math is the shared `_paySplitReceived`, so royalty/floor-fee logic cannot diverge between lanes.
- **Reentrancy/limits:** `nonReentrant` + `whenNotPaused` on the new external function, same as sibling lanes. `_paySplitReceived` calls out to the token (`safeTransfer` to treasury) at the end — covered by the same nonReentrant guard; the token is a plain ERC-20 and creator credit precedes the treasury transfer.
- **Owner recovery:** Permit2 reverts unless the signature recovers to the `owner` parameter; the Processor splits against that same `owner` (never `msg.sender`), so a relayer/gas-sponsor can submit on the payer's behalf without gaining custody.
- **No own nonce** (per brief + research): Permit2's unordered bitmap is the sole replay defense; adding a second layer would only create DoS/griefing surface.

### Residual risks

1. **Fee-change race (accepted):** `protocolFeeBps` can change between signing and redemption, so the payer's realized split may differ from what they assumed when signing. Mitigation would be a signed fee snapshot or admin-set `minPermitSplitBps` (cut as scope creep); consequence is bounded (fees are admin-governed and ≤ cap).
2. **Token rotation race (accepted):** a permit signed for the old payment token cannot redeem after `setPaymentToken` (`InvalidPermitToken`); conversely nothing invalidates pre-signed permits for the *new* token — same trust level as the existing approval lane, and migration is blocked while earnings/balances remain.
3. **Signature phishing** (ecosystem-level): the witness binds amount+agent, but the *amount* itself is attacker-influenceable at a phishing UI. Frontend must render exact permit terms; contract-side exposure is unchanged.
4. **Fork test not yet executed** against live Galileo (needs a funded key) — the hashing is validated against the stub and matches upstream sources line-for-line, but one operator run of `FOUNDRY_LIVE_FORK=1 PERMIT2_FUNDED_KEY=… forge test --match-test test_fork_payForAgentWithPermit2_realPermit2` should close the loop before Wave 3.
5. **Shared-tree hazard:** other Wave-2 lanes are editing the same working tree concurrently; commits should be coordinated per-lane (this lane's changes left uncommitted as instructed).

---

## 6. Summary of changes

- `apps/contracts/src/AxiomPaymentProcessor.sol` (+~130/−17): imports `ISignatureTransfer`; `PERMIT2` constant + witness typehash/string constants + `AgentPaymentWitness`; errors `InvalidPermitToken` / `InvalidPermitAmount` / `PermitExpired`; factored `_paySplit` → `_paySplitReceived`; `_enforcePayCap`; new `payForAgentWithPermit2(uint256,uint256,address,PermitTransferFrom,bytes)`; gap untouched at 47 (zero storage delta).
- `apps/contracts/src/permit2/ISignatureTransfer.sol` (new): minimal vendored upstream interface (`PermitTransferFrom`, `SignatureTransferDetails`, `nonceBitmap`, `permitWitnessTransferFrom`), MIT, byte-compatible with `Uniswap/permit2@main`.
- `apps/contracts/test/AxiomPaymentProcessorPermit2.t.sol` (new): 14 unit tests with upstream-faithful Permit2 stub etched at the canonical address.
- `apps/contracts/test/AxiomPaymentProcessorPermit2Fork.t.sol` (new): fork-gated live-Permit2 test (Galileo, LiveForkTest pattern).
- `.gitignore`: +`.firecrawl/` (research dumps in `.firecrawl/`).
