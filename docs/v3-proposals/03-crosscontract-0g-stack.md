# V3 Proposal 03 — Cross-Contract Structure, State/Capacity, and the Full 0G Stack (Storage → Compute → DA → Pay → Agentic ID)

- **Agent ID:** 01a054c1-ba46-78e2-abb1-30f84a390de0
- **Date:** 2026-08-30
- **Scope:** READ-ONLY analysis of Axiom Protocol V2 (ERC-7857 AI-agent marketplace on 0G Chain) at `/home/eya/og`
- **Lane:** Cross-contract structure, state/capacity, full 0G stack deepening
- **Context:** V2 architecture = AgentNFT (UUPS, ERC-7857 iNFT, sealed DEK re-keying, iClone) + PaymentProcessor (UUPS, `_paySplit`, MAX_PAY) + TeeVerifier (signer allowlist) + StrategyVault (non-upgradeable, CEI, invariant checks mirrored 1:1 by `packages/config/src/strategy-guard.ts` with 12 parity tests) + TimelockManager. 0G integration today: Storage Turbo (canary, AXIOM1 magic) for agent payloads, Compute router for inference, DA rejected by ADR-002.

---

## Scoping notes

Two honest scoping notes before the report: (1) I did not find a dedicated 0G Compute router client module in `apps/backend/src` (only `AXIOM_COMPUTE_API_KEY` env wiring in `apps/backend/src/server/mcp.test.ts:230` and an untyped `/v1/compute/providers` router) — Compute findings below are grounded in that absence plus the payment contract; (2) `apps/oracle` is a separate workspace I did not deep-read; oracle claims cite `apps/backend/src/oracle/*`.

---

## Summary

V2 is a sound 4-contract suite with three structural liabilities for V3: (1) an unmanaged creator/royalty lifecycle (`creatorOf` is frozen at mint while royalties are mutable by that creator forever), (2) unbounded on-chain state in the verifier proof store, vault action-leaves, and per-token `IntelligentData` arrays with no 0G Storage commitment pattern, and (3) three incompatible upgrade-governance models (AccessControl+timelock, AccessControl-instant, Ownable) across the suite. The 0G stack is Storage-only and shallow: no on-chain root-of-trust for stored payloads, no inference receipts, and the ADR-002 DA rejection is — on honest reassessment — still correct.

---

## Analysis

### 1. Call graph (as implemented)

```text
AxiomPaymentProcessor ──creatorOf(tokenId)──▶ AxiomAgentNFT        (AxiomPaymentProcessor.sol:79-86, :280)
AxiomStrategyVault   ──ownerOf(tokenId)────▶ AxiomAgentNFT        (AxiomStrategyVault.sol:53-59)
AxiomAgentNFT (via ERC7857Upgradeable) ──verifyTransferValidity(proofs,to,nft)──▶ AxiomTeeVerifier  (ERC7857Upgradeable.sol:104)
AxiomAgentNFT ──cleanExpiredProofs(nonces)──▶ AxiomTeeVerifier     (AxiomAgentNFT.sol:299)
Backend keeper ──cleanExpiredProofs(candidates)──▶ AxiomTeeVerifier (apps/backend/src/keepers/index.ts:151)
AxiomTeeVerifier ─▶ BaseVerifier._checkAndMarkProof / proofs map  (BaseVerifier.sol:16-24)
Oracle signer service ─(EIP-712 proofs, off-chain)─▶ AxiomTeeVerifier (apps/backend/src/oracle/storage.ts DEK custody feeds the proof payload)
```

**State ownership:** NFT owns `creators`, `mintFee`, 3× `TimelockManager.State`, and the ERC-7857 `iDatas` (namespaced slot in `ERC7857IDataStorageUpgradeable.sol:14-17`); Processor owns `agentEarnings`, `agentRoyaltyStored`, `totalOutstandingEarnings`, `maxPayCap` (`AxiomPaymentProcessor.sol:55-68`); Vault owns `vaults`, `usedActions`, `totalTrackedBalance` (`AxiomStrategyVault.sol:45-51`); Verifier owns `_signers`/`_isSigner` (`AxiomTeeVerifier.sol:43-45`) and the replay `proofs` map (`BaseVerifier.sol:14`).

**No circularity** exists — the graph is a DAG (Processor/Vault→NFT→Verifier). That is good and should be preserved.

**Hidden state assumptions / read-stale hazards:**

- **`creatorOf` is mint-frozen, never updated on iTransfer** (`AxiomAgentNFT.sol:338` public mint, `:369-371` role mint; no write anywhere in the iTransfer path). Yet Processor's `onlyAgentCreator` (`AxiomPaymentProcessor.sol:79-86`) and `_paySplit` (`:280`) read it *at call time* as "the royalty recipient." Consequence: an original creator who sells the agent still (a) accumulates earnings on every future payment and (b) retains `setRoyaltyBps` power forever (clamped only by the min-protocol floor, `:188-195`). This is an undeclared economic invariant, not a bug per se — but nothing documents or bounds it.
- **Vault permissions read `ownerOf` live** (`AxiomStrategyVault.sol:58`) — correct (new owner gains control immediately on iTransfer), but there is no "revoke on transfer" for a stale strategy: the strategy root survives transfer, so a buyer inherits the *seller's* Merkle strategy + daily limit silently. A `StrategySet`-clearing hook on transfer does not exist.
- **Processor↔NFT is the only cross-contract read in a hot path**; it is a static address set once in `initialize` (`:110`) with no re-pointing mechanism — safe, but it means a V3 NFT redeploy strands the Processor (ADR-004 §4 already flags this).
- **DEK custody is off-chain-only and lossy**: the file-backed store tolerates corruption by "starting fresh" (`apps/backend/src/oracle/storage.ts:72-77`), which silently orphans sealed DEKs. There is no on-chain witness that a DEK was ever in custody.

### 2. Capacity / state growth audit

| Site | Growth | Mechanism | Verdict |
| --- | --- | --- | --- |
| `BaseVerifier.proofs` (`BaseVerifier.sol:14-24`) | **Unbounded** | Every transfer writes `ProofRecord{used,timestamp}` (2 slots); `cleanExpiredProofs` (`:29-40`) is the only reclaim, and keeper nonce candidates come from a static env var (`keepers/index.ts:57-69`) because **no `ProofUsed` event exists** and the mapping is `internal` — the keeper explicitly documents this dead end (`keepers/index.ts:56-62`) | HIGH — in production this map only ever grows |
| `AxiomStrategyVault.usedActions` (`:48`, written `:217-219`) | **Unbounded, irreclaimable** | One-shot leaves must stay true forever (replay protection), so entries can never be deleted; `setStrategy` rotates the root but does not scope leaves per root generation | MEDIUM |
| `iDatas[tokenId]` (`ERC7857IDataStorageUpgradeable.sol:30-60`) | Per-token, uncapped | `mint`/`update` accept any-length `IntelligentData[]` with unbounded string fields (`AxiomAgentNFT.sol:311-316, 331-335`); `_updateData` additionally copies the full old array into memory and emits **both** old+new arrays in `Updated` (`:46-58`) → gas and event bloat scale with data size; `tokenURI` re-serializes it all (`AxiomAgentNFT.sol:399`) | HIGH — this is pointer metadata living as full on-chain state |
| `agentEarnings` map (`AxiomPaymentProcessor.sol:60, 301-303`) | Bounded by creator count | Already pull-based (`withdrawAgentEarnings :349-357`) | OK — the pull pattern is correct; extend it, don't replace it |
| `creators`, timelocks, `vaults` | Bounded by tokens/strategies | 1 slot per token | OK |

### 3. 0G stack assessment

- **Storage:** rootHash integrity is enforced only *off-chain* — the oracle rejects any `rootHash ≠ URI binding` via a content-addressed LRU (`apps/backend/src/oracle/routes.ts:48-77`), and the AXIOM1 canary + `markDataHashSeen` live in the TS SDK layer (`packages/config/src/models.test.ts:273-295`). The only on-chain commitment is `IntelligentData.dataHash` inside the iDatas array. **There is no contract a third party can call to ask "is rootHash R the authentic payload for agent T?"**
- **Compute:** no verifiable inference path. `payComputeProvider` pays any address the payer names, with no receipt, no linkage to an inference event, and **no MAX_PAY cap** (`AxiomPaymentProcessor.sol:322-330`; the cap is enforced only inside `_paySplit :270-273`, and the compute leg of `payForAgentAndCompute` at `:347-349` bypasses it too).
- **DA:** ADR-002's rejection logic holds — every candidate dataset (attestations, transcripts, proof payloads) is small and needs durable *retrieval*, which DA does not provide. The one genuine gap DA could paper over (keeper nonce discovery) is cheaper to fix with an on-chain event (see Rec #2). I recommend re-affirming ADR-002 and adding the trigger condition it already defines.
- **Pay:** settlement already rides plain ERC-20 pull-payment semantics; 0G Pay primitives (gasless/metered compute charges) could replace the unauthenticated `payComputeProvider` lane with metered, usage-bound charging — but that requires the Compute receipts from Rec #4 first; doing Pay integration before receipts just re-creates the same unlinkable payment.
- **Agentic ID / ERC-7857 conformance:** solid core — 3-arg verifier binding (`to`,`nft`), dual-leg EIP-712, `intelligentDataOf` singular alias (`ERC7857Upgradeable.sol:220-224`), interface IDs advertised (`:65-69`), iClone implemented (`ERC7857CloneableUpgradeable.sol:58-83`). Remaining gaps: (a) **no spec-verbatim `verifyTransferValidity(proofs)` adapter** — the only interop barrier (documented `ERC7857IDataStorageUpgradeable.sol:3-4`, ADR-004 §1.4); (b) `TransferValidityProofOutput.wantedKey` is always returned empty (`AxiomTeeVerifier.sol:280-287`) rather than carrying a delegated-wanted-key; (c) `Updated` event shape (old+new arrays) diverges from any spec-era DataUpdated convention.

---

## Root Cause

The suite was assembled contract-first, not data-flow-first: each contract owns its state correctly, but the *lifecycle* of cross-cutting facts (who the creator is, which storage root is authentic, which proofs were used, whether compute was actually rendered) has no owner — each fact is either frozen at mint (`creatorOf`), kept only off-chain (rootHash binding, DEK custody), or written but never discoverable (`proofs`, `usedActions`). V3's job is to give those lifecycle facts a minimal on-chain home, not to restructure the contracts.

---

## Recommendations

### Area 1 — Cross-contract structure & governance (3 options)

| Option | Description | Upgrade-key posture | Pros | Cons |
| --- | --- | --- | --- | --- |
| **1a. State-hub + peripheral executors** | One `AxiomHub` (UUPS) owns creators, royalties, earnings, storage-roots, timelocks; NFT/Processor/Vault become thin executors calling it | One upgrade key, one timelock | Kills all cross-contract staleness; single governance matrix | Massive migration (Vault is non-upgradeable → full redeploy of user-fund contract); single hub = single upgrade blast radius; contradicts ADR-004 §5 "don't touch the Vault" |
| **1b. Keep 4-contract split + `AxiomStateView` facade** *(recommended)* | New **non-upgradeable** read-facet contract with hardcoded addresses that exposes composed assertions: `royaltyRecipientOf(tokenId)`, `pendingSettlementOf(creator)`, `effectiveRoyaltyBps(tokenId)`, `vaultHealth(tokenId)`, `rootAttested(agentId,rootHash)` | Unchanged: NFT+Processor UUPS-timelocked, Verifier committed-proxy, Vault non-upgradeable | Zero hot-path changes, zero storage migration; gives backend/indexer/FE one canonical read surface (kills the TS-mirror drift ADR-004 §1.3 worried about); non-upgradeable facade = trustworthy assertions | Read-only — doesn't fix write-path coupling; a 5th address to wire |
| **1c. Pull-based settlement everywhere** | Keep structure; extend the existing pull pattern (`withdrawAgentEarnings`) so *protocol* cuts also accrue to a pullable treasury balance instead of `safeTransfer` per pay (`AxiomPaymentProcessor.sol:303-305`) | Unchanged | Removes treasury forward from the pay hot path (fee-on-transfer/blacklist-token resilience); uniform "everything pulls" invariant | Treasury cash-flow becomes lazy; slightly higher `totalOutstanding` accounting surface |

**Governance surface (applies to all options):** today there are three models — NFT: `ADMIN_ROLE` params + DEFAULT_ADMIN/1-day-timelock upgrades (`AxiomAgentNFT.sol:250-285, 321`); Processor: DEFAULT_ADMIN **instant** upgrades (`AxiomPaymentProcessor.sol:372`); Verifier: single `onlyOwner` upgrades (`AxiomTeeVerifier.sol:302-303`); Vault: `onlyOwner` pause (`AxiomStrategyVault.sol:247-253`). Recommend: **one `TimelockController`-style admin contract (or route all four through `TimelockManager.State` + a shared `ADMIN_ROLE` table)** so every state-mutating admin op — upgrade, verifier rotation, treasury, fee withdrawal, signer revoke — appears in one timelock feed that `GET /v1/governance/timelock` (ADR-004 §2.1) can already read. The immediate single-key residual is Processor's instant `_authorizeUpgrade` — it should adopt the NFT's propose/execute pattern verbatim (~20 LOC, gap-slot append).

### Area 2 — Capacity & on-chain/off-chain split (3 options)

| Option | What moves to 0G Storage | On-chain commitment pattern | Notes |
| --- | --- | --- | --- |
| **2a. Commitment-hash iDatas** *(recommended)* | The `IntelligentData` *payload bodies* (description strings, memory pointers, large fields) go to 0G Storage; keep `dataHash` (already the rootHash), `url`, and `name` on-chain | `mapping(tokenId => bytes32 dataRoot)` where `dataRoot = merkleRoot(keccak(dataHashᵢ, urlᵢ) per entry)`; `PublishedSealedKey` unchanged; full array re-derivable from the 0G download + root check | Bounded gas per mint/update; `tokenURI` becomes root+resolver, not full JSON serialization; needs a size cap as transition guard |
| **2b. TEE attestation batching** | Historical verifier evidence (per-signer proof batches, attestation quotes) → periodic merkle root committed on-chain; individual proofs stay off-chain | `mapping(epoch => bytes32 attestationRoot)` + `attestedAt(epoch)`; spot-check merkle proofs on dispute | Only worth it if attestation volume grows; today proof *nonces* are the only on-chain residue |
| **2c. Strategy config archival** | `usedActions` leaf preimages + strategy trees → 0G; on-chain keeps only `strategyRoot` (already the case) | Already correct (`AxiomStrategyVault.sol:110-119`); add `strategyVersion` counter and scope `usedActions` as `mapping(tokenId => mapping(uint64 gen => mapping(bytes32 => bool)))` so a stale generation's leaves can be *logically* abandoned (and physically deleted by an owner call per generation) | Solves the irreclaimable-leaf growth without weakening one-shot semantics |

**Concretely add now (cheap, no migration):** (1) a `MAX_I_DATA_BYTES` cap in `mint`/`update` (`AxiomAgentNFT.sol:311-316, 331-335`) — sums `abi.encode` lengths, reverts over cap; (2) emit only `newDatas` (plus `bytes32 oldRoot`) in `Updated` (`ERC7857IDataStorageUpgradeable.sol:58`) — the old array is recoverable from 0G via its root; (3) emit `ProofUsed(bytes32 indexed nonce, uint256 timestamp)` in `BaseVerifier._checkAndMarkProof:16-24` — this single event makes the keeper's candidate set discoverable (replacing the env-var hack at `keepers/index.ts:57-69`) and makes `cleanExpiredProofs` actually operational, closing the unbounded-growth loop.

### Area 3 — 0G stack deepening (per layer)

| Layer | Options | Recommendation |
| --- | --- | --- |
| **Storage root-of-trust** | (a) `ZgStorageRoot` registry: `mapping(uint256 tokenId => bytes32 currentRoot)`, admin-gated writes routed through mint/iTransfer/rekey events emitted by NFT; (b) piggyback on existing `dataHash` field, add only a `verifyRoot(tokenId, rootHash, bytes)` merkle/keccak preimage-check view added to the NFT; (c) 1b facade hosts it | **(b) then (c)**: `dataHash` already IS the commitment (`ERC7857Upgradeable.sol:113-114` compares proof `dataHash` to stored `datas[i].dataHash`) — add `verifyPayload(tokenId, bytes calldata payload) view returns (bool)` computing keccak and comparing, so any downloader gets contract-level attestation without a new trust root. Registry (a) is justified only when agent *memory history* (multiple roots over time) needs indexing |
| **Compute receipts** | (a) full on-chain receipts (agentId, provider, model, promptHash, outHash) per inference; (b) batched merkle root per provider per epoch with on-chain `commitInferenceEpoch`; (c) receipts on 0G Storage, only `mapping(provider => bytes32 latestRoot)` on-chain | **(b)**: per-inference on-chain is unaffordable at chat volume; batched epoch roots bound gas to O(providers), and the existing `payComputeProvider` gains a `bytes32 epochRoot` argument so payment references what was rendered (`AxiomPaymentProcessor.sol:322-330` today binds to nothing) |
| **DA reassessment (honest)** | ADR-002 reasons (small data, durability+retrieval needs, storage already anchors data-hashes — `docs/adr/002-da-not-applicable.md:10-19`) remain valid for every current artifact. The one mid-tier candidate — publishing used-proof-nonce batches to DA for keeper discovery — is *worse* than the on-chain `ProofUsed` event (Rec #2), which is cheaper and instantly indexable. Inference log telemetry would be the first legitimate DA use, and it does not exist yet | **Re-affirm ADR-002**; add the reopen trigger it already defines; revisit only when batched inference telemetry ships |
| **0G Pay** | (a) leave ERC-20 pull settlement; (b) 0G Pay metered compute charges routed through Processor as settlement netting; (c) paymaster/sponsored-gas for agent-executed vault actions | **(a) now, (b) after Compute receipts**: metered charging is meaningless without usage binding. (c) is a genuinely useful independent V3 item — it lets a transferred agent's assistant execute strategies without the owner holding gas |
| **Agentic ID conformance** | (a) ship the spec-verbatim verifier adapter (ADR-004 §1.4 shim); (b) leave deviation documented; (c) full spec-verbatim migration | **(a)**: a thin adapter verifier delegating to the hardened path preserves interop without weakening anything; `wantedKey` should also be propagated from delegated `delegateAccess` flows rather than hardcoded `""` (`AxiomTeeVerifier.sol:280-287`) |

---

## Recommended target architecture

```text
ON-CHAIN (Galileo/Aristotle)
  AxiomAgentNFT (UUPS, timelocked upgrade, capped iDatas: name/url/dataHash only)
      │  emits ProofUsed / root commitments via verifier + Updated(newRoot)
  AxiomTeeVerifier (committed proxy, k-of-n allowlist, ProofUsed event)
  AxiomPaymentProcessor (UUPS, timelocked upgrade, pull-everything, cap on all lanes)
  AxiomStrategyVault (non-upgradeable, generation-scoped usedActions)
  AxiomStateView (non-upgradeable facade: composed read assertions + payload verification)
  AdminTimelock (one propose/execute surface for all four)
OFF-CHAIN (0G Storage)                        COMMITMENT (on-chain)
  agent payload bodies / memory history   →   IntelligentData.dataHash + dataRoot merkle
  TEE attestation archive                 →   epoch attestationRoot (Option 2b, deferred)
  strategy trees + leaf preimages         →   strategyRoot (existing) + generation index
  inference receipt batches               →   provider epochRoot (Option 3-Compute (b))
KEEP OFF-CHAIN, NO COMMITMENT: DEK custody (upgrade file→DB + on-chain custody-witness event only if mainnet), chat transcripts
```

---

## Severity-graded V2 findings

| Severity | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| **HIGH** | `payComputeProvider` and the compute leg of `payForAgentAndCompute` bypass `maxPayCap` — the cap lives only inside `_paySplit`; ADR-004's "every pay lane inherits it" is not true on-chain | `AxiomPaymentProcessor.sol:270-273` vs `:322-330`, `:337-352` | Check `maxPayCap` on `computeAmount` in both lanes |
| **HIGH** | `BaseVerifier.proofs` grows unboundedly and cleanup is non-operational in prod: no `ProofUsed` event, mapping `internal`, keeper candidates come from a static env var | `BaseVerifier.sol:14-24, 29-40`; `apps/backend/src/keepers/index.ts:56-69` | Emit `ProofUsed`; keeper indexes it (Rec #2) |
| **HIGH** | No cap on `IntelligentData[]` size → per-mint/update gas is attacker/user-controlled and `Updated` emits full old+new arrays | `AxiomAgentNFT.sol:311-316, 331-335`; `ERC7857IDataStorageUpgradeable.sol:46-58` | Byte cap + root-only `Updated` |
| **HIGH** | Single allowlisted TEE signer = k-of-1 with total transfer-forgery power over all agents if the TEE key leaks (revoke contains it, but only after detection) | `AxiomTeeVerifier.sol:239-241`, allowlist `:43-45` | k-of-n quorum (`count >= k`) or on-chain TEE quote verification |
| **MEDIUM** | Creator/royalty lifecycle is undeclared: `creatorOf` frozen at mint (`AxiomAgentNFT.sol:338, 369-371`), creator keeps `setRoyaltyBps` forever via `onlyAgentCreator` (`AxiomPaymentProcessor.sol:79-86, 179-181`); transferred agents keep paying the ex-creator at the ex-creator's chosen rate | — | Document the invariant + add owner-settable payout address (ADR-004 §1.2 deferred nice-to-have) or clear `agentRoyaltyStored` on iTransfer |
| **MEDIUM** | Strategy root survives agent transfer — buyer silently inherits seller's Merkle strategy + daily limit | `AxiomStrategyVault.sol:53-59` (live ownerOf), no clearing on transfer | iTransfer-triggered strategy clear, or explicit buyer `setStrategy` requirement surfaced in FE |
| **MEDIUM** | `usedActions` leaves irreclaimable, unbounded | `AxiomStrategyVault.sol:48, 217-219` | Generation-scoped leaves (Rec 2c) |
| **MEDIUM** | DEK custody: corrupt file → "starting fresh" silently drops sealed DEKs; single-process, no replication | `apps/backend/src/oracle/storage.ts:72-77, 110-121` | DB backing + custody-witness event (`DekCustodySet(tokenId, keccak(sealedDek))`) so loss is detectable |
| **MEDIUM** | No on-chain root-of-trust for 0G payloads; verification is oracle-internal only | `apps/backend/src/oracle/routes.ts:48-77` | `verifyPayload` view (Rec Area 3) |
| **LOW** | Verifier `registeredSigner()` returns `_signers[0]` which is post-swap-and-pop arbitrary — consumers assume it is the seed | `AxiomTeeVerifier.sol:75-78, 110-115` | Prefer `allowlistedSigners()`; deprecate `[0]` read |
| **LOW** | Processor upgrade is instant single-key while NFT's is timelocked — inconsistent residual admin risk | `AxiomPaymentProcessor.sol:372` vs `AxiomAgentNFT.sol:250-285` | Port propose/execute pattern |
| **LOW** | Vault `execute` is permissionless with a documented gas-grief vector | `AxiomStrategyVault.sol:186-191` | Acceptable; keep the comment |

---

## Trade-offs

| Option | Pros | Cons |
| --- | --- | --- |
| 1b facade (rec) | Zero migration risk; single read surface; aligns with ADR-004 §5 | Doesn't fix write-path coupling; 5th address to wire/verify |
| 1a state hub | True single source of truth | Forces non-upgradeable Vault redeploy holding user funds; centralizes upgrade blast radius; big test rewrite (12 parity tests + strategy-guard mirror) |
| 2a commitment iDatas (rec) | Bounded gas; correct on-chain/off-chain split; standard pattern | Breaking change to `IntelligentData` consumers (tokenURI, FE, e2e matrix); needs payload-resolver UX |
| Keep full iDatas on-chain | Zero change; tokenURI self-contained | Unbounded gas/event bloat; blocks agent-memory growth (the actual V3 product direction) |
| Compute epoch roots (rec) | O(providers) gas; payment finally bound to usage | Trust shifts to provider batch honesty; dispute path needs individual receipt retrieval from 0G |
| Per-inference receipts | Strongest binding | Unaffordable at chat volume; recreates the `proofs`-map growth problem in a new contract |
| DA re-affirmation | Honest; avoids cost/complexity for retrieval-needing data | Leaves the "high-volume ephemeral telemetry" door explicitly open-only |

---

## References

- `apps/contracts/src/AxiomPaymentProcessor.sol:55-68, 79-86, 270-273, 322-330, 337-352, 372` — storage layout, creator coupling, cap gap, instant upgrade gate
- `apps/contracts/src/AxiomAgentNFT.sol:338, 369-371` — mint-frozen `creators`; `:299` verifier cleanup call; `:250-285` timelocked upgrade; `:311-316, 331-335` uncapped iDatas ingress
- `apps/contracts/src/AxiomStrategyVault.sol:45-59, 110-119, 186-191, 217-219` — state ownership, live `ownerOf` reads, irreclaimable leaves
- `apps/contracts/src/verifiers/AxiomTeeVerifier.sol:43-45, 239-241, 280-287, 302-303` — k-of-1 allowlist, empty `wantedKey`, `onlyOwner` upgrade
- `apps/contracts/src/verifiers/BaseVerifier.sol:14-24, 29-40` — unbounded replay store, eventless cleanup
- `apps/contracts/src/ERC7857Upgradeable.sol:104, 113-114, 150-160, 220-224` — verifier call site, dataHash commitment point, iTransfer gate, singular alias
- `apps/contracts/src/extensions/ERC7857IDataStorageUpgradeable.sol:46-58` — full old+new array event emission
- `apps/contracts/src/extensions/ERC7857CloneableUpgradeable.sol:58-83` — iClone implementation (converged surface)
- `apps/backend/src/oracle/storage.ts:72-77, 110-121` — DEK custody loss-on-corruption
- `apps/backend/src/keepers/index.ts:56-69, 151` — env-var nonce discovery dead end
- `apps/backend/src/oracle/routes.ts:48-77` — off-chain rootHash binding
- `docs/adr/002-da-not-applicable.md:10-19` — DA rejection rationale (re-affirmed)
- `docs/adr/004-contract-rewrite-plan.md` §1.2, §1.4, §2.1, §2.5, §4 — governance unification intent, verifier posture, migration constraints
