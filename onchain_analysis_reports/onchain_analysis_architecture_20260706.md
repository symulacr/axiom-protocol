# On-Chain Architecture, Patterns & Quality Analysis — Group B (Smart Contracts)

**Agent:** Sub-Agent 3 — Architecture, Patterns & Quality  
**Date:** 2026-07-06  
**Scope:** Group B smart-contract source only (9 files, ~1,050 LOC)  
**Deployed proxy (reference):** `0x6f82d061a903E48Ce1810F8d42536C6A837ed684` (UUPS upgradeable ERC-7857 iNFT)

| File | Role |
|------|------|
| `apps/contracts/src/AxiomAgentNFT.sol` | Concrete UUPS iNFT |
| `apps/contracts/src/ERC7857Upgradeable.sol` | ERC-7857 base (transfer proofs) |
| `apps/contracts/src/extensions/ERC7857AuthorizeUpgradeable.sol` | Usage authorization extension |
| `apps/contracts/src/extensions/ERC7857CloneableUpgradeable.sol` | Clone extension |
| `apps/contracts/src/extensions/ERC7857IDataStorageUpgradeable.sol` | On-chain `IntelligentData[]` storage |
| `apps/contracts/src/interfaces/IERC7857.sol` | Main ERC-7857 interface |
| `apps/contracts/src/interfaces/IERC7857Authorize.sol` | Authorize extension interface |
| `apps/contracts/src/interfaces/IERC7857Cloneable.sol` | Clone extension interface |
| `apps/contracts/src/interfaces/IERC7857Metadata.sol` | Metadata interface alias |

**Status:** Analysis only — no code changes performed.

---

## 1. Executive Summary

The Group B contracts implement a **modular ERC-7857 iNFT** by composing three 0G-reference extensions (Cloneable, Authorize, IDataStorage) atop a forked `ERC7857Upgradeable` base, with `AxiomAgentNFT` adding UUPS upgradeability, AccessControl roles, Pausable/ReentrancyGuard, and fee/mint governance.

**Overall architecture grade: B**

| Dimension | Grade | Summary |
|-----------|-------|---------|
| **Modularity / inheritance** | B+ | Clean extension pattern with ERC-7201 namespaced storage per module; virtual hooks (`_intelligentDatasOf`, `_updateData`, `_update`) wired correctly in the concrete contract. |
| **Upgrade safety** | B− | UUPS + `_disableInitializers()` + isolated storage namespaces are sound; **no `__gap` arrays** in any app storage struct; Ownable vs AccessControl authority can diverge. |
| **CEI / reentrancy** | C+ | Mint/withdraw paths use CEI + `nonReentrant`; **transfer/clone paths call external verifier then `safeTransferFrom` (with receiver hook) before emitting sealed-key events**; clone/mint copy metadata **after** `_safeMint`. |
| **EIP-7857 integration** | B | Proof pipeline (`verifyTransferValidity(proofs, to, nft)`) correctly binds recipient + contract; 3-arg verifier fork documented (F-03/F-04/F-12). Several **event-signature and pause-coverage deviations** from spec/reference. |
| **Error handling / NatSpec** | C+ | ERC-7857 layer uses custom errors; `AxiomAgentNFT` mixes `require("…")` strings; `_msgSender()` / `msg.sender` inconsistency across authorization paths. |
| **Duplication** | B | Expected inheritance duplication only; `iTransfer` vs `iTransferFrom` authorization split is the main internal inconsistency. |

**Severity counts:** 0 Critical · 2 High · 7 Medium · 6 Low · 5 Cosmetic

No Critical findings: no direct on-chain fund theft path exists in these files; value at risk is primarily **metadata access continuity**, **governance/upgrade control**, and **operational pause completeness**.

---

## 2. Findings by Severity

### High

#### H-01 — Pause does not cover ERC-7857 transfer, clone, or authorization paths

**Impact:** `pause()` is documented/implied as an emergency stop, but only `mint`, `mint` fee paths, and `update()` use `whenNotPaused`. All proof-gated and ERC-721 transfer paths remain live while “paused,” undermining incident response.

**Evidence:**

```183:198:apps/contracts/src/AxiomAgentNFT.sol
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }
    // ...
    function update(
        uint256 tokenId,
        IntelligentData[] calldata newDatas
    ) public virtual whenNotPaused {
```

`iTransfer`, `iTransferFrom`, `iClone`, `iCloneFrom`, `authorizeUsage`, and standard `transferFrom`/`safeTransferFrom` (inherited) have **no** `whenNotPaused`. OpenZeppelin’s canonical pattern applies pause via `_update`:

```37:43:apps/contracts/node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721PausableUpgradeable.sol
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal virtual override whenNotPaused returns (address) {
        return super._update(to, tokenId, auth);
    }
```

`AxiomAgentNFT._update` does not add `whenNotPaused`:

```103:109:apps/contracts/src/AxiomAgentNFT.sol
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal virtual override(ERC721Upgradeable, ERC7857AuthorizeUpgradeable) returns (address) {
        return super._update(to, tokenId, auth);
    }
```

Tests confirm pause blocks mint only (`test_pause_unpause`); no test expects paused `iTransferFrom` to revert.

**Recommendation:** Override `_update` with `whenNotPaused` (OZ `ERC721Pausable` pattern) or add `whenNotPaused` to all state-changing externals. Document intentional exceptions if any path must stay open.

---

#### H-02 — Dual authority model: UUPS upgrades gated by `onlyOwner`, operations gated by `AccessControl`

**Impact:** Ownership and role admin can diverge after deployment. A new `owner` can upgrade implementation without holding `ADMIN_ROLE`/`OPERATOR_ROLE`; conversely, `DEFAULT_ADMIN_ROLE` holders can rotate verifier, fees, and pause state but cannot upgrade unless they are also owner.

**Evidence:**

```86:96:apps/contracts/src/AxiomAgentNFT.sol
        __AccessControl_init();
        __Ownable_init(admin_);
        // ...
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(ADMIN_ROLE, admin_);
        _grantRole(OPERATOR_ROLE, admin_);
        _grantRole(MINTER_ROLE, admin_);
```

```208:210:apps/contracts/src/AxiomAgentNFT.sol
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}
```

`updateVerifier` uses `onlyRole(OPERATOR_ROLE)`; `withdrawMintFees` uses `onlyRole(DEFAULT_ADMIN_ROLE)` — neither checks owner.

**Recommendation:** Unify governance (single owner multisig **or** `onlyRole(DEFAULT_ADMIN_ROLE)` on `_authorizeUpgrade`), or document + enforce `transferOwnership` / role-grant synchronization in ops runbooks.

---

### Medium

#### M-01 — Standard ERC-721 transfers bypass proof-gated `iTransfer` (metadata access discontinuity)

**Impact:** Holders/operators can move token ownership via `transferFrom` / `safeTransferFrom` without `TransferValidityProof`s. On-chain `IntelligentData` hashes remain, but **no `PublishedSealedKey` event** is emitted and off-chain ciphertext is not re-encrypted for the new owner. Marketplaces, aggregators, or users accustomed to ERC-721 flows can inadvertently “brick” agent decryptability.

EIP-7857 explicitly permits optional ERC-721 compatibility; this is an **architectural/integration risk**, not an unintended code path.

**Evidence:** No override of `transferFrom` / `safeTransferFrom` in Group B. Gas benchmarks exercise bare `transferFrom`:

```120:126:apps/contracts/test/GasBenchmark.t.sol
    function testGas_nftTransfer() public {
        // ...
        nft.transferFrom(alice, bob, 0);
    }
```

`_transfer` (proof path) is separate:

```143:153:apps/contracts/src/ERC7857Upgradeable.sol
    function _transfer(...) internal {
        bytes[] memory sealedKeys = _proofCheck(from, to, tokenId, proofs);
        safeTransferFrom(from, to, tokenId);
        emit PublishedSealedKey(to, tokenId, sealedKeys);
        emit Transferred(tokenId, from, to);
    }
```

**Recommendation:** Document integrator requirement (“always `iTransfer`”); optionally override ERC-721 transfer functions to revert with a dedicated error, or emit a warning event when non-proof transfers occur.

---

#### M-02 — CEI violation on clone/mint: `_safeMint` callback runs before metadata is written

**Impact:** During `onERC721Received`, the token exists but `intelligentDatasOf(newTokenId)` may be empty. Receiver contracts that validate metadata in the hook will fail; reentrancy during the hook observes inconsistent state.

**Evidence — clone:**

```46:51:apps/contracts/src/extensions/ERC7857CloneableUpgradeable.sol
        uint256 newTokenId = _incrementTokenId();
        _safeMint(to, newTokenId);
        IntelligentData[] memory datas = _intelligentDatasOf(tokenId);
        _updateData(newTokenId, datas);
```

**Evidence — mint:**

```220:224:apps/contracts/src/AxiomAgentNFT.sol
        tokenId = _incrementTokenId();
        _safeMint(to, tokenId);
        _getAxiomAgentNFTStorage().creators[tokenId] = to;
        emit CreatorSet(tokenId, to);
        _updateData(tokenId, iDatas);
```

**Recommendation:** Prefer `_mint` when recipient is an EOA, or write metadata before `_safeMint` (ordering must still respect reentrancy analysis), or use `_safeMint` only after `_updateData` via internal mint helper that skips the receiver hook until data is set.

---

#### M-03 — Transfer path: external verifier interaction precedes ERC-721 authorization check

**Impact:** `_proofCheck` calls `verifier.verifyTransferValidity` (state-mutating in verifier — nonce marking) before `safeTransferFrom` enforces `_isAuthorized`. Failed authorization reverts the full tx (nonces roll back), but **unauthorized callers still drive verifier work** and proof validation cost until the ERC-721 gate reverts.

**Evidence:**

```90:107:apps/contracts/src/ERC7857Upgradeable.sol
    function _proofCheck(...) internal returns (bytes[] memory sealedKeys) {
        // owner/from checks, empty proof checks...
        TransferValidityProofOutput[] memory proofOutput = $.verifier.verifyTransferValidity(proofs, to, address(this));
```

```143:151:apps/contracts/src/ERC7857Upgradeable.sol
    function _transfer(...) internal {
        bytes[] memory sealedKeys = _proofCheck(from, to, tokenId, proofs);
        safeTransferFrom(from, to, tokenId);  // auth enforced here via transferFrom → _update(..., _msgSender())
```

`iTransfer` performs an early `_checkAuthorized`, but `iTransferFrom` does not:

```155:173:apps/contracts/src/ERC7857Upgradeable.sol
    function iTransferFrom(...) public virtual {
        _transfer(from, to, tokenId, proofs);
    }
    function iTransfer(...) public virtual {
        // ...
        _checkAuthorized(from, _msgSender(), tokenId);
        _transfer(from, to, tokenId, proofs);
    }
```

**Recommendation:** Add `_checkAuthorized(from, _msgSender(), tokenId)` at the start of `_transfer` or `iTransferFrom`; consider static-call/view pre-checks before verifier mutation where verifier API allows.

---

#### M-04 — No storage gaps (`__gap`) in ERC-7201 structs

**Impact:** Future V2 implementations cannot append variables to existing namespaces without storage-layout collision risk. OZ upgradeable guidance and EIP-7857 reference `BaseVerifier` use `uint256[50] private __gap`.

**Evidence:** All namespace structs end without gap arrays, e.g.:

```48:52:apps/contracts/src/AxiomAgentNFT.sol
    struct AxiomAgentNFTStorage {
        string storageInfo;
        uint256 mintFee;
        mapping(uint256 => address) creators;
    }
```

Same pattern in `ERC7857Storage`, `ERC7857AuthorizeStorage`, `ERC7857CloneableStorage`, `ERC7857IDataStorageStorage`.

**Recommendation:** Add `uint256[50] private __gap` (or OZ-recommended size) to each namespace struct before next upgrade.

---

#### M-05 — `AuthorizationRevoked` event parameter order differs from EIP-7857

**Impact:** Event topic0 and indexed topic layout differ from the canonical spec. Off-chain indexers, subgraphs, or compliance tooling expecting EIP field order will mis-decode logs.

**EIP-7857 canonical order:** `AuthorizationRevoked(address indexed _from, address indexed _to, uint256 indexed _tokenId)`

**Implementation:**

```19:19:apps/contracts/src/interfaces/IERC7857Authorize.sol
    event AuthorizationRevoked(uint256 indexed tokenId, address indexed from, address indexed to);
```

```110:110:apps/contracts/src/extensions/ERC7857AuthorizeUpgradeable.sol
        emit AuthorizationRevoked(tokenId, msg.sender, user);
```

**Recommendation:** Align parameter order with EIP in next **major** ABI version (breaking change); until then document the deviation prominently for integrators.

---

#### M-06 — Verifier contract rotatable without timelock or user notice period

**Impact:** `OPERATOR_ROLE` can atomically swap the trust root for all future transfers/clones. Existing agents may become non-transferable if the new verifier rejects old proof format/signers.

**Evidence:**

```148:155:apps/contracts/src/AxiomAgentNFT.sol
    function updateVerifier(
        address newVerifier
    ) public virtual onlyRole(OPERATOR_ROLE) {
        require(newVerifier != address(0), "Zero address");
        address oldVerifier = address(verifier());
        _setVerifier(newVerifier);
        emit VerifierUpdated(oldVerifier, newVerifier);
    }
```

**Recommendation:** Timelock + two-step verifier migration, or cap changes to `onlyOwner` with off-chain governance delay.

---

#### M-07 — `mintWithRole` bypasses pause; creator mapping inconsistently populated

**Impact:** Admin pause does not stop privileged minting. Two-argument `mintWithRole` never sets `creators[tokenId]`, unlike payable `mint` and three-argument `mintWithRole`.

**Evidence:**

```228:237:apps/contracts/src/AxiomAgentNFT.sol
    function mintWithRole(
        IntelligentData[] calldata iDatas,
        address to
    ) public virtual onlyRole(MINTER_ROLE) returns (uint256 tokenId) {
        // no whenNotPaused, no creator set
        tokenId = _incrementTokenId();
        _safeMint(to, tokenId);
        _updateData(tokenId, iDatas);
    }
```

Compare payable `mint` (sets `creators[tokenId] = to`) and three-arg `mintWithRole` (optional creator).

**Recommendation:** Add `whenNotPaused` to all mint entrypoints; align creator semantics across mint paths.

---

### Low

#### L-01 — `msg.sender` vs `_msgSender()` inconsistency breaks meta-tx readiness

| Function | Sender used |
|----------|-------------|
| `iTransfer` / `iClone` | `_msgSender()` |
| `iCloneFrom` / `authorizeUsage` / `revokeAuthorization` | `msg.sender` |

**Evidence:**

```74:75:apps/contracts/src/extensions/ERC7857CloneableUpgradeable.sol
        _checkAuthorized(from, msg.sender, tokenId);
```

```87:88:apps/contracts/src/extensions/ERC7857AuthorizeUpgradeable.sol
        if (_ownerOf(tokenId) != msg.sender) {
```

**Recommendation:** Standardize on `_msgSender()` for all authorization checks.

---

#### L-02 — Mixed error handling: custom errors vs `require` strings

`AxiomAgentNFT` uses string reverts (`"Not owner"`, `"Zero address"`, `"Insufficient mint fee"`) while ERC-7857 interfaces/contracts define typed errors (`ERC7857EmptyProof`, `ERC721IncorrectOwner`, etc.).

**Recommendation:** Define `error` types in `AxiomAgentNFT` (or shared errors file) for uniform decoding in wallets/indexers.

---

#### L-03 — Wrong error type on `revokeAuthorization` ownership failure

Uses `ERC721InvalidSender` when caller is not owner — semantically incorrect; should be `ERC721IncorrectOwner` (as `authorizeUsage` uses).

```98:101:apps/contracts/src/extensions/ERC7857AuthorizeUpgradeable.sol
        if (_ownerOf(tokenId) != msg.sender) {
            revert ERC721InvalidSender(msg.sender);
        }
```

---

#### L-04 — `_clearAuthorized` is O(n) with unbounded loop at transfer time

On each transfer, `authorizedUsersOf` is copied and removed one-by-one. Capped at 100 users per token (`MAX_AUTHORIZED_USERS`), so bounded but gas-heavy.

```69:77:apps/contracts/src/extensions/ERC7857AuthorizeUpgradeable.sol
    function _clearAuthorized(uint256 tokenId) internal {
        address[] memory values = $.authorizedUsers[tokenId].values();
        for (uint256 i = 0; i < values.length; ++i) {
            $.authorizedUsers[tokenId].remove(values[i]);
        }
    }
```

**Recommendation:** Acceptable at max 100; consider `delete $.authorizedUsers[tokenId]` if EnumerableSet supports rebuild-on-next-authorize pattern.

---

#### L-05 — `iTransfer` double-authorization vs `iTransferFrom` single path

`iTransfer` calls `_checkAuthorized` then `_transfer` → `safeTransferFrom` → `transferFrom` → `_update(..., _msgSender())` which checks authorization again. Redundant gas, not a security bug.

---

#### L-06 — Token IDs start at `0`

`_incrementTokenId` post-increments from zero; first minted token is `0`. Some marketplace UIs assume 1-based IDs.

```34:38:apps/contracts/src/extensions/ERC7857CloneableUpgradeable.sol
    function _incrementTokenId() internal returns (uint256 nextTokenId) {
        nextTokenId = $.nextTokenId;
        $.nextTokenId++;
    }
```

Confirmed in tests: `testICloneFrom_succeeds` expects `clonedTokenId == 1` after first mint at `0`.

---

### Cosmetic

#### C-01 — Stale DEV-NOTE on `Authorization` event in `IERC7857Authorize.sol`

Comment claims `to` is not indexed, but the event declares `address indexed to`:

```15:18:apps/contracts/src/interfaces/IERC7857Authorize.sol
    /// @dev DEV-NOTE: Per EIP-7857 spec, `_tokenId` and `_to` should both be `indexed`.
    ///      Current form indexes `tokenId` only (not `to`). This is NOT spec-compliant.
    event Authorization(address indexed from, address indexed to, uint256 indexed tokenId);
```

Remove or correct the DEV-NOTE.

---

#### C-02 — NatSpec gaps on public/external entrypoints

`mint`, `mintWithRole` overloads, `setMintFee`, `withdrawMintFees`, and several extension internals lack `@param` / `@return` documentation. `AxiomAgentNFT` has no `@title` tag.

---

#### C-03 — Redundant `Transferred` event alongside ERC-721 `Transfer`

Intentional per EIP-7857; duplicates information for indexers that already subscribe to `Transfer`.

---

#### C-04 — `IERC7857Metadata` is a thin alias over `@0g-agent-nft` import

```8:14:apps/contracts/src/interfaces/IERC7857Metadata.sol
interface IERC7857Metadata is IERC7857MetadataBase {
    function intelligentDataOf(uint256 tokenId) external view returns (IntelligentData[] memory data);
}
```

Adds EIP singular naming only — fine, but creates dual source-of-truth for `IntelligentData` struct layout.

---

#### C-05 — `update()` uses bare `require` for ownership

```195:195:apps/contracts/src/AxiomAgentNFT.sol
        require(_ownerOf(tokenId) == msg.sender, "Not owner");
```

Should use `_msgSender()` and typed errors for consistency.

---

## 3. Upgrade & Storage Layout Notes

### 3.1 Inheritance linearization (`AxiomAgentNFT`)

```
AxiomAgentNFT
  → ERC7857IDataStorageUpgradeable
  → ERC7857AuthorizeUpgradeable
  → ERC7857CloneableUpgradeable
  → UUPSUpgradeable
  → OwnableUpgradeable
  → PausableUpgradeable
  → ReentrancyGuardUpgradeable
  → AccessControlUpgradeable
  → ERC7857Upgradeable (once, via C3)
  → ERC721Upgradeable
  → … OZ base contracts
```

**Wiring verified:**
- `_intelligentDatasOf` / `_updateData` explicitly delegate to `ERC7857IDataStorageUpgradeable` in the concrete contract.
- `_update` resolves to `ERC7857AuthorizeUpgradeable._update`, which clears authorized users then calls `ERC721Upgradeable._update`.
- `supportsInterface` merges `AccessControl`, all ERC-7857 extensions, and `ERC721` paths via `super` chain.

### 3.2 ERC-7201 namespace slots (verified)

| Namespace | Declared slot | Formula check |
|-----------|---------------|---------------|
| `0g.storage.ERC7857` | `0xa2b40c…3c00` | ✓ |
| `0g.storage.ERC7857Authorize` | `0xf386e9…5700` | ✓ |
| `0g.storage.ERC7857Cloneable` | `0x03de6c…8000` | ✓ |
| `0g.storage.ERC7857IDataStorage` | `0xcee271…5b00` | ✓ |
| `agent.storage.AxiomAgentNFT` | `0xe982fe…a900` | ✓ |

Namespaces are **collision-free** — each module uses a distinct ERC-7201 slot; OpenZeppelin ERC-721 / AccessControl / Ownable use their own OZ v5 slots.

### 3.3 Upgrade checklist for V2

1. **Never reorder** existing struct fields in any namespace.
2. **Append only** new fields with a preceding `__gap` shrink.
3. Re-run `forge inspect AxiomAgentNFT storage-layout` + OZ `validateUpgrade` against `0x6f82d061…684` implementation slot.
4. Preserve `VERSION` constant or bump with migration notes.
5. If changing `IntelligentData` struct (external `@0g-agent-nft` package), plan cross-contract migration — on-chain dynamic arrays in `mapping(uint256 => IntelligentData[])` cannot change element layout safely.

### 3.4 Initializer surface

Single public `initialize(...)` on the proxy; constructor calls `_disableInitializers()`. Extension modules have **no separate initializers** — their storage defaults to zero (`nextTokenId = 0`, empty mappings). This is acceptable but means `nextTokenId` cannot be pre-seeded without an upgrade/migration function.

---

## 4. State Machine Summary

```
┌─────────────┐     mint / iClone      ┌──────────────┐
│  (no token) │ ─────────────────────► │   Minted     │
└─────────────┘                        │  owner = X   │
                                       │  dataHash[]  │
                                       └──────┬───────┘
                                              │
          ┌───────────────────────────────────┼───────────────────────────────┐
          │                                   │                               │
          ▼                                   ▼                               ▼
   iTransfer / iTransferFrom          authorizeUsage                   update (owner)
   (+ proofs, verifier)               (≤100 users)                     (replace data[])
          │                                   │                               │
          ▼                                   ▼                               │
   owner = Y; auth cleared              authorizedUsers set                      │
   PublishedSealedKey emitted            (not decrypt keys on-chain)             │
          │                                                                   │
          ├──── transferFrom (no proofs) ──► owner changes, NO sealed keys    │
          │                                                                   │
          └───────────────────────────────────────────────────────────────────┘
                                              │
                                     pause (partial — see H-01)
```

**Authorized users:** Cleared on every `_update` (transfer/mint/burn path). **Delegate access:** Per-user assistant mapping in `ERC7857Storage.accessAssistants` — **not** cleared on token transfer (user-level, not token-level — correct).

---

## 5. EIP-7857 Transfer Proof Integration (Architecture View)

| Step | Location | Notes |
|------|----------|-------|
| 1. Proof count vs data count | `_proofCheck` | `proofOutput.length` must equal `_intelligentDatasOf(tokenId).length` |
| 2. Domain binding | `verifier.verifyTransferValidity(proofs, to, address(this))` | 3-arg fork binds recipient + NFT contract (F-03/F-04/F-12) |
| 3. Data hash match | `_proofCheck` loop | `proofOutput[i].dataHash == datas[i].dataHash` |
| 4. Access assistant | `_proofCheck` | Must equal `accessAssistants[to]` or `to` |
| 5. Receiver pubkey | `Utils.pubKeyToAddress` / `Utils.bytesEqual` | Empty `wantedKey` → derive address from `targetPubkey` |
| 6. Ownership move | `safeTransferFrom` | Standard ERC-721 auth + hook |
| 7. Key publication | `emit PublishedSealedKey` | After state change |
| 8. EIP transfer event | `emit Transferred` | After state change |

**Fork delta from 0G reference:** Extensions and base document incompatibility with 1-arg `verifyTransferValidity` — Axiom requires the 3-arg interface in `IERC7857DataVerifier.sol` (outside Group B, but consumed here).

---

## 6. Microchange Opportunities

| ID | Change | Effort | Impact |
|----|--------|--------|--------|
| MC-01 | Add `whenNotPaused` to `_update` | Trivial | Fixes H-01 |
| MC-02 | `_checkAuthorized` at top of `_transfer` | Trivial | Fixes M-03 partial |
| MC-03 | Replace `msg.sender` → `_msgSender()` in Authorize + `iCloneFrom` | Trivial | Fixes L-01 |
| MC-04 | `revokeAuthorization` → `ERC721IncorrectOwner` | Trivial | Fixes L-03 |
| MC-05 | Remove stale DEV-NOTE in `IERC7857Authorize.sol` | Trivial | Fixes C-01 |
| MC-06 | Add `whenNotPaused` to `mintWithRole` | Trivial | Fixes M-07 partial |
| MC-07 | Add `__gap[50]` to each storage struct | Small | Fixes M-04 |
| MC-08 | Convert `require` strings in `AxiomAgentNFT` to `error` | Small | Fixes L-02 |
| MC-09 | Set `creators` in 2-arg `mintWithRole` (e.g. `to` or `msg.sender`) | Trivial | Fixes M-07 partial |
| MC-10 | Document ERC-721 bare-transfer hazard in NatSpec | Trivial | Mitigates M-01 |

---

## 7. Positive Findings

1. **Namespaced storage (ERC-7201)** — Each extension isolates state; slot constants match the canonical formula (verified computationally).

2. **Security-conscious verifier binding** — `verifyTransferValidity` includes `to` and `nft` arguments, addressing cross-contract and MEV replay classes (documented F-03/F-04/F-12).

3. **Authorize extension hygiene** — Hard cap of 100 authorized users; zero-address guards; authorization cleared on transfer via `_update` hook.

4. **UUPS implemented correctly** — `_disableInitializers()` in constructor; `_authorizeUpgrade` present (F-02); tests assert non-owner upgrade reverts.

5. **Mint fee CEI** — `_refundExcess` after state writes; `withdrawMintFees` uses `nonReentrant` and transfers after balance read.

6. **Custom errors in ERC-7857 core** — Proof failures use typed errors (`ERC7857DataHashMismatch`, `ERC7857AccessAssistantMismatch`, etc.) enabling precise integrator handling.

7. **Interface licensing clarity** — `IERC7857.sol` documents MIT re-implementation vs GPL reference; reduces license contamination risk.

8. **Composable extension design** — Base `ERC7857Upgradeable` exposes virtual hooks with safe empty defaults; concrete contract selects IDataStorage implementation without forking proof logic.

9. **Operator transfer tests** — `testOperatorTransfer_succeeds` validates ERC-721 approval + `iTransferFrom` interplay.

10. **Metadata JSON decision documented** — `MetadataJsonDecisionDocumented` event at init records explicit rejection of second root-hash pattern (privacy-aligned with EIP-7857 rationale).

---

## 8. Files Read (Complete)

All nine Group B files were read in full:

- `AxiomAgentNFT.sol` (278 lines)
- `ERC7857Upgradeable.sol` (213 lines)
- `extensions/ERC7857AuthorizeUpgradeable.sol` (129 lines)
- `extensions/ERC7857CloneableUpgradeable.sol` (89 lines)
- `extensions/ERC7857IDataStorageUpgradeable.sol` (68 lines)
- `interfaces/IERC7857.sol` (59 lines)
- `interfaces/IERC7857Authorize.sol` (38 lines)
- `interfaces/IERC7857Cloneable.sol` (30 lines)
- `interfaces/IERC7857Metadata.sol` (16 lines)

**Cross-references (context only, out of scope):** `IERC7857DataVerifier.sol`, `AxiomTeeVerifier.sol`, OZ `ERC721Upgradeable` / `ERC721PausableUpgradeable`, `AxiomAgentNFT.t.sol`, `GasBenchmark.t.sol`, EIP-7857 spec.

---

*Report generated by Sub-Agent 3 — Architecture, Patterns & Quality. Findings are evidence-backed from Group B source only.*