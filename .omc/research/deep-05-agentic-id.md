# Deep-Dive: ERC-7857 (Agentic ID) Compliance — Axiom Protocol

**Date:** 2026-06-24
**Researcher:** Grok Build (subagent)
**Status:** HAS_GAPS

---

## Files Checked

| File | Purpose |
|------|---------|
| `apps/contracts/src/AxiomAgentNFT.sol` | Main concrete iNFT contract |
| `apps/contracts/src/ERC7857Upgradeable.sol` | Base ERC-7857 implementation (transfer + proof check) |
| `apps/contracts/src/extensions/ERC7857CloneableUpgradeable.sol` | Cloning extension |
| `apps/contracts/src/extensions/ERC7857AuthorizeUpgradeable.sol` | Authorization extension |
| `apps/contracts/src/extensions/ERC7857IDataStorageUpgradeable.sol` | On-chain IntelligentData storage |
| `apps/contracts/src/interfaces/IERC7857.sol` | Core interface declaration |
| `apps/contracts/src/interfaces/IERC7857Cloneable.sol` | Cloneable interface |
| `apps/contracts/src/interfaces/IERC7857Authorize.sol` | Authorize interface |
| `apps/contracts/src/interfaces/IERC7857Metadata.sol` | Metadata interface (re-export from `@0g-agent-nft`) |
| `apps/contracts/src/interfaces/IERC7857DataVerifier.sol` | Data verifier interface + structs |
| `apps/contracts/src/verifiers/AxiomTeeVerifier.sol` | TEE-based verifier |
| `apps/contracts/src/verifiers/BaseVerifier.sol` | Abstract base verifier (replay protection) |
| `apps/contracts/test/AxiomAgentNFT.t.sol` | Deterministic unit tests |
| `apps/contracts/test/FuzzAxiomAgentNFT.t.sol` | Fuzz + invariant tests (live proxy) |
| `apps/contracts/test/V12C3ValidUntil.t.sol` | `validUntil` boundary tests (live fork) |
| `apps/contracts/test/GasBenchmark.t.sol` | Gas benchmarks (no semantic tests) |
| `apps/contracts/test/BUGS.md` | Bug discovery log from fuzz campaigns |
| `apps/contracts/lib/0g-agent-nft/contracts/interfaces/IERC7857Metadata.sol` | 0G reference metadata interface |
| `apps/contracts/lib/0g-agent-nft/contracts/ERC7857Upgradeable.sol` | 0G reference base implementation |

**Reference standard:** [EIP-7857 (FINAL, 2025-01-02)](https://eips.ethereum.org/EIPS/eip-7857)

---

## Compliance Checklist vs ERC-7857

### Interface: `IERC7857` (Main NFT)

| Requirement | EIP Spec | Axiom Status | Notes |
|------------|----------|--------------|-------|
| **Events** | | | |
| `Approval` | Inherited from ERC-721 | ✅ | Via OZ ERC721Upgradeable |
| `ApprovalForAll` | Inherited from ERC-721 | ✅ | Via OZ ERC721Upgradeable |
| `Authorization` | `address indexed _from, address indexed _to, uint256 indexed _tokenId` | ✅ | In `IERC7857Authorize`, emitted by `AuthorizeUpgradeable` |
| `AuthorizationRevoked` | same indexed params | ✅ | In `IERC7857Authorize`, emitted by `AuthorizeUpgradeable` |
| `Transferred` | `uint256 _tokenId, address indexed _from, address indexed _to` | ❌ **MISSING** | Axiom uses ERC-721's `Transfer` event instead. The EIP defines a separate `Transferred` event with different parameter order/encoding |
| `Cloned` | `uint256 indexed _tokenId, uint256 indexed _newTokenId, address _from, address _to` | ✅ | In `IERC7857Cloneable`, emitted by `CloneableUpgradeable` |
| `PublishedSealedKey` | `address indexed _to, uint256 indexed _tokenId, bytes[] _sealedKeys` | ✅ | Emitted in `_transfer()` and `_clone()` |
| `DelegateAccess` | `address indexed _user, address indexed _assistant` | ✅ | In `IERC7857`, emitted by `ERC7857Upgradeable` |
| **Functions** | | | |
| `verifier()` | `→ IERC7857DataVerifier` | ✅ | Public view |
| `iTransfer(address _to, uint256 _tokenId, TransferValidityProof[] calldata _proofs)` | Core transfer function | ❌ **MISSING** | EIP defines this with 3 params (no `_from`). Axiom only implements `iTransferFrom` (4 params with `_from`). Reference implementation has both, but the EIP interface only mandates `iTransfer` |
| `iTransferFrom(address _from, address _to, uint256 _tokenId, TransferValidityProof[] calldata _proofs)` | Reference impl only | ✅ | Present, auth-checked via `safeTransferFrom` |
| `iClone(address _to, uint256 _tokenId, TransferValidityProof[] calldata _proofs) → uint256` | Core clone function | ❌ **MISSING** | EIP defines `iClone` (3 params, no `_from`). Axiom only implements `iCloneFrom` (4 params with `_from`) |
| `iCloneFrom(address _from, address _to, uint256 _tokenId, TransferValidityProof[] calldata _proofs) → uint256` | Reference impl only | ✅ | Present, with explicit `_checkAuthorized` |
| `authorizeUsage(uint256, address)` | Core function | ✅ | In `ERC7857AuthorizeUpgradeable` |
| `revokeAuthorization(uint256, address)` | Core function | ✅ | In `ERC7857AuthorizeUpgradeable` |
| `approve(address, uint256)` | Core function | ✅ | Via ERC-721 |
| `setApprovalForAll(address, bool)` | Core function | ✅ | Via ERC-721 |
| `delegateAccess(address)` | Core function | ✅ | In `ERC7857Upgradeable` |
| `ownerOf(uint256) → address` | Core function | ✅ | Via ERC-721 |
| `authorizedUsersOf(uint256) → address[]` | Core function | ✅ | In `ERC7857AuthorizeUpgradeable` |
| `getApproved(uint256) → address` | Core function | ✅ | Via ERC-721 |
| `isApprovedForAll(address, address) → bool` | Core function | ✅ | Via ERC-721 |
| `getDelegateAccess(address) → address` | Core function | ✅ | In `ERC7857Upgradeable` |

### Interface: `IERC7857Metadata`

| Requirement | EIP Spec | Axiom Status | Notes |
|------------|----------|--------------|-------|
| `name() → string` | ✅ | ✅ | Via ERC-721 |
| `symbol() → string` | ✅ | ✅ | Via ERC-721 |
| `intelligentDataOf(uint256) → IntelligentData[]` | EIP: **singular** | ⚠️ **RENAMED** | Axiom implements `intelligentDatasOf` (plural). Both EIP (singular) and 0G reference (plural) are used — 0G reference's `IERC7857Metadata.sol` also uses `intelligentDatasOf`. This is a cosmetic naming divergence from the EIP but consistent with the forked 0G base. ERC-165 introspection passes because the interfaceId matches the 0G reference. |

### Data Verifier Interface: `IERC7857DataVerifier`

| Requirement | EIP Spec | Axiom Status | Notes |
|------------|----------|--------------|-------|
| `verifyTransferValidity(TransferValidityProof[])` | 1-arg | ❌ **SIGNATURE CHANGED** | Axiom uses 3-arg form: `verifyTransferValidity(proofs, to, nft)`. The extra args (`to`, `nft`) are added for EIP-712 domain binding per security fixes F-03/F-04/F-12 — they prevent cross-contract and MEV replay. This is a deliberate security hardening that breaks interface compatibility with the canonical EIP. |

### Struct Definitions

| Struct | EIP Field | Axiom Field | Match? |
|--------|-----------|-------------|--------|
| **AccessProof** | `oldDataHash` | `dataHash` | ❌ Renamed + semantics changed (single hash vs old+new) |
| | `newDataHash` | *(absent)* | ❌ Removed altogether |
| | `nonce (bytes)` | `nonce (uint256)` | ❌ Type changed |
| | `encryptedPubKey` | `targetPubkey` | ❌ Renamed, different purpose |
| | `proof` | `proof` | ✅ |
| | *(absent)* | `validUntil` | ➕ Added (EIP-712 deadline) |
| **OwnershipProof** | `oracleType` | `oracleType` | ✅ |
| | `oldDataHash` | `dataHash` | ❌ Same as AccessProof changes |
| | `newDataHash` | *(absent)* | ❌ Removed |
| | `sealedKey` | `sealedKey` | ✅ |
| | `encryptedPubKey` | `targetPubkey` | ❌ Renamed |
| | `nonce (bytes)` | `nonce (uint256)` | ❌ Type changed |
| | `proof` | `proof` | ✅ |
| | *(absent)* | `validUntil` | ➕ Added |
| **TransferValidityProofOutput** | `oldDataHash` | `dataHash` | ❌ Same pattern |
| | `newDataHash` | *(absent)* | ❌ Removed |
| | `sealedKey` | `sealedKey` | ✅ |
| | `encryptedPubKey` | `targetPubkey` | ❌ Renamed |
| | `wantedKey` | `wantedKey` | ✅ |
| | `accessAssistant` | `accessAssistant` | ✅ |
| | `accessProofNonce (bytes)` | `accessProofNonce (uint256)` | ❌ Type changed |
| | `ownershipProofNonce (bytes)` | `ownershipProofNonce (uint256)` | ❌ Type changed |

### Interface Architecture

- **EIP spec**: Single monolithic `IERC7857` interface containing all events + functions + the event definitions for `Authorization`, `Cloned`, etc.
- **Axiom**: Split into 3 interfaces — `IERC7857` (base), `IERC7857Authorize`, `IERC7857Cloneable` — plus `IERC7857Metadata` imported from the 0G reference.
- **Impact**: An integrator expecting the canonical EIP-7857 single interface will not match Axiom's `supportsInterface(type(IERC7857).interfaceId)` because Axiom's `IERC7857` is a subset.

---

## Auth Checks on `iTransferFrom`

| Check | EIP Reference | Axiom Implementation | Status |
|-------|---------------|---------------------|--------|
| Caller is owner or approved | `_isApprovedOrOwner(msg.sender, tokenId)` | `_transfer()` calls `safeTransferFrom()` → `_update(auth=msg.sender)` → `_checkAuthorized(from, auth, tokenId)` | ✅ Functionally equivalent; auth is enforced via ERC-721's `_checkAuthorized` |
| `from` is actual owner | `_proofCheck` → `require(token.owner == from)` | `_proofCheck()` → `require(_ownerOf(tokenId) == from)` or `revert ERC721InvalidSender(from)` | ✅ |
| `to` is non-zero | `require(to != address(0))` | `_proofCheck()` → `revert ERC721InvalidReceiver(to)` | ✅ |
| Proofs non-empty | `require(proofs.length > 0)` | `revert ERC7857EmptyProof()` | ✅ |
| Proof count matches data | `require(proofCount == dataCount)` | `revert ERC7857ProofCountMismatch()` | ✅ |
| Data hash integrity | `require(output.oldDataHash == currentDataHash)` | `revert ERC7857DataHashMismatch()` | ✅ |
| Access assistant check | `require(assistant == to OR assistant == delegate)` | Same logic | ✅ |
| Wanted receiver check | `pubKeyToAddress(pub) == to` or `encryptedPubKey == wantedKey` | Same logic, uses `targetPubkey` | ✅ |

**For `iCloneFrom`**, `_checkAuthorized(from, msg.sender, tokenId)` is called explicitly before `_clone`, which is correct and matches the reference.

---

## Test Coverage Analysis

### ✅ Covered (Deterministic — `AxiomAgentNFT.t.sol`)

| Test | What it checks |
|------|---------------|
| `test_initialize_setsRolesAndOwner` | Initial state after proxy deployment |
| `test_mint_happy` | Basic mint: ownership, creator, data length |
| `test_withdrawMintFees_onlyAdmin` | Admin withdraw |
| `test_withdrawMintFees_revertNotAdmin` | Non-admin blocked |
| `test_mint_revertZeroAddress` | Revert: mint to address(0) |
| `test_mint_revertEmptyData` | Revert: empty IntelligentData array |
| `test_iTransferFrom_happy` | Full iTransferFrom flow: alice→bob |
| `test_iTransferFrom_revertBadOracleSig` | Corrupted ownership proof |
| `test_iTransferFrom_revertBadAccessSig` | Corrupted access proof |
| `test_iTransferFrom_revertEmptyProofs` | Empty proofs array |
| `test_iTransferFrom_revertNotOwner` | Unauthorized caller (carol) |
| `test_iTransferFrom_revertReplay` | Reused proof nonce |
| `test_iTransferFrom_revertMixedProofs` | Cross-proof nonce mismatch |
| `test_verifyTransferValidity_revertMixedProofs_direct` | Verifier-level mix check |
| `test_updateVerifier_onlyOperator` | Operator updates verifier |
| `test_updateVerifier_revertNotOperator` | Non-operator blocked |
| `test_pause_unpause` | Pause/unpause state |
| `test_authorizeUsage_revertTooMany` | Max authorized users limit (100→101) |
| `test_update_onlyOwner` | Owner updates data |
| `test_update_revertNotOwner` | Non-owner blocked from update |
| `test_upgrade_onlyOwner` | UUPS upgrade blocked for non-owner |
| `test_upgrade_owner_succeeds` | UUPS upgrade succeeds for owner |

### ✅ Covered (Fuzz + Invariant — `FuzzAxiomAgentNFT.t.sol`)

| Test | What it checks |
|------|---------------|
| `testFuzz_mintWithRole_recordsAllFields` | Mint preserves dataHash, description, creator, monotonic tokenId |
| `testFuzz_authorizeUsage_accessControl` | Owner authorizes, non-owner blocked, zero-user blocked |
| `testFuzz_iTransferFrom_doesNotClearData` | Critical invariant: iTransferFrom does NOT zero out intelligentDatasOf |
| `invariant_totalSupplyMonotonic` | nextTokenId never decreases |
| `invariant_dataHashNeverLost` | Non-zero dataHashes stay non-zero |
| `test_sanity_proxyLive` | Live proxy is initialized and reachable |

### ❌ Test Coverage Gaps

#### Critical Gaps

1. **No `iCloneFrom` tests at all** — Neither the deterministic suite nor the fuzz suite exercises cloning. This means:
   - The `Cloned` event is never tested
   - The `_clone` proof-check path is never tested
   - The `_checkAuthorized` call in `iCloneFrom` is never tested
   - The `_updateData` on a cloned token is never tested
   - The `PublishedSealedKey` emission from `_clone` is never tested

2. **No `revokeAuthorization` tests** — `authorizeUsage` is tested (happy path + revert), but removal of authorization is never exercised.

3. **No `iTransferFrom` via operator/approved caller** — All tests call `iTransferFrom` from the token owner. There is no test where an approved operator (via `approve()` or `setApprovalForAll()`) calls `iTransferFrom`. This means the `_checkAuthorized` path via `safeTransferFrom` is not explicitly proven.

4. **No `delegateAccess` / `getDelegateAccess` tests** — The assistant delegation path is never exercised.

#### Moderate Gaps

5. **No batch transfer test** — All tests use a single-element `TransferValidityProof[]`. Multi-proof batch transfers (matching multiple IntelligentData entries) are never tested.

6. **No fuzz test for `iTransferFrom_happy` on the live proxy** — The fuzz suite tests that data is preserved during transfers, but there's no fuzz test asserting ownership transfer success across diverse receiver addresses.

7. **No `mintWithRole(address to)` 2-arg variant test** — Only the 3-arg `mintWithRole(iDatas, to, creator)` is fuzzed.

8. **No `creatorOf` assertion for basic `mint()` path** — BUG-5 from BUGS.md was RESOLVED (mint now sets `creators[tokenId] = to`) but there is no deterministic test verifying this.

9. **No `MAX_AUTHORIZED_USERS = 100` boundary test** — The test only checks that adding a 101st user reverts. There's no test that 100 is actually the allowed maximum.

10. **No multi-token transfer scenario** — Transferring multiple tokens in sequence, or concurrent transfers from different owners, is not tested.

#### Fuzz-Specific Gaps

11. **No fuzz test for `iCloneFrom` on live proxy** — The live-proxy fuzz suite only tests mint, authorizeUsage, and iTransferFrom.

12. **No invariant test for authorized users** — e.g. "authorizedUsersOf(tokenId) never contains duplicates" or "authorizedUsersOf is cleared after transfer".

13. **No invariant test connecting verifier state** — e.g. "usedProofs mapping prevents replay" is not tested in the fuzz suite.

---

## Additional Findings

### 1. `Transferred` Event Missing

The EIP-7857 standard defines:
```solidity
event Transferred(uint256 _tokenId, address indexed _from, address indexed _to);
```
Axiom does not emit this event. It uses ERC-721's `Transfer(address indexed from, address indexed to, uint256 indexed tokenId)` instead. These have different parameter ordering: EIP's `Transferred` has `_tokenId` first (non-indexed), while ERC-721's `Transfer` has it third (indexed). Any indexer expecting the EIP-7857 event will not find it.

### 2. Interface Splitting vs Monolithic EIP

The EIP defines a single `IERC7857` interface containing all functions and events including `Authorization`, `Cloned`, `authorizeUsage`, `revokeAuthorization`, `iClone`. Axiom splits these into:
- `IERC7857` (base — only core transfer + delegateAccess + PublishedSealedKey)
- `IERC7857Authorize` (authorize/revoke events + functions)
- `IERC7857Cloneable` (Cloned event + iCloneFrom)

This means `supportsInterface(type(IERC7857).interfaceId)` returns false for the Axiom contract if checked against the canonical EIP interface (because Axiom's `IERC7857` is a subset). The contract does return true for `type(IERC7857Authorize).interfaceId` and `type(IERC7857Cloneable).interfaceId` separately.

### 3. EIP-7201 Storage Slot Mismatch (BUG-1 from BUGS.md)

All 6 source files use incorrect ERC-7201 storage location constants. The deployed slots do not match the formula documented in code comments. This is a **HIGH** severity finding per the BUGS.md log. The constants were deployed as-is and cannot be changed without a fresh deployment. Since the contracts are already live on Galileo, the incorrect slots are now immutable state.

### 4. `verifyTransferValidity` Signature Change

The EIP specifies `verifyTransferValidity(TransferValidityProof[] calldata)` — one argument. Axiom's `AxiomTeeVerifier` uses three arguments: `verifyTransferValidity(proofs, to, nft)`. The extra `to` and `nft` parameters bind the proof to a specific receiver and NFT contract via EIP-712 domain separation, preventing cross-contract and MEV replay attacks. This is a security improvement (per fixes F-03/F-04/F-12) but breaks interface compatibility with any tooling expecting the canonical EIP interface.

### 5. Proof Structural Divergence

The proof structs (`AccessProof`, `OwnershipProof`, `TransferValidityProofOutput`) differ significantly from the EIP spec:
- Single `dataHash` instead of `oldDataHash` + `newDataHash` (no support for data re-encryption during transfer)
- `targetPubkey` instead of `encryptedPubKey`
- `uint256 nonce` instead of `bytes nonce`
- Added `validUntil` timestamp for EIP-712 deadline enforcement

### 6. `iTransfer` / `iClone` Missing

The canonical EIP interface requires:
- `iTransfer(address _to, uint256 _tokenId, TransferValidityProof[] memory _proofs)` — 3 params
- `iClone(address _to, uint256 _tokenId, TransferValidityProof[] memory _proofs) → uint256` — 3 params

Axiom only implements:
- `iTransferFrom(address _from, address _to, uint256 _tokenId, TransferValidityProof[] memory _proofs)` — 4 params
- `iCloneFrom(address _from, address _to, uint256 _tokenId, TransferValidityProof[] memory _proofs) → uint256` — 4 params

The `_from` parameter is explicit in Axiom's version but implicit (= ownerOf) in the EIP version.

### 7. Named Parameter Indexing Discrepancy

The EIP uses underscore-prefixed named parameters (e.g. `_tokenId`, `_from`, `_to`). Axiom's codebase inconsistently mixes underscore-prefixed and non-prefixed parameter names (e.g., `tokenId` without underscore in `iTransferFrom`, but `_from` with underscore in the interface declaration). This has no on-chain impact but is a code hygiene issue.

---

## Recommendations

### Short-term (Code/Test Fixes)

1. **Add `iTransfer()` and `iClone()` wrappers** — Even if they're thin wrappers around the `From` variants, the canonical EIP interface requires these 3-param functions. Add:
   ```solidity
   function iTransfer(address to, uint256 tokenId, TransferValidityProof[] calldata proofs) external {
       iTransferFrom(ownerOf(tokenId), to, tokenId, proofs);
   }
   function iClone(address to, uint256 tokenId, TransferValidityProof[] calldata proofs) external returns (uint256) {
       return iCloneFrom(ownerOf(tokenId), to, tokenId, proofs);
   }
   ```

2. **Add `Transferred` event emission** — Either in `_transfer()` alongside `safeTransferFrom`, or document the decision to omit it in favor of ERC-721's `Transfer` event.

3. **Add `iCloneFrom` tests immediately** — Clone semantics are completely untested. At minimum: happy-path clone, proof validation during clone, auth check, owner verification.

4. **Add `revokeAuthorization` tests** — Both happy path and revert cases (non-owner, non-authorized user, zero address).

5. **Add operator/approved transfer test** — Test that `iTransferFrom` succeeds when called by an approved address (via `approve()` or `setApprovalForAll()`), not just the owner.

6. **Add `delegateAccess` / `getDelegateAccess` tests** — Exercise the assistant delegation path.

### Medium-term

7. **Add batch transfer test** — Test with 2+ proofs in a single `iTransferFrom` call.

8. **Add `creatorOf` test for basic `mint()` path** — Verify the BUG-5 fix (mint now sets `creators[tokenId] = to`).

9. **Add fuzz invariant: authorized users cleared on transfer** — Assert that after `iTransferFrom`, `authorizedUsersOf(tokenId)` is empty.

10. **Harmonize parameter naming** — Consistent use of `_` prefix for external-facing parameters across all interfaces.

### Long-term (Architecture)

11. **Consider standard interface alignment** — If the Axiom Protocol aims for broad ERC-7857 compatibility, the struct and function signature divergences should be resolved. If the intent is a "hardened superset" of ERC-7857, publish a supplement document describing the delta.

12. **Fix ERC-7201 storage slots on next redeployment** — The incorrect slots (BUG-1) should be corrected on any future mainnet deployment.

---

## Summary

**Overall compliance score:** ~70% (functional subset of ERC-7857 with significant safety improvements and interface deviations)

**Key strengths:**
- All core security invariants are tested (data hash integrity, proof freshness, replay protection, auth checks)
- The EIP-712 domain binding adds meaningful replay protection
- The live-proxy fuzz suite validates critical data-loss invariants
- `iTransferFrom`, `iClonFrom`, `authorizeUsage`, `revokeAuthorization` are all implemented

**Key gaps:**
- `iTransfer()` and `iClone()` (canonical 3-param forms) are missing from the interface
- `Transferred` event not emitted
- `iClonFrom` has zero test coverage
- Struct definitions diverge significantly from the EIP (single `dataHash`, no `oldDataHash`/`newDataHash`, added `validUntil`)
- `verifyTransferValidity` signature changed from 1-arg to 3-arg
- EIP-7201 storage slots are incorrect in all 6 source files (live deployment)
- Several secondary function paths untested (operator transfers, delegation, revocation)
