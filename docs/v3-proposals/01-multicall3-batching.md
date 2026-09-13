# Axiom Protocol V3 — Multicall3 / Batching / Cross-Txn Security Report

**Agent ID:** 01a054c1-ba46-78e2-abb1-30dc30427f7b
**Date:** 2026-08-30
**Scope:** Multicall3 + batch transactions + cross-txn state-aware security (V3 proposal lane)
**Target:** Axiom Protocol (ERC-7857 AI-agent marketplace on 0G Chain, Galileo testnet, chainId 16602)

## Summary

Canonical Multicall3 **is deployed on 0G Galileo (16602)** — I verified live bytecode at the standard CREATE2 address `0xcA11bde05977b3631167028862bE2a173976CA11` via `eth_getCode` against `https://evmrpc-testnet.0g.ai` (`eth_chainId` → `0x40da` = 16602). However, stock Multicall3 is **unusable for Axiom's write flows as-is**, because every value-bearing entry point authorizes on `msg.sender` (`AxiomPaymentProcessor.sol:311,321,339`; `AxiomStrategyVault.sol:56-59`), which would be the Multicall3 contract, not the user. My recommendation: use canonical Multicall3 for read/view aggregation, an internal `multicall(bytes[])` on the two state-heavy contracts (NFT, Processor) for same-contract batches, and a thin stateless `AxiomBatchRouter` for the two cross-contract value flows (mint+pay, iTransfer+pay) — with `nonReentrant` leaf-guards preserved by dispatching multicall sub-calls to **internal, unguarded core functions** (details in §3). Separately, this review found one HIGH-severity cross-txn griefing vector: the permissionless, state-mutating `verifyTransferValidity` lets anyone burn a victim's proof nonce (§5, F-1).

---

## Area 1 — Multicall3 Integration Options

First, a grounding fact that shapes everything: Multicall3 executes every sub-call with `msg.sender == 0xcA11bde…CA11`. Today, that breaks:

- `payForAgent` (`AxiomPaymentProcessor.sol:311`) — `_paySplit(msg.sender, …)` pulls tokens *from* `msg.sender` (line 276: `token.safeTransferFrom(payer, …)`), so tokens would be pulled from Multicall3's (empty) balance.
- `payComputeProvider` / `payForAgentAndCompute` (`AxiomPaymentProcessor.sol:321-328, 336-347`) — same `msg.sender` pull pattern.
- All Vault functions — `onlyTokenOwner` (`AxiomStrategyVault.sol:56-59`) compares `nft.ownerOf(tokenId) != msg.sender`.
- `mint` / `update` / `iTransfer*` on the NFT — owner/authorizer checks against `msg.sender` (`AxiomAgentNFT.sol:311, 328-339`; `ERC7857Upgradeable.sol:148-152`).

### Options table

| Option | What | Pros | Cons | Gas delta | Risk |
| --- | --- | --- | --- | --- | --- |
| **(a) Canonical Multicall3 (deployed)** | Use `0xcA11…CA11` `aggregate3` / `aggregate3Value` directly | Zero deploy cost; standard tooling (viem/wagmi `writeContractMultiCall`); no new audit surface of ours; verified present on 16602 | **Breaks `msg.sender` authorization on every Axiom write** (evidence above); `aggregate3Value` does **not refund surplus value** (exact-value discipline or funds stuck in Multicall3); cannot do per-call postcondition assertions; one bad sub-call with `allowFailure=true` silently degrades batch semantics | ~3–5k overhead + ~0.5–1k/call; saves ~21k base tx + calldata per merged tx | **HIGH if adopted for writes without contract changes**; LOW for read aggregation |
| **(b) Internal `multicall(bytes[])` on Axiom contracts** | OZ-style self-multicall added to `AxiomAgentNFT` + `AxiomPaymentProcessor` (and optionally Vault — but see §5, Vault is non-upgradeable, so this requires a V3 Vault redeploy or leaving Vault out) | Preserves `msg.sender` (auth works unchanged); no new trust root; per-contract, composable with per-leaf guards if dispatched to internal cores; no storage growth (multicall is stateless) | Cannot span contracts (mint+pay crosses NFT→Processor); **must not itself be `nonReentrant` if leaves are** — OZ's `ReentrancyGuard` is contract-wide (single slot), so a nonReentrant multicall calling `mint()` (`AxiomAgentNFT.sol:328`, nonReentrant) or `payForAgent` (`AxiomPaymentProcessor.sol:311`, nonReentrant) via self-call reverts; payable-value splitting per sub-call adds complexity | ~1–2k per sub-call dispatch (low-level `call` + selector decode); saves full 21k base + fixed per-tx overhead per merged tx | MEDIUM — reentrancy/composability subtleties (§3); LOW storage risk |
| **(c) Dedicated `AxiomBatchRouter`** | New stateless (or 1-var) contract: `batch(Call[] calls, uint256 deadline, bytes32 batchId)` with explicit `payer`/`caller` threading, per-call postcondition assertions, and per-batch allowance scoping | Spans contracts (the only option that makes mint+pay / iTransfer+pay 1-txn); can enforce cross-call assertions (balance/price guards between sub-calls); explicit `payer` param fixes the `msg.sender` attribution problem for good; `batchId` improves indexer/off-chain reconciliation; stateless → zero upgrade-layout impact | New audited surface holding (transient) token allowances — **must be per-batch exact approvals or Permit2, never infinite** (§3.6); one more address to wire into `Deploy.s.sol` + 5 env surfaces (per `docs/adr/004-contract-rewrite-plan.md` §3.4); adds ~4–6k router dispatch overhead/call | ~4–6k overhead/call; saves 21k base + calldata per merged tx | MEDIUM — allowance custody is the main risk, mitigable to LOW |
| **(b+c) Hybrid (recommended)** | Multicall3 for views; internal multicall on NFT/Processor for same-contract batches; Router only for the 2 cross-contract value flows | Each tool where it's strongest; minimal new trust surface; no forced Vault changes | Two batching patterns for integrators to learn | net negative vs. status quo | LOW–MEDIUM |

**Also verified:** `docs/adr/004-contract-rewrite-plan.md:95-96` shows precedent for in-suite cross-contract merging without a router — `transferAndCleanExpiredProofs` (`AxiomAgentNFT.sol:289-300`) already calls `verifier().cleanExpiredProofs(...)` from the NFT in one tx. So option (c) is an evolution of an existing pattern, not a new architecture.

---

## Area 2 — Flows That Become 1-Txn (exact before/after)

| # | Flow | Today (exact call sequence) | After (with recommended hybrid) | Txns |
| --- | --- | --- | --- | --- |
| 1 | **Mint with pay** | ① `AxiomAgentNFT.mint(iDatas, to)` with native fee (`AxiomAgentNFT.sol:328-339`, native — no approval needed) → ② `mockUSDC.approve(processor, amt)` → ③ `payForAgent(tokenId, amt)` | **1 tx:** `AxiomBatchRouter.mintAndPay(iDatas, to, agentTokenIdPredicted?, payAmount)` — router calls `mint` (fee via forwarded value), then `_paySplit`-style pull against per-batch router allowance. *Note:* `mint` returns `tokenId`, so the router can chain it — this requires the router (or a Processor helper) to consume the return value; `payForAgent`'s public API can't be called with a not-yet-known id, so add `payForAgentMinted(tokenId, amount)` internal or have the router do `mint` → read return → `processor.payForAgent(newId, amt)` in-frame | 3 → 1 |
| 2 | **Deposit + strategy + withdraw** | **Already 1 tx**: `depositSetStrategyAndWithdraw` (`AxiomStrategyVault.sol:149-176`) | No change — V2 already merged it. Optional: batch *multi-token* vault ops via NFT-side multicall once Vault exposes non-guarded cores (V3 Vault redeploy only) | 1 → 1 (already done) |
| 3 | **TEE-verify + fee-pay (buy agent)** | ① `mockUSDC.approve` → ② `iTransferFrom(from, to, tokenId, proofs)` (verifier leg inside: `ERC7857Upgradeable.sol:104`) → ③ `payForAgent(tokenId, amt)` | **1 tx:** Router `buyAgent(from, to, tokenId, proofs, payAmount)`: exact per-batch allowance → `iTransferFrom` → assert `nft.ownerOf(tokenId) == to` (postcondition, §3.1) → `payForAgent`. Optionally extend `transferAndCleanExpiredProofs` pattern with a `transferAndPay` on the NFT if you want to avoid the router for this flow (NFT→Processor call, mirroring `AxiomAgentNFT.sol:299`) | 3 → 1 |
| 4 | **iTransfer + fee settle** | Same as #3 minus buyer-side variant (`iTransfer` self-transfer, `ERC7857Upgradeable.sol:181-186`) | Same as #3 | 3 → 1 |
| 5 | **Pay + compute** | **Already 1 tx**: `payForAgentAndCompute` (`AxiomPaymentProcessor.sol:336-347`) — but requires a prior `approve` tx | 1 tx with Permit2 or per-batch router allowance (approval amortized to 1-per-N-batches instead of 1-per-pay) | 2 → 1 (approval amortized) |
| 6 | **Royalty set + first payment** | ① `setRoyaltyBps` (`AxiomPaymentProcessor.sol:179-182`) ② `approve` ③ `payForAgent` | 1 tx via Processor internal `multicall` (same contract) | 3 → 1 |
| 7 | **Proof cleanup** | **Already mergeable**: `transferAndCleanExpiredProofs` (`AxiomAgentNFT.sol:289-300`) | Unchanged | 2 → 1 (done) |
| 8 | **Governance ops** (propose+execute can't merge — 1-day delay by design, `TimelockManager.sol:12`) | n/a | Deliberately **not** batchable; see §3.5 | — |

Rough gas deltas (Galileo ≈ generic EVM arithmetic): each eliminated tx saves ~21,000 base + ~16k nonce/signature overhead + calldata; per-batch router overhead ~4–6k/call. Net saving per merged 3→1 flow ≈ **35–50k gas**, before UX/relayer savings (1 RPC round-trip, atomic rollback — a reverted leg rolls back the whole batch, which is also a safety *win*: no half-paid/half-transferred states).

---

## Area 3 — Cross-Txn State-Aware Security Design

### §3.1 Per-call postcondition assertions (router-only)

Between sub-calls, the router asserts expected state: after `iTransferFrom` → `require(nft.ownerOf(tokenId) == to)`; after `payForAgent` → `require(processor.agentEarningsOf(creator) >= pre + expectedCreatorCut)` using `royaltyBpsOf`/`protocolFeeBps` (`AxiomPaymentProcessor.sol:244-256`) to recompute the split independently. This catches a compromised/mismatched processor or a token that changed hands mid-batch. Cost ~2k/assertion (SLOAD + compare).

### §3.2 Slippage/price guards

`payForAgent` has no price oracle (payer picks `amount`), so slippage doesn't apply there. Where it *does*: batch flows involving `mintFee` — read `mintFee()` (`AxiomAgentNFT.sol:187-189`) at quote time and assert `mintFee() <= quotedFee` in-batch (admin fee raises can't make the batch overpay; underpay reverts naturally at `AxiomAgentNFT.sol:332`). For the Vault: `strategyOf(...)` pre/post assertions that `dailySpent` moved exactly by `value` (guards against a strategy leaf spending more than quoted).

### §3.3 Nonce/expiry semantics

Batch level: `deadline` (block.timestamp check at router entry, not per-call — per-call deadlines would let a partial batch linger); `batchId = keccak256(user, deadline, calls)` used **only for indexing/reconciliation, not replay-blocking** — on-chain replay protection is already correctly carried by the existing one-shot primitives: proof nonces (`BaseVerifier.sol:14-24`), `usedActions` (`AxiomStrategyVault.sol:45, 216-218`), and earnings accounting. Do **not** add a batch-nonce registry: it adds storage and the leaves are already idempotent.

### §3.4 Reentrancy interactions with multicall loops

The critical subtlety: OZ `ReentrancyGuard` is a single contract-wide slot. Today's leaves are `nonReentrant` (`AxiomAgentNFT.sol:328, 344, 350`; `AxiomPaymentProcessor.sol:311, 321, 336, 349`; `AxiomStrategyVault.sol:87, 190`). Therefore:

- An internal `multicall` that is itself `nonReentrant` **cannot dispatch to these leaves** via self-call (the guard is already held → `ReentrancyGuardReentrantCall`).
- Correct pattern: refactor each guarded leaf into `external guardedWrapper → internal unguardedCore`, and have `multicall` dispatch to the **cores**. The external wrapper keeps its guard for direct callers; the multicall provides the whole-batch lock instead.
- Re-entry during value callbacks (`_refundExcess` raw call, `AxiomAgentNFT.sol:336-343`; vault payout `call{value:…}`, `AxiomStrategyVault.sol:97, 173`): with the multicall holding a whole-batch lock, a re-entrant caller hits the lock — safe. This is why the router/multicall should carry the batch-level `nonReentrant` and the cores must not.

### §3.5 What must remain unbatchable

Never batch across the 1-day timelocks (`TimelockManager.sol:12` — `propose`/`execute` are intentionally time-separated; a batch that "merges" them would defeat ADR-004 §1.1). Never batch `pause`-sensitive admin ops with user ops. Keep `executeUpgrade`'s self-call constraint (`AxiomAgentNFT.sol:263-269` comment) out of any router path.

### §3.6 Aggregated approvals vs. per-batch scoping (the big one)

Infinite USDC approval to a router = a router bug/compromise drains every user. Required mitigations, in order of preference:

- **Permit2** (allowance with per-use expiry) if 0G tooling permits;
- else **exact-amount approval per batch** (user approves exactly `payAmount`, router consumes it, `assert token.allowance(router) == 0` post-batch);
- router must be **stateless** (no token balances held across txs; `receive`-less; sweep-any-residual function only for dust).

Never expose a `sweep(token)` that can move user-approved funds — sweep only `balanceOf(router)` deltas with a 0-expected-balance invariant.

---

## Area 4 — Storage / Upgrade Implications

- **AgentNFT**: gap is currently `uint256[44]` (`AxiomAgentNFT.sol:62`) — 44 free slots. An internal `multicall` adds **zero** storage. If you add a trusted-router address (e.g., `address batchRouter` for a future `transferAndPay` on the NFT), it consumes 1 gap slot using the exact V2 append-in-gap discipline documented at `AxiomAgentNFT.sol:59-62`. Verify with `forge inspect AxiomAgentNFT storage-layout` against `artifacts/storage-layout/AxiomAgentNFT.json` (procedure per `docs/adr/004-contract-rewrite-plan.md` §4).
- **PaymentProcessor**: gap `uint256[48]` (`AxiomPaymentProcessor.sol:69`), same discipline — V2 already appended `maxPayCap` at the gap tail (lines 66-68), so the append pattern is proven on this contract.
- **ERC-7201 namespaces**: all Axiom state sits in fixed custom slots (`AxiomAgentNFT.sol:74`; `AxiomPaymentProcessor.sol:72`; `ERC7857Upgradeable.sol:31`), so a *separate* router contract touches none of them. A stateless router has no layout at all — **this is the strongest argument for option (c) over stuffing batch state into the upgradable contracts**.
- **Vault**: non-upgradeable by design (ADR-004 §1.3, "the trust model IS the design"). Any Vault batching change means a fresh Vault deploy + `nft` rewiring (`AxiomStrategyVault.sol:65-69`) — weigh against the fact that its 3-txn flow is **already merged** (§2 row 2). Recommend: don't touch Vault in V3.
- **Verifier**: keep `cleanExpiredProofs` out of batch scope per ADR-004 §2.2 ("batching belongs to the keeper job config, not a new contract function") — though note `transferAndCleanExpiredProofs` already legitimately folds it into transfers.

---

## Area 5 — V2 Critique (severity-ranked, file+line evidence)

**No CRITICAL findings.** Ledger claim in ADR-004 §0 ("all CRITICAL/HIGH ledger rows fixed or dispositioned") holds for fund-loss vectors; the HIGH below is a griefing/availability issue.

| Sev | Finding | Evidence | Concrete fix |
| --- | --- | --- | --- |
| **HIGH** | **Permissionless state-mutating `verifyTransferValidity` enables proof-nonce burning (front-run griefing / DoS on transfers).** The function is `external override` with no caller restriction and marks the nonce used (`_checkAndMarkProof`, `BaseVerifier.sol:14-24`) *before any transfer occurs*. Anyone who observes an in-flight `iTransferFrom` in the mempool (or obtains the relayed proof payload) can call the verifier directly with the same proofs; the nonce burns, and the genuine transfer then reverts at `BaseVerifier.sol:20` (`ProofAlreadyUsed`), forcing fresh TEE proofs. Related: if the NFT's post-verify checks fail (e.g., `ERC7857DataHashMismatch`, `ERC7857Upgradeable.sol:117-119`), the nonce is already burned — a failed transfer wastes the whole proof set. | `AxiomTeeVerifier.sol:168-190` (no access control); `BaseVerifier.sol:18-22` (marks used); `ERC7857Upgradeable.sol:104` (NFT is the only legitimate consumer) | (1) Restrict: `if (msg.sender != nft) revert UnauthorizedVerifierCaller();` — the `nft` param already flows in (`:173`); the NFT is the sole consumer of outputs. For e2e back-compat, gate behind an admin-settable `publicVerify` flag default-off at V3 deploy. (2) Optionally split verify into read-only `previewValidity` + `consumeProofs` called by the NFT after its own checks, eliminating burned-nonces-on-failed-transfer. Effort: low; impact: removes transfer-DoS class + proof waste. |
| **HIGH→MEDIUM** | **MAX_PAY cap is advertised as a chain invariant on "both pay lanes" but the compute lane bypasses it.** Comment at `AxiomPaymentProcessor.sol:159-160` says the cap is "enforced on both pay lanes"; `setMaxPayCap` doc (`:164-165`) repeats it. But `payComputeProvider` (`:321-328`) and the `computeAmount` leg of `payForAgentAndCompute` (`:340-345`) do raw `safeTransferFrom(msg.sender, provider, amount)` with no cap check — only `_paySplit` (`:269`) enforces it. Funds are the payer's own, so not directly exploitable, but the documented M8 invariant is false and any backend/FE that trusts the on-chain cap for the compute lane is miscalibrated. | `AxiomPaymentProcessor.sol:159-160, 269, 321-328, 336-347` | Either enforce `maxPayCap` on `computeAmount` too, or amend the doc to "agent-pay lane only." Given M8's root cause was "no on-chain bound" (ADR-004 §1.2), enforce it: 3 lines. |
| **MEDIUM** | **Creator routing is permanent and decoupled from ownership with no buyer-facing signal.** `creators[tokenId]` is set at mint and never updated on transfer (only mint paths write it, `AxiomAgentNFT.sol:338, 367-371`); `_paySplit` always credits the original creator (`AxiomPaymentProcessor.sol:276-278`). A buyer who pays `payForAgent` post-purchase directs 100% of `agentAmount` to the seller — correct royalty design, but there is no event/view making the split discoverable pre-pay beyond `creatorOf`. Additionally, `mintWithRole(iDatas, to, creator=0)` skips `creators[tokenId]` (`AxiomAgentNFT.sol:367-369`) → such tokens permanently revert `AgentCreatorNotRegistered` in `_paySplit` (`AxiomPaymentProcessor.sol:276-277`). | `AxiomAgentNFT.sol:367-371`; `AxiomPaymentProcessor.sol:276-278` | (a) Forbid `creator == address(0)` in `_mintWithRole` (default to `to`, matching the 2-arg overload's intent at `:346-349`); (b) emit creator+split info in `PaymentProcessed` (already does, `:308`) and surface `creatorOf` in FE pay confirmation. Effort: trivial; impact: removes a permanent dead-token class. |
| **MEDIUM** | **Vault `execute` is permissionless — anyone can front-run the owner's action execution.** Comment acknowledges it (`AxiomStrategyVault.sol:184-185` "Permissionless — use private relays when ordering matters (MEV)"). One-shot leaves prevent double-execution (`:216-218`), so the impact is timing/MEV hijack of agent actions, not theft — but for an agent-execution rails contract, letting arbitrary parties trigger a strategy action (and pay its gas) is an attack surface the strategyRoot holder didn't opt into. | `AxiomStrategyVault.sol:183-232` | Add `if (msg.sender != nft.ownerOf(tokenId) && nft.getDelegateAccess(owner) != msg.sender) revert NotTokenOwner();` — reusing the existing `delegateAccess` infra (`ERC7857Upgradeable.sol:71-78`) gives "owner or authorized assistant" semantics for free. Requires V3 Vault redeploy (non-upgradeable), so bundle with any other Vault change or accept the documented risk. |
| **MEDIUM** | **`setStrategy` / merged deposits reset `dailySpent` to 0, defeating the daily limit at will.** Every strategy set zeroes `dailySpent` (`AxiomStrategyVault.sol:113-118, 130-140, 160-166`). Owner-controlled (principal can always reset their own cap), so not theft — but it invalidates the daily limit as an *invariant* that the TS `strategyGuard` mirror (ADR-004 §1.3) can rely on: a "limit 1 OG/day" shown in UI is unenforceable the moment the owner refreshes the strategy. | `AxiomStrategyVault.sol:113-118, 160-166` | If the limit is meant to bound the *strategy* between owner reviews, don't reset `dailySpent` on re-set of the same root; only reset when the root changes. One-line change in the V3 Vault. |
| **LOW** | **Vault `withdraw` lacks `whenNotPaused` while every other entry point has it.** `deposit` (`:78`), `setStrategy` (`:109`), `execute` (`:190`), and both merged functions (`:125, 150`) carry `whenNotPaused`; plain `withdraw` (`:86-98`) does not. Allowing exit during pause is arguably the *correct* choice (pause must not trap user funds) — but it is undocumented and looks like an omission. | `AxiomStrategyVault.sol:86-98` vs `:78` | Keep behavior; add a comment: "withdraw intentionally exempt from pause — exit valve." If it *is* an omission, note that adding the modifier would create a fund-trap scenario. |
| **LOW** | **`withdrawMintFees` revert stub keeps a dead selector that backend callers will hit at runtime.** The function exists only to revert (`AxiomAgentNFT.sol:385-393`) "so the deployed ABI keeps its selector for backend callers" — callers get `UseTimelockedFeeWithdrawal` instead of a compile-time signal. | `AxiomAgentNFT.sol:385-393` | Remove the selector in V3 and update backend callers in the same commit (ADR-004 §3.5 ABI-regen procedure); keeping revert-stubs past one release cycle converts a migration aid into a permanent trap. |
| **LOW** | **`_refundExcess` raw call can DoS mint for contract callers with failing `receive`.** `AxiomAgentNFT.sol:336-343` sends surplus native via `call` and `require(ok)`. Self-inflicted only (attacker hurts themselves), but using per-call `value`-exact mint quotes in the batch router (§3.2) makes this path rare anyway. | `AxiomAgentNFT.sol:336-343` | Optional: suppress revert on failed refund and credit a pull-based surplus mapping — not worth the storage on testnet; document instead. |
| **LOW** | **Signer allowlist can grow unbounded** (`executeSigner` pushes without cap, `AxiomTeeVerifier.sol:90-98`) and `registeredSigner()` hard-depends on `_signers[0]` surviving revocations (the swap-and-pop at `:108-116` maintains this, but the invariant is subtle). | `AxiomTeeVerifier.sol:90-116` | Cap allowlist size (e.g., 5) in V3; keep the swap-and-pop invariant comment pinned. |
| **INFO** | **`payForAgent`-style `msg.sender`-as-payer is the single biggest blocker to any external batching** — see §1. Threading an explicit `payer` parameter (validated via a signature or `tx.origin == msg.sender` free-call pattern avoided) through `_paySplit` would future-proof all lanes regardless of which batching option is chosen. | `AxiomPaymentProcessor.sol:268-278, 311, 321, 336` | In V3, make `_paySplit(payer, …)` the only pull path and add `payForAgentFor(payer, tokenId, amount)` callable only by a trusted router/relayer, or adopt Permit2. |

---

## Recommended Combination

**Multicall3 (canonical, deployed) for all read aggregation + internal `multicall(bytes[])` on `AxiomAgentNFT` and `AxiomPaymentProcessor` (dispatching to refactored internal cores, whole-batch `nonReentrant` on the multicall entry) + a stateless `AxiomBatchRouter` for exactly two flows: `mintAndPay` and `buyAgent` (iTransfer+pay), with per-batch exact allowances, batch `deadline`, and postcondition assertions (`ownerOf`, earnings delta, allowance-zero).** Leave `AxiomStrategyVault` untouched (its flow is already merged; non-upgradeable trust model preserved per ADR-004 §1.3).

Rationale: (1) it's the only combination that achieves all four 1-txn flows while preserving `msg.sender` semantics where they already work; (2) zero storage-layout impact (router stateless; multicall stateless), so UUPS upgrade-in-place for NFT/Processor stays trivially safe with 44/48 gap slots intact; (3) allowance risk is contained to two flows and two contracts instead of everything; (4) highest-severity finding (F-1) should ship in the same V3 wave since it's a one-line gate on the verifier — batching multiplies proof-visibility surface (batched calldata bundles proofs for multiple transfers in one tx, making mempool nonce-burning more attractive), so fixing the verifier gate is a prerequisite for the `buyAgent` batch flow.

## Trade-offs

| Option | Pros | Cons |
| --- | --- | --- |
| Canonical Multicall3 (a) | Free, standard, verified on 16602 | Broken auth for writes; no assertions; surplus-value trap |
| Internal multicall (b) | No new trust root; keeps guards per-leaf; no storage | Single-contract only; requires leaf→core refactor; guard subtleties |
| BatchRouter (c) | Cross-contract; assertions; explicit payer; stateless | New audited surface; allowance custody; extra deploy wiring |
| Do nothing (status quo) | Zero new risk | 3-txn user flows persist; approval-per-pay UX; no atomic rollback of pay/transfer combos |

## References

- `apps/contracts/src/AxiomPaymentProcessor.sol:268-308` — `_paySplit`, cap enforcement, msg.sender-as-payer
- `apps/contracts/src/AxiomPaymentProcessor.sol:159-160, 321-347` — cap-not-enforced-on-compute-lane evidence
- `apps/contracts/src/AxiomAgentNFT.sol:59-62` — 44-slot gap + V2 append discipline; `:289-300` — cross-contract merge precedent; `:328-343` — mint + refund; `:385-393` — revert stub
- `apps/contracts/src/AxiomStrategyVault.sol:56-59, 86-98, 113-118, 149-176, 183-232` — owner gate, withdraw-no-pause, dailySpent reset, merged deposit flow, permissionless execute
- `apps/contracts/src/verifiers/AxiomTeeVerifier.sol:168-190` + `apps/contracts/src/verifiers/BaseVerifier.sol:14-24` — permissionless nonce-burning vector (F-1)
- `apps/contracts/src/ERC7857Upgradeable.sol:104, 117-119, 148-159, 71-78` — verifier call site, post-verify check failures, iTransfer depth gate, delegateAccess
- `apps/contracts/src/libraries/TimelockManager.sol:12` — 1-day delay that must stay unbatchable
- `docs/adr/004-contract-rewrite-plan.md` §1.3, §2.2, §3.4-3.5, §4 — Vault non-upgradability, keeper batching decision, deploy/ABI cutover procedure, storage-layout diff requirement
- Live RPC check: `eth_getCode(0xcA11bde05977b3631167028862bE2a173976CA11)` returns bytecode on chainId 16602 (`https://evmrpc-testnet.0g.ai`) — recommend recording the Multicall3 initcode hash in the next deployment JSON to pin provenance, since I verified bytecode *presence*, not CREATE2 provenance.
