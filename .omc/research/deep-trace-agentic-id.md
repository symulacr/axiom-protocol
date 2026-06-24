# Deep Trace Report: ERC-7857 (Agentic ID) Contract Integration in Axiom Protocol

**Date:** 2026-06-24  
**Scope:** All Solidity contracts in `apps/contracts/src/` related to ERC-7857  
**Method:** Static analysis, cross-referenced against EIP-7857 FINAL spec (2025-01-02) and 0G reference implementation

---

## 1. FULL iTransferFrom CALL CHAIN

### Entry Point
```
AxiomAgentNFT.iTransferFrom(from, to, tokenId, proofs)
```

### Call Chain (top to bottom)

```
AxiomAgentNFT.iTransferFrom(from, to, tokenId, proofs)                      [AxiomAgentNFT.sol:129-134]
│  (inherited from ERC7857Upgradeable; no override)
│
└─► ERC7857Upgradeable._transfer(from, to, tokenId, proofs)                  [ERC7857Upgradeable.sol:122-126]
    │
    ├─► ERC7857Upgradeable._proofCheck(from, to, tokenId, proofs)            [ERC7857Upgradeable.sol:69-119]
    │   │
    │   ├─► Revert if to == address(0) → ERC721InvalidReceiver(to)          [line 75-77]
    │   ├─► Revert if _ownerOf(tokenId) != from → ERC721InvalidSender(from) [line 78-80]
    │   ├─► Revert if proofs.length == 0 → ERC7857EmptyProof()              [line 81-83]
    │   │
    │   ├─► $.verifier.verifyTransferValidity(proofs, to, address(this))    [line 85]
    │   │   └─► AxiomTeeVerifier.verifyTransferValidity (see §2 below)
    │   │
    │   ├─► datas = _intelligentDatasOf(tokenId)                             [line 87]
    │   │   └─► ERC7857IDataStorageUpgradeable._intelligentDatasOf           [ERC7857IDataStorage.sol:36-39]
    │   │
    │   ├─► Revert if proofOutput.length != datas.length → ERC7857ProofCountMismatch() [line 89-91]
    │   │
    │   └─► For each proofOutput[i]:
    │       ├─► Revert if dataHash mismatch → ERC7857DataHashMismatch()     [line 97-99]
    │       ├─► Revert if accessAssistant is not to and not                  [line 101-103]
    │       │   accessAssistants[to] → ERC7857AccessAssistantMismatch()
    │       ├─► If wantedKey.length == 0:
    │       │   ├─► defaultReceiver = Utils.pubKeyToAddress(targetPubkey)    [line 107]
    │       │   └─► Revert if defaultReceiver != to → ERC7857WantedReceiverMismatch() [line 108-109]
    │       └─► If wantedKey.length > 0:
    │           └─► Revert if !bytesEqual(targetPubkey, wantedKey) → ERC7857TargetPubkeyMismatch() [line 111-113]
    │
    ├─► safeTransferFrom(from, to, tokenId)                                   [line 124]
    │   └─► ERC721Upgradeable.safeTransferFrom
    │       └─► _checkAuthorized(from, to, tokenId)
    │       └─► _update(to, tokenId, msg.sender)                             [ERC721Upgradeable]
    │           └─► ERC7857AuthorizeUpgradeable._update                      [ERC7857Authorize.sol:107-110]
    │               ├─► super._update(to, tokenId, auth) → ERC721Upgradeable._update
    │               │   ├─► _beforeTokenTransfer (no-op)
    │               │   └─► Update ownership in ERC721 storage
    │               └─► _clearAuthorized(tokenId)                            [ERC7857Authorize.sol:63-71]
    │
    └─► emit PublishedSealedKey(to, tokenId, sealedKeys)                     [line 125]
```

### Key Observations on iTransferFrom

1. **`_checkAuthorized` happens INSIDE `safeTransferFrom`**, which is called AFTER `_proofCheck`. This means proof validation happens before ownership/auth checking. If `_checkAuthorized` fails, the proof was already validated (and marked as used in the verifier), burning the proof nonce unnecessarily.

2. **`_clearAuthorized` happens ON TRANSFER** in `ERC7857AuthorizeUpgradeable._update`. This is spec-compliant — authorizations are cleared on transfer.

3. **`intelligentDatasOf` is NOT updated during transfer.** The EIP-7857 spec implies the dataHash should be updated (oldDataHash → newDataHash), but Axiom's implementation only stores the initial data at mint time and never changes it on transfer. This is a CRITICAL design divergence from the spec.

4. **`safeTransferFrom` → `_update` → ERC721's `_checkAuthorized`** checks that `msg.sender` is authorized (owner, approved, or operator). For the `iTransferFrom` path, `msg.sender` must be the owner (`from`) OR an approved operator. The proof verification does NOT check that `msg.sender == from` — that's enforced by `_checkAuthorized` at the ERC721 level.

---

## 2. FULL verifyTransferValidity CALL CHAIN (AxiomTeeVerifier)

### Entry Point
```
AxiomTeeVerifier.verifyTransferValidity(proofs, to, nft)
```

### Full Path with Every Revert Branch

```
AxiomTeeVerifier.verifyTransferValidity(proofs, to, nft)                    [AxiomTeeVerifier.sol:189-289]
│
│  Pre-loop state:
│  ├─ expectedSigner = registeredSigner()
│  ├─ maxAge = maxProofAgeSeconds
│  ├─ nowTs = block.timestamp
│  └─ outputs = new TransferValidityProofOutput[](proofs.length)
│
├─► For each proof p in proofs:
│   │
│   ├─► _checkValidUntil(p.ownershipProof.validUntil, nowTs, maxAge)       [AxiomTeeVerifier.sol:301-308]
│   │   ├─► Revert AxiomProofExpired(validUntil, nowTs)                     ← if validUntil < nowTs
│   │   └─► Revert AxiomValidUntilTooFar(validUntil, nowTs, maxAge)        ← if validUntil - nowTs > maxAge
│   │
│   ├─► _checkValidUntil(p.accessProof.validUntil, nowTs, maxAge)          [same as above]
│   │
│   ├─► CROSS-PROOF CONSISTENCY CHECK                                       [AxiomTeeVerifier.sol:210-217]
│   │   Checks:
│   │   ├─ p.accessProof.dataHash != p.ownershipProof.dataHash         → ProofFieldMismatch()
│   │   ├─ keccak256(p.accessProof.targetPubkey) !=
│   │   │   keccak256(p.ownershipProof.targetPubkey)                   → ProofFieldMismatch()
│   │   ├─ p.accessProof.nonce != p.ownershipProof.nonce               → ProofFieldMismatch()
│   │   └─ p.accessProof.validUntil != p.ownershipProof.validUntil     → ProofFieldMismatch()
│   │
│   ├─► OWNERSHIP PROOF VERIFICATION
│   │   ├─ Build EIP-712 digest with OWNERSHIP_PROOF_TYPEHASH
│   │   ├─ _recoverSigner(ownershipMessage, p.ownershipProof.proof)        [AxiomTeeVerifier.sol:145-149]
│   │   │   ├─► Revert AxiomInvalidSigner()       ← if signature.length != 65
│   │   │   └─► Revert AxiomInvalidSigner()       ← if ECDSA.recover returns address(0)
│   │   └─► Revert AxiomInvalidOwnershipProof()    ← if recovered != expectedSigner
│   │
│   ├─► ACCESS PROOF VERIFICATION
│   │   ├─ Build EIP-712 digest with ACCESS_PROOF_TYPEHASH
│   │   ├─ _recoverSigner(accessMessage, p.accessProof.proof)              [AxiomTeeVerifier.sol:145-149]
│   │   │   ├─► Revert AxiomInvalidSigner()       ← if signature.length != 65
│   │   │   └─► Revert AxiomInvalidSigner()       ← if ECDSA.recover returns address(0)
│   │   └─► Revert AxiomInvalidAccessProof()       ← if recovered == address(0)
│   │   └─ NOTE: Does NOT check recovered == to here. The binding to `to`
│   │            happens in ERC7857Upgradeable._proofCheck.
│   │
│   ├─► REPLAY PROTECTION
│   │   ├─ proofNonce = keccak256(abi.encode(dataHash, targetPubkey,
│   │   │                   sealedKey, nonce, validUntil))                  [line 270-276]
│   │   └─ BaseVerifier._checkAndMarkProof(proofNonce)                     [BaseVerifier.sol:17-20]
│   │       └─► Revert "Proof already used"   ← if usedProofs[proofNonce] == true
│   │
│   └─► Populate output struct                                               [line 278-288]
│
└─► Return outputs[]
```

### CRITICAL FINDING: No Timestamp Check on Hot Path

The `maxProofAgeSeconds` is checked via `_checkValidUntil` only for the `validUntil` field within the proof struct. But as documented in BUG-TEE-13D-02, there is NO check that compares `block.timestamp` against a `proofTimestamp` (when the proof was actually signed). The `proofTimestamps` mapping in `BaseVerifier` records when a proof nonce was **first used**, not when it was **signed**. The `_getMaxProofAge()` is only consumed by `cleanExpiredProofs`, which is a manual housekeeping function.

This means: if a proof with `validUntil = block.timestamp + 1 year` is generated (bypassing the TEE's `maxProofAgeSeconds` enforcement), the contract will accept it because `_checkValidUntil` only checks `validUntil - nowTs > maxProofAgeSeconds` — but the `validUntil` is chosen by the TEE signer or the receiver at signing time. The contract's own `maxProofAgeSeconds` is consulted here, so this is actually correct IF the TEE enforces it. The bug is about the SEPARATE concern that `proofTimestamps` (when the proof was FIRST VERIFIED) is not checked against `maxProofAgeSeconds` — the "replay window" is not bounded by age.

**Wait — re-reading `_checkValidUntil`:** Line 302: `if (validUntil - nowTs > maxAge)` — this DOES check the proof's `validUntil` against `maxProofAgeSeconds`. So the TEE cannot set `validUntil` more than 7 days in the future. This is correct. What is NOT checked is: the NONCE-based replay protection has no time-bound expiry; the `proofTimestamps` mapping records when the proof was first used, and `cleanExpiredProofs` can clean it after `maxProofAgeSeconds`, but that's a manual call. A used nonce remains marked forever unless explicitly cleaned.

### All Possible Revert Paths (17 total)

| # | Location | Condition | Error |
|---|----------|-----------|-------|
| 1 | `_proofCheck` L75-77 | `to == address(0)` | `ERC721InvalidReceiver` |
| 2 | `_proofCheck` L78-80 | `_ownerOf(tokenId) != from` | `ERC721InvalidSender` |
| 3 | `_proofCheck` L81-83 | `proofs.length == 0` | `ERC7857EmptyProof` |
| 4 | `verifyTransferValidity` L206 | `ownershipProof.validUntil < block.timestamp` | `AxiomProofExpired` |
| 5 | `verifyTransferValidity` L207 | `accessProof.validUntil < block.timestamp` | `AxiomProofExpired` |
| 6 | `verifyTransferValidity` L208 | `ownershipProof.validUntil - now > maxAge` | `AxiomValidUntilTooFar` |
| 7 | `verifyTransferValidity` L209 | `accessProof.validUntil - now > maxAge` | `AxiomValidUntilTooFar` |
| 8 | `verifyTransferValidity` L212-216 | Cross-proof field mismatch | `ProofFieldMismatch` |
| 9 | `_recoverSigner` L147 | `signature.length != 65` | `AxiomInvalidSigner` |
| 10 | `_recoverSigner` L148 | `ECDSA.recover` returns `address(0)` | `AxiomInvalidSigner` |
| 11 | `verifyTransferValidity` L224 | Ownership signer != `registeredSigner` | `AxiomInvalidOwnershipProof` |
| 12 | `verifyTransferValidity` L257 | Access signer == `address(0)` | `AxiomInvalidAccessProof` |
| 13 | `BaseVerifier._checkAndMarkProof` L18 | `usedProofs[nonce] == true` | `"Proof already used"` (string) |
| 14 | `_proofCheck` L89-91 | `proofOutput.length != datas.length` | `ERC7857ProofCountMismatch` |
| 15 | `_proofCheck` L97-99 | `proofOutput[i].dataHash != datas[i].dataHash` | `ERC7857DataHashMismatch` |
| 16 | `_proofCheck` L101-103 | Access assistant mismatch | `ERC7857AccessAssistantMismatch` |
| 17 | `_proofCheck` L108-109 | `pubKeyToAddress(targetPubkey) != to` | `ERC7857WantedReceiverMismatch` |
| 18 | `_proofCheck` L111-113 | `targetPubkey != wantedKey` | `ERC7857TargetPubkeyMismatch` |

**Note on 13:** Uses a `require` string instead of a custom error. This is inconsistent with every other error in the codebase which uses custom errors.

---

## 3. EIP-7857 COMPLIANCE MATRIX

Compare against the EIP-7857 FINAL spec (2025-01-02) fetched from `eips.ethereum.org/EIPS/eip-7857`.

### Interface Functions

| EIP-7857 Function | Axiom Has? | Axiom Signature | Match? |
|---|---|---|---|
| `iTransfer(address _to, uint256 _tokenId, TransferValidityProof[] calldata _proofs)` | **NO** | — | ❌ MISSING |
| `iTransferFrom(address _from, address _to, uint256 _tokenId, TransferValidityProof[] calldata _proofs)` | YES | Same | ✅ |
| `iClone(address _to, uint256 _tokenId, TransferValidityProof[] calldata _proofs)` | **NO** (has `iCloneFrom`) | `iCloneFrom(address,address,uint256,TransferValidityProof[])` | ❌ DIVERGENT |
| `authorizeUsage(uint256 _tokenId, address _user)` | YES | Same | ✅ |
| `revokeAuthorization(uint256 _tokenId, address _user)` | YES | Same | ✅ |
| `delegateAccess(address _assistant)` | YES | Same | ✅ |
| `getDelegateAccess(address _user)` | YES | Same | ✅ |
| `verifier()` | YES | Same | ✅ |
| `ownerOf(uint256 _tokenId)` | YES (ERC721) | Same | ✅ |
| `authorizedUsersOf(uint256 _tokenId)` | YES | Same | ✅ |
| `approve(address _to, uint256 _tokenId)` | YES (ERC721) | Same | ✅ |
| `setApprovalForAll(address _operator, bool _approved)` | YES (ERC721) | Same | ✅ |
| `getApproved(uint256 _tokenId)` | YES (ERC721) | Same | ✅ |
| `isApprovedForAll(address _owner, address _operator)` | YES (ERC721) | Same | ✅ |

### Interface Errors

| EIP-7857 Error | Axiom Has? | Match? |
|---|---|---|
| `ERC7857InvalidAssistant(address)` | YES (no param) | ❌ DIVERGENT — EIP takes `address`, Axiom has no params |
| `ERC7857EmptyProof()` | YES | ✅ |
| `ERC7857ProofCountMismatch()` | YES | ✅ |
| `ERC7857DataHashMismatch()` | YES | ✅ |
| `ERC7857AccessAssistantMismatch()` | YES | ✅ |
| `ERC7857WantedReceiverMismatch()` | YES | ✅ |
| `ERC7857TargetPubkeyMismatch()` | YES | ✅ |

### Events

| EIP-7857 Event | Axiom Has? | Parameter Order | Match? |
|---|---|---|---|
| `Approval(address indexed _from, address indexed _to, uint256 indexed _tokenId)` | YES (ERC721) | Same | ✅ |
| `ApprovalForAll(address indexed _owner, address indexed _operator, bool _approved)` | YES (ERC721) | Same | ✅ |
| `Authorization(address indexed _from, address indexed _to, uint256 indexed _tokenId)` | YES | `(tokenId, from, to)` — order differs! | ❌ ORDER |
| `AuthorizationRevoked(address indexed _from, address indexed _to, uint256 indexed _tokenId)` | YES | `(tokenId, from, user)` — order differs! | ❌ ORDER |
| `Transferred(uint256 indexed _tokenId, address indexed _from, address indexed _to)` | **NO** | — | ❌ MISSING |
| `Cloned(uint256 indexed _tokenId, uint256 indexed _newTokenId, address _from, address _to)` | YES | Same | ✅ |
| `PublishedSealedKey(address indexed _to, uint256 indexed _tokenId, bytes[] _sealedKeys)` | YES | Same | ✅ |
| `DelegateAccess(address indexed _user, address indexed _assistant)` | YES | Same | ✅ |
| `Updated(uint256 indexed _tokenId, IntelligentData[] _oldDatas, IntelligentData[] _newDatas)` | In extensions | `(tokenId, oldDatas, newDatas)` | ⚠️ In extensions, not core |

### Structs

| EIP-7857 Struct | Axiom Version | Match? |
|---|---|---|
| `AccessProof.oldDataHash` (bytes32) | Flat to `dataHash` | ❌ — EIP has old+new, Axiom has single |
| `AccessProof.newDataHash` (bytes32) | **NOT PRESENT** | ❌ MISSING |
| `AccessProof.nonce` (bytes) | `nonce` (uint256) | ❌ TYPE — EIP says bytes, Axiom uses uint256 |
| `AccessProof.encryptedPubKey` (bytes) | `targetPubkey` (bytes) | ❌ RENAMED + SEMANTICS |
| `AccessProof.proof` (bytes) | Same | ✅ |
| `AccessProof.validUntil` (uint256) | **ADDED** | ⚠️ Axiom extension |
| `OwnershipProof.oracleType` | Same | ✅ |
| `OwnershipProof.oldDataHash` (bytes32) | Flat to `dataHash` | ❌ |
| `OwnershipProof.newDataHash` (bytes32) | **NOT PRESENT** | ❌ MISSING |
| `OwnershipProof.sealedKey` (bytes) | Same | ✅ |
| `OwnershipProof.encryptedPubKey` (bytes) | `targetPubkey` (bytes) | ❌ RENAMED |
| `OwnershipProof.nonce` (bytes) | `nonce` (uint256) | ❌ TYPE |
| `OwnershipProof.proof` (bytes) | Same | ✅ |
| `OwnershipProof.validUntil` (uint256) | **ADDED** | ⚠️ Axiom extension |
| `TransferValidityProofOutput.oldDataHash` | **NOT PRESENT** | ❌ MISSING |
| `TransferValidityProofOutput.newDataHash` | **NOT PRESENT** | ❌ MISSING |
| `TransferValidityProofOutput.sealedKey` | Same | ✅ |
| `TransferValidityProofOutput.encryptedPubKey` | `targetPubkey` | ❌ RENAMED |
| `TransferValidityProofOutput.wantedKey` | Same | ✅ |
| `TransferValidityProofOutput.accessAssistant` | Same | ✅ |
| `TransferValidityProofOutput.accessProofNonce` (bytes) | Same (bytes) | — |
| `TransferValidityProofOutput.ownershipProofNonce` (bytes) | Same (bytes) | — |

### Data Verifier Interface

| EIP-7857 | Axiom | Match? |
|---|---|---|
| `verifyTransferValidity(TransferValidityProof[] calldata _proofs)` (1 param) | `verifyTransferValidity(TransferValidityProof[] calldata proofs, address to, address nft)` (3 params) | ❌ DIVERGENT SIGNATURE |

### Critical Compliance Gaps Summary

1. **`iTransfer()` completely missing** — the EIP defines `iTransfer(address _to, uint256 _tokenId, TransferValidityProof[])` as a separate function from `iTransferFrom`. Axiom only has `iTransferFrom`.

2. **`iClone()` missing** — EIP defines `iClone(address _to, uint256 _tokenId, TransferValidityProof[])`. Axiom only has `iCloneFrom(address _from, address _to, uint256 _tokenId, TransferValidityProof[])`.

3. **`Transferred` event missing** — EIP defines `event Transferred(uint256 indexed _tokenId, address indexed _from, address indexed _to)` as distinct from ERC-721's `Transfer`.

4. **Struct design completely different** — EIP uses `oldDataHash`/`newDataHash` dual-hash model; Axiom uses a single `dataHash` model with no hash update during transfer.

5. **verifyTransferValidity signature diverges** — EIP defines 1-param interface; Axiom uses 3 params for EIP-712 domain binding.

6. **Event parameter order for Authorization events** — EIP specifies `indexed _from, indexed _to, indexed _tokenId`; Axiom emits `(tokenId, from, to)`.

7. **`nonce` type mismatch** — EIP specifies `bytes` for nonces; Axiom uses `uint256`.

---

## 4. 0G REFERENCE IMPLEMENTATION COMPARISON

Based on the 0G `0g-agent-nft` repo (MIT, main branch):

### Interface Divergences

| Aspect | 0G Reference | Axiom | Gap |
|---|---|---|---|
| `verifyTransferValidity` params | 1-arg `(proofs)` | 3-arg `(proofs, to, nft)` | MAJOR - EIP-712 domain binding |
| EIP-712 domain binding | NOT in data verifier | Domain separator binds to contract+chain | Security improvement in Axiom |
| `AccessProof.nonce` type | `bytes` | `uint256` | Type mismatch |
| `OwnershipProof.nonce` type | `bytes` | `uint256` | Type mismatch |
| `AccessProof.encryptedPubKey` | `encryptedPubKey` (bytes) | `targetPubkey` (bytes) | Renamed |
| `OwnershipProof.encryptedPubKey` | `encryptedPubKey` (bytes) | `targetPubkey` (bytes) | Renamed |
| `validUntil` in proofs | NOT present | ADDED | Axiom extension |
| `OracleType` enum location | Same file | Same file | ✅ |
| `BaseVerifier._getMaxProofAge()` | Hardcoded 7 days | `immutable` via override | ✅ |
| `cleanExpiredProofs` | Same pattern | Same pattern | ✅ |
| `IERC7857Cloneable` interface | Same | Same | ✅ |
| `IERC7857Authorize` interface | Same | Same | ✅ |
| `iCloneFrom` | Present | Present | ✅ |
| `iTransferFrom` | Present | Present | ✅ |
| `iTransfer` (no from) | NOT present | NOT present | Same (both diverge from spec) |
| `iClone` (no from) | NOT present | NOT present | Same (both diverge from spec) |
| `Transferred` event | NOT present | NOT present | Same (both diverge from spec) |
| Authorization event params | `(from, to, tokenId)` | `(tokenId, from, to)` | ORDER DIFFERS between 0G and Axiom |
| `supportsInterface` for `IERC7857` | ✅ | ✅ | ✅ |
| `supportsInterface` for `IERC7857Metadata` | NOT explicit | ✅ | Axiom adds extra |
| `name()`/`symbol()` in IERC7857Metadata | From ERC721 | Same | ✅ |

### Storage Slot Bug (Shared)

The ERC-7201 storage slot values are **identical** between 0G reference and Axiom for the shared namespaces:

| Namespace | 0G Value | Axiom Value | EIP-7201 Correct Value | Match? |
|---|---|---|---|---|
| `0g.storage.ERC7857` | `0xa2b4...3c00` | `0xa2b4...3c00` | `0x64b7...2100` | Both WRONG (same) |
| `0g.storage.ERC7857Cloneable` | `0x03de...8000` | `0x03de...8000` | `0x8d55...d500` | Both WRONG (same) |
| `0g.storage.ERC7857Authorize` | `0xf386...5700` | `0xf386...5700` | `0x38f5...8d00` | Both WRONG (same) |

Axiom inherited the incorrect hardcoded values from 0G's reference implementation. The `agent.storage.AxiomAgentNFT` and `agent.storage.AxiomTeeVerifier` namespaces are Axiom-specific and also wrong.

### Code Structure Differences

| Aspect | 0G Reference | Axiom |
|---|---|---|
| Ownable | In `AgentNFT` directly | Via `OwnableUpgradeable` on `AxiomAgentNFT` |
| UUPSUpgradeable | NOT present | ON `AxiomAgentNFT` |
| `constructor()` + `initialize()` pattern | OpenZeppelin upgradeable | Same + UUPS |
| `_update` override | From `ERC7857AuthorizeUpgradeable` | Same pattern |
| Metadata JSON extension | NOT present | `AxiomMetadataJson` library |
| `mintWithRole(address to)` (standard NFT) | Present (+ `string uri` variants) | NOT present |
| `batchAuthorizeUsage` | Present | NOT present |
| `clearAuthorizedUsers` | Present + `AuthorizedUsersCleared` event | NOT present |
| `tokenURI()` | Present (ERC721Metadata) | NOT present (no `tokenURI` at all) |
| `setBaseURI` / `setTokenURI` | Present | NOT present |
| `grantMinterRole` / `revokeMinterRole` | Present | Uses `_grantRole` directly |
| **EIP-712 in verifier** | NOT present | Full EIP-712 typed data signing |
| **Domain separator** | NOT present | `_domainSeparator()` + `domainSeparator()` |

---

## 5. EXHAUSTIVE TEST COVERAGE ANALYSIS

### 5a. `AxiomAgentNFT.t.sol` — Unit Tests (Foundry)

| Test Function | What It Tests | Happy/Revert/Edge | Coverage |
|---|---|---|---|
| `test_initialize_setsRolesAndOwner` | Initialize sets name, symbol, roles, verifier | Happy | ✅ Full |
| `test_mint_happy` | Basic mint via `_mintTo` helper | Happy | ✅ Basic |
| `test_withdrawMintFees_onlyAdmin` | Admin can withdraw | Happy | ✅ |
| `test_withdrawMintFees_revertNotAdmin` | Non-admin cannot withdraw | Revert | ✅ |
| `test_mint_revertZeroAddress` | Mint to zero address | Revert | ✅ |
| `test_mint_revertEmptyData` | Mint with empty data | Revert | ✅ |
| `test_iTransferFrom_happy` | Successful transfer | Happy | ✅ |
| `test_iTransferFrom_revertBadOracleSig` | Tampered ownership signature | Revert | ✅ |
| `test_iTransferFrom_revertBadAccessSig` | Tampered access signature | Revert | ✅ |
| `test_iTransferFrom_revertEmptyProofs` | Empty proof array | Revert | ✅ |
| `test_iTransferFrom_revertNotOwner` | Non-owner calls transfer | Revert | ✅ |
| `test_iTransferFrom_revertReplay` | Same proof twice (replay protection) | Revert | ✅ |
| `test_iTransferFrom_revertMixedProofs` | Cross-proof field mismatch | Revert | ✅ |
| `test_verifyTransferValidity_revertMixedProofs_direct` | ProofFieldMismatch at verifier | Revert | ✅ |
| `test_updateVerifier_onlyOperator` | Operator updates verifier | Happy | ✅ |
| `test_updateVerifier_revertNotOperator` | Non-operator cannot update | Revert | ✅ |
| `test_pause_unpause` | Pause blocks mint, unpause allows | Edge | ✅ |
| `test_authorizeUsage_revertTooMany` | Exceed MAX_AUTHORIZED_USERS | Revert | ✅ |
| `test_update_onlyOwner` | Owner updates data | Happy | ✅ |
| `test_update_revertNotOwner` | Non-owner cannot update | Revert | ✅ |
| `test_upgrade_onlyOwner` | Non-owner cannot upgrade | Revert | ✅ |
| `test_upgrade_owner_succeeds` | Owner upgrade succeeds | Happy | ✅ |

### 5b. `AxiomAgentNFT.t.sol` — What is NOT Tested

| Feature | Missing Tests | Severity |
|---|---|---|
| **`iCloneFrom()`** | Zero tests for clone functionality | HIGH |
| **`authorizeUsage()` happy path** | Only `revertTooMany` tested. No test that authorized user is actually added | MEDIUM |
| **`revokeAuthorization()`** | Zero tests | MEDIUM |
| **`delegateAccess()` + `getDelegateAccess()`** | Zero tests for access assistant pattern | HIGH |
| **`authorizedUsersOf()`** | Zero tests (except indirectly in fuzz) | MEDIUM |
| **`mintWithRole()` happy path** | Only used in fuzz, not in unit tests | LOW |
| **`creatorOf()`** | Only implicitly tested via `test_mint_happy` | LOW |
| **`setMintFee()`** | Zero tests | MEDIUM |
| **`setStorageInfo()` / `storageInfo()`** | Zero tests | LOW |
| **`mint()` with actual mint fee > 0** | Only tested with fee=0 | MEDIUM |
| **`intelligentDatasOf()` nonexistent token** | Zero tests for ERC721NonexistentToken case | LOW |
| **`update()` with empty data** | Zero tests | LOW |
| **`update()` with nonexistent token** | Zero tests | LOW |
| **Transfer with delegateAccess** | Zero tests for access assistant on transfer | HIGH |
| **`supportsInterface()`** | No explicit test for interface detection | LOW |
| **`tokenURI()` / metadata JSON** | No test for OpenSea metadata output | LOW |
| **`iTransferFrom` via approved operator** | Only tested via `msg.sender == from` path | MEDIUM |
| **`iTransferFrom` with multiple proofs batch** | Only single-proof tested | MEDIUM |
| **`_refundExcess()`** | No test for overpayment refund | LOW |
| **`withdrawMintFees()` zero balance** | No edge case test | LOW |

### 5c. `FuzzAxiomAgentNFT.t.sol` — Fuzz + Invariant Tests (Live Fork)

| Test Function | What It Tests | Notes |
|---|---|---|
| `testFuzz_mintWithRole_recordsAllFields` | Mint with fuzzed receiver, creator, dataHash, description | ✅ Comprehensive fuzz on live |
| `testFuzz_authorizeUsage_accessControl` | Auth with fuzzed caller/user | ✅ Tests happy + revert for non-owner + zero address |
| `testFuzz_iTransferFrom_doesNotClearData` | Transfer and assert datas preserved | ✅ CRITICAL invariant: dataHash not cleared on transfer |
| `invariant_totalSupplyMonotonic` | nextTokenId never decreases | ✅ Reads from ERC-7201 slot |
| `invariant_dataHashNeverLost` | dataHash remains non-zero and stable | ✅ Passive check |

### 5d. `FuzzAxiomTeeVerifier.t.sol` — Verifier Fuzz Tests

| Test Function | What It Tests | Notes |
|---|---|---|
| `testFuzz_verifyTransferValidity_validProof_succeeds` | Fuzzed receiver + dataHash + nonce | ✅ Full parameter coverage |
| `testFuzz_verifyTransferValidity_wrongSigner_reverts` | Random key != TEE signer | ✅ |
| `testFuzz_verifyTransferValidity_wrongAccessMessage_reverts` | Tampered dataHash in access proof | ✅ |
| `testFuzz_verifyTransferValidity_truncatedSignature_reverts` | 64-byte ownership sig | ✅ |
| `testFuzz_verifyTransferValidity_zeroLengthSignature_reverts` | Empty ownership sig | ✅ |
| `testFuzz_verifyTransferValidity_inBatchReplay_reverts` | Duplicate proof in single call | ✅ |
| `testFuzz_verifyTransferValidity_emptyBatch_succeeds` | Zero-length array | ✅ |
| `testFuzz_verifyTransferValidity_batchLength5_succeeds` | Batch of 5 | ✅ |
| `testFuzz_verifyTransferValidity_batchLength10_succeeds` | Batch of 10 | ✅ |
| `testFuzz_verifyTransferValidity_validUntilPast_reverts` | Past deadline | ✅ |
| `testFuzz_verifyTransferValidity_validUntilAtNow_succeeds` | Boundary: now | ✅ |
| `testFuzz_verifyTransferValidity_validUntilFuture_succeeds` | Future within window | ✅ |
| `testFuzz_verifyTransferValidity_validUntilTooFar_reverts` | Future beyond maxAge | ✅ |
| `test_verifyTransferValidity_validUntilOverflow_reverts` | `type(uint256).max` | ✅ No panic |
| `testFuzz_verifyTransferValidity_warpPast_validUntilReverts` | Time warp past deadline | ✅ |
| `test_liveForkBytecode_containsMaxProofAgeSelector` | Deployed bytecode has selector | ✅ |
| `testFuzz_registerSigner_ownerRotatesToNewSigner` | Owner rotates signer | ✅ |
| `testFuzz_registerSigner_zeroAddress_reverts` | Zero address rejected | ✅ |
| `testFuzz_registerSigner_strangerReverts` | Non-owner cannot register | ✅ |
| `testFuzz_registerSigner_rotateToCurrentSigner_succeeds` | No-op rotation | ✅ |
| `testFuzz_cleanExpiredProofs_anyCallerCanClean` | Anyone can clean expired | ✅ |
| `testFuzz_cleanExpiredProofs_keepsLiveExpiresExpired` | Mixed live/expired cleanup | ✅ |
| `invariant_registeredSignerNeverZero` | Signer never zero | ✅ |
| `invariant_maxProofAgeConstant` | Immutable unchanged | ✅ |

### 5e. Fuzz — What is NOT Tested

| Feature | Missing Tests | Severity |
|---|---|---|
| **`verifyTransferValidity` with `ZKP` oracle type** | All tests use `OracleType.TEE` | MEDIUM |
| **`verifyTransferValidity` with access assistant** | No test where `accessAssistant != to` | MEDIUM |
| **`verifyTransferValidity` with malformed `targetPubkey`** | No edge case for invalid pubkey | LOW |
| **Re-entrancy during `verifyTransferValidity`** | Not tested | MEDIUM |
| **Extreme batch sizes (>10)** | Only 5 and 10 tested | LOW |
| **`cleanExpiredProofs` with empty array** | Not tested | LOW |
| **Invariant: `usedProofs` never double-marked** | Not tested | LOW |

---

## 6. ERC-7201 STORAGE SLOT TRACE (BUG-1)

### 6a. All 8 Storage Locations in Source

#### 1. `ERC7857Upgradeable.sol` — Namespace: `"0g.storage.ERC7857"`
```solidity
// Source constant (line 24)
0xa2b40c657abdbf180a6038c081d3a0af6206dcea36f4558f991bf8c787ef3c00
// EIP-7201 formula result:
// keccak256(abi.encode(uint256(keccak256("0g.storage.ERC7857")) - 1)) & ~bytes32(uint256(0xff))
// = 0x64b7a9174199f8a05a46e657b8e43f869b1cedd4a1aa5b02d35e29bd7e3f2100
// MISMATCH: 0xa2b4...3c00 vs 0x64b7...2100
```

#### 2. `ERC7857CloneableUpgradeable.sol` — Namespace: `"0g.storage.ERC7857Cloneable"`
```solidity
// Source constant (line 26)
0x03de6cf14ecf4575e0ed0cc2fdb9b7ee13500cb3c0c403254fc893bf6e0c8000
// EIP-7201 formula result:
// = 0x8d5521bd6fec1e93fcf974e20f4fbc3e25cca19b89d2c9c3a0ac21ad0bcd500
// MISMATCH: 0x03de...8000 vs 0x8d55...d500
//
// NOTE: FuzzAxiomAgentNFTSanity.sol line 410 has:
//   CLONEABLE_STORAGE_SLOT = 0x8d5521bd6fec1e93fcf974e20f4fbc3e25cca19b89d2c9c3a0ac21ad0bcd500
// But FuzzAxiomAgentNFT.sol line 28-29 has:
//   CLONEABLE_STORAGE_SLOT = 0x03de6cf14ecf4575e0ed0cc2fdb9b7ee13500cb3c0c403254fc893bf6e0c8000
// The fuzz test uses the SOURCE constant (wrong). The sanity test uses the CORRECT EIP-7201 value.
```

#### 3. `ERC7857AuthorizeUpgradeable.sol` — Namespace: `"0g.storage.ERC7857Authorize"`
```solidity
// Source constant (line 31)
0xf386e9faca35fbde2fe950510f665060c1dd15a136a76c268b6e6459b9945700
// EIP-7201 formula result:
// = 0x38f530a575a852d047a6f30287d6bfef69a637e8a35e24e31029853ac6c4c8d00
// MISMATCH: 0xf386...5700 vs 0x38f5...8d00
```

#### 4. `ERC7857IDataStorageUpgradeable.sol` — Namespace: `"0g.storage.ERC7857IDataStorage"`
```solidity
// Source constant (line 25)
0xcee27158032fdbe7e1246476ff878669b520bc82ee1a949d22135b88cc5f5b00
// EIP-7201 formula result:
// = 0xde7093eb3837496d25c4608e9a3053c84899ef29baaa49917f0951ab9e7a73d00
// MISMATCH: 0xcee2...5b00 vs 0xde70...3d00
```

#### 5. `AxiomAgentNFT.sol` — Namespace: `"agent.storage.AxiomAgentNFT"`
```solidity
// Source constant (line 71)
0xe982fe9a44d6409dbf89634fae06be5c796203a5c100b2ec87b395d27194a900
// EIP-7201 formula result:
// = 0x2b2e47f92e33c3308d1bd7658ac092554a4c25433f5432d4fdb86d5cfb2cd1900
// MISMATCH: 0xe982...a900 vs 0x2b2e...1900
```

#### 6. `AxiomTeeVerifier.sol` — Namespace: `"agent.storage.AxiomTeeVerifier"`
```solidity
// Source constant (line 55)
0xcdd50b252b44b49759effa27dcfb9f7db71e867632e96be05c00db87cfc30900
// EIP-7201 formula result:
// = 0x5d01f66be923b34f9b743e5c5c011231ea2ceee62a8b3a392dc9fc6bca064d100
// MISMATCH: 0xcdd5...0900 vs 0x5d01...d100
```

#### 7. `AxiomStrategyVault.sol` — Namespace: `"agent.storage.AxiomStrategyVault"`
```solidity
// Source constant (line 53)
0x2c8500969106113efc78631b1915a4e278f67bc66ee84f8db9954bdec44ca100
// EIP-7201 formula result:
// Would need to compute: keccak256("agent.storage.AxiomStrategyVault")
```

#### 8. `AxiomPaymentProcessor.sol` — Namespace: `"agent.storage.AxiomPaymentProcessor"`
```solidity
// Source constant (line 57)
0xb6e9ac8ab7d5307044651d01576943b58a3563d54e8f2be64d1601b1a6cebc00
```

### 6b. Summary Table

| Contract | Namespace | Deployed Slot (hex) | Correct EIP-7201 Slot | Match? |
|---|---|---|---|---|
| ERC7857Upgradeable | `0g.storage.ERC7857` | `0xa2b4…3c00` | `0x64b7…2100` | ❌ |
| ERC7857CloneableUpgradeable | `0g.storage.ERC7857Cloneable` | `0x03de…8000` | `0x8d55…d500` | ❌ |
| ERC7857AuthorizeUpgradeable | `0g.storage.ERC7857Authorize` | `0xf386…5700` | `0x38f5…8d00` | ❌ |
| ERC7857IDataStorageUpgradeable | `0g.storage.ERC7857IDataStorage` | `0xcee2…5b00` | `0xde70…3d00` | ❌ |
| AxiomAgentNFT | `agent.storage.AxiomAgentNFT` | `0xe982…a900` | `0x2b2e…1900` | ❌ |
| AxiomTeeVerifier | `agent.storage.AxiomTeeVerifier` | `0xcdd5…0900` | `0x5d01…d100` | ❌ |
| AxiomStrategyVault | `agent.storage.AxiomStrategyVault` | `0x2c85…a100` | ? | Unknown |
| AxiomPaymentProcessor | `agent.storage.AxiomPaymentProcessor` | `0xb6e9…bc00` | ? | Unknown |

### 6c. Root Cause

All 6 contracts use hardcoded `bytes32 private constant STORAGE_LOCATION` values that were copied from the 0G reference implementation. The 0G reference itself has incorrect ERC-7201 slot values. The EIP-7201 formula is:

```
keccak256(abi.encode(uint256(keccak256("namespace")) - 1)) & ~bytes32(uint256(0xff))
```

The deployed values are NOT computed from this formula. They appear to be arbitrary or copied from a pre-EIP-7201 version of 0G's code.

### 6d. Risk: What Breaks on Next Upgrade

| Scenario | Risk |
|---|---|
| **Fresh deployment with corrected slots** | All data in old storage is orphaned. Must migrate via a migration contract |
| **UUPS upgrade with same (wrong) slots** | Safe for existing data, but slots still non-standard. Collision risk with future OZ/other contract storage |
| **Two different upgradeable contracts sharing same proxy** | If another contract using incorrectly-derived slots deploys to the same proxy, storage collisions are possible |
| **OZ v6+ with different ERC-7201 defaults** | If OZ ever changes its ERC-7201 slot derivation algorithm (unlikely but possible), the current hardcoded values would diverge further |
| **Adding new storage to existing contracts** | The `__gap` arrays (e.g., `uint256[50] private __gap` in BaseVerifier) provide SOME protection, but if new storage variables are added, the slot collision risk with other incorrectly-slot'd contracts increases |

---

## 7. RISK MATRIX: WHAT BREAKS ON NEXT UPGRADE

### Storage Layout Risks

1. **ERC-7201 Violation (BUG-1):** The `STORAGE_LOCATION` constants in all 6 contracts are incorrect. If an upgrade adds new storage variables or restructures existing structs, the layout within each slot is at risk. More critically, if the deployer tries to "fix" the constants without a migration, all existing state is orphaned.

2. **UUPS Upgradeable + Non-standard Storage:** AxiomAgentNFT uses UUPSUpgradeable (mandated by security report F-02). The `_authorizeUpgrade` is gated by `onlyOwner` (OwnableUpgradeable). On upgrade, the new implementation contract's `proxiableUUID()` must match. If the new implementation changes any storage constant, existing proxy state is invalidated.

3. **`BaseVerifier.__gap[50]`:** The 0G reference includes a `uint256[50] private __gap` at the end of BaseVerifier. This is good practice for upgradeability. However, the derived verifiers (AxiomTeeVerifier) do NOT inherit from BaseVerifier with a `__gap` of their own — they rely on the base contract's gap. Any upgrade that adds state to AxiomTeeVerifier itself needs careful slot management.

### Functional Risks

4. **No `iTransfer()` function:** Any integrator relying on the EIP-7857 `iTransfer(address,uint256,TransferValidityProof[])` signature (without `_from`) will get a selector-not-found revert.

5. **No `iClone()` function:** Same problem for `iClone(address,uint256,TransferValidityProof[])`.

6. **No `Transferred` event:** Indexers that listen for the EIP-specified `Transferred` event will miss all agent transfers. Only ERC-721's `Transfer` event is emitted.

7. **Authorization event parameter order mismatch:** Indexers expecting `Authorization(indexed from, indexed to, indexed tokenId)` will get the parameters in the wrong indexed positions (`tokenId, from, to`).

8. **`intelligentDatasOf` not updated on transfer:** The EIP-7857 spec implies that on transfer, the `oldDataHash` is replaced with `newDataHash` from the proof. Axiom's implementation never updates the stored data on transfer — the same data persists forever. This means re-encryption proofs are verified but their `dataHash` outputs are effectively ignored for storage purposes.

### Verifier Risks

9. **No time-bounded replay protection in `cleanExpiredProofs`:** Used nonces remain forever unless `cleanExpiredProofs` is called manually. Over time, the `usedProofs` mapping grows unbounded. A griefing attack could fill it (though each call costs gas).

10. **`verifyTransferValidity` uses 3-arg interface:** Any external verifier (ZKP-based, for example) that follows the EIP spec with 1-arg cannot be plugged into Axiom's system without modification.

11. **`BaseVerifier` uses `require` string error:** `"Proof already used"` is a string-based require, not a custom error. This means 2100 gas extra for string storage on first occurrence versus custom error, and off-chain parsing must match the exact string.

12. **Access signer NOT checked against `to` in verifier:** The verifier only checks the access signer is not `address(0)`. The binding to `to` happens in `_proofCheck`. If a verifier delegation path is implemented incorrectly, a valid ECDSA signature from ANY address passes the verifier — the downstream `_proofCheck` is the only guard.

---

## 8. COMPLETE FUNCTION INDEX

Every public/external function across the ERC-7857 contract suite:

| Function | Contract | Has Test? | Notes |
|---|---|---|---|
| `initialize(name, symbol, storageInfo, verifier, admin)` | AxiomAgentNFT | ✅ | |
| `_update(to, tokenId, auth)` | AxiomAgentNFT | — | Internal override |
| `_intelligentDatasOf(tokenId)` | AxiomAgentNFT | — | Internal override |
| `_intelligentDatasLengthOf(tokenId)` | AxiomAgentNFT | — | Internal override |
| `_updateData(tokenId, newDatas)` | AxiomAgentNFT | — | Internal override |
| `supportsInterface(interfaceId)` | AxiomAgentNFT | ❌ | **No test** |
| `updateVerifier(newVerifier)` | AxiomAgentNFT | ✅ | |
| `setMintFee(newFee)` | AxiomAgentNFT | ❌ | **No test** |
| `mintFee()` | AxiomAgentNFT | ✅ (indirect) | |
| `setStorageInfo(newInfo)` | AxiomAgentNFT | ❌ | **No test** |
| `storageInfo()` | AxiomAgentNFT | ❌ | **No test** |
| `pause()` | AxiomAgentNFT | ✅ | |
| `unpause()` | AxiomAgentNFT | ✅ | |
| `update(tokenId, newDatas)` | AxiomAgentNFT | ✅ | |
| `_authorizeUpgrade(newImplementation)` | AxiomAgentNFT | ✅ | |
| `mint(iDatas, to)` | AxiomAgentNFT | ✅ | |
| `mintWithRole(iDatas, to)` | AxiomAgentNFT | ✅ (fuzz) | |
| `mintWithRole(iDatas, to, creator)` | AxiomAgentNFT | ✅ (fuzz) | |
| `creatorOf(tokenId)` | AxiomAgentNFT | ✅ (indirect) | |
| `withdrawMintFees(to)` | AxiomAgentNFT | ✅ | |
| `iTransferFrom(from, to, tokenId, proofs)` | ERC7857Upgradeable | ✅ | |
| `delegateAccess(assistant)` | ERC7857Upgradeable | ❌ | **No test** |
| `getDelegateAccess(user)` | ERC7857Upgradeable | ❌ | **No test** |
| `intelligentDatasOf(tokenId)` | ERC7857Upgradeable | ✅ | |
| `verifier()` | ERC7857Upgradeable | ✅ | |
| `iCloneFrom(from, to, tokenId, proofs)` | ERC7857CloneableUpgradeable | ❌ | **No test** |
| `authorizedUsersOf(tokenId)` | ERC7857AuthorizeUpgradeable | ✅ (fuzz) | |
| `authorizeUsage(tokenId, to)` | ERC7857AuthorizeUpgradeable | ✅ | |
| `revokeAuthorization(tokenId, user)` | ERC7857AuthorizeUpgradeable | ❌ | **No test** |
| `verifyTransferValidity(proofs, to, nft)` | AxiomTeeVerifier | ✅ | |
| `registeredSigner()` | AxiomTeeVerifier | ✅ | |
| `registerSigner(newSigner)` | AxiomTeeVerifier | ✅ | |
| `domainSeparator()` | AxiomTeeVerifier | ❌ | **No direct test** |
| `maxProofAgeSeconds()` | AxiomTeeVerifier | ✅ (live fork) | |
| `initialize(initialOwner)` | AxiomTeeVerifier | ❌ | **No test** |
| `cleanExpiredProofs(proofNonces)` | BaseVerifier | ✅ | |

**Functions with ZERO test coverage:**
1. `delegateAccess(address)`
2. `getDelegateAccess(address)`
3. `revokeAuthorization(uint256, address)`
4. `domainSeparator()` on AxiomTeeVerifier
5. `AxiomTeeVerifier.initialize(address)`
6. `setMintFee(uint256)` (only fuzz)
7. `setStorageInfo(string)`
8. `storageInfo()`

---

## 9. 0G REFERENCE vs AXIOM: SPECIFIC CODE DIFFERENCES IN VERIFIER

### verifyTransferValidity Signature

**0G Reference** (1-arg):
```solidity
function verifyTransferValidity(
    TransferValidityProof[] calldata proofs
) external returns (TransferValidityProofOutput[] memory);
```

**Axiom** (3-arg):
```solidity
function verifyTransferValidity(
    TransferValidityProof[] calldata proofs,
    address to,
    address nft
) external override returns (TransferValidityProofOutput[] memory outputs);
```

### EIP-712 Integration

**0G Reference:** No EIP-712. Uses legacy `\x19Ethereum Signed Message:\n66` prefix for both proof types.

**Axiom:** Full EIP-712 typed data signing:
- `_domainSeparator()` binds to contract address + chainId
- `OWNERSHIP_PROOF_TYPEHASH` for ownership proofs
- `ACCESS_PROOF_TYPEHASH` for access proofs
- Digest: `keccak256("\x19\x01" || domainSeparator || structHash)`

### AccessProof.encryptedPubKey → targetPubkey

**0G Reference:** Field named `encryptedPubKey` with comment "can be empty, meaning use receiver's ethereum public key."

**Axiom:** Field renamed to `targetPubkey` with same semantics. However, `targetPubkey` is required in the ownership proof (not optional), and the `wantedKey` in the output handles the "empty = default" logic.

### `validUntil` Field (Axiom Extension)

**0G Reference:** No `validUntil` field. No timestamp-based verification.

**Axiom:** Added `validUntil` field to both AccessProof and OwnershipProof, plus:
- `_checkValidUntil()`: rejects expired proofs
- `maxProofAgeSeconds` immutable: bounds how far future is allowed
- `AxiomProofExpired` / `AxiomValidUntilTooFar` custom errors

---

## 10. VERIFICATION: LIVE CONTRACT STATE

From `test/BUGS.md` and `FuzzAxiomAgentNFT.t.sol`:

| Check | Value | Source |
|---|---|---|
| Live proxy address | `0xf12F158a20c36a351b056FD60b3a7377ce4F1e09` | Fuzz test |
| Live verifier address | `0x24f725198d64A3b03A8386cD8fa12BD7c591734A` | Fuzz test |
| Chain | 0G Galileo testnet (chainId 16602) | Fuzz test |
| Fork block | 38,748,015 | BUGS.md |
| Deployed `nextTokenId` slot | `0x03de...8000` (source constant, NOT EIP-7201) | BUGS.md |
| Correct `nextTokenId` slot | `0x8d55...d500` (but live uses `0x03de...8000`) | BUGS.md |
| `maxProofAgeSeconds()` selector present | ✅ (Wave E-5 fix deployed) | `test_liveForkBytecode_containsMaxProofAgeSelector` |
| `mintFee()` on live | 0 OG | BUGS.md |
| `name()` | "Axiom Agent NFT" | Sanity test |
| `symbol()` | "AXM-A" | Sanity test |

---

## 11. ALL DOCUMENTED BUGS (Summary)

| Bug ID | Description | Severity | Status |
|---|---|---|---|
| BUG-1 | ERC-7201 storage slots wrong in 6 contracts | HIGH | Open (deployed; fix requires fresh deploy) |
| BUG-2 | Spec-vs-deployment signature mismatch (mint, authorizeUsage) | MEDIUM | Open (documented) |
| BUG-3 | `authorizeUsage` uses generic ERC721IncorrectOwner error | LOW | Open |
| BUG-4 | No public `nextTokenId()` or `totalSupply()` getter | LOW | Open |
| BUG-5 | `mint()` does not set creator (Wave 1: RESOLVED) | LOW | **RESOLVED** |
| BUG-6 | `mintFee()` returns 0 on live | INFO | Open (config decision) |
| BUG-TEE-13D-01 | `maxProofAgeSeconds()` missing from live bytecode (Wave E-5: FIXED) | HIGH | **FIXED** |
| BUG-TEE-13D-02 | `verifyTransferValidity` does not check proof timestamp at verification time | MEDIUM | Open (no `proofTimestamp` field) |
| BUG-VAULT-01 | Fuzz suite compile error (Wave 12A: FIXED) | BLOCKER | **FIXED** |
| EIP-iTransfer | `iTransfer(address,uint256,TransferValidityProof[])` missing from IERC7857 | MEDIUM | Spec gap |
| EIP-iClone | `iClone(address,uint256,TransferValidityProof[])` missing from IERC7857 | MEDIUM | Spec gap |
| EIP-Transferred | `Transferred` event missing | LOW | Spec gap |
| Event order | Authorization events parameter order diverges from EIP spec | LOW | Spec gap |
| Struct mismatch | AccessProof/OwnershipProof structs diverge from EIP spec (fields, types, semantics) | HIGH | Spec gap |
| Data not updated | `intelligentDatasOf` NOT updated during `iTransferFrom` | HIGH | Design gap |
| `verifyTransferValidity` signature | 3-arg vs 1-arg EIP spec | MEDIUM | Intended deviation |
| No `iCloneFrom` test | Clone functionality completely untested | HIGH | Test gap |
| No `delegateAccess` test | Access assistant pattern untested | HIGH | Test gap |
| No `revokeAuthorization` test | Revoke path untested | MEDIUM | Test gap |

---

## 12. RECOMMENDATIONS

### Critical (Pre-Mainnet)
1. **Fix ERC-7201 storage slots** before mainnet deployment. Fresh deployment required.
2. **Reconcile EIP-7857 structural differences** — decide whether to align with EIP spec or clearly document deviations.
3. **Add `iTransfer()` and `iClone()`** wrapper functions for spec compliance (can delegate to `iTransferFrom` and `iCloneFrom`).
4. **Test `iCloneFrom()`** — clone functionality is entirely untested.
5. **Test `delegateAccess()`** flow end-to-end with both TEE and access assistant signing.

### High
6. **Add `nextTokenId()` public view** for off-chain indexers.
7. **Add custom error** for `"Proof already used"` in BaseVerifier for gas optimization and consistency.
8. **Test `revokeAuthorization()`** happy path and edge cases.
9. **Test multiple-proof batch transfers** (N > 1) through the full iTransferFrom path.
10. **Document the `validUntil` extension** in the spec as an Axiom-specific enhancement.

### Medium
11. **Add `tokenURI()`** for OpenSea/metamask compatibility (or use `AxiomMetadataJson` as the canonical renderer).
12. **Align Authorization event parameter order** with EIP spec if indexers depend on it.
13. **Consider adding `batchAuthorizeUsage`** for UX parity with 0G reference.
14. **Test `setMintFee()`, `setStorageInfo()`, `storageInfo()`** view functions.

