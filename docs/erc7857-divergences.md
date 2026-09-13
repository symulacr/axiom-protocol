# ERC-7857 Divergence Register

**Status:** current as of 2026-09-13 (10-pass Wave 2, OPT-12). Tripwire tests: `apps/contracts/test/AxiomAgentNFT.conformance.t.sol` — any contract change that flips a pinned conformance assertion must update this register in the same change.

**Baseline:** EIP-7857 draft + the 0G reference implementation (`lib/0g-agent-nft`, pinned `0gfoundation/0g-agent-nft@b86e108`). Divergences are **not debt by default**: several are deliberate security hardening the spec's own reference lacks (full analysis: `_agent_reports/10d-erc7857.md` §3).

## ABI / struct divergences

| # | Spec / 0G reference | Axiom | Class | Fix commit / status |
| --- | --- | --- | --- | --- |
| D1 | `verifyTransferValidity(_proofs)` — 1-arg | `verifyTransferValidity(proofs, to, nft)` + `msg.sender == nft` gate (`AxiomTeeVerifier.sol:197-202`) | **Deliberate hardening** — closes the nonce-burn front-run and cross-NFT/cross-`to` replay the spec form allows. Keep. | shipped pre-V3 |
| D2 | Single `dataHash` proof fields + `targetPubkey` naming; no freshness bound | `AccessProof`/`OwnershipProof` carry **`validUntil`** enforced on-chain (`IERC7857DataVerifier.sol:12-29`) | Hardening (freshness beyond the spec's 7-day record retention). Keep. | shipped pre-V3 |
| D3 | EIP-191 personal-sign recovery in reference verifier | EIP-712 typed data with domain `AxiomTeeVerifier`/`1`, chainId + verifyingContract bound | Hardening (cross-chain / cross-contract replay). Keep. | shipped pre-V3 |
| D4 | Both proof nonces marked used | one derived nonce `keccak(dataHash,targetPubkey,sealedKey,nonce,validUntil)` | Sound simplification (legs are consistency-checked first). Keep. | shipped pre-V3 |
| D5 | `event Transferred(uint256 tokenId, address from, address to)` — tokenId unindexed | `event Transferred(uint256 indexed _tokenId, address indexed _from, address indexed _to)` | Cosmetic-ABI; affects log filters only. Topic0 pinned by `test_transferredTopic0_isThreeIndexedForm`. Keep. | shipped pre-V3 |
| D6 | `event Updated(uint256 indexed, IntelligentData[] _oldDatas, IntelligentData[] _newDatas)` | `event Updated(uint256 indexed tokenId, bytes32 oldRoot, IntelligentData[] newDatas)` (`src/extensions/ERC7857IDataStorageUpgradeable.sol:28`) | Event-gas fix. Topic0 pinned by `test_updatedTopic0_isOldRootShape`. Keep. | shipped pre-V3 |
| D7 | Single `IERC7857` interface incl. authorize + clone | 3 modular extensions; **each advertises its own ERC-165 ID** (`src/extensions/*` `supportsInterface`) + the base ID | Modularization; all spec functions present on the composed contract. Extension-ID advertisement pinned by `test_extensionInterfaceIdsAdvertised`. Keep. | shipped pre-V3 |
| D8 | Spec reference `_transfer` writes the re-keyed `newDataHash` back into token `iDatas` | no write-back (`src/ERC7857Upgradeable.sol:147-160`) — **shared with the vendored 0G reference** | The one divergence with real consequence: the chain proves the oracle vouches for delivery of the *old*-rooted data, but the new ciphertext's integrity is attested nowhere (downstream readers trust the backend response for the new root). Improvement path is bounded: bind the re-keyed `newDataHash` in the event/proof (OPT-01, gated on a V3 upgrade window — see `_agent_reports/10k`). | **OPEN** — OPT-01 gated |

## Additional register entries (found while building the conformance tripwire)

| # | Finding | Status |
| --- | --- | --- |
| D9 | `AxiomTeeVerifier` implements **no ERC-165**: probing it **reverts** rather than returning `false` (worse for `ERC165Checker` consumers). Spec-clients must wire the verifier address from deployment records. Pinned by `test_verifierRevertsOnInterfaceProbe_documentedGap`. | **OPEN** — candidate for the next verifier deploy window (non-upgradeable storage posture; see ADR-004) |
| — | Singular/plural metadata alias parity (`intelligentDataOf` ≡ `intelligentDatasOf`) — spec-clients using the singular form work | **CLOSED** — pinned by `test_singularAndPluralMetadataReturnIdenticalData` |
| — | Data-availability on mint: the spec "recommends doing ownership verification for minting"; Axiom mints against a caller-declared hash (synthetic `keccak(name)` placeholder allowed) | **OPEN** — OPT-03 (flag-gated mint-time proof-of-possession), Wave 3 |

## DO-NOT-ADOPT (do not re-litigate; `_agent_reports/10d-erc7857.md` §5)

1. Spec-verbatim 1-arg `verifyTransferValidity` (reintroduces F-1/F-03/F-04/F-12).
2. ZKP oracle leg (reference itself is `// TODO`; `OracleType.ZKP` future-proofs the ABI).
3. Full Sealed Executor (Axiom's DelegationRegistry + API-key auth covers the use case with a smaller trust surface).
4. Rental/lease semantics, ERC-8170-style `reproduce()`.
5. On-chain 2-root-hash metadata JSON (already adjudicated `2RH-REJECTED-v1`).
6. Relaxing the bare-ERC-721 transfer lock to the reference's proofless `transferFrom`.
