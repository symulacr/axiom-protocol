# V3 Proposal: Permit2 Gasless Approvals + Paymaster/AA + Delegated Execution

**Agent ID:** 01a054c1-ba46-78e2-abb1-30ef327aaf0d
**Date:** 2026-08-30
**Scope:** Axiom Protocol V3 (ERC-7857 AI-agent marketplace, 0G Chain Galileo testnet, chainId 16602, USDC-style ERC-20 payments)
**Lane:** Gasless approvals (EIP-2612 / Permit2 / Permit3) + paymaster & account abstraction (ERC-4337 v0.8, ERC-2771) + delegated transactions (ERC-7857 delegateAccess extension)

> UPDATE 2026-08-31 (live-chain audit): **EntryPoint v0.7 is deployed on Galileo 16602** at `0x0000000071727De22E5E9d8BAf0edAC6f37da032` (bytecode verified); no v0.8/v0.9 singleton exists there yet. Permit2 (canonical) and Multicall3 (`0xcA11…CA11`) are also live; Permit3 is absent. Phase-2 paymaster work should target **v0.7 semantics** (ABI-compatible with v0.8 forwarders); EIP-7702 remains unavailable (0G pins `evm_version = cancun`).

---

## Summary

V2 is approve+pay with two txs per payment, native-only mint/vault funding, zero gas abstraction, and a delegation surface (`delegateAccess`, `authorizeUsage`) that grants access but not *execution*. I recommend **Permit2 as the universal approval layer + an EIP-712 delegation registry (ERC-7857-native) + a phased gas path (ERC-2771 relayer now, ERC-4337 v0.8 paymaster later)**, composed into a single-signature `onboardAgent` flow. One hard prerequisite finding: the MAX_PAY cap is only enforced on the split lane, so it must be closed before any signature-based spend primitive ships.

## Analysis

### Grounding facts that constrain this design

| Fact | Evidence | Consequence for V3 |
| --- | --- | --- |
| Payment token is a plain ERC-20, **no permit** | `apps/contracts/src/mocks/AxiomMockUSDC.sol:7` (`contract AxiomMockUSDC is ERC20`), no `ERC20Permit` import; comment at :6 "no canonical USDC.e on testnet" | EIP-2612 alone cannot be the universal answer; production USDC-style token may or may not support permit per chain |
| All pay lanes pull from `msg.sender` after external approval | `AxiomPaymentProcessor.sol:279` (`safeTransferFrom(payer, ...)` inside `_paySplit`), `:322-328` (`payComputeProvider`), `:331-345` (`payForAgentAndCompute`) | Every lane needs an approve tx first — the two-tx UX problem is structural |
| MAX_PAY cap enforced **only** in `_paySplit` | `AxiomPaymentProcessor.sol:270-272`; `payComputeProvider`/`payForAgentAndCompute` compute legs never call it | Cap bypass exists today; becomes CRITICAL once signatures can authorize spend |
| Mint fee and vault deposits are **native-only** | `AxiomAgentNFT.sol:328-339` (`msg.value >= fee`), `AxiomStrategyVault.sol:76-81` (`deposit` is `payable`, `receive()` reverts :73-75) | Permit applies to the *payment* lane only; "mint+deposit in 1 signature" needs either a stable-denominated mint path or a paymaster, not permit alone |
| Delegation today is access-only, static, unexpiring | `ERC7857Upgradeable.sol:69-77` (`delegateAccess` — no expiry, reverts on zero so no unset), `ERC7857AuthorizeUpgradeable.sol:76-86` (`authorizeUsage` — no spend cap, no expiry, cleared only on transfer :115-120) | V3 must add an execution delegation layer, not just extend these |
| Keeper is infra-EOA-based, batch ceiling 256 | `apps/backend/src/keepers/index.ts:50` (`CONTRACT_BATCH_MAX = 256`), `:80-88` (gas cap via `AXIOM_KEEPER_GAS_CAP_GWEI`), `:110-152` (`sweepOnce` direct wallet send) | Keeper ticks should stay direct-EOA; no paymaster needed for them |
| TEE verifier already has an EIP-712 pattern to reuse | `AxiomTeeVerifier.sol:45-55` (typehashes), `:145-158` (`_recoverSigner`), `:240-243` (allowlist check), `:262-275` (nonce marking) | The agent's execution delegation can mirror this two-leg proof scheme |
| Vault `execute()` is Merkle-gated, permissionless, one-shot | `AxiomStrategyVault.sol:190-235` (root check :196-198, daily limit :210-213, `usedActions` :219-221) | Agent delegated calls should target the vault's `execute()`, inheriting its limits rather than bypassing them |

---

## 1. Gasless Approvals — Options

| | A: EIP-2612 Permit on token | B: Uniswap Permit2 | C: Permit3 (cross-chain allowance trees) |
| --- | --- | --- | --- |
| Token changes | Yes — must add `ERC20Permit` to production token + mock (`AxiomMockUSDC.sol` is bare `ERC20`) | **No — works with any ERC-20** (one-time approve to canonical Permit2) | No |
| Universality | Only permit-capable tokens (USDC native has it; AxiomMockUSDC doesn't; other chains' USDC variants vary) | Any token, any spender, batched allowance sets, expiries | Any token, but needs hub+spoke deployment per chain |
| Cross-chain | No | No | Yes — 1 sig grants allowances across chains via hash-chained tree |
| Marketplace fit (seller+treasury+earnings in 1 call) | Good, but only for that one token | **Best**: `permit` + `permitTransferFrom` + batch in one calldata blob | Best only if Axiom goes multi-chain (0G multi-domain) |
| Maturity/risk | Battle-tested, OZ-native | Canonical immutable contract (`0x0000...78BA3`), widely audited, but an external trust anchor | Immature; needs cross-chain messaging reliability that Galileo doesn't guarantee |
| Verdict | Keep as fast-path when token supports it | **Primary** | Defer — revisit at Aristotle mainnet / multi-chain |

**Why B fits a marketplace paying sellers+treasury+agent-earnings:** Permit2's `permitBatch` + `transferFrom` lets one signature authorize exactly the amounts the split needs, with per-permit deadline and nonce — a stricter grant than a blanket ERC-20 allowance. `_paySplit` (`AxiomPaymentProcessor.sol:260-309`) already takes `payer` as a parameter, so it is Permit2-shaped with zero internal refactor.

**Recommended merged signatures** (processor, UUPS storage-append compatible):

```solidity
/// Permit2 single: PermitTransferFrom{permitted:{token,amount}, spender=processor, nonce, deadline}
function payForAgentWithPermit2(
    uint256 agentTokenId,
    uint256 amount,
    uint256 nonce,
    uint256 deadline,
    bytes calldata signature
) external nonReentrant whenNotPaused; // Permit2.permit(sig) + Permit2.transferFrom(owner,msg.sender,amount) then _paySplit(owner, agentTokenId, amount)

/// Batch: one sig covers agent payment + compute leg (replaces payForAgentAndCompute approve+pay)
function payForAgentAndComputeWithPermit2(
    uint256 agentTokenId,
    address provider,
    uint256 agentAmount,
    uint256 computeAmount,
    ISignatureTransfer.PermitTransferFrom[] calldata permits, // 2 entries
    bytes[] calldata signatures
) external nonReentrant whenNotPaused;

/// Creator earnings payout with permit (creator is msg.sender — permit is for the token they then grant)
/// Note: withdrawAgentEarnings (AxiomPaymentProcessor.sol:349-357) already pulls; a Permit2 variant is only
/// needed if you later add push-payouts.
```

Vault needs an ERC-20 asset lane first (ADR-004 §1.3 already gates this as optional), then:

```solidity
// AxiomStrategyVault (non-upgradeable — this ships in the V3 redeploy, like Vault did for V2)
function depositERC20WithPermit2(
    uint256 tokenId,
    address asset,
    uint256 amount,
    uint256 nonce,
    uint256 deadline,
    bytes calldata signature
) external whenNotPaused onlyTokenOwner(tokenId);
```

And to make "mint+deposit" fully stablecoin-denominated (see §4):

```solidity
// AxiomAgentNFT — pays mintFee in paymentToken via Permit2 instead of msg.value
function mintWithStableWithPermit2(
    IntelligentData[] calldata iDatas,
    address to,
    uint256 nonce,
    uint256 deadline,
    bytes calldata signature
) external whenNotPaused nonReentrant returns (uint256 tokenId);
```

---

## 2. Paymaster / Gas Abstraction on 0G Chain

| | A: ERC-4337 EntryPoint v0.8 (bundler + paymaster) | B: Backend relayer + ERC-2771 forwarder | C: EIP-7702 delegator / hybrid relay |
| --- | --- | --- | --- |
| Feasibility on Galileo (16602) | Works on any EVM-equivalent chain, but requires operating a bundler + funding paymaster staked deposits in native; node must serve standard `eth_*` (Galileo is geth-derived — likely fine, **must be verified empirically; I could not verify Galileo's mempool/debug API surface from this repo**) | Trivially feasible — it's just your existing backend wallet pattern (keepers/index.ts already runs a funded signer EOA at :110-115) | Depends on 0G's hardfork including Pectra — **unverifiable from repo; treat as unknown** |
| Trust model | Decentralized-ish; paymaster policy on-chain | Centralized relayer; relayer can censor/reorder (mitigate: private-mempool note like `AxiomStrategyVault.sol:189`) | Per-tx EOA delegation; elegant but ecosystem-young |
| Fit with V2 contracts | Contracts need `_msgSender()` awareness only inside accounts; target contracts called from smart accounts work **as-is** | Requires retrofitting ERC-2771 context at every `msg.sender` site: `AxiomPaymentProcessor.sol:79-87` (`onlyAgentCreator`), `:313-319` (`payForAgent`), `AxiomAgentNFT.sol:311-315` (`update`), `ERC7857Upgradeable.sol:69-77` (`delegateAccess`) — a real surface change | Minimal contract change |
| Who it fits | Users who onboard gaslessly *and* agents that self-operate | Sponsorship of known flows (mint, pay) with off-chain quota | Transitional |
| Verdict | **Phase 2 target** (verifying paymaster validating TEE-signed ops reuses the AxiomTeeVerifier EIP-712 pattern) | **Phase 1 ship** | Watch-only |

**Sponsorship policy design (paymaster, phase 2):**

- **Per-user quota:** daily gas quota per userOp sender, mirroring the proven daily-rollover pattern (`AxiomStrategyVault.sol:37-41`: `dailySpent`/`resetDay`) — resetting at UTC day boundary, capping gas *spent* not tx count.
- **MAX_PAY analog:** `maxGasPerUserOp` admin cap, same posture as `setMaxPayCap` (`AxiomPaymentProcessor.sol:159-172`) but with a **non-zero floor** (see finding L2 — the 0-disables-cap footgun should not be repeated).
- **Allowlists:** per-target-selector allowlist (`AxiomAgentNFT.mint`, `AxiomPaymentProcessor.payForAgentWithPermit2`, `AxiomStrategyVault.deposit*`) — a paymaster must never sponsor arbitrary calldata.
- **Agent self-operation:** a **verifying paymaster**: the iNFT's TEE agent signs an EIP-712 `SponsorshipVoucher{agentTokenId, opHash, validUntil, nonce}`; the paymaster validates against a registry of agent-bound signing keys (same allowlist + revoke-immediately philosophy as `AxiomTeeVerifier.sol:100-116`) and charges the agent's on-chain gas escrow (vault balance) rather than the user.
- **Keeper ticks:** stay direct EOA (`keepers/index.ts:110-115`) — they are infra, already gas-capped at :132-142, and adding a paymaster would only add failure modes.

**Who pays what:**

| Actor | Phase 1 (relayer) | Phase 2 (4337) |
| --- | --- | --- |
| User mint | Relayer sponsors under per-user quota; user pays mintFee in native or stable (`mintWithStableWithPermit2`) | Paymaster sponsors; quota on-chain |
| Agent self-op (TEE agent calling its own tools) | Not supported (this is the delegation gap, §3) | Verifying paymaster, agent's vault-funded escrow |
| Keeper ticks | Backend EOA (unchanged) | Unchanged |

---

## 3. Delegated Execution

Current state: `delegateAccess` (`ERC7857Upgradeable.sol:69-77`) names one assistant per owner, never expires, cannot be unset (zero reverts :70-72), and only affects sealed-key delivery (`_proofCheck`, :112-121). `authorizeUsage` (`ERC7857AuthorizeUpgradeable.sol:76-86`) grants usage rights with no spend limit and no expiry. **Neither lets an agent execute a payment or a vault action.**

| | A: Axiom DelegationRegistry (EIP-712, ERC-7857-native) | B: ERC-4337 session keys | C: ERC-7579 modules |
| --- | --- | --- | --- |
| Works with EOA owners today | **Yes** | No — requires smart accounts | No — requires 7579 accounts |
| Spend limits | Per-delegate caps enforced by registry | In session-key validation | Module-enforced |
| Revocation | On-chain `revokeDelegation` + `expiresAt` | Account-internal | Module uninstall |
| Standard gravity | Custom (audit surface) | Standard, but couples you to 4337 rollout | Most flexible, heaviest |
| Verdict | **Ship now** | Adopt when 4337 ships (phase 2) — design A's struct to be portable | Defer |

**Concrete delegation struct + flow:**

```solidity
struct AgentDelegation {
    uint256 agentTokenId;
    address delegate;          // relayer or agent-controlled key
    uint256 perTxCap;          // MAX_PAY-analog, per delegated call
    uint256 windowCap;         // rolling/day cap — mirrors vault dailyLimit (AxiomStrategyVault.sol:210-213)
    uint64  windowSeconds;
    uint64  expiresAt;         // hard expiry — fixes the delegateAccess no-expiry gap
    bytes32 allowedSelectorsRoot; // optional Merkle of permitted (target,selector) pairs, same pattern as vault strategyRoot
    uint256 nonce;             // single-use; increments on install
}

// AxiomDelegationRegistry (or a Processor extension, storage-gap append)
function installDelegation(AgentDelegation calldata d, bytes calldata ownerSig) external; // EIP-712 digest over the struct, signer MUST be nft.ownerOf(d.agentTokenId)
function revokeDelegation(uint256 agentTokenId) external onlyTokenOwner(agentTokenId);    // immediate, like AxiomTeeVerifier.revokeSigner (:100-116)
function delegatedExecute(
    AgentDelegation calldata d,
    bytes[] calldata calls,      // each call validated: selector in root, value <= perTxCap, window accounting
    bytes calldata delegateSig   // proves delegate controls the call, binds opHash → nonce (replay protection)
) external payable returns (bytes[] memory);
```

**Validation flow:** (1) recompute EIP-712 digest (domain = registry address + chainId 16602, same shape as `AxiomTeeVerifier.sol:145-158`); (2) `ecrecover` → must equal `nft.ownerOf(tokenId)` **or** an address in `authorizedUsersOf(tokenId)` (reusing `ERC7857AuthorizeUpgradeable.sol:31-40` as the sub-delegation source); (3) `block.timestamp <= expiresAt`; (4) mark nonce used (bitmap or mapping, same as `_checkAndMarkProof`, `AxiomTeeVerifier.sol:262-275`); (5) per-call: selector-leaf Merkle verify + `perTxCap` + window accounting; (6) execute with `nonReentrant` + `whenNotPaused`, CEI ordering as in `AxiomStrategyVault.execute()` (:219-231).

**Replay protection:** per-delegation nonce consumed on first `delegatedExecute`; delegate signature binds `keccak256(calls, block.chainid, registry)` so a captured calldata+sig pair is unusable on reorg-free replay. Revocation flips a `revoked` flag checked before nonce consumption.

**vs 4337 session keys / 7579:** session keys enforce limits inside account validation — cleaner but presuppose accounts. Registry A is strictly additive to the current UUPS suite and composes with phase-2 accounts (a smart account can simply be `delegate`).

---

## 4. Composition — the 1-signature ideal

**Constraint discovered:** mint (`AxiomAgentNFT.sol:328-339`) and vault deposit (`AxiomStrategyVault.sol:76-81`) are native-payable. A permit signature cannot fund them. Therefore "mint + strategy deposit in 1 signature" requires **one of**: (a) `mintWithStableWithPermit2` + ERC-20 vault lane (stablecoin-denominated onboarding), or (b) a paymaster userOp carrying native value via `callGasLimit` + postOp.

**Final ideal flow (phase 2, 4337) — described:**

```text
User wallet (or TEE agent key)
  └─ signs ONE UserOperation:
       [ Paymaster validates: sender quota + selector allowlist + maxGasPerUserOp ]
       [ Account executes batch:
           1. AxiomAgentNFT.mintWithStableWithPermit2(iDatas, user, permitSig)   ← Permit2 sig
           2. AxiomStrategyVault.depositERC20WithPermit2(tokenId, USDC, amt, sig)
           3. AxiomStrategyVault.setStrategy(tokenId, root, dailyLimit, validUntil)
           4. AxiomDelegationRegistry.installDelegation(delegation, ownerSig)    ← pre-signed, same batch
       ]
Phase 1 (EOA, no accounts): the same 4 calls behind ONE ERC-2771 forwarder tx,
sponsored relayer-side, with the Permit2 + delegation signatures attached as calldata
→ user reaches "minted + funded + delegated" with 2 signatures total (permit + delegation),
   0 gas from the user.
```

Payments thereafter: buyer signs one Permit2 permit → `payForAgentWithPermit2` (or a delegated agent signs and a relayer submits under `delegatedExecute` with `perTxCap` ≤ `maxPayCap`). Keeper sweeps (`cleanExpiredProofs`) remain direct-EOA and unaffected.

## Root Cause

The V2 payment layer was designed around `msg.sender`-pulled ERC-20 approvals (`_paySplit` at `AxiomPaymentProcessor.sol:260-309` taking `payer` as a parameter was the right move — but no signature-based authorization was ever layered on top), while the delegation layer grants *access* but never *execution* (`ERC7857Upgradeable.sol:69-77`). V3 closes both gaps with one pattern: signatures authorize, caps bound, registry validates.

## Security Findings

| # | Severity | Finding | Evidence | Fix |
| --- | --- | --- | --- | --- |
| C1 | **CRITICAL** (pre-condition for V3) | MAX_PAY is a "chain-invariant per-pay upper bound" in name only — the compute legs of both non-split lanes bypass it entirely, so an uncapped transfer lane exists today. Once permits/delegation make spend *signature-authorized*, a phished signature drains via the uncapped lane. | `AxiomPaymentProcessor.sol:270-272` (cap in `_paySplit` only); `payComputeProvider` :322-328 and the compute leg of `payForAgentAndCompute` :340-343 never check `maxPayCap` | Route every token-moving lane through a single capped internal `_payTransferFrom(payer, to, amount)` that enforces `maxPayCap`; ship before any permit/delegation function |
| H1 | HIGH | `payForAgentAndCompute` compute leg enables royalty evasion: arbitrary `provider`, no relationship to the agent, so an operator can route ~100% of payment as "compute" and starve the creator split (agentAmount=1 wei). | `AxiomPaymentProcessor.sol:330-345` — no cap, no provider binding | Ratio bound (`computeAmount <= k × agentAmount`) or provider allowlist per agent |
| H2 | HIGH | `delegateAccess` never expires and cannot be unset (zero reverts), silently and indefinitely deciding who may receive sealed keys. | `ERC7857Upgradeable.sol:69-77` (zero check :70-72, mapping write :74-75); consumed at :112-121 | V3 registry: `expiresAt` + explicit revoke; keep delegateAccess for ERC-7857 compat but wrap with expiry |
| H3 | HIGH | `authorizeUsage` grants are perpetual (cleared only on transfer) with no spend limit — a granted "user" today becomes an unbounded delegate under V3 if reused as the delegation source. | `ERC7857AuthorizeUpgradeable.sol:76-86`, cleared only at :115-120 | Add expiry param; treat `authorizedUsers` as sub-delegators only under owner-signed caps |
| H4 | HIGH | No agent self-execution path at all: the TEE agent cannot pay its own compute (`payComputeProvider` requires the payer EOA's pre-approval, :322-328) — every agent action costs the human owner gas. | Whole-suite grep: no meta-tx/4337/forwarder code exists (`ERC2771\|4337\|forwarder` → 0 matches in apps/contracts/src) | §3 registry + §2 phase 2 verifying paymaster |
| M1 | MEDIUM | Vault is native-only while events advertise an `asset` param — permit-based funding is structurally impossible without the ERC-20 lane. | `AxiomStrategyVault.sol:30` (event w/ asset), :78/:88 hardcoded `address(0)` | Ship `depositERC20WithPermit2` in the V3 redeploy (Vault is non-upgradeable per ADR-004 §1.3 — needs fresh deploy, plan it) |
| M2 | MEDIUM | Retrofitted relaying breaks `msg.sender` checks unless every site is context-aware: `onlyAgentCreator` (:79-87), `payForAgent` (:313-319), `update` (`AxiomAgentNFT.sol:311-315`), `delegateAccess` (:69-77) | List as-is | Phase 1: ERC2771ContextUpgradeable on Processor+NFT with a trusted forwarder; enumerate and test every `msg.sender` |
| L1 | LOW | Keeper sweep candidate nonces are operator-supplied env config — no on-chain enumeration of used proofs, so sweep coverage is manual and can silently rot. | `apps/backend/src/keepers/index.ts:56-71` (comment: `usedProofs` internal, no event) | Emit a `ProofUsed`-style event in BaseVerifier; keeper derives candidates from logs |
| L2 | LOW | `maxPayCap = 0` disables the cap — a misconfiguration recreates C1's posture on the split lane. | `AxiomPaymentProcessor.sol:270-272`, setter :159-172 | Treat 0 as "unset ⇒ revert" or a very high default, never "unlimited" |
| L3 | LOW (known/ADR'd) | k-of-1 TEE signer allowlist: one compromised key forges all transfer proofs until revoke (revoke is immediate — mitigated). | `AxiomTeeVerifier.sol:41-47`, revoke :100-116 | Keep; the same revoke-immediately philosophy is reused in the V3 delegation registry |

## Recommendations (prioritized)

1. **Close the cap bypass (C1/H1) with a single capped internal pay-transfer** — small effort, unblocks everything; do not ship any signature-based spend before it.
2. **Permit2 integration on the Processor** (`payForAgentWithPermit2`, `payForAgentAndComputeWithPermit2`) — medium effort, kills the approve-tx UX problem token-agnostically.
3. **AxiomDelegationRegistry** (EIP-712 struct per §3, caps+expiry+nonce) — medium effort, unlocks agent self-operation.
4. **ERC-2771 relayer (phase 1) → ERC-4337 v0.8 verifying paymaster (phase 2)** with quota/allowlist policy — large effort; empirically verify Galileo bundler compatibility before committing.
5. **ERC-20 vault lane + `mintWithStableWithPermit2`** in the V3 redeploy — required for the true 1-signature onboarding.

## Trade-offs

| Option | Pros | Cons |
| --- | --- | --- |
| Permit2 | Token-agnostic (mock lacks permit), batched, per-permit deadlines, canonical+audited | External contract trust anchor; one-time approve friction; users unfamiliar with signature "swind" warnings |
| EIP-2612 only | Zero external deps, OZ-native | Requires token redeploy; fails for non-permit tokens across chains |
| Permit3 | Cross-chain single-sig, fits 0G multi-domain ambitions | Immature, needs cross-chain messaging on Galileo, overkill pre-Aristotle |
| 4337 paymaster | Standard, on-chain quotas, agents as accounts, verifying-paymaster reuses TEE EIP-712 machinery | Bundler/paymaster ops burden; Galileo node compatibility unverified; EntryPoint deposit management |
| ERC-2771 relayer | Ships in weeks on existing backend signer infra (keepers/index.ts:110-115 pattern) | Centralized; touches every `msg.sender` site (M2); relayer can censor/reorder |
| Custom delegation registry vs 4337 session keys | Works with today's EOA owners + UUPS suite; portable struct | Custom code = audit surface; duplicated limit logic unless mirrored in TS like strategyGuard (ADR-004 §1.3) |

## Single Recommended Stack

**Permit2 (approvals) + AxiomDelegationRegistry (EIP-712, capped, expiring, nonced) + phased gas: ERC-2771 relayer now, ERC-4337 v0.8 verifying paymaster later; keeper stays direct-EOA.** Rationale: it is the only combination that works with a permit-less mock token, EOA owners, the existing UUPS suite, and the existing keeper — while structurally anticipating 4337 (delegation struct is account-compatible; `_paySplit`'s `payer` param is Permit2-shaped). The gating prerequisite is fixing C1 — an uncapped pay lane under a signature-authorization regime converts a UX feature into a drain vector.

## References

- `apps/contracts/src/AxiomPaymentProcessor.sol:260-309` — `_paySplit` (payer-param, cap, balance-diff guard)
- `apps/contracts/src/AxiomPaymentProcessor.sol:313-345` — `payForAgent`, `payComputeProvider`, `payForAgentAndCompute` (uncapped lanes)
- `apps/contracts/src/AxiomPaymentProcessor.sol:159-172` — `setMaxPayCap` / 0-disables footgun
- `apps/contracts/src/AxiomMockUSDC.sol:6-21` — bare ERC-20, no permit, no canonical USDC on Galileo
- `apps/contracts/src/ERC7857Upgradeable.sol:69-77, :112-121` — `delegateAccess` (no expiry/unset) and sealed-key consumption
- `apps/contracts/src/extensions/ERC7857AuthorizeUpgradeable.sol:76-86, :115-120` — perpetual `authorizeUsage`
- `apps/contracts/src/AxiomAgentNFT.sol:328-339` — native-fee `mint`
- `apps/contracts/src/AxiomStrategyVault.sol:30, :76-81, :190-235` — native-only deposit, advertised-but-absent asset, Merkle/daily-limit `execute()`
- `apps/contracts/src/verifiers/AxiomTeeVerifier.sol:45-55, :145-158, :240-243, :262-275` — EIP-712 typehash/recovery/allowlist/nonce pattern to reuse for delegation + paymaster vouchers
- `apps/backend/src/keepers/index.ts:50, :56-71, :110-152` — keeper batch cap, operator-supplied nonces, direct-EOA sweep
- `docs/adr/004-contract-rewrite-plan.md:46-56` (§1.2), `:48-54` (§1.3 vault non-upgradeable), `:79` (§2.3) — dedup/optional-ERC-20/delegation decisions this V3 plan extends
