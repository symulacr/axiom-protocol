# Dead Functions & Methods Report

**Agent:** W3A2-DeadFunctions
**Date:** 2026-06-28
**Scope:** All `.ts`, `.sol` source files under `/home/eya/og/apps/` and `/home/eya/og/packages/`
**Methodology:** For each discovered function definition, grep for its name across the entire project, exclude definition site, cross-reference with route registration, hook imports, and interface declarations. Only functions with zero callers (beyond definition + auto-generated ABI) are flagged.

---

## Summary

| Category | Count |
|---|---|
| **Solidity contract functions (confirmed dead)** | 17 |
| **Solidity interface-only functions (transitively dead)** | 7 |
| **Backend TypeScript functions (confirmed dead)** | 17 |
| **Frontend TypeScript functions (confirmed dead)** | 2 |
| **Oracle TypeScript functions (confirmed dead)** | 3 |
| **Indexer TypeScript functions (confirmed dead)** | 1 |
| **Deploy script functions (confirmed dead)** | 1 |
| **Total** | **48** |

---

## 1. Solidity Contract Functions

### apps/contracts/src/AxiomPaymentProcessor.sol

| Line | Function | Confidence | Evidence |
|------|----------|------------|----------|
| 90 | `setProtocolTreasury(address newTreasury)` | **HIGH** | `external onlyOwner` admin setter. Only referenced in auto-generated ABIs (generated.ts, paymentProcessor.json). Never called from any deploy script, backend, frontend, oracle, indexer, or test code. |
| 97 | `setProtocolFeeBps(uint256 newBps)` | **HIGH** | Same pattern — ABI-only. No callers. |
| 108 | `setPaymentToken(address newPaymentToken)` | **HIGH** | Same pattern — ABI-only. No callers. |

### apps/contracts/src/AxiomStrategyVault.sol

| Line | Function | Confidence | Evidence |
|------|----------|------------|----------|
| 75 | `setNFT(address newNft)` | **HIGH** | `external onlyOwner`. ABI-only. No callers. |

### apps/contracts/src/ERC7857Upgradeable.sol

| Line | Function | Confidence | Evidence |
|------|----------|------------|----------|
| 61 | `delegateAccess(address assistant)` | **HIGH** | `public virtual`. Definition + interface (IERC7857.sol:52) + ABI auto-gen only. No actual callers in any Solidity contract logic, deploy script, TypeScript, or test. |
| 70 | `getDelegateAccess(address user)` | **HIGH** | `public view virtual`. Same pattern — interface + ABI only. No callers. |
| 144 | `iTransfer(address to, uint256 tokenId, TransferValidityProof[] calldata proofs)` | **HIGH** | 3-arg convenience form. Interface + ABI only. All application code uses `iTransferFrom()` instead (run-e2e.ts, useTransfer.ts). |
| 155 | `_intelligentDatasLengthOf(uint256)` | **MEDIUM** | Internal virtual defined in ERC7857Upgradeable (returns 0), overridden in ERC7857IDataStorageUpgradeable (returns actual length) and AxiomAgentNFT (delegates to storage). **Never actually called by any code.** Framework-completeness function with zero invocations. |
| 169 | `intelligentDataOf(uint256 tokenId)` | **HIGH** | Singular alias for `intelligentDatasOf()`. Interface (IERC7857Metadata.sol:12) + ABI only. All code uses `intelligentDatasOf()` (plural) directly. |

### apps/contracts/src/extensions/ERC7857AuthorizeUpgradeable.sol

| Line | Function | Confidence | Evidence |
|------|----------|------------|----------|
| 39 | `authorizedUsersOf(uint256 tokenId)` | **HIGH** | `public view virtual`. Interface + ABI only. No callers. |
| 73 | `authorizeUsage(uint256 tokenId, address to)` | **HIGH** | `public virtual`. Calls `_authorizeUsage()` internally but nothing calls `authorizeUsage()` externally. Interface + ABI only. |
| 85 | `revokeAuthorization(uint256 tokenId, address user)` | **HIGH** | `public virtual`. Interface + ABI only. No callers. |

### apps/contracts/src/extensions/ERC7857CloneableUpgradeable.sol

| Line | Function | Confidence | Evidence |
|------|----------|------------|----------|
| 64 | `iCloneFrom(address from, address to, uint256 tokenId, ...)` | **HIGH** | `public virtual`. Interface + ABI only. Clone extension compiled in but never used. |
| 77 | `iClone(address to, uint256 tokenId, ...)` | **HIGH** | `public virtual`. Same pattern. Only changelog/docs references. |

### apps/contracts/src/extensions/AxiomMetadataJson.sol

| Line | Function | Confidence | Evidence |
|------|----------|------------|----------|
| 101 | `buildMetadataJson(...)` | **HIGH** | Library function. `using AxiomMetadataJson for uint256` is imported in AxiomAgentNFT.sol but neither `buildMetadataJson()` nor the using-for-attached version is ever called. `tokenURI` is not overridden in AxiomAgentNFT. |
| 134 | `buildMetadataJsonDataUri(...)` | **HIGH** | Base64-wraps `buildMetadataJson()`. Same — never called. |

### apps/contracts/src/AxiomAgentNFT.sol

| Line | Function | Confidence | Evidence |
|------|----------|------------|----------|
| 154 | `setStorageInfo(string memory newInfo)` | **HIGH** | `external onlyRole(ADMIN_ROLE)`. ABI only. Deploy scripts set `storageInfo` via `initialize()` parameter, never via setter. |
| 161 | `storageInfo()` | **HIGH** | `public view`. ABI only. No code queries this getter. |
| 234 | `withdrawMintFees(address payable to)` | **HIGH** | `external onlyRole(DEFAULT_ADMIN_ROLE)`. ABI only. No callers. |

### apps/contracts/src/verifiers/BaseVerifier.sol

| Line | Function | Confidence | Evidence |
|------|----------|------------|----------|
| 27 | `cleanExpiredProofs(bytes32[] calldata proofNonces)` | **HIGH** | `external`. ABI-only. Never called from any Solidity contract or TypeScript code. |

### apps/contracts/src/verifiers/AxiomTeeVerifier.sol

| Line | Function | Confidence | Evidence |
|------|----------|------------|----------|
| 117 | `registerSigner(address newSigner)` | **HIGH** | `external onlyOwner`. ABI-only. Deploy scripts (Deploy.s.sol, DeployAristotle.s.sol) set the signer via the **constructor**, never call `registerSigner()` after deployment. Comments mention the function but never invoke it. |
| 158 | `domainSeparator()` | **HIGH** | `public view`. Wraps `_domainSeparator()` (which IS called internally). But the **public** `domainSeparator()` is never called from any Solidity code, deploy script, or TypeScript. TypeScript has its own `domainSeparator()` in eip712.ts — different symbol. Contract ABI has it, zero callers. |

---

## 2. Solidity Interface Functions (Transitively Dead)

These are functions declared in interface files whose implementations are also dead:

| Interface File | Function | Status |
|----------------|----------|--------|
| `IERC7857.sol:48` | `iTransfer(address,uint256,TransferValidityProof[])` | Implementation dead (ERC7857Upgradeable.sol:144) |
| `IERC7857.sol:52` | `delegateAccess(address)` | Implementation dead (ERC7857Upgradeable.sol:61) |
| `IERC7857.sol:56` | `getDelegateAccess(address)` | Implementation dead (ERC7857Upgradeable.sol:70) |
| `IERC7857Authorize.sol:24` | `authorizeUsage(uint256,address)` | Implementation dead (ERC7857AuthorizeUpgradeable.sol:73) |
| `IERC7857Authorize.sol:27` | `revokeAuthorization(uint256,address)` | Implementation dead (ERC7857AuthorizeUpgradeable.sol:85) |
| `IERC7857Authorize.sol:31` | `authorizedUsersOf(uint256)` | Implementation dead (ERC7857AuthorizeUpgradeable.sol:39) |
| `IERC7857Cloneable.sol:19` | `iCloneFrom(...)` | Implementation dead (ERC7857CloneableUpgradeable.sol:64) |
| `IERC7857Cloneable.sol:31` | `iClone(...)` | Implementation dead (ERC7857CloneableUpgradeable.sol:77) |
| `IERC7857Metadata.sol:12` | `intelligentDataOf(uint256)` | Implementation dead (ERC7857Upgradeable.sol:169) |

---

## 3. Backend TypeScript Functions

### apps/backend/src/events/store.ts

| Line | Function | Confidence | Evidence |
|------|----------|------------|----------|
| 95 | `EventStore.queryBySource(source)` | **HIGH** | Public method on EventStore class. Never called. All consumers use `getAll()` and `queryByAgent()` instead. |
| 141 | `EventStore.getTokenIdsByOwner(owner)` | **HIGH** | Public method. Never called. |
| 162 | `EventStore.bucketCount` (getter) | **HIGH** | Public getter. Never called. (`.size` on line 163 is `Map.size`, not this getter.) |
| 166 | `EventStore.size` (getter) | **HIGH** | Public getter returning concatenated bucket lengths. Never called. |
| 172 | `EventStore.totalAppends` (getter) | **HIGH** | Public getter. Never called. |
| 257 | `EventStore.clear()` | **HIGH** | Public method. Internal `.clear()` calls on lines 185-187 are `Map.clear()` on internal maps, not the class method. |
| 289 | `_resetEventStoreForTests()` | **HIGH** | Exported test-only helper. No test file exists under `apps/backend/src/events/` to call it. |

### apps/backend/src/compute/provider-discovery.ts

| Line | Function | Confidence | Evidence |
|------|----------|------------|----------|
| 62 | `invalidateProviderCache()` | **HIGH** | Exported function. Never imported or called by any production code. |

### apps/backend/src/routers/route-factory.ts

| Line | Variable | Confidence | Evidence |
|------|----------|------------|----------|
| 13 | `REGISTERED_ROUTES` (const array) | **HIGH** | Exported const. Written to by `createRoute()` at line 55 (`.push()`) but **never read** — no `.length`, iteration, or export consumer exists. Write-only array. Planned GET `/v1/admin/routes` endpoint never implemented. |

### apps/backend/src/payment/processor.ts

| Line | Function | Confidence | Evidence |
|------|----------|------------|----------|
| 70 | `PaymentProcessorClient.payForAgent(...)` | **HIGH** | Public method. Never called externally. |
| 82 | `PaymentProcessorClient.payComputeProvider(...)` | **HIGH** | Public method. Never called externally. |
| 92 | `PaymentProcessorClient.withdrawEarnings(...)` | **HIGH** | Public method. Never called externally. |
| 121 | `PaymentProcessorClient.royaltyBpsOf(...)` | **HIGH** | Public method. Never called externally. |
| 125 | `PaymentProcessorClient.royaltyBpsSet(...)` | **HIGH** | Public method. Never called externally. |
| 144 | `PaymentProcessorClient.ensureAllowance(...)` (private) | **HIGH** | Only called internally by `payForAgent` and `payComputeProvider` — both transitively dead. |
| 151 | `PaymentProcessorClient.parsePaymentProcessed(...)` (private) | **HIGH** | Only called internally by `payForAgent` — transitively dead. |

**Note:** `PaymentProcessorClient` IS instantiated at `server.ts:118`, and these methods ARE alive: `earningsOf`, `encodeSetRoyalty`, `paymentToken`, `protocolFeeBps`, `protocolTreasury`.

### apps/backend/src/oracle/client.ts

| Line | Function | Confidence | Evidence |
|------|----------|------------|----------|
| 77 | `DefaultSignerOracleClient.recoverAccessSigner(...)` | **HIGH** | Public instance method implementing `OracleClient.recoverAccessSigner`. Never invoked via any oracle instance (zero matches for `.recoverAccessSigner(`). The standalone `recoverAccessSigner` function from `@axiom/oracle/signer` is imported and used directly in `agents.ts:190` instead. |

---

## 4. Frontend TypeScript Functions

### apps/frontend/src/utils/events.ts

| Line | Function | Confidence | Evidence |
|------|----------|------------|----------|
| 4 | `eventField(event, field)` | **HIGH** | Exported utility. Never imported or called anywhere in `apps/frontend/src/`. |
| 10 | `eventTokenId(event)` | **HIGH** | Exported utility. Never imported or called anywhere in `apps/frontend/src/`. |

---

## 5. Oracle TypeScript Functions

### apps/oracle/src/crypto/secp256k1.ts

| Line | Function | Confidence | Evidence |
|------|----------|------------|----------|
| 16 | `pubKeyToAddress(uncompressed: Uint8Array)` | **HIGH** | Exported and re-exported from `signer.ts:15`. Never imported or called by any TypeScript code. Solidity `Utils.pubKeyToAddress` in `ERC7857Upgradeable.sol:114` is a different (on-chain) function. |

### apps/oracle/src/crypto/ecies.ts

| Line | Function | Confidence | Evidence |
|------|----------|------------|----------|
| 29 | `unsealKeyForReceiver(receiverPrivateKey, sealedKey)` | **HIGH** | Exported but never imported or called by any TypeScript code. Not re-exported from any barrel file. (Note: `sealKeyForReceiver` IS used — the `unseal` variant is dead.) |

### apps/oracle/src/signer.ts

| Line | Function | Confidence | Evidence |
|------|----------|------------|----------|
| 76 | `TeeSigner.recoverAccessSigner(...)` (class method) | **HIGH** | Method on `TeeSigner` class using `this.domain`. Never invoked — zero matches for `.recoverAccessSigner(` across `apps/`. The **standalone** `recoverAccessSigner` function (signer.ts:43) IS used by `backend/client.ts`, but the class method version is never called. |

---

## 6. Indexer TypeScript Functions

### apps/indexer/src/watcher.ts

| Line | Function | Confidence | Evidence |
|------|----------|------------|----------|
| 518 | `Watcher.cursor` (getter) | **HIGH** | Getter returning `this.nextBlock`. Never invoked via `this.cursor`, `watcher.cursor`, or any instance `.cursor`. Class reads `this.nextBlock` directly instead. |

---

## 7. Deploy Script Functions

### apps/contracts/script/DeployPaymentProcessor.s.sol

| Line | Function | Confidence | Evidence |
|------|----------|------------|----------|
| 12 | `AxiomMockUSDC.mint(address to, uint256 amount)` | **HIGH** | `external` on mock contract. `run()` creates `new AxiomMockUSDC()` but never calls `.mint()`. The mock USDC is deployed with zero initial supply and no tokens are ever minted. |

---

## 8. Additional Notes

- **No dead functions found in:** `apps/backend/src/routers/` (all handlers are route-mounted and alive), `apps/frontend/src/hooks/` (all hooks have consumers in components/pages), `packages/config/` (all exported functions have callers), `apps/backend/src/services/`, `apps/backend/src/utils/`.
- **Router handlers are NOT listed as dead** — every handler function in `routers/agents.ts`, `routers/events.ts`, `routers/orchestrator.ts`, `routers/health.ts`, `routers/performance.ts` is registered on an Express `Router()` via `.get()`, `.post()`, etc.
- **Frontend hooks confirmed alive:** `useMediaQuery` (App.tsx, EventTimeline.tsx, ProviderCard.tsx), `usePoll` (MarketPage.tsx), `usePolledApi` (6 importer files), `useProviders` (MarketPage.tsx, ProviderCard.tsx), `useEventStream` (useAgentEvents.ts).
- **Interface functions** listed separately because while the function declaration exists in the interface file, the implementation is already counted above. They're included for completeness.
