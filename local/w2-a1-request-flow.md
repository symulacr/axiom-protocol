# Request & Job Flow Trace: Axiom Protocol

Traced 2026-06-28 across frontend (`apps/frontend/src/`), backend (`apps/backend/src/`), oracle (`apps/oracle/src/`), indexer (`apps/indexer/src/`), and contracts (`apps/contracts/src/`).

---

## Flow A: iNFT Transfer (Two-Phase Cryptographic Ceremony)

**Initiating actor:** User click on "Transfer Agent" button on the Agent Detail page.

### Step-by-step trace

#### 1. Frontend UI entry: Agent Detail Overview tab

| File | Line(s) | Action |
|------|---------|--------|
| `apps/frontend/src/pages/AgentDetail.tsx` | 44 | `const [transferOpen, setTransferOpen] = useState(false)` |
| `apps/frontend/src/pages/AgentDetail.tsx` | 170-181 | "Transfer" section renders `Button` with `onClick={() => setTransferOpen(true)}` |
| `apps/frontend/src/pages/AgentDetail.tsx` | 267-276 | Conditionally renders `<TransferModal>` when `transferOpen === true` |

**Data passed to modal:** `tokenId: bigint` from URL params (line 33: `parseTokenId(params.tokenId)`).

#### 2. TransferModal: Form submission → useTransfer.prepare()

| File | Line(s) | Action |
|------|---------|--------|
| `apps/frontend/src/components/TransferModal.tsx` | 326-571 | Modal lifecycle: form phase → review phase |
| `apps/frontend/src/components/TransferModal.tsx` | 436-449 | `onSubmit`: calls `prepare(buildInput())`, then sets `phase('review')` |
| `apps/frontend/src/components/TransferModal.tsx` | 422-434 | `buildInput()`: constructs `TransferInput {tokenId, to, receiverPubKey64, accessProofNonce, oldDataEncryptionKey?, oldDataUri?}` |
| `apps/frontend/src/components/TransferModal.tsx` | 451-461 | `onConfirm`: calls `confirm(buildInput())` → `handleTransferred(txHash)` |

#### 3. useTransfer.prepare(): Challenge phase

| File | Line(s) | Action |
|------|---------|--------|
| `apps/frontend/src/hooks/useTransfer.ts` | 54-156 | `prepare()` — orchestrates the 3-phase backend interaction |
| `apps/frontend/src/hooks/useTransfer.ts` | 66-68 | Set phase to `'challenge'` |
| `apps/frontend/src/hooks/useTransfer.ts` | 70-85 | **Async boundary 1:** `apiFetch` POST `/v1/agents/:id/transfer` with `{to, receiverPubKey64, accessProofNonce, oldDataEncryptionKey?, oldDataUri?}` |
| `apps/frontend/src/hooks/useTransfer.ts` | 86-96 | Validates response includes `dataHash`, `targetPubkey`, `accessProofNonce`, `validUntil` |
| `apps/frontend/src/hooks/useTransfer.ts` | 98-119 | Set phase to `'signing'`. **Async boundary 2:** `signTypedDataAsync(ACCESS_PROOF_TYPES)` — receiver signs EIP-712 AccessProof in wallet |
| `apps/frontend/src/hooks/useTransfer.ts` | 121 | Set phase to `'finalizing'` |
| `apps/frontend/src/hooks/useTransfer.ts` | 123-147 | **Async boundary 3:** `apiFetch` POST `/v1/agents/:id/transfer` with signed AccessProof |
| `apps/frontend/src/hooks/useTransfer.ts` | 145-147 | Validates backend returned `accessProof` and `ownershipProof` structs |

**API call details:**

| File | Line(s) | Detail |
|------|---------|--------|
| `apps/frontend/src/utils/apiFetch.ts` | 9-36 | Generic fetch wrapper — adds `x-api-key`, JSON headers, AbortSignal.timeout |
| `apps/frontend/src/utils/apiFetch.ts` | 6 | `LONG_TIMEOUT = 60_000` (used for transfer) |
| `packages/config/src/types/transfer.ts` | 5-12 | `TransferInput` type definition |
| `packages/config/src/types/transfer.ts` | 34-53 | `TransferResponse` type — both challenge and final stages |

#### 4. Backend POST /v1/agents/:id/transfer: Challenge & Finalize

| File | Line(s) | Action |
|------|---------|--------|
| `apps/backend/src/routers/agents.ts` | 112-209 | Router handler |
| `apps/backend/src/routers/agents.ts` | 114-126 | Parse `id`, validates `transferBodySchema` (route-schemas.ts:12-21) |
| `apps/backend/src/routers/agents.ts` | 128-136 | If `dataHash` not in request, reads it from chain via `intelligentDatasOf(tokenId)` |
| `apps/backend/src/route-schemas.ts` | 12-21 | `transferBodySchema`: `to, receiverPubKey64, accessProofNonce?, dataHash?, sealedKey?, oldDataEncryptionKey?, oldDataUri?, accessProof?` |

**Challenge branch (no accessProof in request):**

| File | Line(s) | Action |
|------|---------|--------|
| `apps/backend/src/routers/agents.ts` | 150 | `canRekey = !!(oldDataEncryptionKey && oldDataUri)` |
| `apps/backend/src/routers/agents.ts` | 151-179 | If no `accessProof` → challenge mode |
| `apps/backend/src/routers/agents.ts` | 153-168 | **RE-KEY PATH:** `canRekey` is true → `oracle.transferValidity({...})` |
| `apps/backend/src/routers/agents.ts` | 170-178 | **SIMPLE PATH:** `oracle.signOwnership({...})` |
| `apps/backend/src/backend/src/oracle/client.ts` | 55-103 | `DefaultSignerOracleClient` — HTTP client to oracle |
| `apps/backend/src/backend/src/oracle/client.ts` | 64-66 | `transferValidity()`: POST `/v1/transfer-validity` |
| `apps/backend/src/backend/src/oracle/client.ts` | 68-70 | `signOwnership()`: POST `/v1/ownership` |
| `apps/backend/src/backend/src/oracle/client.ts` | 88-96 | `post()`: fetch with 10s timeout, BigInt serialization |

**Finalize branch (accessProof in request):**

| File | Line(s) | Action |
|------|---------|--------|
| `apps/backend/src/routers/agents.ts` | 181-204 | Finalize mode |
| `apps/backend/src/routers/agents.ts` | 186-187 | Validates cross-field consistency (dataHash, targetPubkey match) |
| `apps/backend/src/routers/agents.ts` | 189-194 | **Async boundary:** Recovers access signer from EIP-712 signature (local, no HTTP) |
| `apps/backend/src/routers/agents.ts` | 200 | `oracle.signOwnership({...})` for the final OwnershipProof |
| `apps/backend/src/routers/agents.ts` | 201-205 | Returns `{accessProof, ownershipProof, ...}` for on-chain submission |

**Failure points:**
- Missing `agentNft` address → 500 (line 116-119)
- No dataHash found on-chain → 400 (line 137-140)
- Oracle 10s timeout → `DefaultSignerOracleClient` throws (client.ts:96-100)
- AccessProof dataHash/targetPubkey mismatch → 400 (line 186-187)
- No sealedKey in production → 400 (line 197)

#### 5. Oracle POST /v1/transfer-validity (Re-key path)

| File | Line(s) | Action |
|------|---------|--------|
| `apps/oracle/src/server.ts` | 60-129 | Route handler |
| `apps/oracle/src/server.ts` | 62 | `transferValiditySchema.parse(req.body)` |
| `apps/oracle/src/route-schemas.ts` | 4-13 | `transferValiditySchema`: `oldDataHash, oldDataUri, targetPubkey64, accessProofNonce, ownershipProofNonce?, oldDataEncryptionKey, to?, nft?` |
| `apps/oracle/src/server.ts` | 64-83 | Input validation (130-char pubkey, valid addresses) |
| `apps/oracle/src/server.ts` | 85 | **Async boundary 4:** `storage.download(oldDataUri)` — fetch encrypted blob from 0G Storage |
| `apps/oracle/src/server.ts` | 86 | `parseEncrypted(oldBlob)` — split iv \|\| ciphertext \|\| authTag |
| `apps/oracle/src/server.ts` | 88-93 | `aesGcmDecrypt(oldDataKey, oldEnc)` — decrypt with old encryption key |
| `apps/oracle/src/packages/config/src/storage/0g.ts` | 113-116 | `ZeroGStorage.download()` — downloads from 0G via Indexer |
| `apps/oracle/src/crypto/aes-gcm.ts` | 30-40 | `aesGcmDecrypt()`: Node crypto, AES-256-GCM with authTag verification |
| `apps/oracle/src/server.ts` | 95-96 | Generate new random 32-byte key → `aesGcmEncrypt(newDataKey, oldPlaintext)` |
| `apps/oracle/src/crypto/aes-gcm.ts` | 17-28 | `aesGcmEncrypt()`: random IV, 256-bit key |
| `apps/oracle/src/server.ts` | 97-98 | `concatEncrypted(newEnc)` → **Async boundary 5:** `storage.upload(newBlob)` → `newDataHash` |
| `apps/oracle/src/server.ts` | 100 | `storage.markDataHashSeen(newDataHash)` — registers for future /v1/ownership |
| `apps/oracle/src/server.ts` | 102-103 | `sealKeyForReceiver(targetPubkeyBytes, newDataKey)` — ECIES encrypt |
| `apps/oracle/src/crypto/ecies.ts` | 25-27 | `sealKeyForReceiver()`: converts 64-byte uncompressed → 33-byte compressed → eciesjs.encrypt |
| `apps/oracle/src/server.ts` | 106-114 | `signer.signOwnership({...})` — EIP-712 OwnershipProof signature |
| `apps/oracle/src/signer.ts` | 71-73 | `signOwnership()`: computes EIP-712 digest → wallet.signingKey.sign → serialized |
| `apps/oracle/src/crypto/eip712.ts` | 98-100 | `ownershipMessageHash()`: `keccak256(0x1901 \|\| domainSeparator \|\| structHash)` |
| `apps/oracle/src/server.ts` | 116-124 | Returns `{newDataUri, newDataHash, sealedKey, ownershipSignature, ...}` |

**Failure points:**
- Invalid targetPubkey64 length → 400 (line 68-71)
- Missing `oldDataEncryptionKey` → 400 (line 72-75)
- Invalid `to`/`nft` address → 400 (line 76-83)
- 0G Storage download/upload failure → 500 (line 126-128)
- AES-GCM decryption auth tag failure → throw (decrypt line 33)

#### 6. Oracle POST /v1/ownership

| File | Line(s) | Action |
|------|---------|--------|
| `apps/oracle/src/server.ts` | 141-231 | Route handler |
| `apps/oracle/src/server.ts` | 144 | `ownershipBodySchema.parse(req.body)` |
| `apps/oracle/src/route-schemas.ts` | 15-23 | `ownershipBodySchema`: `dataHash, targetPubkey, sealedKey, nonce, to, nft, validUntil?` |
| `apps/oracle/src/server.ts` | 168-174 | **Gate:** `storage.hasSeenDataHash(dataHash)` — rejects unknown dataHashes |
| `apps/oracle/src/packages/config/src/storage/0g.ts` | 118-124 | `markDataHashSeen` / `hasSeenDataHash` — in-memory Set |
| `apps/oracle/src/server.ts` | 217-225 | `signer.signOwnership({...})` |
| `apps/oracle/src/server.ts` | 226-230 | Returns `{signature, signer, validUntil}` |

**Failure points:**
- Unknown dataHash → 400 "POST to /v1/agents/mint first" (line 168-174)
- Invalid `to`/`nft` → 400 (line 176-183)

#### 7. Backend returns to frontend → useTransfer.confirm()

| File | Line(s) | Action |
|------|---------|--------|
| `apps/frontend/src/hooks/useTransfer.ts` | 160-197 | `confirm()` — on-chain submission |
| `apps/frontend/src/hooks/useTransfer.ts` | 168 | Set phase to `'confirming'` |
| `apps/frontend/src/hooks/useTransfer.ts` | 170-185 | **Async boundary 6:** `writeContractAsync({ functionName: 'iTransferFrom', args: [from, to, tokenId, [{accessProof, ownershipProof}]] })` |
| `apps/frontend/src/hooks/useTransfer.ts` | 199-203 | `transfer()` — convenience: `await prepare(input); return confirm(input);` |

#### 8. Contract: ERC7857Upgradeable.iTransferFrom → _transfer → _proofCheck

| File | Line(s) | Action |
|------|---------|--------|
| `apps/contracts/src/ERC7857Upgradeable.sol` | 135-142 | `iTransferFrom(address from, address to, uint256 tokenId, TransferValidityProof[] calldata proofs)` |
| `apps/contracts/src/ERC7857Upgradeable.sol` | 128-133 | `_transfer()`: calls `_proofCheck()` → `_safeTransferFrom()` → `emit PublishedSealedKey()` → `emit Transferred()` |
| `apps/contracts/src/ERC7857Upgradeable.sol` | 75-126 | `_proofCheck()`: |
| `apps/contracts/src/ERC7857Upgradeable.sol` | 82-89 | Validates `to != 0`, `_ownerOf(tokenId) == from`, `proofs.length > 0` |
| `apps/contracts/src/ERC7857Upgradeable.sol` | 92 | **On-chain boundary:** `$.verifier.verifyTransferValidity(proofs, to, address(this))` |
| `apps/contracts/src/ERC7857Upgradeable.sol` | 94-98 | Validates proof count matches `intelligentDatasOf(tokenId).length` |
| `apps/contracts/src/ERC7857Upgradeable.sol` | 102-125 | Per-dataHash loop: verifies `dataHash` match, `accessAssistant` match, `pubKeyToAddress(targetPubkey) == to` |
| `apps/contracts/src/ERC7857Upgradeable.sol` | 129 | `_safeTransferFrom()` — ERC721 transfer |
| `apps/contracts/src/ERC7857Upgradeable.sol` | 131 | `emit PublishedSealedKey(to, tokenId, sealedKeys)` |
| `apps/contracts/src/ERC7857Upgradeable.sol` | 132 | `emit Transferred(tokenId, from, to)` |

#### 9. Contract: AxiomTeeVerifier.verifyTransferValidity

| File | Line(s) | Action |
|------|---------|--------|
| `apps/contracts/src/verifiers/AxiomTeeVerifier.sol` | 176-277 | Main verification loop |
| `apps/contracts/src/verifiers/AxiomTeeVerifier.sol` | 193-194 | Both proofs' `validUntil` must not be expired (`_checkValidUntil`) |
| `apps/contracts/src/verifiers/AxiomTeeVerifier.sol` | 199-206 | **Cross-proof consistency check:** `dataHash`, `targetPubkey(hashed)`, `nonce`, `validUntil` must match between accessProof and ownershipProof |
| `apps/contracts/src/verifiers/AxiomTeeVerifier.sol` | 215-230 | Verify OwnershipProof EIP-712 digest → recover signer → compare to `registeredSigner()` |
| `apps/contracts/src/verifiers/AxiomTeeVerifier.sol` | 235-249 | Verify AccessProof EIP-712 digest → recover signer |
| `apps/contracts/src/verifiers/AxiomTeeVerifier.sol` | 255-264 | **Replay protection:** Compute proofNonce → mark used via `_checkAndMarkProof()` |
| `apps/contracts/src/verifiers/BaseVerifier.sol` | 18-22 | `_checkAndMarkProof()`: reverts if `usedProofs[proofNonce] == true` |
| `apps/contracts/src/verifiers/AxiomTeeVerifier.sol` | 285-293 | `_checkValidUntil()`: reverts if expired or too far in future (> maxProofAgeSeconds) |

**Failure points (contract):**
- `ERC721InvalidReceiver` if `to == 0`
- `ERC721InvalidSender` if caller doesn't own token
- `ERC7857EmptyProof` if proofs array empty
- `ERC7857ProofCountMismatch` if proof count != data entries
- `ERC7857DataHashMismatch` if per-index dataHash doesn't match
- `ERC7857AccessAssistantMismatch` if signer not authorized
- `ERC7857WantedReceiverMismatch` if pubkey doesn't resolve to receiver
- `ProofAlreadyUsed` if nonce replayed
- `AxiomInvalidOwnershipProof` / `AxiomInvalidAccessProof` if signature invalid
- `ProofFieldMismatch` if cross-proof fields disagree
- `AxiomProofExpired` / `AxiomValidUntilTooFar` if outside window

#### 10. Events emitted → indexed → displayed

Events `Transfer`, `PublishedSealedKey` picked up by indexer → `POST /v1/events` → `EventStore` → frontend polls via `useEventHistory`.

---

## Flow B: Orchestrator Strategy Tick

**Initiating actor:** User click on "Execute" button in ExecutePanel (Agent Detail → Execute tab).

### Step-by-step trace

#### 1. Frontend UI entry: AgentDetail Execute tab

| File | Line(s) | Action |
|------|---------|--------|
| `apps/frontend/src/pages/AgentDetail.tsx` | 185-190 | Execute tab renders `<ExecutePanel tokenId={tokenId} />` |
| `apps/frontend/src/components/ExecutePanel.tsx` | 29-301 | ExecutePanel: agent select, vault state display, stream toggle, execute button |
| `apps/frontend/src/components/ExecutePanel.tsx` | 72-102 | `onExecute()` callback — calls `tick()` or `tickStream()` depending on `streamMode` |
| `apps/frontend/src/components/ExecutePanel.tsx` | 80-87 | Stream mode: `await tickStream({ vault, agentNft, agentTokenId }, {})` |
| `apps/frontend/src/components/ExecutePanel.tsx` | 90-96 | HTTP mode: `await tick({ vault, agentNft, agentTokenId })` |
| `apps/frontend/src/components/ExecutePanel.tsx` | 82-84 | TickRequest: `{vault: strategyVaultAddr, agentNft: agentNftAddr, agentTokenId}` |

#### 2. useOrchestratorTick: HTTP tick

| File | Line(s) | Action |
|------|---------|--------|
| `apps/frontend/src/hooks/useOrchestratorTick.ts` | 60-76 | `tick()` — standard POST |
| `apps/frontend/src/hooks/useOrchestratorTick.ts` | 68-73 | **Async boundary 1:** `apiFetch` POST `/v1/orchestrator/tick` with `{vault, agentNft, agentTokenId}`, 30s timeout |
| `apps/frontend/src/hooks/useOrchestratorTick.ts` | 80-166 | `tickStream()` — streaming via WebSocket |
| `apps/frontend/src/hooks/useOrchestratorTick.ts` | 97-109 | **Async boundary 2:** POST `/v1/orchestrator/tick` with `{..., stream: true}`, gets `streamTopic` |
| `apps/frontend/src/hooks/useOrchestratorTick.ts` | 114-159 | Opens WebSocket to `/v1/stream?topic={topic}`, parses `token`/`complete`/`error` messages |
| `apps/frontend/src/hooks/useOrchestratorTick.ts` | 33-57 | 50ms debounced token flush to re-render streamed tokens |

**Failure points:**
- Backend returns non-ok → `apiFetch` throws (apiFetch.ts:29-34)
- Stream: WebSocket connection failure → `ws.onerror` rejects (line 155-158)
- Stream: WS message with `type: 'error'` → rejects with error (line 144-147)
- AbortController triggered → DOMException 'Aborted'

#### 3. Backend POST /v1/orchestrator/tick

| File | Line(s) | Action |
|------|---------|--------|
| `apps/backend/src/routers/orchestrator.ts` | 16-78 | Route handler |
| `apps/backend/src/routers/orchestrator.ts` | 18 | `tickSchema.parse(req.body)` |
| `apps/backend/src/route-schemas.ts` | 41-50 | `tickSchema`: `vault, agentNft, agentTokenId, computeModel?, strategy?, signalSource?, signalPayload?, stream?` |
| `apps/backend/src/routers/orchestrator.ts` | 21-27 | `StrategySpec` assembly: `{agentTokenId, agentNft, vault, computeModel, systemPrompt, modelDataRoot, modelEncryption}` |
| `apps/backend/src/routers/orchestrator.ts` | 28-31 | `MarketSignal` assembly: `{source, payload, emittedAt}` |
| `apps/backend/src/routers/orchestrator.ts` | 33-34 | `getOrCreateOrchestrator()` — lazy singleton StrategyRunner |
| `apps/backend/src/routers/orchestrator.ts` | 36-53 | **Stream branch:** checks WS subscribers → `runner.runTick(spec, signal, callback)` → returns 202 + `streamTopic` |
| `apps/backend/src/routers/orchestrator.ts` | 44-46 | Stream callback sends `token` chunks via `sendToTopic('tick.{tokenId}', chunk)` |
| `apps/backend/src/routers/orchestrator.ts` | 46-49 | On completion: `sendToTopic` with `complete` or `error` |
| `apps/backend/src/routers/orchestrator.ts` | 55-74 | **HTTP branch:** `await runner.runTick(spec, signal)` → appends Tick event → broadcast → 200 |

**Failure points:**
- Orchestrator not available → 503 (line 34)
- Stream mode but no WS subscriber → 400 (line 42)
- Schema validation fails → 400 via error handler (server.ts:263)

#### 4. StrategyRunner.runTick()

| File | Line(s) | Action |
|------|---------|--------|
| `apps/backend/src/orchestrator/index.ts` | 88-129 | `runTick()` |
| `apps/backend/src/orchestrator/index.ts` | 91-97 | **Async boundary 3:** `Promise.all([runInference, fetchOnchainState, fetchStoragePeek])` |
| `apps/backend/src/orchestrator/index.ts` | 99 | `parseRecommendation(rawModelOutput)` — JSON parse LLM output |
| `apps/backend/src/orchestrator/index.ts` | 101-113 | If action != "hold": **Async boundary 4:** `settleOnChain()` (with `.catch` — failure doesn't poison tick) |
| `apps/backend/src/orchestrator/index.ts` | 115-127 | Assembles `TickResult {recommendation, rawModelOutput, onchain, storage, execution, durationMs}` |
| `apps/backend/src/orchestrator/index.ts` | 124-126 | If streaming: `onChunk({ type: 'complete', result })` |

#### 5. runInference (LLM call via 0G Compute Router)

| File | Line(s) | Action |
|------|---------|--------|
| `apps/backend/src/orchestrator/index.ts` | 195-232 | `runInference()` |
| `apps/backend/src/orchestrator/index.ts` | 82-84 | `getClient()` — lazily creates OpenAI client via `createRouterClient()` |
| `apps/backend/src/compute/router.ts` | 42-66 | `createRouterClient()` |
| `apps/backend/src/compute/router.ts` | 43-59 | If `AXIOM_COMPUTE_DIRECT_KEY` (app-sk-*): decode token (line 21-38), resolve provider URL via on-chain registry (line 47), create direct OpenAI client |
| `apps/backend/src/compute/router.ts` | 61-64 | Else: OpenAI with `baseURL = getComputeBaseUrl()` + `AXIOM_COMPUTE_API_KEY` |
| `apps/backend/src/compute/router.ts` | 13-18 | `getComputeBaseUrl()`: env var > network config > Galileo fallback |
| `apps/backend/src/orchestrator/index.ts` | 196-201 | Builds prompt: system prompt (fixed strategy prompt) + user prompt (vault state as JSON) |
| `apps/backend/src/orchestrator/index.ts` | 203-222 | **Streaming path:** `client.chat.completions.create({stream: true})` → `for await (const chunk of stream)` → emit tokens via `onChunk` |
| `apps/backend/src/orchestrator/index.ts` | 225-231 | **Non-streaming path:** `client.chat.completions.create({response_format: {type: "json_object"}})` |

**Failure points:**
- `AXIOM_COMPUTE_DIRECT_KEY` decode fails → Error (router.ts:59)
- Provider not found in on-chain registry → Error (router.ts:57)
- No compute credentials configured → Error (router.ts:65)
- OpenAI API timeout/error → throw (caught in settleOnChain fallback for execution, but propagates for inference itself)

#### 6. fetchOnchainState

| File | Line(s) | Action |
|------|---------|--------|
| `apps/backend/src/orchestrator/index.ts` | 234-275 | `fetchOnchainState()` |
| `apps/backend/src/orchestrator/index.ts` | 239-244 | `vaultTc.contract.balanceOf(tokenId)` |
| `apps/backend/src/orchestrator/index.ts` | 247-261 | `provider.getBlockNumber()` → `provider.getLogs()` for `StrategySet` + `Deposited` events (last 2000 blocks) |
| `apps/backend/src/orchestrator/index.ts` | 262-273 | Sorts, slices last 10 events, maps to `{blockNumber, txHash, name}` |

#### 7. settleOnChain (on-chain execution)

| File | Line(s) | Action |
|------|---------|--------|
| `apps/backend/src/orchestrator/index.ts` | 146-193 | `settleOnChain()` |
| `apps/backend/src/orchestrator/index.ts` | 147-149 | Validate vault address configured |
| `apps/backend/src/orchestrator/index.ts` | 153-162 | Build actionHash: `keccak256(encode([target, value, keccak256(data)]))` — single-leaf Merkle tree (empty proof) |
| `apps/backend/src/orchestrator/index.ts` | 164-165 | **Async boundary 5:** `vaultTc.contract.execute(tokenId, target, value, data, proof)` |
| `apps/backend/src/orchestrator/index.ts` | 166 | `tx.wait()` — await receipt |
| `apps/backend/src/orchestrator/index.ts` | 172-182 | Parse `Executed` event from receipt logs |
| `apps/backend/src/orchestrator/index.ts` | 185-192 | Returns `{txHash, action, target, success, result, gasUsed}` |

#### 8. AxiomStrategyVault.execute()

| File | Line(s) | Action |
|------|---------|--------|
| `apps/contracts/src/AxiomStrategyVault.sol` | 118-158 | `execute(tokenId, target, value, data, merkleProof)` |
| `apps/contracts/src/AxiomStrategyVault.sol` | 126 | `if (v.strategyRoot == bytes32(0)) revert NoStrategySet()` |
| `apps/contracts/src/AxiomStrategyVault.sol` | 127 | `if (value > v.balance) revert ZeroAmount()` |
| `apps/contracts/src/AxiomStrategyVault.sol` | 128 | `if (target == address(0)) revert ZeroAddress()` |
| `apps/contracts/src/AxiomStrategyVault.sol` | 131-136 | Daily-limit check with auto-reset on UTC day rollover |
| `apps/contracts/src/AxiomStrategyVault.sol` | 139-140 | Merkle proof verification against strategyRoot |
| `apps/contracts/src/AxiomStrategyVault.sol` | 143-144 | CEI: `v.balance -= value; v.dailySpent += value` |
| `apps/contracts/src/AxiomStrategyVault.sol` | 147-153 | **External call:** `target.call{value: value}(data)` — the actual DeFi action |
| `apps/contracts/src/AxiomStrategyVault.sol` | 156 | `emit Executed(tokenId, actionHash, target, value, result)` |

**Failure points (contract):**
- `NoStrategySet` if no strategy root set for token
- `ZeroAmount` if value > vault balance
- `DailyLimitExceeded` if daily spending limit hit
- `InvalidMerkleProof` if action not in strategy tree
- External call `require(ok)` — target's call reverts → entire tx reverts

#### 9. Results streamed back

**Non-streaming:**
- Backend returns `TickResult` JSON (orchestrator.ts:74)
- EventStore.append (orchestrator.ts:56-69)
- Broadcast to `orchestrator.tick` topic (orchestrator.ts:70-73)

**Streaming:**
- Token chunks via `sendToTopic('tick.{tokenId}', {type:'token', content})` (orchestrator.ts:45)
- Completion via `sendToTopic('tick.{tokenId}', {type:'complete', ...result})` (orchestrator.ts:47)
- Error via `sendToTopic('tick.{tokenId}', {type:'error', error})` (orchestrator.ts:49)
- WebSocket server at `/v1/stream` (server.ts:272-288)

---

## Flow C: Indexer Event Polling

**Initiating actor:** System daemon — indexer started as long-lived process (via Docker or `pnpm start`).

### Step-by-step trace

#### 1. Entry: index.ts main()

| File | Line(s) | Action |
|------|---------|--------|
| `apps/indexer/src/index.ts` | 170-252 | `main()` |
| `apps/indexer/src/index.ts` | 171-178 | Load `chainId` + RPC URL → create ethers `JsonRpcProvider` with `staticNetwork: true` |
| `apps/indexer/src/index.ts` | 183-196 | Verify live chain ID matches expected (line 184: `liveChainId !== cid` → error but non-fatal) |
| `apps/indexer/src/index.ts` | 200-216 | Load 0G Storage config (`INDEXER_DA_ENABLED`, `BACKEND_URL`, `AXIOM_STORAGE_RPC`, `DEPLOYER_PK`) |
| `apps/indexer/src/index.ts` | 222-229 | `composeSinks(daConfig, {backendUrl, rpcUrl})` |
| `apps/indexer/src/index.ts` | 231-234 | `new Watcher({provider, sink: composedSink})` |
| `apps/indexer/src/index.ts` | 238-250 | Register SIGINT/SIGTERM handlers → `watcher.stop()` → `flushBuffer()` |
| `apps/indexer/src/index.ts` | 246 | `watcher.start()` |

#### 2. Watcher.start() → polling loop

| File | Line(s) | Action |
|------|---------|--------|
| `apps/indexer/src/watcher.ts` | 522-622 | `Watcher.start()` |
| `apps/indexer/src/watcher.ts` | 596-613 | Loop: load checkpoint → `while(running) { await tick(); setTimeout(resolve, POLL_INTERVAL_MS) }` |
| `apps/indexer/src/watcher.ts` | 523-524 | Guard: `if (this.running) throw` |
| `apps/indexer/src/watcher.ts` | 12 | `POLL_INTERVAL_MS = 12_000` (12s) |

**Failure points:**
- Chain ID mismatch → logs error, returns early (index.ts:183-196)
- `Watcher` already running → throws (line 523-524)

#### 3. Watcher.tick() — per-tick logic

| File | Line(s) | Action |
|------|---------|--------|
| `apps/indexer/src/watcher.ts` | 526-593 | `tick()` |
| `apps/indexer/src/watcher.ts` | 532 | **Async boundary 1:** `this.provider.getBlockNumber()` — fetch chain head |
| `apps/indexer/src/watcher.ts` | 536-538 | First-run seed: `nextBlock = latest >= window ? latest - window : 0n` |
| `apps/indexer/src/watcher.ts` | 544 | Stale cursor clamp: `fromBlock = min(nextBlock, latest)` |
| `apps/indexer/src/watcher.ts` | 548-549 | Compute `toBlock = min(fromBlock + window - 1, latest)` |
| `apps/indexer/src/watcher.ts` | 10 | `POLL_WINDOW_BLOCKS = 50n` |
| `apps/indexer/src/watcher.ts` | 566 | **Async boundary 2:** `pollOnce(this.provider, this.watchList, fromBlock, range)` |
| `apps/indexer/src/watcher.ts` | 567 | `logs.sort(logsByChainOrder)` |
| `apps/indexer/src/watcher.ts` | 568-572 | Per log: `decodeAxiomLog(log)` → `await this.sink(ev)` |
| `apps/indexer/src/watcher.ts` | 573 | Advance cursor: `this.nextBlock = toBlock + 1n` |
| `apps/indexer/src/watcher.ts` | 574 | **Async boundary 3:** `saveCheckpoint(Number(this.nextBlock))` |
| `apps/indexer/src/watcher.ts` | 554-562 | Skip tick if `toBlock < fromBlock` (head not advanced) |
| `apps/indexer/src/watcher.ts` | 583-593 | Error handling: log error, backoff `this.intervalMs` |

**Failure points:**
- RPC `getBlockNumber()` failure → caught, backoff (line 583-593)
- `pollOnce()` RPC failure → caught, backoff
- `decodeAxiomLog()` returns null for unknown event → skipped safely (line 569-570)
- Checkpoint write failure → logged, non-fatal (line 583)

#### 4. pollOnce() — batch log fetching

| File | Line(s) | Action |
|------|---------|--------|
| `apps/indexer/src/watcher.ts` | 441-462 | `pollOnce()` |
| `apps/indexer/src/watcher.ts` | 447 | `toBlock = fromBlock + window - 1n` |
| `apps/indexer/src/watcher.ts` | 451-459 | One `provider.getLogs()` per (event, address) pair from `DEFAULT_WATCH_LIST` |
| `apps/indexer/src/watcher.ts` | 79-115 | `DEFAULT_WATCH_LIST`: 28 event types across 4 contracts (AxiomAgentNFT, AxiomStrategyVault, AxiomPaymentProcessor, AxiomTeeVerifier) + ERC-1967 proxy events |

#### 5. decodeAxiomLog() — event decoding

| File | Line(s) | Action |
|------|---------|--------|
| `apps/indexer/src/watcher.ts` | 137-438 | `decodeAxiomLog(log)` |
| `apps/indexer/src/watcher.ts` | 138-141 | Extract `topic0` → look up event name in `TOPIC_TO_EVENT` map |
| `apps/indexer/src/watcher.ts` | 56-72 | `TOPIC_TO_EVENT` built from `TOPIC_TABLE` (line 19-54) |
| `apps/indexer/src/watcher.ts` | 146-150 | Base fields: `blockNumber`, `txHash`, `logIndex` |
| `apps/indexer/src/watcher.ts` | 158-437 | Big switch on event name: each case calls `decodeEventLog({abi: [...], data, topics, strict: true})` via viem |
| `apps/indexer/src/events.ts` | 12-76 | `EVENT_SIGNATURES` — 28 human-readable event signatures |
| `apps/indexer/src/events.ts` | 115-170 | `EVENT_ABI` — 28 parsed ABI entries (some manual, some via `parseAbiItem`) |

**Failure points:**
- Unknown topic0 → returns null (line 141-142)
- `decodeEventLog` with `strict: true` fails on malformed event → caught? If strict fails, it throws — only known events are passed, so this would indicate a contract/RPC bug

#### 6. composeSinks — event routing pipeline

| File | Line(s) | Action |
|------|---------|--------|
| `apps/indexer/src/index.ts` | 125-168 | `composeSinks()` — returns async function |
| `apps/indexer/src/index.ts` | 130 | `stdoutSink(event)` — JSON line to stdout |
| `apps/indexer/src/index.ts` | 132-154 | **Async boundary 4:** If `backendUrl` set: `postEvent(event, {backendUrl})` → HTTP POST to backend |
| `apps/indexer/src/index.ts` | 157-166 | If DA enabled: buffer event; flush if buffer >= `BATCH_MAX` (10) or start batch timer (5s) |
| `apps/indexer/src/sink.ts` | 45-68 | `postEvent()` — POST to `${backendUrl}/v1/events` with `HttpEventBody {source, chainId, blockNumber, txHash, logIndex, eventName, payload}`, 5s timeout |
| `apps/indexer/src/sink.ts` | 61-64 | `fetchImpl(url, {method: 'POST', headers, body: JSON with BigInt→string replacer})` |

**Failure points:**
- Backend returns `>= 400` → logged as warn (index.ts:135-145)
- HTTP fetch throws → logged as error (index.ts:146-154)
- Storage upload failure → events re-buffered (index.ts:86-94); if buffer exceeds 10000, oldest dropped (line 89-92)

#### 7. 0G Storage batch upload

| File | Line(s) | Action |
|------|---------|--------|
| `apps/indexer/src/index.ts` | 64-104 | `flushBuffer()` — drains event buffer to 0G Storage |
| `apps/indexer/src/index.ts` | 69-75 | `uploadToStorage(storageIndexer, payload, evmRpc, signer)` |
| `apps/indexer/src/index.ts` | 86-94 | On failure: re-buffer events (FIFO up to 10000) |

#### 8. Backend EventStore — event ingestion

| File | Line(s) | Action |
|------|---------|--------|
| `apps/backend/src/routers/events.ts` | 15-26 | `POST /v1/events` route — calls `events.append()` |
| `apps/backend/src/events/store.ts` | 73-93 | `EventStore.append()` — deep-clones, buckets by `${source}::${eventName}`, caps at 1000 per bucket, indexes by eventName and tokenId, debounced persist (2s) |
| `apps/backend/src/events/store.ts` | 118-135 | `EventStore.getAll(limit, since, eventName)` — cursor-based query |

#### 9. Frontend consumption

| File | Line(s) | Action |
|------|---------|--------|
| `apps/frontend/src/hooks/useEventHistory.ts` | — | Cursor-based polling of `GET /v1/events?since=<ts>`, groups by `eventName` |
| `apps/frontend/src/hooks/useEventStream.ts` | — | WebSocket connection to `/v1/stream`, auto-reconnect, MAX_EVENTS=500 |
| `apps/frontend/src/hooks/useAgents.ts` | — | Polled `GET /v1/agents?owner=<addr>` every 30s |

---

## Flow D: Agent Mint

**Initiating actor:** User fills MintForm on MintAgentPage and clicks submit.

### Step-by-step trace

#### 1. Frontend UI entry: MintAgentPage

| File | Line(s) | Action |
|------|---------|--------|
| `apps/frontend/src/pages/MintAgentPage.tsx` | — | Reads `?provider=` search param, renders `<MintForm provider={provider} />` |
| `apps/frontend/src/pages/AgentsBrowser.tsx` | — | "Mint" button linking to `/agents/new` |
| `apps/frontend/src/App.tsx` | — | Route: `/agents/new` → `MintAgentPage` |

#### 2. MintForm: Data gathering and submission

| File | Line(s) | Action |
|------|---------|--------|
| `apps/frontend/src/components/MintForm.tsx` | 31-168 | `MintForm` component |
| `apps/frontend/src/components/MintForm.tsx` | 39-52 | **Async boundary 1:** `useReadContracts` — fetches `mintFee()` from on-chain |
| `apps/frontend/src/components/MintForm.tsx` | 81-100 | `onSubmit()` |
| `apps/frontend/src/components/MintForm.tsx` | 86 | Compute `dataHash = keccak256(toBytes("axiom:agent:{name}:{owner}"))` |
| `apps/frontend/src/components/MintForm.tsx` | 87-93 | **Async boundary 2:** `writeContractAsync({ functionName: 'mint', args: [[{dataDescription: agentName, dataHash}], owner], value: mintFeeWei })` |
| `apps/frontend/src/components/MintForm.tsx` | 94-96 | Toast success → `setPendingHash(hash)` |
| `apps/frontend/src/components/MintForm.tsx` | 60-61 | `useWaitForTransactionReceipt({ hash: pendingHash })` |
| `apps/frontend/src/components/MintForm.tsx` | 64-79 | On receipt: find `Transfer(from=0x0 → to)` log → extract `tokenId` from log.topics[3] → `navigate(/agents/${tokenId})` |

**Data:**
- `IntelligentData[]` = `[{dataDescription: "agent name", dataHash: "0x..."}]`
- `value: mintFeeWei` (from `useReadContracts`)

**Failure points:**
- `mintFee()` call fails → `feeQuery.error` shown, can't submit
- Wallet not connected → `ConnectedGuard` blocks
- `writeContractAsync` fails → `setSubmitError` shows error
- Receipt has no Transfer(from=0x0) log → navigates to `/agents` without specific tokenId (line 76)

#### 3. AxiomAgentNFT.mint() — on-chain

| File | Line(s) | Action |
|------|---------|--------|
| `apps/contracts/src/AxiomAgentNFT.sol` | 189-200 | `mint(IntelligentData[] calldata iDatas, address to)` |
| `apps/contracts/src/AxiomAgentNFT.sol` | 190-192 | Validate: `to != 0`, `iDatas.length > 0`, `msg.value >= mintFee` |
| `apps/contracts/src/AxiomAgentNFT.sol` | 194 | `tokenId = _incrementTokenId()` — auto-incrementing from CloneableExtension |
| `apps/contracts/src/AxiomAgentNFT.sol` | 195 | `_safeMint(to, tokenId)` — ERC721 mint (emits `Transfer(0x0, to, tokenId)`) |
| `apps/contracts/src/AxiomAgentNFT.sol` | 196-197 | Store creator mapping: `creators[tokenId] = to; emit CreatorSet(tokenId, to)` |
| `apps/contracts/src/AxiomAgentNFT.sol` | 198 | `_updateData(tokenId, iDatas)` — stores `IntelligentData[]` on-chain |
| `apps/contracts/src/AxiomAgentNFT.sol` | 199 | `_refundExcess()` — refund overpayment above mintFee |
| `apps/contracts/src/AxiomAgentNFT.sol` | 226-232 | `_refundExcess()` — `msg.value > fee → call{value: excess}(msg.sender)` |

**Failure points (contract):**
- `to == 0` → revert
- `iDatas.length == 0` → revert
- `msg.value < mintFee` → revert
- Refund `call` fails → revert (line 230: `require(ok, "Refund failed")`)

#### 4. Oracle dataHash registration (optional / async)

| File | Line(s) | Action |
|------|---------|--------|
| `apps/oracle/src/server.ts` | 233-241 | `POST /v1/agents/mint` — registers dataHash as "seen" |
| `apps/oracle/src/route-schemas.ts` | 25-27 | `mintDataHashSchema`: `{dataHash: hexViem}` |
| `apps/oracle/src/server.ts` | 235-238 | Validate 32-byte hex → `storage.markDataHashSeen(dataHash)` |
| `apps/oracle/src/server.ts` | 239-240 | Returns `{ok: true, dataHash, seen: true}` |

This is required before `/v1/ownership` will sign for this dataHash (server.ts:168-174).

**Failure point:** Invalid `dataHash` format → 400 (line 235-238).

#### 5. On-chain data display via useAgentMetadata

| File | Line(s) | Action |
|------|---------|--------|
| `apps/frontend/src/pages/AgentDetail.tsx` | 37 | `useAgentMetadata(tokenId)` — fetches on-chain data |
| `apps/frontend/src/hooks/useAgentMetadata.ts` | 25-66 | `useReadContracts` multicall: `name`, `symbol`, `ownerOf`, `intelligentDatasOf`, `tokenURI`, `creatorOf` |
| `apps/frontend/src/hooks/useAgentMetadata.ts` | 68-85 | Extract first data entry → `{dataHash, dataDescription}` |
| `apps/frontend/src/hooks/useAgentMetadata.ts` | 87-92 | Returns `{data: AgentMetadata | null, isLoading, error, refetch}` |
| `apps/frontend/src/pages/AgentDetail.tsx` | 69-70 | Renders `data.dataDescription` as page title |
| `apps/frontend/src/pages/AgentDetail.tsx` | 128-167 | Renders metadata grid: collection, owner, creator, dataHash, description, tokenURI, TEE status |

#### 6. Indexer picks up events

- `Transfer(0x0, to, tokenId)` — mint detected by indexer
- `CreatorSet(tokenId, creator)` — creator event
- Both → POST /v1/events → EventStore → available via `useEventHistory`

---

## Summary: Async Boundaries Across All Flows

| Flow | # | Async Boundary | File:Line |
|------|---|----------------|-----------|
| A | 1 | `apiFetch` POST /v1/agents/:id/transfer (challenge) | useTransfer.ts:80-85 |
| A | 2 | `signTypedDataAsync` (wallet EIP-712) | useTransfer.ts:106-119 |
| A | 3 | `apiFetch` POST /v1/agents/:id/transfer (finalize) | useTransfer.ts:124-141 |
| A | 4 | Oracle: `storage.download()` from 0G Storage | server.ts:85 |
| A | 5 | Oracle: `storage.upload()` to 0G Storage | server.ts:98 |
| A | 6 | `writeContractAsync` (iTransferFrom tx) | useTransfer.ts:170-185 |
| B | 1 | `apiFetch` POST /v1/orchestrator/tick | useOrchestratorTick.ts:68-73 |
| B | 2 | WebSocket open to `/v1/stream` (stream mode) | useOrchestratorTick.ts:121 |
| B | 3 | `Promise.all([runInference, fetchOnchainState, fetchStoragePeek])` | orchestrator/index.ts:91-97 |
| B | 4 | OpenAI `chat.completions.create` (0G Compute Router) | orchestrator/index.ts:209 or 226 |
| B | 5 | `vaultTc.contract.execute()` + `tx.wait()` | orchestrator/index.ts:165-166 |
| C | 1 | `provider.getBlockNumber()` | watcher.ts:532 |
| C | 2 | `pollOnce()` → `provider.getLogs()` (multiple) | watcher.ts:566 |
| C | 3 | `saveCheckpoint()` | watcher.ts:574 |
| C | 4 | `postEvent()` → HTTP POST to backend | index.ts:134 |
| C | 5 | (optional) `uploadToStorage()` → 0G DA | index.ts:70-75 |
| D | 1 | `useReadContracts` → on-chain `mintFee()` | MintForm.tsx:39-52 |
| D | 2 | `writeContractAsync` → AxiomAgentNFT.mint() tx | MintForm.tsx:87-93 |
| D | 3 | `useWaitForTransactionReceipt` | MintForm.tsx:61 |

## Summary: Failure Point Patterns

| Category | Examples |
|----------|----------|
| **Input validation** | Missing required fields, invalid address format, pubKey length mismatch |
| **Authentication** | Wallet not connected, invalid API key, unregistered oracle signer |
| **Oracle failures** | 0G Storage download/upload failure, orphaned dataHash, timeout |
| **On-chain contract** | Zero receiver, nonce replay, expired proof, insufficient fee, merkle proof failure, daily limit exceeded, no strategy set |
| **Network/RPC** | Chain head query failure, eth_getLogs failure, websocket disconnect |
| **LLM/Compute** | Missing API keys, provider not found, OpenAI timeout, malformed JSON output |
| **State** | Stale cursor, stale event store checkpoint, event buffer overflow |
