# Wave 1 — Lane B: Verifier Hardening (F-1 gate, ProofUsed event, signer cap, k-of-1 NatSpec)

- **Date:** 2026-08-30
- **Lane:** Wave 1B of the Axiom Protocol V3 campaign (verifier findings)
- **Status:** Implemented, uncommitted (parent handles commits)
- **Verification:** forge test 231 passed / 0 failed / 7 skipped (baseline 201; this lane adds +8 deterministic tests and migrates existing ones — full delta attribution in §4, since `apps/contracts/test/` is gitignored and other lanes share the tree); backend bun test 181 pass / 0 fail; @axiom/config tests 47 pass; `@axiom/config` + `@axiom/backend` typecheck clean; `forge build --force` clean.

---

## 1. `verifyTransferValidity` call-site survey (F-1)

Repo-wide grep (`rg --no-ignore verifyTransferValidity` across contracts, tests, backend, backend/e2e, oracle, packages). Every site, with disposition:

| # | Site | Caller at that site | Disposition |
| --- | --- | --- | --- |
| 1 | `apps/contracts/src/ERC7857Upgradeable.sol:105` (`_proofCheck`) | The NFT contract itself (`address(this)` inside the NFT) | **The only production consumer.** Gate passes: `msg.sender == nft` holds by construction. Zero migration. |
| 2 | `apps/contracts/src/interfaces/IERC7857DataVerifier.sol:50` | interface declaration | n/a |
| 3–5 | `apps/contracts/src/extensions/ERC7857CloneableUpgradeable.sol:4`, `ERC7857AuthorizeUpgradeable.sol:4`, `ERC7857IDataStorageUpgradeable.sol:4` | comments only | n/a |
| 6 | `apps/contracts/src/verifiers/AxiomTeeVerifier.sol:171` (impl) | — | gated here |
| 7 | `packages/config/src/abis/teeVerifier.ts:21` | ABI (no call) | ABI gains the `ProofUsed` event entry (§2); function ABI unchanged |
| 8–12 | `apps/contracts/test/AxiomTeeVerifier.t.sol:136,150,170,194,219` | forge test contract, direct, with `nft` bound as `address(0xBEEF)` | **Migrated:** proofs re-signed with `nft = address(this)` (the test contract) so the test contract legitimately poses as the designated NFT; plus 4 new gate tests that call as a non-designated address and revert |
| 13 | `apps/contracts/test/AxiomAgentNFT.t.sol:392` (`test_verifyTransferValidity_revertMixedProofs_direct`) | forge test contract, direct, `nft = address(0)` | **Migrated:** call changed to `nft = address(this)` (this test file's `_makeProofs` helper already binds `address(nft)` = the NFT under test — used by the NFT-path tests, which pass unchanged) |
| 14–45 | `apps/contracts/test/FuzzAxiomTeeVerifier.t.sol` (31 call sites) | forge fuzz test contract, direct, mostly `nft = address(0)` | **Migrated:** all `nft` params and all digest bindings (`_ownershipDigest`/`_accessDigest`/`_makeValidProof*` callsites) changed from `address(0)` to `address(this)` |
| 46–56 | `apps/contracts/test/V12C3ValidUntil.t.sol` (10 call sites, `nft = address(0)`) | **live Galileo fork** of the already-deployed old verifier | **No change possible or needed:** these run against the on-chain deployment (self-skip without env vars; the live contract's behavior is fixed by its deployed bytecode). They will not run against the new source. Documented as stale-by-design once the hardening is deployed (Wave 3 regen/deploy supersedes them). |
| 57–63 | `apps/backend/e2e/e2e/scenarios.ts:348,402`, `matrix.ts:196,203,206`, `run-e2e.ts:288`, `steps.ts:895` | coverage bookkeeping (strings), no direct verifier call | n/a |
| 64 | `apps/backend/e2e/e2e/failure-scenarios.ts:473` (`tee.contract.verifyTransferValidity([bogus], someoneElse, deps.agentNft)`) | backend e2e probe, staticcall (read-only `eth_call` via `expectRevert`), proofs signed by a non-allowlisted key, `nft = deps.agentNft` | **Unchanged, still valid:** (a) the probe is a `staticCall`-style revert assertion — a reverted `eth_call` burns nothing and the strict gate preserves the expected `AxiomInvalidOwnershipProof` outcome only if the caller matches... see (b): the caller is the deployer EOA, so after the gate this probe reverts with `UnauthorizedVerifierCaller` instead. The harness asserts a *member of* `["AxiomInvalidOwnershipProof", ERR.AxiomInvalidOwnershipProof]` in the payload — noted as a **required e2e touch-up when this verifier is actually deployed** (Wave 3): add `"UnauthorizedVerifierCaller"` to that expected list (one line, `failure-scenarios.ts:469-475`). Not done in this lane because the e2e runs against the *live* old verifier, where the new error does not exist yet. |

**Conclusion:** no production or backend path legitimately calls the verifier directly with proofs. The strict zero-storage gate (`msg.sender == nft`) is adopted; **no `publicVerify` flag is needed** — the only affected callers are forge tests, which were migrated, and the live-fork suites that cannot be migrated by source change anyway.

## 2. Fixes applied

### 2.1 HIGH — proof-nonce-burning gate (F-1)

`apps/contracts/src/verifiers/AxiomTeeVerifier.sol`

- New error: `UnauthorizedVerifierCaller(address caller, address nft)`.
- `verifyTransferValidity` now opens with:

  ```solidity
  if (msg.sender != nft) revert UnauthorizedVerifierCaller(msg.sender, nft);
  ```

- **Before:** permissionless — any address could submit observed proofs, consuming the nonce via `_checkAndMarkProof` before the genuine `iTransferFrom` lands, DoSing the transfer with `ProofAlreadyUsed`.
- **After:** only the NFT contract named in the EIP-712 digests can invoke verification. Zero storage: the `nft` param already flows through both struct hashes, so no state, no initialize change, no gap shrink, no deploy-script change (`RedeployTeeVerifier.s.sol`/`Deploy.s.sol` untouched — `initialize(owner, signer, maxProofAge)` signature intact). The gate precedes all signature/expiry/replay work, so direct calls are cheap reverts and touch no state. Note: proof validity itself is unaffected — proofs remain cryptographically bound to one `nft`; a wrong `nft` param would fail signature recovery anyway.
- The interface (`IERC7857DataVerifier.sol`) is unchanged (error type is implementation detail).

### 2.2 HIGH — `ProofUsed` event

`apps/contracts/src/verifiers/BaseVerifier.sol`

- New event: `event ProofUsed(bytes32 indexed nonce, uint256 indexed timestamp);`
- `_checkAndMarkProof` emits it right after the `used`/`timestamp` write.
- **Before:** the `proofs` map was write-only and undiscoverable (`internal`, no event) — the keeper's nonce candidates could only come from a static env list.
- **After:** every consumed nonce is log-discoverable; the replay path reverts *before* the write, so the log stream is candidate-exact (no duplicates from failed attempts). Event emission costs nothing under the committed-proxy posture.

### 2.3 LOW — signer allowlist cap

`apps/contracts/src/verifiers/AxiomTeeVerifier.sol`

- `uint256 private constant MAX_SIGNERS = 5;` and `executeSigner()` now reverts `SignerAllowlistFull` (new error) when `_signers.length >= MAX_SIGNERS` — checked **before** `TimelockManager.execute()` so a capped execute leaves the pending proposal intact (verified by test; the proposal survives and can execute after a revocation re-opens room).
- `registeredSigner()` NatSpec rewritten: documents that it returns the **current first entry**, which can change under swap-and-pop revocation (`_signers[0]` is replaced by the last entry when revoked), and directs enumeration/membership consumers to `allowlistedSigners()` / `isAllowlistedSigner()`.

### 2.4 LOW — k-of-1 residual-risk NatSpec (no k-of-n implementation, per product decision)

`apps/contracts/src/verifiers/AxiomTeeVerifier.sol` contract-level `@dev`: documents that a single allowlisted TEE key carries total transfer-forgery power if leaked, that containment is **immediate** `revokeSigner` (same-block, no timelock) while adds keep the 1-day propose/execute delay, and that k-of-n was deliberately **not** implemented (product decision, V3 wave 1B — quorum would multiply TEE infrastructure without changing the containment story).

## 3. Keeper change (log-derived sweep candidates)

`apps/backend/src/keepers/index.ts`:

- **Before:** `sweepOnce` used only `parseKeeperNonces(env.AXIOM_KEEPER_NONCES)` — a static operator list (the documented dead end at the old lines 56–69).
- **After:** `deriveCandidates()` first scans `ProofUsed(nonce, timestamp)` logs on the verifier over `[latest − AXIOM_KEEPER_LOG_LOOKBACK_BLOCKS, latest]` (new optional env var in `packages/config/src/env-schema.ts`, default 2,000,000 blocks ≈ the 7-day `maxProofAgeSeconds` sweepable window), dedupes, and uses those as candidates; it **falls back to `AXIOM_KEEPER_NONCES`** when the scan returns nothing or fails (e.g. verifier predates the event). Gas cap and the 256 batch ceiling are untouched — log candidates are clamped with the same `.slice(0, batchMax)`.
- New exported helper `fetchProofUsedNonces(raw, fromBlock, toBlock)`; `KeeperDeps` gains a `verifierRaw` test seam (stub `verifier` without a raw contract keeps the env-fallback path).
- `packages/config/src/abis/teeVerifier.ts`: **one line added** — the `event ProofUsed(bytes32 indexed nonce, uint256 indexed timestamp)` ABI entry so `queryFilter("ProofUsed")` decodes. This is a hand-maintained ABI file with a one-entry append, **not** a Wave-3 ABI regen; the function/error ABI is otherwise untouched.
- Backend keeper tests (`apps/backend/src/keepers/index.test.ts`): 5 new tests (log-driven sweep, dedupe+clamp to 256, empty-log fallback, failed-scan fallback, stub-without-raw fallback) + 1 `fetchProofUsedNonces` unit test. All pre-existing keeper tests pass unchanged.

## 4. Test changes

**Migrations (existing tests kept, `nft` binding updated):** `AxiomTeeVerifier.t.sol` — `address(0xBEEF)` → `address(this)` (7 sites incl. digest bindings); `FuzzAxiomTeeVerifier.t.sol` — `address(0)` → `address(this)` as designated NFT across all 31 direct-call/digest sites; `AxiomAgentNFT.t.sol` — one direct-call site's `nft` arg → `address(this)`.

**New forge tests (all in `AxiomTeeVerifier.t.sol`):**

| Test | Covers |
| --- | --- |
| `test_verifyTransferValidity_directCall_reverts` | (i) direct verifier call from non-designated address → `UnauthorizedVerifierCaller(stranger, nft)` |
| `test_verifyTransferValidity_gatePrecedesProofChecks` | gate fires even for an empty proof batch (no signature/replay work reachable) |
| `test_verifyTransferValidity_designatedNft_succeeds` | (ii) NFT-path call still works (test contract poses as the NFT the proofs bind) |
| `test_verifyTransferValidity_wrongNftParam_reverts` | caller that passes a mismatched `nft` param is rejected before signature work |
| `test_verifyTransferValidity_emitsProofUsed` | (iii) `ProofUsed(nonce, timestamp)` emitted with the exact derived nonce + current timestamp |
| `test_verifyTransferValidity_replay_emitsNoSecondProofUsed` | replay path emits nothing (log stream stays candidate-exact) |
| `test_executeSigner_allowlistCap_reverts` | (iv) 6th signer: propose OK, execute → `SignerAllowlistFull`, count stays 5, pending proposal preserved |
| `test_executeSigner_capOpensAfterRevocation` | revoke re-opens room; re-add works |

### Forge output summary

Baseline (pre-change): `201 tests passed, 0 failed, 7 skipped (208 total)` — 15 suites, excluding the env-gated live-fork `V12C3ValidUntil` suite (baseline behavior: also excluded, self-skips without env).

Post-change (`forge test --no-match-path "*V12C3ValidUntil*"`):

```text
Ran 15 test suites in 26.63s (30.90s CPU time): 231 tests passed, 0 failed, 7 skipped (238 total tests)
```

Delta: +30 passing. Attribution: `apps/contracts/test/` is **gitignored in this repo** (`.gitignore`: `apps/contracts/test/`, `**/*.t.sol`), so the forge test files are untracked and the 201-test baseline already contained an evolving untracked set. This lane's verified contribution is **+8 deterministic tests** in `AxiomTeeVerifierTest` (19 → 26: the four F-1 gate tests, two `ProofUsed` tests, two allowlist-cap tests) plus the `nft`-binding migrations in `FuzzAxiomTeeVerifier` (same test count) and `AxiomAgentNFT.t.sol`. The remainder of the delta (+22) comes from sibling lanes' concurrent edits to the shared untracked test tree (e.g. `AxiomPaymentProcessorTest` now reports 51 passing, `AxiomPaymentProcessor.sol` and other lane-A/B-adjacent sources carry changes in `git diff` that this lane did not author). **Every one of the 15 suites reports `Suite result: ok` with zero failures**, so the tree is green regardless of authorship; a pristine-tree rerun by the parent will isolate per-lane counts exactly. Backend: `bun run --filter @axiom/backend test` → `181 pass, 0 fail` (keepers 18/18 incl. 6 new). `@axiom/config`: 47 pass, typecheck clean.

### Test-infra gotcha (worth pinning)

With `via_ir = true` + `optimizer_runs = 1`, the Solidity optimizer CSE'd two syntactically identical `vm.warp(block.timestamp + 1 days + 1)` calls in one test into a single evaluation — `block.timestamp` is legitimately constant mid-transaction in production semantics, but `vm.warp` (cheatcode) breaks that assumption, so the second warp never advanced time (`DelayNotElapsed`). Fix in the new cap tests: distinct warp expressions per call (`+ i + 1`, `+ 2`, `+ 100`). Any future test that warps twice must not reuse an identical timestamp expression.

## 5. Compatibility / deployment notes

- **Storage layout:** unchanged. The gate uses the existing `nft` param (zero storage); `MAX_SIGNERS` is a `constant` (no slot); the event costs no storage. `uint256[50] __gap` on both `AxiomTeeVerifier` and `BaseVerifier` is untouched.
- **`initialize` signature:** unchanged (`owner, signer, maxProofAge`) — `script/RedeployTeeVerifier.s.sol`, `Deploy.s.sol`, `DeployAristotle.s.sol`, `DeployPaymentProcessor.s.sol`, `RedeployVaultProcessor.s.sol`, `MintE2eUsdc.s.sol` untouched and compile clean (`forge build --force` OK).
- **Live verifier:** the deployed Galileo verifier predates all of this. The gate/event/cap take effect only when the next verifier implementation is deployed (parent/Wave 3 decision; do **not** redeploy from this lane). Until then the keeper's log scan finds no `ProofUsed` logs and falls back to env config — identical behavior to today.
- **E2E touch-up deferred (one line):** `apps/backend/e2e/e2e/failure-scenarios.ts:469-475` — after the hardened verifier is deployed, add `"UnauthorizedVerifierCaller"` to the expected-error list of the `tee.revoked-signer-proof` probe (the current live-verifier expectation `AxiomInvalidOwnershipProof` is still what the old deployment returns). Left untouched per lane scope (e2e targets the live deployment, not source).
- **Not done (explicit):** k-of-n quorum (product decision — NatSpec only); no ABI regen; no redeploy; `AxiomMockUSDC` untouched.

## 6. Risks

| Risk | Assessment |
| --- | --- |
| Future non-NFT consumer of `verifyTransferValidity` (e.g. a spec-verbatim 1-arg adapter delegating to this verifier) | Blocked by the gate. Mitigation: the adapter contract *is* an `nft` from the gate's perspective — proofs must then be signed binding the adapter's address; document at adapter-construction time (V3 §1.4 shim, out of scope here). |
| Gate splits proof-validity from caller context: proofs signed for NFT X cannot be verified by X's own admin directly | Intended — verification is meaningless without the NFT consuming the outputs; all NFT-side flows call from the NFT itself. |
| Keeper log scan window (2M blocks default) vs. actual chain block rate | If Galileo produces >2M blocks within `maxProofAgeSeconds` (7d), old-but-unsweepable-yet candidates are missed until their proof expires anyway; operators can raise `AXIOM_KEEPER_LOG_LOOKBACK_BLOCKS`. Fallback list still works. |
| `queryFilter` over a 2M-block range on a rate-limited public RPC | Wrapped in try/catch → env fallback; one failed scan only degrades to today's behavior, never blocks a sweep. |
| Event stream assumes single verifier instance | The keeper queries only `AXIOM_TEE_VERIFIER_ADDRESS`; verifier rotation (NFT `proposeVerifier`) requires updating the env var — same as the existing sweeper path. |
| Test-only CSE gotcha | Could bite future multi-warp tests; pinned in §4. |

## 7. Files changed (this lane)

- `apps/contracts/src/verifiers/AxiomTeeVerifier.sol` — gate + error, signer cap + error, NatSpecs (k-of-1 risk, `registeredSigner` semantics)
- `apps/contracts/src/verifiers/BaseVerifier.sol` — `ProofUsed` event + emission
- `apps/contracts/test/AxiomTeeVerifier.t.sol` — nft-binding migration + 8 new tests
- `apps/contracts/test/FuzzAxiomTeeVerifier.t.sol` — nft-binding migration (31 sites)
- `apps/contracts/test/AxiomAgentNFT.t.sol` — 1 direct-call migration
- `apps/backend/src/keepers/index.ts` — log-derived candidates + fallback, `fetchProofUsedNonces`, `verifierRaw` seam
- `apps/backend/src/keepers/index.test.ts` — 6 new tests, provider stub gains `getBlockNumber`
- `packages/config/src/abis/teeVerifier.ts` — +1 ABI event entry (not a regen)
- `packages/config/src/env-schema.ts` — `AXIOM_KEEPER_LOG_LOOKBACK_BLOCKS` (optional)
- `docs/v3-proposals/waves/w1-b-verifier-hardening.md` — this file
