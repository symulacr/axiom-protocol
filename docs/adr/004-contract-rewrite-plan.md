# ADR 004: V2 Contract Suite Rewrite Plan

Status: PROPOSED (plan wave — no source edits; zero .sol/ABI/deploy-script changes made)
Date: 2026-08-28
Owner: RW executor A (contracts)
Inputs: full reads of AxiomAgentNFT.sol, AxiomPaymentProcessor.sol, AxiomStrategyVault.sol, verifiers/ (AxiomTeeVerifier, BaseVerifier), ERC7857Upgradeable.sol + extensions (usage sites); ledger M1/M2/M3/M4/M5/M8/M9/M10/M11/M12; ADR-002, ADR-003; R3 §2–§3; lane6; proto-hashless-completion.md (P4 DEK custody deferral); deployment record docs/deployments/galileo-merged-2026-08-13.json.
Per-contract evidence detail: analysis_reports/session-2026-08-24/rw-contracts.md

## 0. Context

The current suite (4 contracts + 2 verifiers, Foundry; compiled against vendored OZ 5.0.2 in `lib/` — the npm 5.6.1 pin is tooling-only and shadowed by remappings.txt) works: e2e is green, tx-merge prototype cut on-chain txs 12→6, all CRITICAL/HIGH ledger contract rows are fixed or dispositioned. What remains is a set of **designed-around** problems: dead convergence surfaces (M1, M5), an unkept cleanup path (M2/ADR-003), unconverged iClone (M11), DEK custody deferred (P4), split governance models, and duplicated invariants across contract/orchestrator/FE. A V2 suite can design convergence/custody/keeper **in** instead of commenting around them.

External facts (2026-08-28):

- OZ: npm `@openzeppelin/contracts-upgradeable` **5.6.1 == npm `latest`**; 5.7.0 exists only under `dev` dist-tag (2026-07-29). No forced bump. NOTE (2026-08-31 audit): the Solidity actually compiled by Foundry is the **vendored `lib/` tree at 5.0.2** (remappings.txt shadows node_modules); any OZ bump above 5.0.2 changes bytecode and is V3/redeploy scope.
- ERC-7857 is **Final** (eips.ethereum.org/EIPS/eip-7857). Axiom's verifier interface deviates from the Final spec (adds `to`/`nft` params, richer proof structs, freshness windows) — strictly stronger, but not byte-compatible with spec-verbatim third-party implementations. FULL deviation list (2026-08-31 audit, against the Final EIP): ① 3-arg verifyTransferValidity with `to`/`nft` domain binding (spec: 1-arg), ② single `dataHash` proof model (spec: oldDataHash+newDataHash pair), ③ on-chain `validUntil` + maxProofAge enforcement, ④ EIP-712 domain separator (spec reference hashes raw structs), ⑤ `msg.sender == nft` caller gate on the verifier, ⑥ `wantedKey`-empty pinning semantics differ.

## 1. Per-contract KEEP / CHANGE / ADD / REMOVE

### 1.1 AxiomAgentNFT (UUPS, ERC-7857 iNFT)

| Verdict | Item | Rationale |
| --- | --- | --- |
| KEEP | erc7201 storage + `__gap`, UUPS with DEFAULT_ADMIN gate, 4-role AccessControl, verifier 1-day timelock (propose/execute/cancel + views), Pausable `_update` gate, bare-ERC721-transfer block (forces iTransfer), creators mapping + dual mint paths, on-chain metadata JSON (tokenURI), `_refundExcess` | Working, audited-shape, upgrade-safe; M10 event indexing already shipped |
| KEEP | `transferAndCleanExpiredProofs` (folds cleanup into transfer) | Good UX; becomes useful once keeper decision lands (see §2.2) |
| CHANGE | `authorizeDelegateAndRevoke` (M1) — currently no producer. Either DELETE it, or in V2 make it the canonical "install assistant" path that FE/BE actually emit (merged with iClone decision §2.3) | Dead surface today; 15 LOC of unused attack/review surface |
| CHANGE | withdrawMintFees / upgrades both gated on DEFAULT_ADMIN EOA — V2: route both through a timelock or multisig (align with verifier-timelock pattern already in TimelockManager) | Single-key instant upgrade + instant fee drain is the largest residual admin risk |
| ADD | Operator cleanup: nothing — see REMOVE | |
| REMOVE | `OPERATOR_ROLE` (declared, granted, zero call-sites in this contract — verify cross-contract before deletion) | Role theater; every unused role widens the audit surface |
| REMOVE | mintFee native path OR keep — decision: keep `mintFee` (it works), but emit `MintFeeUpdated` indexing already covered; no change | |

ERC-7857 compliance: keep the hardened verifier interface (documented deviation); optionally add an adapter if external interop becomes a product requirement (§2.4).

### 1.2 AxiomPaymentProcessor (UUPS, Ownable)

| Verdict | Item | Rationale |
| --- | --- | --- |
| KEEP | erc7201 storage + gap, fee-on-transfer balance-diff check with `TransferAmountMismatch`, royalty sentinel (bps+1) with clamp, min-protocol-floor split, `withdrawAgentEarnings` pull pattern, `setPaymentToken` MigrationBlocked guard, treasury 1-day timelock | Core split logic is correct and tested (incl. fuzz) |
| KEEP | `payForAgentAndCompute` — **canonical** payment entry (R3 §3: one path per payment lane, Virtuals ACP pattern) | Ledger M4 convergence decision |
| CHANGE | `payForAgent` — keep as thin wrapper delegating to a single internal `_split()` | Split logic currently duplicated 3× (payForAgent / payForAgentAndCompute / payAndWithdrawEarnings) — drift risk; V2 collapses to one internal function |
| REMOVE | `payAndWithdrawEarnings` (M5: zero prod callers, e2e-only) | The 3-in-1 also *sets royalty as a side effect* — a UX hazard (payment should not mutate pricing). Its withdrawal leg is superseded by the shipped withdrawAgentEarnings relay (M6 fix, wave6 782a25d93) |
| CHANGE | Governance: Ownable → AccessControl (ADMIN_ROLE), matching AxiomAgentNFT; pause + setProtocolFeeBps under one model | Two governance shapes in one suite is an operator trap |
| ADD | Contract-level per-pay cap (constant or admin-set MAX_PAY) enforced in `_split` callers — so M8's "consistent-by-luck" (chat-runtime cap 1000 OG, BE relay cap) becomes a chain invariant | M8 root cause: no on-chain bound |
| ADD | Optional per-tokenId earnings split (creatorOf today; V2: allow creator to designate a payout address) — only if product wants it; not blocking | Deferred nice-to-have |

### 1.3 AxiomStrategyVault (non-upgradeable — keep it that way)

| Verdict | Item | Rationale |
| --- | --- | --- |
| KEEP | **Non-upgradeable** (holds user funds; trust model is the feature), CEI ordering, `receive()` revert → UseDeposit, packed Vault struct, usedActions one-shot leaves, totalTrackedBalance + recoverExcessNative, daily rollover + validUntilDay semantics | M9-era fixes settled these; correct as-is |
| KEEP | depositAndSetStrategy / depositSetStrategyAndWithdraw merges | Measured e2e win (12→6 txs) |
| CHANGE | Extract strategy-invariant checks (revert order NoStrategySet → balance → StrategyExpired → DailyLimitExceeded, rollover) into a shared interface/library that the orchestrator's `strategyGuard` (packages/config/src/strategy-guard.ts) mirrors | M9 root cause: same invariant hand-maintained in Solidity + TS; drift silently burns reverting txs. V2: contract publishes the exact revert-order contract, orchestrator imports a single TS mirror tested against on-chain behavior |
| ADD | ERC-20 asset support (asset param exists in events but is hardcoded address(0)) — **optional, product-gated**; native-only is coherent for Galileo testnet | Do not add speculatively |
| REMOVE | nothing | |

### 1.4 AxiomTeeVerifier + BaseVerifier

| Verdict | Item | Rationale |
| --- | --- | --- |
| KEEP | Two-leg EIP-712 proof scheme (Ownership + Access), cross-leg consistency checks, domain separator, maxProofAge dual gate (expiry + anti-forever), ProofRecord merge (used+timestamp in one struct), `to`/`nft` binding in digests | Stronger than Final-spec reference in every dimension that matters |
| KEEP | Permissionless `cleanExpiredProofs` | Keeper onboarding needs zero contract change (ADR-003) |
| CHANGE | Single `registeredSigner` — V2: small signer allowlist (k-of-1 quorum to start, i.e. a list + revoke path) so signer-key compromise is containable by revoking one entry without a 1-day propose/execute cycle from the SAME owner key | Single TEE key compromise = total transfer forgery until rotation today |
| CHANGE | `verifyTransferValidity(proofs)` spec-verbatim adapter (optional shim delegating to the hardened internal path with `to` = recovered access signer) — only if third-party ERC-7857 interop is wanted | Compliance deviation is currently the ONLY barrier to external verifier/NFT interop |
| REMOVE | UUPS machinery if verifier stays deployed non-upgradeable (dead weight + audit surface) — OR deploy behind proxy and keep; pick one, don't keep both half-wired | Bytecode is currently "upgrade-safe but deployed plain" — ambiguous posture |

### 1.5 Libraries/extensions (ERC7857Upgradeable, Cloneable/Authorize/IDataStorage, TimelockManager, AxiomMetadataJson)

- KEEP all. TimelockManager is used by 3 contracts consistently. Extensions implement Final ERC-7857 semantics.
- CHANGE (M1 dependency): if `authorizeDelegateAndRevoke` is removed from the NFT, Authorize extension stays (iTransfer authorizations still used); only the merged convenience function disappears.

## 2. V2 target architecture decisions

### 2.1 Governance unification

One AccessControl model across NFT + Processor (+ optional verifier): DEFAULT_ADMIN (multisig or timelock-gated upgrades), ADMIN_ROLE for parameter ops, MINTER_ROLE. TimelockManager reused for: verifier rotation (existing), treasury rotation (existing), plus NEW: implementation upgrades behind a 1-day propose/execute instead of instant `_authorizeUpgrade`. USER-EXPERIENCE WIN: operators reason about one "who can do what" matrix; M12 timelock views become uniformly readable via GET /v1/governance/timelock.

### 2.2 Keeper cleanup (resolves ADR-003)

V2 does NOT need contract changes for keepers (cleanExpiredProofs is permissionless). Decision recorded: **Option A (Chainlink Automation time-based upkeep)** preferred per R3 §2 cost model (~0.008 LINK/day est., Base premium lower than Polygon example), Gelato `callWithSyncFee` fallback, e2e-indexer (status quo) as last resort. V2 additionally exposes a batched `sweepExpiredProofs(bytes32[][] nonces)` convenience? — NO: keep BaseVerifier as-is; batching belongs to the keeper job config, not a new contract function. ADR-003 remains DECISION PENDING until user picks; this ADR only reserves the V2 property: *no new contract function required for any of the three options*.

### 2.3 iClone decision (M11)

DECISION: **surface iClone as a product feature in V2, via FE/BE convergence only** — the contract already implements ERC-7857 Cloneable semantics (iClone = new tokenId, cloned data, ownership not transferred, Cloned + PublishedSealedKey events; e2e-matrix labels exist at cli/e2e/matrix.ts:94-95). Rationale: cloning is the differentiating ERC-7857 capability ("fork an agent without taking ownership") and the contract cost is already sunk. If product later rejects it, remove only the extension wiring — the core NFT is unaffected. `authorizeDelegateAndRevoke` (M1) folds into this: cloning + delegate-install can share the FE flow; if iClone ships, M1's merged function is still redundant (keep _authorizeUsage + delegateAccess composably) → REMOVE authorizeDelegateAndRevoke in V2.

### 2.4 DEK custody (P4 deferral → V2 option)

proto-hashless-completion.md option C: sealed-DEK vault (`dek_custody` table keyed by tokenId, ECIES-sealed to oracle, `AXIOM_DEK_CUSTODY=true` default-off, deletion on successful re-key, "bring your own sealed key" override kept). V2 contract impact: **none** — custody is backend-only (oracle routes.ts already downloads/decrypts/re-uploads blobs). The contract's `sealedKey` field in OwnershipProof is the custody-agnostic transport. Record: V2 adds no custody contract; the feature gate stays backend env.

### 2.5 Target topology (unchanged shapes, hardened wiring)

```text
AxiomTeeVerifier (non-upgradeable OR committed-proxy; signer allowlist)
        ▲ verifier()
AxiomAgentNFT (UUPS, timelocked upgrades, roles, ERC-7857 final-semantics)
   ▲ ownerOf/creatorOf          ▲ safeTransferFrom(processor) not needed — earnings are credit-based
AxiomStrategyVault (NON-upgradeable, shared strategy invariant mirror)
AxiomPaymentProcessor (UUPS, roles, single _split, MAX_PAY cap, canonical payForAgentAndCompute)
```

Off-chain consumers: indexer (Paused/Unpaused already watched), oracle signer service, orchestrator strategyGuard (single-source TS mirror), chat-runtime encode executors.

## 3. Redeploy checklist (V2)

Order matters: verifier first (NFT init requires a non-zero verifier), then NFT, then vault + processor, then wiring assertions, then env/indexer/FE.

1. **Pre-flight**: bump/freeze OZ (5.6.1 == latest; revisit only if 5.7.0 promotes to `latest`); run full `forge test` + fuzz suites; `forge build` canary green.
2. **Deploy sequence** (extend Deploy.s.sol pattern — full fresh deploy, not RedeployVaultProcessor):
   a. AxiomTeeVerifier (initialize: owner=AXIOM_DEPLOYER_ADDRESS, signer=TEE signer pubkey-address, maxProofAge=7 days) — deploy behind proxy this time if V2 keeps UUPS, else strip UUPS in source.
   b. AxiomAgentNFT proxy (name/symbol/storageInfo/verifier/admin) — verifier = step-a address.
   c. AxiomStrategyVault (nft = step-b proxy, owner).
   d. AxiomPaymentProcessor (nft = step-b, paymentToken, treasury, protocolFeeBps=100, owner=ADMIN).
   e. **Verifier bootstrap**: registerSigner is pre-set in initialize; if rotating later: proposeSigner → wait 1 day → executeSigner.
   f. **Roles**: grant MINTER_ROLE to backend relay EOA (mintWithRole path), grant OPERATOR only if V2 keeps it (see §1.1 REMOVE note); verify DEFAULT_ADMIN is the intended multisig, NOT the deployer hot wallet — sweep transferDefaultAdmin if deployer-held.
3. **Wiring assertions** (script asserts, mirroring RedeployVaultProcessor.s.sol:106-107): `nft.verifier() == verifier`, `vault.nft() == nft proxy`, `processor.AXIOM_NFT() == nft proxy`, `processor.paymentToken() == AXIOM_PAYMENT_TOKEN`.
4. **Address env updates** (all five surfaces, same values):
   - Root `.env` + `.env.example`: AXIOM_AGENT_NFT_ADDRESS, AXIOM_STRATEGY_VAULT_ADDRESS, AXIOM_TEE_VERIFIER_ADDRESS, AXIOM_PAYMENT_PROCESSOR_ADDRESS, AXIOM_MOCK_USDC_ADDRESS (or real token), VITE_* mirrors (lines 87-94, 129-133 pattern).
   - Backend: apps/backend/src/env-schema.ts consumes the same vars (no code change — values only).
   - Frontend: apps/frontend/src/abi/addresses.ts VITE_* envs (values only).
   - packages/config/src/addresses.ts ENV_VAR_NAMES unchanged (resolver is value-driven).
   - Deployment record: new docs/deployments/<network>-<date>.json with impl+proxy pairs, wiringVerified block, e2eEvidence (follow galileo-merged-2026-08-13.json schema).
5. **ABI regeneration**: `npm run build` runs generate-abis.sh; confirm packages/config/src/abis/*.ts drift gate (scripts/check-abi-drift.sh) passes; if V2 renames/removes functions (payAndWithdrawEarnings, authorizeDelegateAndRevoke), regenerate + update e2e coverage matrix labels (cli/e2e/coverage.ts) in the SAME commit.
6. **Indexer restart**: restart backend/indexer AFTER env update; indexer/index.ts watchGroups re-resolve addresses from env at boot; verify checkpoint resumes (data/checkpoints/checkpoint-16602.json cursor) and Paused/Unpaused subscription attaches on the new proxies; expect a fresh-event gap only for blocks between old-indexer stop and new-indexer start (backfill if needed).
7. **Frontend verify**: connect smoke, mint, pay (payForAgentAndCompute lane), set-strategy card, withdraw-earnings button — each exercises one new-env address.
8. **Oracle**: confirm AXIOM_TEE_VERIFIER_ADDRESS EIP-712 verifyingContract matches new verifier (domain separator binds chainId+address — old oracle proofs are invalid against the new verifier address; drain in-flight transfers before cutover).

## 4. Risks

- **Existing tokenIds do not migrate.** A fresh V2 NFT starts tokenId counter at 1; creators/owners of Galileo testnet tokens lose their agents unless (a) V2 upgrades the existing proxy instead of redeploying (only possible for UUPS contracts with compatible storage layouts — Processor + NFT qualify, Vault/Verifier don't), or (b) a migration script mints equivalent tokens (creators mapping can be replayed via mintWithRole(iDatas, to, creator)). Testnet data: acceptable loss IF announced; mainnet (Aristotle): MUST be upgrade-in-place or scripted migration, never fresh deploy.
- **Storage layout compatibility** for upgrade-in-place: NFT storage struct gains nothing in this plan (removals only); any ADD (e.g. payout address) must append inside the 48-slot gap and re-verify with `forge inspect AxiomAgentNFT storage-layout` diff against artifacts/storage-layout/AxiomAgentNFT.json.
- **Blob re-keying across a verifier-address cutover**: 0G blobs stay valid (addressed by rootHash), but sealed keys are ECIES to the receiver and proofs are domain-bound to the OLD verifier address — any transfer initiated pre-cutover completes against the old verifier; new transfers need fresh oracle proofs. Cutover must be a quiet period (no in-flight transfers), and the old verifier should stay live read-only for one maxProofAge (7 days) before decommission.
- **Storage checkpoints / indexer cursor**: checkpoint-16602.json cursor is chain-height keyed, not contract-keyed — safe to keep; but events from OLD contract addresses remain in the event store and will surface in "own events" feeds mixed with new-contract events until FE scoping (isOwnEvent, L1-C3 fix) filters by current addresses — verify or accept mixed history.
- **usedProofs growth carries over only if verifier is upgraded in place**; fresh verifier starts clean (no migration needed — proofs are per-transfer nonces).
- **payAndWithdrawEarnings removal** breaks e2e coverage rows and any cached calldata builders; remove in the same commit as ABI regen + e2e matrix update (M5 labels).
- **Signer allowlist change** alters oracle health route assumptions (single registeredSigner read) — coordinate apps/oracle + backend /oracle/health consumers.
- **Governance model migration (Ownable→AccessControl on Processor)**: if upgrading in place, the Ownable storage slot must be preserved or admin re-granted in the same upgrade tx; storage-layout diff mandatory.

## 5. Do NOT rewrite (works fine — don't touch)

- **ERC7857Upgradeable core** (proof-check + transfer gate + PublishedSealedKey flow) — reference-grade, tested, spec-Final-aligned; only the verifier interface question (§1.4 adapter) touches it.
- **BaseVerifier replay store + cleanExpiredProofs** — ADR-003 needs no contract change; permissionless cleanup already keeper-ready.
- **TimelockManager** — single 1-day delay primitive used consistently by 3 contracts; works, tested.
- **AxiomMetadataJson + tokenURI on-chain JSON** — buildathon-verified, deterministic, no consumers complain.
- **AxiomStrategyVault's non-upgradability, CEI, usedActions, recoverExcessNative** — the trust model IS the design; "make it upgradeable" would be a regression.
- **payForAgentAndCompute split arithmetic + fee-on-transfer guard** — correct, fuzz-tested; only refactor is internal dedup (§1.2 CHANGE), not a rewrite.
- **AxiomMockUSDC + mockUsdc.ts ABI export** — e2e + ABI-drift gate dependency (ledger OE-13 wontfix); untouchable per standing rule.
- **Deploy script env-var contract (DEPLOYER_PK/TEE_SIGNER_PK/ORACLE_ADMIN_PK/AXIOM_DEPLOYER_ADDRESS)** — redeploy checklist reuses it; don't redesign the deployment interface in the same wave as the redeploy.

## 6. Consequences

- V2 scope is modest by design: removals (payAndWithdrawEarnings, authorizeDelegateAndRevoke, OPERATOR_ROLE, maybe verifier UUPS), internal dedup (_split), governance unification, signer allowlist, strategy-invariant mirror, optional verifier adapter. Everything else is configuration/ops (keeper registration, env cutover, indexer restart).
- ADR-003 stays open until the user picks a keeper; nothing in V2 blocks any of its three options.
- If V2 is executed, this ADR + ADR-003 + a new deployment JSON supersede galileo-merged-2026-08-13.json as the address source of truth.
