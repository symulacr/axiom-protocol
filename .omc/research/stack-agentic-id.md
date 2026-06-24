# ERC-7857 (Agentic ID) — Deep Research & Compliance Report

> **Author:** Grok Build — deep-research subagent  
> **Date:** 2026-06-24  
> **Purpose:** Full trace of Axiom Protocol's ERC-7857 implementation vs canonical EIP spec + 0G reference

---

## 1. Web Research Summary

### 1.1 Official EIP-7857 Specification

| Field | Value |
|-------|-------|
| **EIP** | [ERC-7857: AI Agents NFT with Private Metadata](https://eips.ethereum.org/EIPS/eip-7857) |
| **Authors** | Ming Wu (@sparkmiw), Jason Zeng (@zenghbo), Wei Wu (@Wilbert957), Michael Heinrich (@michaelomg) |
| **Created** | 2025-01-02 |
| **Category** | Standards Track: ERC |
| **Status** | FINAL |

**Abstract:** A standard interface for NFTs specifically designed for AI agents, where the metadata represents agent capabilities and requires privacy protection. Unlike traditional NFT standards that focus on static metadata, this standard introduces mechanisms for verifiable data ownership and secure transfer. By defining a unified interface for different verification methods (TEE/ZKP), it enables secure management of valuable agent metadata such as models, memory, and character definitions, while maintaining confidentiality and verifiability.

**Key Innovation:** The EIP defines three key interfaces:
1. **Main NFT Interface** (`IERC7857`) — Core token operations with proof-based transfers
2. **Metadata Interface** (`IERC7857Metadata`) — `IntelligentData` structure with `dataDescription` and `dataHash`
3. **Data Verification Interface** (`IERC7857DataVerifier`) — `verifyTransferValidity()` for proof verification

### 1.2 0G Reference Implementation

| Field | Value |
|-------|-------|
| **Repository** | [0gfoundation/0g-agent-nft](https://github.com/0gfoundation/0g-agent-nft) |
| **License** | GPL-3.0 (interfaces also MIT in Axiom's re-implementation) |
| **Structure** | Hardhat project with Solidity contracts, TypeScript tasks, Foundry tests |
| **Key Contract** | `contracts/AgentNFT.sol` — single monolithic contract |

### 1.3 0G Documentation

- **Technical Standard:** https://docs.0g.ai/developer-hub/building-on-0g/agentic-id/erc7857
- **Blog:** https://0g.ai/blog/0g-introducing-erc-7857
- **Core Architecture:** ERC-7857 extends ERC-721 with encrypted metadata, secure re-encryption, oracle verification (TEE/ZKP), and authorized usage without ownership.

---

## 2. Codebase Trace — All Files Read

### 2.1 Source Contracts

| File | Path | Lines | Role |
|------|------|-------|------|
| **AxiomAgentNFT.sol** | `apps/contracts/src/AxiomAgentNFT.sol` | 240 | Main NFT contract — composes all extensions |
| **ERC7857Upgradeable.sol** | `apps/contracts/src/ERC7857Upgradeable.sol` | 153 | Base ERC-7857: iTransferFrom, verifier binding, proof checking |
| **ERC7857CloneableUpgradeable.sol** | `apps/contracts/src/extensions/ERC7857CloneableUpgradeable.sol` | 72 | Token cloning (iCloneFrom) |
| **ERC7857AuthorizeUpgradeable.sol** | `apps/contracts/src/extensions/ERC7857AuthorizeUpgradeable.sol` | 110 | Usage authorization (max 100 users, cleared on transfer) |
| **ERC7857IDataStorageUpgradeable.sol** | `apps/contracts/src/extensions/ERC7857IDataStorageUpgradeable.sol` | 60 | On-chain IntelligentData storage |
| **AxiomMetadataJson.sol** | `apps/contracts/src/extensions/AxiomMetadataJson.sol` | 280 | OpenSea-compatible JSON builder (library, not contract) |
| **AxiomTeeVerifier.sol** | `apps/contracts/src/verifiers/AxiomTeeVerifier.sol` | 310 | TEE-based verifier with EIP-712 typed signatures |

### 2.2 Interfaces

| File | Path | Lines | Role |
|------|------|-------|------|
| **IERC7857.sol** | `apps/contracts/src/interfaces/IERC7857.sol` | 50 | Main ERC-7857 interface (Axiom's version) |
| **IERC7857Authorize.sol** | `apps/contracts/src/interfaces/IERC7857Authorize.sol` | 30 | Authorization extension |
| **IERC7857Cloneable.sol** | `apps/contracts/src/interfaces/IERC7857Cloneable.sol` | 22 | Cloning extension |
| **IERC7857DataVerifier.sol** | `apps/contracts/src/interfaces/IERC7857DataVerifier.sol` | 90 | Data verifier interface with structs |
| **IERC7857Metadata.sol** | `apps/contracts/src/interfaces/IERC7857Metadata.sol` | 1 | Delegates to @0g-agent-nft/interfaces |

### 2.3 Test Files

| File | Path | Lines | Coverage |
|------|------|-------|----------|
| **AxiomAgentNFT.t.sol** | `apps/contracts/test/AxiomAgentNFT.t.sol` | 430 | 20 unit tests (mint, transfer, auth, upgrade, pause) |
| **FuzzAxiomAgentNFT.t.sol** | `apps/contracts/test/FuzzAxiomAgentNFT.t.sol` | 420 | 3 fuzz tests + 2 invariant tests (live fork) |
| **AxiomTeeVerifier.t.sol** | `apps/contracts/test/AxiomTeeVerifier.t.sol` | 110 | F-01 registerSigner access control |
| **FuzzAxiomTeeVerifier.t.sol** | `apps/contracts/test/FuzzAxiomTeeVerifier.t.sol` | ~1000 | 15+ fuzz tests for verifier |
| **V12C3ValidUntil.t.sol** | `apps/contracts/test/V12C3ValidUntil.t.sol` | 230 | 5 deterministic validUntil tests (live fork) |
| **BUGS.md** | `apps/contracts/test/BUGS.md` | ~7000+ | Comprehensive bug diary across 16+ waves |

### 2.4 EIP-712 Off-Chain

| File | Path | Role |
|------|------|------|
| **oracle/src/crypto/eip712.ts** | `apps/oracle/src/crypto/eip712.ts` | Server-side EIP-712 proof generation |
| **frontend/src/abi/eip712.ts** | `apps/frontend/src/abi/eip712.ts` | Frontend EIP-712 constants for wallet signing |

---

## 3. Compliance Matrix: ERC-7857 Spec vs Axiom Implementation

### 3.1 Main NFT Interface (`IERC7857`)

| # | Requirement | ERC-7857 Spec | Axiom Implementation | Status |
|---|------------|--------------|---------------------|--------|
| 1 | `iTransfer(address _to, uint256 _tokenId, TransferValidityProof[] calldata _proofs)` | **Required** in spec | **MISSING** — only `iTransferFrom` exists | ❌ MISSING |
| 2 | `iTransferFrom(address _from, address _to, uint256 _tokenId, TransferValidityProof[] calldata _proofs)` | In reference impl | ✅ Implemented in `ERC7857Upgradeable.sol:128` | ✅ PRESENT |
| 3 | `iClone(address _to, uint256 _tokenId, TransferValidityProof[] calldata _proofs) returns(uint256)` | **Required** in spec | **MISSING** — only `iCloneFrom` exists | ❌ MISSING |
| 4 | `iCloneFrom(address _from, address _to, uint256 _tokenId, TransferValidityProof[] calldata _proofs) returns(uint256)` | In reference impl | ✅ Implemented in `ERC7857CloneableUpgradeable.sol:64` | ✅ PRESENT |
| 5 | `authorizeUsage(uint256 _tokenId, address _user)` | Required in spec | ✅ In `ERC7857AuthorizeUpgradeable.sol:74` | ✅ PRESENT |
| 6 | `revokeAuthorization(uint256 _tokenId, address _user)` | Required in spec | ✅ In `ERC7857AuthorizeUpgradeable.sol:86` | ✅ PRESENT |
| 7 | `delegateAccess(address _assistant)` | Required in spec | ✅ In `ERC7857Upgradeable.sol:58` | ✅ PRESENT |
| 8 | `verifier() → IERC7857DataVerifier` | Required in spec | ✅ In `ERC7857Upgradeable.sol:154` | ✅ PRESENT |

### 3.2 Events

| # | Event | ERC-7857 Spec | Axiom Implementation | Status |
|---|-------|--------------|---------------------|--------|
| 1 | `Approval(address indexed _from, address indexed _to, uint256 indexed _tokenId)` | Required in spec | ❌ Not in Axiom's `IERC7857` (inherited from ERC-721) | ⚠️ From OZ ERC721 |
| 2 | `ApprovalForAll(address indexed _owner, address indexed _operator, bool _approved)` | Required in spec | ❌ Not in Axiom's `IERC7857` | ⚠️ From OZ ERC721 |
| 3 | `Authorization(address indexed _from, address indexed _to, uint256 indexed _tokenId)` | Required in spec | ✅ In `IERC7857Authorize.sol:14` | ✅ PRESENT |
| 4 | `AuthorizationRevoked(address indexed _from, address indexed _to, uint256 indexed _tokenId)` | Required in spec | ✅ In `IERC7857Authorize.sol:15` | ✅ PRESENT |
| 5 | **`Transferred(uint256 _tokenId, address indexed _from, address indexed _to)`** | **Required in spec** | **MISSING** — not emitted anywhere | ❌ **MISSING** |
| 6 | `Cloned(uint256 indexed _tokenId, uint256 indexed _newTokenId, address _from, address _to)` | Required in spec | ✅ Emitted in `ERC7857CloneableUpgradeable.sol:54` | ✅ PRESENT |
| 7 | `PublishedSealedKey(address indexed _to, uint256 indexed _tokenId, bytes[] _sealedKeys)` | Required in spec | ✅ Emitted in `ERC7857Upgradeable.sol:123` | ✅ PRESENT |
| 8 | `DelegateAccess(address indexed _user, address indexed _assistant)` | Required in spec | ✅ Emitted in `ERC7857Upgradeable.sol:61` | ✅ PRESENT |

### 3.3 Data Structures

| # | Struct | ERC-7857 Spec Fields | Axiom Fields | Status |
|---|--------|---------------------|-------------|--------|
| 1 | `AccessProof` | `bytes32 oldDataHash, bytes32 newDataHash, bytes nonce, bytes encryptedPubKey, bytes proof` | `bytes32 dataHash, bytes targetPubkey, uint256 nonce, bytes proof, uint256 validUntil` | ⚠️ **DIVERGED** — renamed `oldDataHash`→`dataHash`, dropped `newDataHash`, renamed `encryptedPubKey`→`targetPubkey`, added `validUntil` |
| 2 | `OwnershipProof` | `OracleType oracleType, bytes32 oldDataHash, bytes32 newDataHash, bytes sealedKey, bytes encryptedPubKey, bytes nonce, bytes proof` | `OracleType oracleType, bytes32 dataHash, bytes sealedKey, bytes targetPubkey, uint256 nonce, bytes proof, uint256 validUntil` | ⚠️ **DIVERGED** — dropped `newDataHash`, renamed fields, added `validUntil` |
| 3 | `TransferValidityProof` | `AccessProof accessProof, OwnershipProof ownershipProof` | Same | ✅ Same shape |
| 4 | `TransferValidityProofOutput` | `bytes32 oldDataHash, bytes32 newDataHash, bytes sealedKey, bytes encryptedPubKey, bytes wantedKey, address accessAssistant, bytes accessProofNonce, bytes ownershipProofNonce` | `bytes32 dataHash, bytes sealedKey, bytes targetPubkey, bytes wantedKey, address accessAssistant, uint256 accessProofNonce, uint256 ownershipProofNonce` | ⚠️ **DIVERGED** — dropped `newDataHash`, renamed fields, nonces changed to `uint256` |
| 5 | `IntelligentData` | `string dataDescription, bytes32 dataHash` | Same | ✅ Same shape |

### 3.4 Data Verification Interface

| # | Function | ERC-7857 Spec | Axiom Implementation | Status |
|---|---------|--------------|---------------------|--------|
| 1 | `verifyTransferValidity(TransferValidityProof[] calldata _proofs)` | 1-arg: `(bytes32[] memory)` in spec | **3-arg**: `(TransferValidityProof[] calldata _proofs, address to, address nft)` | ⚠️ **DIVERGED** (by design — adds EIP-712 domain binding per security fix F-03/F-04/F-12) |
| 2 | `verifyOwnership()` | Mentioned in spec | **MISSING** — not implemented anywhere | ❌ **MISSING** |

### 3.5 Metadata Interface

| # | Function | ERC-7857 Spec | Axiom Implementation | Status |
|---|---------|--------------|---------------------|--------|
| 1 | `name() → string` | Required | ✅ From ERC721Upgradeable | ✅ PRESENT |
| 2 | `symbol() → string` | Required | ✅ From ERC721Upgradeable | ✅ PRESENT |
| 3 | `intelligentDataOf(uint256) → IntelligentData[]` | Named `intelligentDataOf` in spec | Named `intelligentDatasOf` (plural) in Axiom | ⚠️ **RENAMED** |

### 3.6 Transfer Behavior

| Aspect | ERC-7857 Reference Implementation | Axiom Implementation | Status |
|--------|-----------------------------------|---------------------|--------|
| Data update on transfer | ✅ `_transfer` updates `token.iDatas` with `newDataHash` from proof output | ❌ **NO data hash update** — only emits `PublishedSealedKey`; calls `safeTransferFrom` | ❌ DIVERGENT |
| Owner change mechanism | Uses internal `token.owner = to` direct storage write | Uses OZ `safeTransferFrom` which triggers `_update` hook | ⚠️ Different approach |
| `iTransfer` (3-arg) | ✅ `iTransfer(to, tokenId, proofs)` — calls `_transfer(ownerOf(tokenId), to, tokenId, proofs)` | ❌ **NOT IMPLEMENTED** | ❌ MISSING |
| `iTransferFrom` (4-arg) | ✅ `iTransferFrom(from, to, tokenId, proofs)` — calls `_transfer(from, to, tokenId, proofs)` | ✅ Implemented | ✅ PRESENT |
| `Transferred` event | ✅ Emitted in `_transfer` | ❌ **NOT EMITTED** | ❌ MISSING |

### 3.7 Extensions Present in Axiom But Not in EIP Spec

| Extension | Description | EIP Status |
|-----------|-------------|------------|
| UUPS Upgradeability | `UUPSUpgradeable` — contract can be upgraded | Axiom addition (mandated by security report F-02) |
| ERC-7201 Storage | Namespaced storage slots per OZ v5 | Axiom/BUG-1 — slots don't match canonical EIP-7201 formula |
| Role-Based Access | `ADMIN_ROLE`, `OPERATOR_ROLE`, `MINTER_ROLE` | Axiom addition |
| Pausability | `PausableUpgradeable` | Axiom addition |
| Mint Fee | `mintFee` with native currency payment | Axiom addition |
| Creator Tracking | `creatorOf(uint256)` mapping | Axiom addition |
| `authorizeUsage` max-100 cap | `MAX_AUTHORIZED_USERS = 100` | Axiom addition (not in spec) |
| `mintWithRole` | MINTER_ROLE-gated mint | Axiom addition |

---

## 4. Test Coverage Analysis

### 4.1 Unit Tests (`AxiomAgentNFT.t.sol`) — 20 tests

| Test | Coverage | Status |
|------|----------|--------|
| `test_initialize_setsRolesAndOwner` | Deploy + role setup | ✅ |
| `test_mint_happy` | Basic mint | ✅ |
| `test_withdrawMintFees_onlyAdmin` | Fee withdrawal | ✅ |
| `test_withdrawMintFees_revertNotAdmin` | Access control | ✅ |
| `test_mint_revertZeroAddress` | Input validation | ✅ |
| `test_mint_revertEmptyData` | Input validation | ✅ |
| `test_iTransferFrom_happy` | Happy-path transfer | ✅ |
| `test_iTransferFrom_revertBadOracleSig` | Bad oracle signature | ✅ |
| `test_iTransferFrom_revertBadAccessSig` | Bad access signature | ✅ |
| `test_iTransferFrom_revertEmptyProofs` | Empty proofs | ✅ |
| `test_iTransferFrom_revertNotOwner` | Not owner | ✅ |
| `test_iTransferFrom_revertReplay` | Replay protection | ✅ |
| `test_iTransferFrom_revertMixedProofs` | Cross-proof consistency | ✅ |
| `test_verifyTransferValidity_revertMixedProofs_direct` | Verifier cross-proof | ✅ |
| `test_updateVerifier_onlyOperator` | Verifier rotation | ✅ |
| `test_updateVerifier_revertNotOperator` | Access control | ✅ |
| `test_pause_unpause` | Pausability | ✅ |
| `test_authorizeUsage_revertTooMany` | Max auth users (100) | ✅ |
| `test_update_onlyOwner` | Metadata update | ✅ |
| `test_update_revertNotOwner` | Access control | ✅ |
| `test_upgrade_onlyOwner` | UUPS auth | ✅ |
| `test_upgrade_owner_succeeds` | UUPS upgrade | ✅ |

### 4.2 Fuzz Tests (`FuzzAxiomAgentNFT.t.sol`) — 3 fuzz + 2 invariant (live fork)

| Test | Coverage | Status |
|------|----------|--------|
| `testFuzz_mintWithRole_recordsAllFields` | Mint with fuzzed receiver/creator/dataHash | ✅ |
| `testFuzz_authorizeUsage_accessControl` | Auth fuzzing on live proxy | ✅ |
| `testFuzz_iTransferFrom_doesNotClearData` | Transfer preserves data hashes | ✅ |
| `invariant_totalSupplyMonotonic` | nextTokenId never decreases | ✅ |
| `invariant_dataHashNeverLost` | Observed data hashes persist | ✅ |

### 4.3 Verifier Tests

| Test | Coverage | Status |
|------|----------|--------|
| `test_registerSigner_onlyOwner_reverts` (AxiomTeeVerifier.t.sol) | F-01 access control | ✅ |
| `test_registerSigner_owner_succeeds` | F-01 positive | ✅ |
| `test_constructor_setsSigner` | Constructor params | ✅ |
| `test_initialize_setsOwner_andRevertsOnReRun` | Initializer | ✅ |
| 15+ fuzz tests (FuzzAxiomTeeVerifier.t.sol) | Valid proofs, wrong signer, truncated sigs, replay, batch, validUntil | ✅ |
| 5 deterministic tests (V12C3ValidUntil.t.sol) | validUntil boundary cases on live fork | ✅ |

### 4.4 Gaps in Test Coverage

| Gap | Impact | Severity |
|-----|--------|----------|
| ❌ **No tests for `iCloneFrom`** | Cloning path never tested | **HIGH** |
| ❌ **No tests for `revokeAuthorization`** | Revocation path never tested | **MEDIUM** |
| ❌ **No tests for `delegateAccess`** | Assistant delegation never tested | **MEDIUM** |
| ❌ **No tests for multi-data (N>1) IntelligentData** | Only single-entry arrays tested | **MEDIUM** |
| ❌ **No `iTransfer` / `iClone` (3-arg) tests** | Functions don't exist, so can't test | **HIGH** |
| ❌ **No `Transferred` event assertion tests** | Missing event can't be tested | **HIGH** |
| ❌ **No `verifyOwnership` tests** | Function not implemented | **MEDIUM** |

---

## 5. Critical Bugs & Issues

### BUG-1: ERC-7201 Storage Slot Mismatch (CONFIRMED — HIGH)

**Status:** CONFIRMED in BUGS.md across multiple waves (11A, 14F, 15A, 15C)

The storage slot constants declared in source do NOT match the canonical EIP-7201 formula. For example, `ERC7857CloneableStorage` uses slot `0x03de6cf14ecf4575e0ed0cc2fdb9b7ee13500cb3c0c403254fc893bf6e0c8000` in the source, but the EIP-7201 formula produces a different value. The live proxy on Galileo testnet has `nextTokenId` at a wrong slot, causing it to read `0` when the counter is actually at 122+.

**Affected files (6 source files):**
- `ERC7857Upgradeable.sol` — `0g.storage.ERC7857` slot
- `ERC7857CloneableUpgradeable.sol` — `0g.storage.ERC7857Cloneable` slot
- `ERC7857AuthorizeUpgradeable.sol` — `0g.storage.ERC7857Authorize` slot
- `ERC7857IDataStorageUpgradeable.sol` — `0g.storage.ERC7857IDataStorage` slot
- `AxiomAgentNFT.sol` — `agent.storage.AxiomAgentNFT` slot
- `AxiomTeeVerifier.sol` — `agent.storage.AxiomTeeVerifier` slot

### BUG-2: Missing `iTransfer` (3-arg) and `iClone` (3-arg)

**Severity:** HIGH — spec non-compliance

The ERC-7857 EIP specification defines `iTransfer(address _to, uint256 _tokenId, TransferValidityProof[] calldata _proofs)` and `iClone(address _to, uint256 _tokenId, TransferValidityProof[] calldata _proofs)` as required interface functions. Axiom only implements the 4-arg versions (`iTransferFrom` and `iCloneFrom`).

The EIP reference implementation has both forms — `iTransfer` calls `_transfer(ownerOf(tokenId), to, tokenId, proofs)` internally and `iTransferFrom` does the same with an explicit `from` parameter.

### BUG-3: Missing `Transferred` Event

**Severity:** HIGH — spec non-compliance

The EIP requires `event Transferred(uint256 indexed tokenId, address indexed from, address indexed to)`. This event is emitted in the EIP reference implementation's `_transfer()` and `transferFrom()` functions. Axiom's implementation does NOT emit this event anywhere. The ERC-721 `Transfer` event is emitted by `safeTransferFrom`, but the EIP-7857 `Transferred` event is a distinct requirement.

### BUG-4: Struct Divergence from EIP Spec

**Severity:** MEDIUM — interface incompatibility

Axiom's `AccessProof`, `OwnershipProof`, and `TransferValidityProofOutput` structs differ significantly from the EIP specification:

| Struct | EIP Field | Axiom Field | Issue |
|--------|-----------|-------------|-------|
| `AccessProof.oldDataHash` | `bytes32` | Renamed to `dataHash` | Name change breaks spec compatibility |
| `AccessProof.newDataHash` | `bytes32` | **DROPPED** | Spec requires both old and new |
| `AccessProof.encryptedPubKey` | `bytes` | Renamed to `targetPubkey` | Name change |
| `AccessProof.validUntil` | Not in spec | **ADDED** | Axiom extension (good security fix) |
| `OwnershipProof.oldDataHash` | `bytes32` | Renamed to `dataHash` | Name change |
| `OwnershipProof.newDataHash` | `bytes32` | **DROPPED** | Spec requires both old and new |
| `TransferValidityProofOutput.oldDataHash` | `bytes32` | Renamed to `dataHash` | Name change |
| `TransferValidityProofOutput.newDataHash` | `bytes32` | **DROPPED** | Spec requires new hash |

### BUG-5: No Data Hash Update on Transfer

**Severity:** MEDIUM — behavioral divergence from spec

The EIP reference implementation's `_transfer()` updates the token's `iDatas` array with `newDataHash` from the proof output during transfer. Axiom's `_transfer()` calls `safeTransferFrom(from, to, tokenId)` (ERC-721 transfer) and emits `PublishedSealedKey`, but does NOT update the `IntelligentData[]` hashes on-chain. This means the data hashes stored on-chain remain stale after a transfer.

### BUG-6: Missing `verifyOwnership()` Implementation

**Severity:** MEDIUM — spec incompleteness

The EIP specification's "Data Verification System" section describes `verifyOwnership()` as the on-chain function for ownership proof verification. It states: "Verified on-chain through `verifyOwnership()`". Axiom's `IERC7857DataVerifier` interface does NOT include this function, and no implementation exists.

### BUG-7: `iCloneFrom` Has No Tests

**Severity:** HIGH — untested critical path

The entire cloning code path (`ERC7857CloneableUpgradeable._clone()`, `iCloneFrom()`) has ZERO tests in the entire test suite. No unit tests, no fuzz tests, no integration tests. This is a critical feature of ERC-7857 that is completely untested.

### BUG-8: No `revokeAuthorization` Tests

**Severity:** MEDIUM — untested code path

The `revokeAuthorization()` function in `ERC7857AuthorizeUpgradeable.sol:86` has no test coverage. Only `authorizeUsage` is tested.

### BUG-9: `verifyTransferValidity` Signature Differs from EIP

**Severity:** LOW (by design)

Axiom changes `verifyTransferValidity(TransferValidityProof[] calldata _proofs)` to `verifyTransferValidity(TransferValidityProof[] calldata _proofs, address to, address nft)`. The addition of `to` and `nft` parameters provides EIP-712 domain binding (security fix F-03/F-04/F-12), which is a strict improvement over the spec. However, it makes the Axiom verifier ABI-incompatible with the canonical EIP verifier.

### BUG-10: `intelligentDataOf` Renamed to `intelligentDatasOf`

**Severity:** LOW — interface name change

The EIP spec names the function `intelligentDataOf(uint256)` (singular). Axiom implements `intelligentDatasOf(uint256)` (plural). This breaks strict ERC-165 interface detection for `IERC7857Metadata`.

---

## 6. Axiom vs 0G Reference Implementation Comparison

| Aspect | 0G Reference (`0gfoundation/0g-agent-nft`) | Axiom (`AxiomAgentNFT`) | Delta |
|--------|---------------------------------------------|------------------------|-------|
| **Contract structure** | Monolithic `AgentNFT` contract | Modular: base + 3 extensions + concrete | Axiom's is more composable |
| **Storage model** | Single `agent.storage.AgentNFT` struct | Separate ERC-7201 storage per extension | Axiom uses namespaced storage |
| **`iTransfer(i)` / `iClone(i)` 3-arg** | ✅ Both implemented | ❌ Both missing | Axiom negative |
| **`iTransferFrom(i)` / `iCloneFrom(i)` 4-arg** | ✅ Both implemented | ✅ Both implemented | Same |
| **`Transferred` event** | ✅ Emitted | ❌ Not emitted | Axiom negative |
| **Data hash update on transfer** | ✅ Updates `iDatas` with `newDataHash` | ❌ No update (stale hashes) | Axiom negative |
| **`verifyTransferValidity`** | 1-arg: `(_proofs)` | 3-arg: `(_proofs, to, nft)` | Axiom binds to domain |
| **`verifyOwnership()`** | ❌ Not in reference either | ❌ Not implemented | Same |
| **`validUntil` deadline** | ❌ Not in reference | ✅ Added to both proof structs | Axiom improvement |
| **Public key format** | `encryptedPubKey` (name) | `targetPubkey` (name + 64-byte raw) | Different naming |
| **Access control** | `AccessControlEnumerableUpgradeable` | `AccessControlUpgradeable` + Ownable | Axiom has simpler ACL |
| **Upgradeability** | Not mentioned | UUPS upgradeable | Axiom improvement |
| **License** | GPL-3.0 | MIT (re-implemented) | Axiom is more permissive |

---

## 7. Architectural Strengths

Despite the compliance gaps, Axiom's implementation has notable improvements over the spec:

1. **EIP-712 Security Fixes:** The `validUntil` deadline field and the `(to, nft)` domain binding in `verifyTransferValidity` (security fixes F-03/F-04/F-12) prevent replay attacks across contracts and chains.

2. **Cross-Proof Consistency Check:** AxiomTeeVerifier validates that `AccessProof` and `OwnershipProof` share the same `dataHash`, `targetPubkey`, `nonce`, and `validUntil` — preventing mixed-proof attacks.

3. **Modular Architecture:** Separating ERC-7857 into `ERC7857Upgradeable` (base), `ERC7857CloneableUpgradeable`, `ERC7857AuthorizeUpgradeable`, and `ERC7857IDataStorageUpgradeable` allows selective feature composition.

4. **UUPS Upgradeability:** The contract can be upgraded via the proxy pattern (mandated by security report F-02).

5. **Role-Based Access Control:** Fine-grained roles (ADMIN, OPERATOR, MINTER) vs the spec's simple ownership.

6. **On-Chain Data Storage Extension:** `ERC7857IDataStorageUpgradeable` stores `IntelligentData[]` on-chain (some implementations may store off-chain).

7. **Comprehensive Fuzz Suite:** Live-fork fuzz testing for the verifier is extensive (15+ fuzz tests covering edge cases).

---

## 8. Summary of Findings

| # | Finding | Severity | File(s) |
|---|---------|----------|---------|
| BUG-1 | ERC-7201 storage slot formula mismatch | **HIGH** | All 6 storage-bearing contracts |
| BUG-2 | Missing `iTransfer` (3-arg) and `iClone` (3-arg) | **HIGH** | `ERC7857Upgradeable.sol`, `ERC7857CloneableUpgradeable.sol` |
| BUG-3 | Missing `Transferred` event | **HIGH** | `ERC7857Upgradeable.sol` |
| BUG-4 | Struct fields diverge from EIP spec (`oldDataHash`, `newDataHash` dropped) | **MEDIUM** | `IERC7857DataVerifier.sol` |
| BUG-5 | Data hashes not updated on transfer | **MEDIUM** | `ERC7857Upgradeable.sol` |
| BUG-6 | Missing `verifyOwnership()` implementation | **MEDIUM** | `IERC7857DataVerifier.sol` |
| BUG-7 | No `iCloneFrom` tests | **HIGH** | `test/` |
| BUG-8 | No `revokeAuthorization` tests | **MEDIUM** | `test/` |
| BUG-9 | `verifyTransferValidity` signature differs from EIP (by design) | **LOW** | `IERC7857DataVerifier.sol` |
| BUG-10 | `intelligentDataOf` renamed to `intelligentDatasOf` | **LOW** | `ERC7857Upgradeable.sol` |

**Total non-compliances with mandatory EIP-7857 interface:** **3 HIGH** (BUG-2, BUG-3, plus BUG-1 in storage), **3 MEDIUM** (BUG-4, BUG-5, BUG-6), **2 LOW** (BUG-9, BUG-10).

**Test coverage gaps:** 2 HIGH (BUG-7), 1 MEDIUM (BUG-8).

---

## 9. References

- **EIP-7857 (Official):** https://eips.ethereum.org/EIPS/eip-7857
- **0G Reference Implementation:** https://github.com/0gfoundation/0g-agent-nft
- **0G Documentation (ERC-7857):** https://docs.0g.ai/developer-hub/building-on-0g/agentic-id/erc7857
- **0G Blog — ERC-7857 Announcement:** https://0g.ai/blog/0g-introducing-erc-7857
- **GitHub Topic — erc-7857:** https://github.com/topics/erc-7857
- **EIP-712 (Typed Data):** https://eips.ethereum.org/EIPS/eip-712
- **EIP-7201 (Namespaced Storage):** https://eips.ethereum.org/EIPS/eip-7201
- **ERC-721 (NFT Standard):** https://eips.ethereum.org/EIPS/eip-721
- **Axiom BUGS.md:** `/home/eya/og/apps/contracts/test/BUGS.md` (7,000+ lines of bug tracking)
