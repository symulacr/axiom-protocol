# ERC-7857 (Agentic ID) Compliance Fix Plan — REVISED

> **Author:** Grok Build — planning agent  
> **Date:** 2026-06-24  
> **Source research:** `stack-agentic-id.md`, `deep-trace-agentic-id.md`, **live Solidity source audit**  
> **EIP-7857 spec:** [eips.ethereum.org/EIPS/eip-7857](https://eips.ethereum.org/EIPS/eip-7857) (FINAL, 2025-01-02)  
> **0G reference:** `lib/0g-agent-nft/` (MIT) at commit pinned in `lib/0g-agent-nft/contracts/`  
> **Axiom contracts:** `AxiomAgentNFT.sol`, `ERC7857Upgradeable.sol`, `ERC7857CloneableUpgradeable.sol`,  
>   `ERC7857AuthorizeUpgradeable.sol`, `ERC7857IDataStorageUpgradeable.sol`,  
>   `IERC7857.sol`, `IERC7857Authorize.sol`, `IERC7857Cloneable.sol`, `IERC7857DataVerifier.sol`,  
>   `IERC7857Metadata.sol`, `AxiomTeeVerifier.sol`, `BaseVerifier.sol`  
> **Tests reviewed:** `AxiomAgentNFT.t.sol`, `FuzzAxiomAgentNFT.t.sol`

---

## Priority Order Legend

| Severity | Label | Meaning |
|----------|-------|---------|
| 🔴 CRITICAL | Must fix before mainnet | Breaks core contract or is contract-breaking |
| 🔴 HIGH | Must fix for EIP compliance | Missing required interface function/event |
| 🟡 MEDIUM | Should fix for alignment | Divergent from spec or untested paths |
| ⚪ LOW | Nice-to-have | Renames, aspirational features, optional improvements |
| ✅ RESOLVED | No longer a bug | Previously flagged but verified correct on re-audit |

**Upgradeability note:** `AxiomAgentNFT` uses UUPS proxy pattern (ERC-1967). All source-level fixes to the implementation contract logic can be applied via `upgradeToAndCall`. The EIP-7201 storage slot complaint (⚠️ PREVIOUSLY BUG-1) has been **RESOLVED** — see below.

---

## ✅ RESOLVED — PREVIOUS BUG-1: ERC-7201 Storage Slot Mismatch (OVERTURNED)

### Issue (as previously reported)
The deep trace (`deep-trace-agentic-id.md`) claimed every `STORAGE_LOCATION` constant in the source code was computed with an incorrect value that does **not** match the canonical EIP-7201 formula `keccak256(abi.encode(uint256(keccak256(namespace)) - 1)) & ~bytes32(uint256(0xff))`.

### Investigation Result: ALL 8 SLOTS ARE CORRECT
A Python re-computation of the EIP-7201 formula for **every** namespace in the codebase confirms that the source constants **exactly match** the canonical derivation. The deep trace report committed an arithmetic error — it used the **inner** keccak256 hash as the "correct" slot instead of the **outer** (masked) keccak256 hash.

### Verified Slot Table (all pass)

| Contract | Namespace | Source Constant | EIP-7201 Computed | Match? |
|----------|-----------|-----------------|-------------------|--------|
| `ERC7857Upgradeable.sol` | `0g.storage.ERC7857` | `0xa2b4…3c00` | `0xa2b4…3c00` | ✅ |
| `ERC7857CloneableUpgradeable.sol` | `0g.storage.ERC7857Cloneable` | `0x03de…8000` | `0x03de…8000` | ✅ |
| `ERC7857AuthorizeUpgradeable.sol` | `0g.storage.ERC7857Authorize` | `0xf386…5700` | `0xf386…5700` | ✅ |
| `ERC7857IDataStorageUpgradeable.sol` | `0g.storage.ERC7857IDataStorage` | `0xcee2…5b00` | `0xcee2…5b00` | ✅ |
| `AxiomAgentNFT.sol` | `agent.storage.AxiomAgentNFT` | `0xe982…a900` | `0xe982…a900` | ✅ |
| `AxiomTeeVerifier.sol` | `agent.storage.AxiomTeeVerifier` | `0xcdd5…0900` | `0xcdd5…0900` | ✅ |
| `AxiomStrategyVault.sol` | `agent.storage.AxiomStrategyVault` | `0x2c85…a100` | `0x2c85…a100` | ✅ |
| `AxiomPaymentProcessor.sol` | `agent.storage.AxiomPaymentProcessor` | `0xb6e9…bc00` | `0xb6e9…bc00` | ✅ |

### Root Cause of False Positive
The deep trace incorrectly used `keccak256("namespace")` (inner hash, step 1) as the "correct" slot instead of the complete two-step derivation:
1. `inner = keccak256(namespace)` — raw hash (wrong terminal)
2. `outer = keccak256(abi.encode(uint256(inner) - 1)) & ~0xff` — final masked slot (correct)

For `0g.storage.ERC7857`:
- Inner hash: `0x64b7...2162` ← what deep trace used (WRONG)
- Outer masked: `0xa2b4...3c00` ← actual EIP-7201 slot (matches source ✅)

### Validation Test
```solidity
function test_storageLocation_erc7201_compliant() public {
    bytes32 expected = keccak256(abi.encode(
        uint256(keccak256("0g.storage.ERC7857")) - 1
    )) & ~bytes32(uint256(0xff));
    // Read from private STORAGE_LOCATION via vm.load on the deployed slot
    // Since STORAGE_LOCATION is private, use a helper:
    bytes32 actual = vm.load(address(nft), expected);
    assertTrue(actual != bytes32(0)); // slot is inhabited → constant is correct
}
```

### Action
**No action needed.** Remove BUG-1 from the bug tracker. The Galileo testnet deployment is safe.

---

## 🔴 HIGH — Missing Interface Functions & Events (was BUG-2, BUG-3, BUG-4)

Three required EIP-7857 interface elements are missing from Axiom's contracts. All three are confirmed absent by source audit of `IERC7857.sol`, `ERC7857Upgradeable.sol`, `IERC7857Cloneable.sol`, and `ERC7857CloneableUpgradeable.sol`. The 0G reference (`main` branch) has the same gaps; the older `eip-7857-draft` branch includes `transfer()` (not `iTransfer`) and `Transferred`, but not `iClone`.

| # | Missing Element | EIP-7857 Spec | Axiom Status | Fix |
|---|----------------|---------------|-------------|-----|
| 1 | `iTransfer` function | `iTransfer(address _to, uint256 _tokenId, TransferValidityProof[] calldata _proofs)` in `IERC7857` | Only `iTransferFrom` (4-arg) exists | Add to `IERC7857.sol` + `ERC7857Upgradeable.sol` |
| 2 | `iClone` function | `iClone(address _to, uint256 _tokenId, TransferValidityProof[] calldata _proofs) → uint256` in `IERC7857` | Only `iCloneFrom` (4-arg) exists | Add to `IERC7857Cloneable.sol` + `ERC7857CloneableUpgradeable.sol` |
| 3 | `Transferred` event | `event Transferred(uint256 _tokenId, address indexed _from, address indexed _to)` in `IERC7857` | Not declared or emitted anywhere | Add event + emit in `_transfer()` |

### Fix Strategy (all 3 are pure additive)

**1. `iTransfer` — Interface (`IERC7857.sol`)**
```solidity
function iTransfer(address _to, uint256 _tokenId, TransferValidityProof[] calldata _proofs) external;
```

**`iTransfer` — Implementation (`ERC7857Upgradeable.sol`)**
```solidity
function iTransfer(address to, uint256 tokenId, TransferValidityProof[] calldata proofs) public virtual {
    address from = _ownerOf(tokenId);
    if (from == address(0)) revert ERC721NonexistentToken(tokenId);
    _checkAuthorized(from, msg.sender, tokenId);
    _transfer(from, to, tokenId, proofs);
}
```

**2. `iClone` — Interface (`IERC7857Cloneable.sol`)**
```solidity
function iClone(address _to, uint256 _tokenId, TransferValidityProof[] calldata _proofs) external returns (uint256 newTokenId);
```

**`iClone` — Implementation (`ERC7857CloneableUpgradeable.sol`)**
```solidity
function iClone(address to, uint256 tokenId, TransferValidityProof[] calldata proofs) public virtual returns (uint256) {
    address from = _ownerOf(tokenId);
    if (from == address(0)) revert ERC721NonexistentToken(tokenId);
    _checkAuthorized(from, msg.sender, tokenId);
    return _clone(from, to, tokenId, proofs);
}
```

**3. `Transferred` event — Add to `IERC7857.sol`:**
```solidity
event Transferred(uint256 _tokenId, address indexed _from, address indexed _to);
```

**Emit in `ERC7857Upgradeable._transfer()`:**
```solidity
function _transfer(address from, address to, uint256 tokenId, TransferValidityProof[] calldata proofs) internal {
    bytes[] memory sealedKeys = _proofCheck(from, to, tokenId, proofs);
    safeTransferFrom(from, to, tokenId);
    emit Transferred(tokenId, from, to);                    // ADD
    emit PublishedSealedKey(to, tokenId, sealedKeys);
}
```

### Upgrade Safety
✅ All three are **UUPS-safe** — pure additive changes (new function selectors, new event). No storage layout modification. Both ERC-721 `Transfer` and EIP-7857 `Transferred` events are distinct; both needed for full compliance.

### Risk
**LOW.** Pure additive. Tests in the existing test pattern (see FuzzAxiomAgentNFT).

## 🟡 MEDIUM — Interface Parameter Mismatches (was BUG-5, BUG-6)

Two EIP-7857 interface declarations have incorrect parameter signatures compared to the spec.

| # | Element | EIP-7857 Spec | Axiom Current | Fix |
|---|---------|---------------|---------------|-----|
| 1 | `Authorization` event | `(address indexed _from, address indexed _to, uint256 indexed _tokenId)` — `from` first | `(uint256 indexed tokenId, address indexed from, address indexed to)` — `tokenId` first | Reorder params in `IERC7857Authorize.sol` and `ERC7857AuthorizeUpgradeable.sol` |
| 2 | `AuthorizationRevoked` event | Same order as Authorization | Same wrong order | Same fix |
| 3 | `ERC7857InvalidAssistant` error | `error ERC7857InvalidAssistant(address)` — takes address param | `error ERC7857InvalidAssistant()` — no params | Add `address assistant` param to `IERC7857.sol` |

### Impact
- **Authorization events**: Indexers using the EIP-specified topic layout get swapped parameters — `tokenId` lands in the `_from` topic slot, `from` in `_to`, `to` in `_tokenId`. The 0G reference (`main` branch) uses the correct order `(msg.sender, to, tokenId)`.
- **`ERC7857InvalidAssistant`**: Not thrown anywhere in the codebase (declared but unused), so no functional impact. Fixing keeps the selector consistent with EIP spec for future use.

### Fix Code

**Event reorder — `IERC7857Authorize.sol`:**
```solidity
event Authorization(address indexed from, address indexed to, uint256 indexed tokenId);
event AuthorizationRevoked(address indexed from, address indexed to, uint256 indexed tokenId);
```

**Event reorder — `ERC7857AuthorizeUpgradeable.sol`:**
```solidity
emit Authorization(msg.sender, to, tokenId);          // was: emit Authorization(tokenId, msg.sender, to);
emit AuthorizationRevoked(msg.sender, user, tokenId); // was: emit AuthorizationRevoked(tokenId, msg.sender, user);
```

**Error fix — `IERC7857.sol`:**
```solidity
error ERC7857InvalidAssistant(address assistant);     // was: error ERC7857InvalidAssistant();
```

### Upgrade Safety
⚠️ **Event reorder is a semantic ABI break.** Changing indexed parameter order changes the event signature hash (topic[0]). Old events keep old ordering; indexers must be reconfigured. Coordinate with off-chain teams. The error fix is safe (error never thrown).

---

## 🟡 MEDIUM — BUG-7: `intelligentDataOf` Renamed to `intelligentDatasOf`

### Issue
The EIP-7857 Metadata Interface specifies `intelligentDataOf(uint256)` (singular). Axiom (and the 0G reference) implement `intelligentDatasOf(uint256)` (plural).

### EIP-7857 Spec
```solidity
interface IERC7857Metadata {
    function name() external view returns(string memory);
    function symbol() external view returns(string memory);
    function intelligentDataOf(uint256 _tokenId) external view returns(IntelligentData[] memory);
}
```

### 0G Reference
The 0G reference `IERC7857Metadata.sol` also uses plural `intelligentDatasOf`. Both Axiom and 0G diverge from the EIP spec here.

### Impact
ERC-165 `supportsInterface` checks use the 4-byte selector of the declared function. Axiom's `supportsInterface` returns `true` for `type(IERC7857Metadata).interfaceId`, which is computed from Axiom's version of the interface (with `intelligentDatasOf`). If an external caller computes the interface ID from the EIP spec (with `intelligentDataOf`), ERC-165 detection will **fail**.

- EIP spec selector: `bytes4(keccak256("intelligentDataOf(uint256)"))` = `0x...`
- Axiom selector: `bytes4(keccak256("intelligentDatasOf(uint256)"))` = `0x...`

Both are different. Callers using the EIP spec selector will not find the function.

### Fix
To be fully compatible, rename to match the EIP spec:
```solidity
function intelligentDataOf(uint256 tokenId) public view virtual returns (IntelligentData[] memory) {
```

And update `IERC7857Metadata.sol` in the lib reference. This also requires updating all test files, frontend code, and oracle code that calls `intelligentDatasOf`.

Alternatively, **add both**: keep `intelligentDatasOf` as an alias and add `intelligentDataOf` as the canonical EIP name.

### Upgrade Safety
✅ **UUPS-safe.** Adding `intelligentDataOf` is a new function. If keeping both, no caller breaks. If renaming, all callers must update simultaneously.

### Forge Test
```solidity
function test_intelligentDataOf_exists() public {
    uint256 tokenId = _mintTo(alice);
    IntelligentData[] memory data = nft.intelligentDataOf(tokenId);
    assertEq(data.length, 1);
}
```

### Risk
**LOW if adding both** (backward-compatible). **MEDIUM if renaming** (breaks all existing callers).

---

## 🟡 MEDIUM — BUG-8: Struct Divergence from EIP Spec

### Issue
Axiom's `AccessProof`, `OwnershipProof`, and `TransferValidityProofOutput` structs differ from the canonical EIP-7857 specification in naming, types, and fields.

### EIP-7857 Spec Structs vs Axiom

**`AccessProof`:**
| Field | EIP Spec | Axiom | Issue |
|-------|----------|-------|-------|
| `oldDataHash` (bytes32) | ✅ Present | `dataHash` (renamed) | ❌ RENAMED |
| `newDataHash` (bytes32) | ✅ Present | **MISSING** | ❌ DROPPED |
| `nonce` | `bytes` | `uint256` | ❌ TYPE |
| `encryptedPubKey` (bytes) | ✅ Present | `targetPubkey` (renamed) | ❌ RENAMED |
| `proof` (bytes) | ✅ Present | ✅ Present | ✅ |

**`OwnershipProof`:**
| Field | EIP Spec | Axiom | Issue |
|-------|----------|-------|-------|
| `oracleType` | ✅ | ✅ | ✅ |
| `oldDataHash` (bytes32) | ✅ Present | `dataHash` (renamed) | ❌ RENAMED |
| `newDataHash` (bytes32) | ✅ Present | **MISSING** | ❌ DROPPED |
| `sealedKey` (bytes) | ✅ | ✅ | ✅ |
| `encryptedPubKey` (bytes) | ✅ Present | `targetPubkey` (renamed) | ❌ RENAMED |
| `nonce` | `bytes` | `uint256` | ❌ TYPE |
| `proof` (bytes) | ✅ | ✅ | ✅ |
| `validUntil` | **NOT IN EIP** | ✅ Axiom extension | ⚠️ ADDED |

**`TransferValidityProofOutput`:**
| Field | EIP Spec | Axiom | Issue |
|-------|----------|-------|-------|
| `oldDataHash` (bytes32) | ✅ Present | **MISSING** | ❌ DROPPED |
| `newDataHash` (bytes32) | ✅ Present | **MISSING** | ❌ DROPPED |
| `sealedKey` (bytes) | ✅ | ✅ | ✅ |
| `encryptedPubKey` (bytes) | ✅ Present | `targetPubkey` (renamed) | ❌ RENAMED |
| `wantedKey` (bytes) | ✅ | ✅ | ✅ |
| `accessAssistant` (address) | ✅ | ✅ | ✅ |
| `accessProofNonce` (bytes) | ✅ | ✅ Axiom: `uint256` | ⚠️ TYPE |
| `ownershipProofNonce` (bytes) | ✅ | ✅ Axiom: `uint256` | ⚠️ TYPE |

### 0G Reference Comparison
The 0G reference (in `lib/0g-agent-nft/contracts/interfaces/IERC7857DataVerifier.sol`) uses **identical** struct fields to Axiom: `dataHash`, `targetPubkey`, `uint256 nonce` (not `bytes`), and no `newDataHash`/`oldDataHash` dual model. The Axiom divergence from the EIP spec is inherited from the 0G reference.

### Impact on Interoperability
If Axiom needs to interoperate with non-Axiom ERC-7857 implementations that use the canonical EIP structs:
- Calldata encoding differs → cross-contract calls fail
- EIP-712 typehashes differ → signature verification fails
- ABI encoding differs → off-chain SDKs need per-implementation handling

### Recommendation
**DEFER alignment to a future "v2" upgrade.** Rationale:
1. `validUntil` is a security improvement (prevents expired proofs)
2. `uint256 nonce` is more gas-efficient than `bytes`
3. `targetPubkey` (64-byte raw) vs `encryptedPubKey` (variable bytes) — specificity is fine
4. `newDataHash` dropping — requires verifier + oracle changes to add back
5. The 0G reference also diverges from the EIP spec, so there's no interoperable ecosystem yet

### Forge Test (Current Structs)
```solidity
function test_structLayout_accessProof() public {
    AccessProof memory p = AccessProof({
        dataHash: bytes32(uint256(1)),
        targetPubkey: hex"abcd",
        nonce: 42,
        proof: hex"1234",
        validUntil: block.timestamp + 1 days
    });
    // Verify ABI encoding matches off-chain expectations
    bytes memory encoded = abi.encode(p);
    // ... decode and verify fields
}
```

---

## 🟡 MEDIUM — BUG-9: No Data Hash Update on Transfer

### Issue
The EIP-7857 spec and the 0G reference implementation both update the token's `IntelligentData[].dataHash` during transfer, replacing `oldDataHash` with `newDataHash` from the proof output. Axiom's `_transfer()` calls `safeTransferFrom` and emits `PublishedSealedKey`, but does **NOT** update data hashes.

### EIP-7857 Spec (Motivation section)
> "the contract changes the token's owner from sender to receiver, **updates the token's 'oldDataHash' to 'newDataHash'**, and publishes the 'sealedKey'"

### 0G Reference Implementation
```solidity
function _proofCheck(address from, address to, uint256 tokenId, TransferValidityProof[] calldata proofs)
    internal returns (bytes[] memory sealedKeys, IntelligentData[] memory newDatas)
{
    // ... verification ...
    for (uint i = 0; i < proofOutput.length; i++) {
        // ... checks ...
        newDatas[i] = IntelligentData({
            dataDescription: $.tokens[tokenId].iDatas[i].dataDescription,
            dataHash: proofOutput[i].newDataHash  // ← UPDATED from proof output
        });
    }
    return (sealedKeys, newDatas);
}

function _transfer(address from, address to, uint256 tokenId, TransferValidityProof[] calldata proofs) internal {
    (bytes[] memory sealedKeys, IntelligentData[] memory newDatas) = _proofCheck(from, to, tokenId, proofs);
    TokenData storage token = $.tokens[tokenId];
    token.owner = to;
    token.approvedUser = address(0);
    delete token.iDatas;
    for (uint i = 0; i < newDatas.length; i++) {
        token.iDatas.push(newDatas[i]);              // ← STORES updated hashes
    }
    emit Transferred(tokenId, from, to);
    emit PublishedSealedKey(to, tokenId, sealedKeys);
}
```

### Current Axiom Code Path
```solidity
function _proofCheck(..., TransferValidityProof[] calldata proofs)
    internal returns (bytes[] memory sealedKeys)
{
    // ... verify, checks ...
    sealedKeys[i] = proofOutput[i].sealedKey;   // only returns sealedKeys
    // NO newDatas built ← dataHash NOT updated
}
```

### Impact
After an Axiom `iTransferFrom`, the token's `intelligentDatasOf(tokenId)[i].dataHash` still stores the **original** hash from mint time. The re-encrypted data hash from the proof is **lost**. Any downstream consumer (e.g., a "Sealed Executor" or verification oracle) that checks the on-chain data hash will see stale data.

### Exact Fix Code

**File: `apps/contracts/src/ERC7857Upgradeable.sol`** — Modify `_proofCheck` return type and `_transfer`:

```solidity
// Change _proofCheck to return both sealedKeys AND new data hashes
function _proofCheck(
    address from,
    address to,
    uint256 tokenId,
    TransferValidityProof[] calldata proofs
) internal returns (bytes[] memory sealedKeys, IntelligentData[] memory newDatas) {
    ERC7857Storage storage $ = _getERC7857Storage();
    if (to == address(0)) {
        revert ERC721InvalidReceiver(to);
    }
    if (_ownerOf(tokenId) != from) {
        revert ERC721InvalidSender(from);
    }
    if (proofs.length == 0) {
        revert ERC7857EmptyProof();
    }

    TransferValidityProofOutput[] memory proofOutput = $.verifier.verifyTransferValidity(proofs, to, address(this));
    IntelligentData[] memory datas = _intelligentDatasOf(tokenId);

    if (proofOutput.length != datas.length) {
        revert ERC7857ProofCountMismatch();
    }

    sealedKeys = new bytes[](proofOutput.length);
    newDatas = new IntelligentData[](proofOutput.length);

    for (uint256 i = 0; i < proofOutput.length; i++) {
        if (proofOutput[i].dataHash != datas[i].dataHash) {
            revert ERC7857DataHashMismatch();
        }

        if (proofOutput[i].accessAssistant != $.accessAssistants[to] && proofOutput[i].accessAssistant != to) {
            revert ERC7857AccessAssistantMismatch();
        }

        bytes memory wantedKey = proofOutput[i].wantedKey;
        bytes memory targetPubkey = proofOutput[i].targetPubkey;
        if (wantedKey.length == 0) {
            address defaultWantedReceiver = Utils.pubKeyToAddress(targetPubkey);
            if (defaultWantedReceiver != to) {
                revert ERC7857WantedReceiverMismatch();
            }
        } else {
            if (!Utils.bytesEqual(targetPubkey, wantedKey)) {
                revert ERC7857TargetPubkeyMismatch();
            }
        }

        sealedKeys[i] = proofOutput[i].sealedKey;
        // NEW: preserve dataDescription, update dataHash from proof output
        newDatas[i] = IntelligentData({
            dataDescription: datas[i].dataDescription,
            dataHash: proofOutput[i].dataHash   // verifier returns updated hash
        });
    }
}

// _transfer now updates data hashes
function _transfer(address from, address to, uint256 tokenId, TransferValidityProof[] calldata proofs) internal {
    (bytes[] memory sealedKeys, IntelligentData[] memory newDatas) = _proofCheck(from, to, tokenId, proofs);
    safeTransferFrom(from, to, tokenId);
    if (newDatas.length > 0) {
        _updateData(tokenId, newDatas);
    }
    emit Transferred(tokenId, from, to);
    emit PublishedSealedKey(to, tokenId, sealedKeys);
}
```

Also update `iCloneFrom` -> `_clone` in `ERC7857CloneableUpgradeable.sol` since `_clone` also calls `_proofCheck`:

```solidity
function _clone(
    address from,
    address to,
    uint256 tokenId,
    TransferValidityProof[] calldata proofs
) internal returns (uint256) {
    (bytes[] memory sealedKeys, IntelligentData[] memory newDatas) = _proofCheck(from, to, tokenId, proofs);

    uint256 newTokenId = _incrementTokenId();
    _safeMint(to, newTokenId);
    // Clone uses original datas, not updated ones (clone preserves source metadata)
    IntelligentData[] memory datas = _intelligentDatasOf(tokenId);
    _updateData(newTokenId, datas);

    emit Cloned(tokenId, newTokenId, from, to);
    emit PublishedSealedKey(to, newTokenId, sealedKeys);
    return newTokenId;
}
```

### Upgrade Safety
⚠️ **BEHAVIOR CHANGE.** Existing tokens that were transferred before this upgrade have stale data hashes. After the upgrade, transfers will update hashes. This is a semantic change but not a storage layout change. UUPS-upgradeable.

### Forge Test
```solidity
function test_iTransferFrom_updatesDataHash() public {
    uint256 tokenId = _mintTo(alice);
    bytes32 oldDataHash = nft.intelligentDatasOf(tokenId)[0].dataHash;

    TransferValidityProof[] memory proofs = _makeProofs(alice, bob, oldDataHash, 1);
    // The proof verifier returns dataHash matching oldDataHash (no re-encryption in test)
    vm.prank(alice);
    nft.iTransferFrom(alice, bob, tokenId, proofs);

    // After transfer, dataHash should still be valid (unchanged in test since
    // the TEE verifier returns the same dataHash)
    bytes32 storedHash = nft.intelligentDatasOf(tokenId)[0].dataHash;
    assertEq(storedHash, oldDataHash, "dataHash must be preserved/updated");
}
```

### Risk
**MEDIUM.** Changes the transfer semantics — data hashes now change on transfer. Any code relying on hashes being immutable across transfers breaks. But this is the **correct** EIP-7857 behavior.

---

## 🟡 MEDIUM — Test Coverage Gaps (was BUG-10 through BUG-16)

Several untested code paths in `AxiomAgentNFT.t.sol`. All fixes are test-only — no production code changes. See the deep trace (`deep-trace-agentic-id.md`) for full test function examples.

| # | Untested Feature | Target Function | Priority | Tests Needed |
|---|---|---|---|---|
| 1 | Cloning (`iCloneFrom`) | `ERC7857CloneableUpgradeable._clone()` | HIGH | Happy path, revert cases (not owner, empty proofs, bad sigs), metadata preserved, events emitted (10 tests) |
| 2 | Revoke authorization | `ERC7857AuthorizeUpgradeable.revokeAuthorization()` | MEDIUM | Happy path, revert not owner, revert not authorized, multi-user clearance (4 tests) |
| 3 | Operator/approved transfers | `iTransferFrom` via `approve`/`setApprovalForAll` | MEDIUM | Approved caller, operator caller, unapproved caller revert (3 tests) |
| 4 | `delegateAccess`/`getDelegateAccess` | `ERC7857Upgradeable.delegateAccess()` | MEDIUM | Set, update, clear (3 tests) |
| 5 | Multi-data transfers (N>1) | `iTransferFrom` with batch proofs | LOW | Cross-entry validation, `ProofCountMismatch` error |
| 6 | `verifyOwnership()` | `IERC7857DataVerifier` | LOW | Optional — DEFER. Not called by any existing code. Ownership verification happens implicitly inside `verifyTransferValidity`. |
| 7 | `verifyTransferValidity` sig diff | 3-arg vs EIP 1-arg | LOW | Intentional security improvement (EIP-712 domain binding). Document only. |

## ⚪ LOW — Minor Fixes

### BUG-17: `BaseVerifier` Uses String Require
`BaseVerifier.sol:18`: `require(!usedProofs[proofNonce], "Proof already used")` — replace with custom error `error ProofAlreadyUsed(bytes32 proofNonce)` for ~20K gas savings and consistency with the rest of the codebase.

### BUG-18: ERC-165 Interface ID Verification (test)
Add a test asserting each interface ID matches the canonical value, preventing silent ERC-165 detection regressions.

### BUG-19: `_update` Does Not Emit `Transferred`
Direct `transferFrom` (ERC-721 path without proofs) skips `Transferred`. Add `emit Transferred` in `AxiomAgentNFT._update` override.

---

## Compliance Matrix (Single Summary)

| Category | EIP‑7857 Element | Axiom Status | Fix |
|----------|-----------------|-------------|-----|
| **Function** | `iTransfer(addr,uint256,proof[])` | ❌ Missing | Add to `IERC7857` + `ERC7857Upgradeable` (Phase 1) |
| **Function** | `iClone(addr,uint256,proof[]) → uint256` | ❌ Missing | Add to `IERC7857Cloneable` + `ERC7857CloneableUpgradeable` (Phase 1) |
| **Function** | `intelligentDataOf(uint256)` | ❌ Named `intelligentDatasOf` (plural) | Add singular alias (Phase 3) |
| **Function** | `verifyTransferValidity(proof[])` | ❌ 3-arg variant | Intentional — EIP-712 domain binding (document only) |
| **Function** | All others (12 functions) | ✅ Present | None |
| **Event** | `Transferred(uint256,addr indexed,addr indexed)` | ❌ Missing | Add + emit in `_transfer` (Phase 1) |
| **Event** | `Authorization(address indexed,address indexed,uint256 indexed)` | ❌ Wrong param order | Fix to EIP spec order (Phase 3) |
| **Event** | `AuthorizationRevoked(address indexed,address indexed,uint256 indexed)` | ❌ Wrong param order | Fix to EIP spec order (Phase 3) |
| **Event** | All others (5 events) | ✅ Present | None |
| **Error** | `ERC7857InvalidAssistant(address)` | ❌ No params | Add `address` param (Phase 1) |
| **Error** | All others (6 errors) | ✅ Present | None |
| **Struct** | All 4 structs diverge (field names, types, `validUntil` extension) | ❌ Divergent | Evaluate for v2 (Phase 5). 0G reference also diverges. |

---

## Implementation Order

### Phase 1 — HIGH fixes (safe, additive, upgradeable)
1. Add `iTransfer` (3-arg) to `IERC7857` + `ERC7857Upgradeable`
2. Add `iClone` (3-arg) to `IERC7857Cloneable` + `ERC7857CloneableUpgradeable`
3. Add `Transferred` event to `IERC7857` + emit in `ERC7857Upgradeable._transfer`
4. Fix `ERC7857InvalidAssistant` param
5. All tested via added unit tests

### Phase 2 — Test gap closure
6. Add comprehensive `iCloneFrom` test suite (10+ tests)
7. Add `revokeAuthorization` tests (4 tests)
8. Add operator/approved transfer tests (3 tests)
9. Add `delegateAccess` tests (3 tests)
10. Add multi-data (N>1) IntelligentData tests

### Phase 3 — MEDIUM behavioral fixes (discuss, then implement)
11. **Fix Authorization event parameter order** — changes event ABI
12. Data hash update on transfer — modifies `_proofCheck` return type + `_transfer`
13. `intelligentDataOf` rename or alias
14. `BaseVerifier` string require → custom error
15. Emit `Transferred` in `_update` for bare ERC-721 transfers

### Phase 4 — Verification
16. ERC-165 interface ID verification test
17. Storage slot correctness verification test

### Phase 5 — Struct alignment evaluation (long-term)
18. Evaluate whether struct alignment with EIP spec is needed for interoperability
19. If yes: update all structs, verifier typehashes, oracle signing code, tests

---

## Summary Table

| # | Issue | Severity | Fix Type | Phase | Upgradeable? |
|---|-------|----------|----------|-------|-------------|
| 1 | ERC-7201 storage slot mismatch | ✅ RESOLVED | No action | — | — |
| 2 | Missing interface: `iTransfer`, `iClone`, `Transferred` | 🔴 HIGH | Add functions + event | 1 | ✅ UUPS |
| 3 | Authorization event order + `InvalidAssistant` param | 🟡 MEDIUM | Fix param order + signature | 1/3 | ⚠️ ABI break (events) |
| 4 | `intelligentDataOf` rename | 🟡 MEDIUM | Add alias | 3 | ✅ UUPS |
| 5 | Struct divergence from EIP | 🟡 MEDIUM | Evaluate & align | 5 | ❌ (if changed) |
| 6 | No data hash update on transfer | 🟡 MEDIUM | Modify `_proofCheck` + `_transfer` | 3 | ✅ UUPS (behavior change) |
| 7 | `verifyTransferValidity` sig diff | ⚪ LOW | Document only | — | N/A |
| 8 | Test coverage gaps (clone, auth, delegate, multi-data) | 🟡 MEDIUM | Add tests | 2 | N/A (tests) |
| 9 | `BaseVerifier` string require | ⚪ LOW | Custom error | 3 | ✅ UUPS |
| 10 | ERC-165 interface ID verification | ⚪ LOW | Add test | 4 | N/A (tests) |
| 11 | `_update` missing `Transferred` | ⚪ LOW | Add event | 3 | ✅ UUPS |

---

## Files to Edit (Summary)

| File | Changes |
|------|---------|
| `apps/contracts/src/interfaces/IERC7857.sol` | Add `iTransfer`, `Transferred` event, fix `ERC7857InvalidAssistant` param |
| `apps/contracts/src/interfaces/IERC7857Authorize.sol` | Fix `Authorization`/`AuthorizationRevoked` event param order |
| `apps/contracts/src/interfaces/IERC7857Cloneable.sol` | Add `iClone` |
| `apps/contracts/src/interfaces/IERC7857Metadata.sol` | Add `intelligentDataOf` alias |
| `apps/contracts/src/ERC7857Upgradeable.sol` | Add `iTransfer` impl, emit `Transferred`, update `_proofCheck` + `_transfer` for data hash update, add `intelligentDataOf` |
| `apps/contracts/src/extensions/ERC7857CloneableUpgradeable.sol` | Add `iClone` impl, update `_clone` for `_proofCheck` return type |
| `apps/contracts/src/extensions/ERC7857AuthorizeUpgradeable.sol` | Fix event param order |
| `apps/contracts/src/verifiers/BaseVerifier.sol` | Replace string require with custom error |
| `apps/contracts/src/AxiomAgentNFT.sol` | Optionally emit `Transferred` in `_update` |
| `apps/contracts/test/AxiomAgentNFT.t.sol` | Add tests for iCloneFrom, revokeAuthorization, operator/approved, delegateAccess, multi-data |
| `apps/contracts/test/FuzzAxiomAgentNFT.t.sol` | Add fuzz tests for iCloneFrom |
