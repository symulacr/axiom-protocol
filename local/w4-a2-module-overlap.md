# Module Responsibility Overlap Report

**Agent:** W4A2-ModuleOverlap  
**Date:** 2026-06-28  
**Scope:** Axiom Protocol monorepo (`/home/eya/og`) — 6 apps + shared `@axiom/config` package

---

## 1. Environment Loading — ⚠️ Centralized (Good, Minor Friction)

**Files:**
- `packages/config/src/env.ts` — canonical `loadEnv()`, `getEnv()`, `getEnvWithAlias()`
- `apps/backend/src/env.ts` → re-exports from `@axiom/config/env`
- `apps/oracle/src/env.ts` → re-exports from `@axiom/config/env`
- `apps/indexer/src/env.ts` → re-exports from `@axiom/config/env`
- `apps/frontend/src/config/env.ts` — separate Vite `import.meta.env`-based loader (unavoidable difference)

**Assessment:** Already consolidated. The three Node apps all re-export from the single source of truth. The frontend uses Vite's built-in env system, which is a different paradigm (static embedding, `import.meta.env`), so its separate loader is appropriate.

**Friction:** The `getEnvWithAlias()` backward-compat alias system in `@axiom/config/env` is redundant with `@axiom/config/addresses.ts` which re-implements the same fallback chain for contract addresses independently. A single address-resolution helper using `getEnvWithAlias` could replace the inline fallback chains in both `index.ts` and `addresses.ts`.

---

## 2. Contract Interaction — ⚠️ Two Patterns, One Shared

### ABI Source
**Overlap:** The ABIs are defined **once** in `packages/config/src/abis/` and consumed everywhere:
- `AGENT_NFT_ABI` — used by backend server.ts, orchestrator, agents router
- `VAULT_ABI` — used by backend orchestrator
- `PAYMENT_PROCESSOR_ABI` — used by backend payment/processor.ts
- `ITRANSFER_FROM_ABI` — used by frontend useTransfer hook
- `ERC20_ABI` — used by backend payment/processor.ts

The frontend also has `apps/frontend/src/abi/axiomAgentNft.ts` and `axiomStrategyVault.ts` which are **thin re-exports** from `@axiom/config/abis` — technically a skip layer but trivially thin.

### Address Resolution
**Overlap:** Two different address resolution patterns exist:

1. **Backend `apps/backend/src/index.ts`:** Manually reads env vars with `getAddress()` from `viem`, with fallback chain → falls back to `DEPLOYED_ADDRESSES` from `@axiom/config/addresses`. Uses `viem`'s `getAddress` (EIP-55 checksum).

2. **Frontend `apps/frontend/src/abi/addresses.ts`:** Wraps `DEPLOYED_ADDRESSES` through a `getContractAddress()` function + per-contract named helpers. Uses `viem`'s `Address` type cast.

3. **Indexer `apps/indexer/src/events.ts`:** Re-exports via `toViemHex(DEPLOYED_ADDRESSES.*)` — adds an unnecessary hex transformation.

**Assessment:** There are two subtly different resolution strategies (manual fallback chain in backend index.ts vs wrapped helpers in frontend addresses.ts). The backend duplicates the address environment-variable fallback logic that `DEPLOYED_ADDRESSES` in `@axiom/config/addresses.ts` already handles via `process.env.*` lookups. The backend's `index.ts` doesn't use `@axiom/config/addresses` for the actual fallback resolution — it re-implements the same fallback chain manually. **Consolidation would help:** the backend should use a shared `resolveContractAddress(name)` helper from `@axiom/config`.

### Contract Typed Wrapper
- Backend uses `TypedContract<T>` from `@axiom/config/types/contract` — shared pattern, good.
- Each callsite locally defines the method type interface (`StrategyVaultMethods`, `AgentNFTMethods`, `PaymentProcessorMethods`). These are **duplicated per callsite** with the same shape defined differently:
  - `orchestrator/index.ts` line 16 — `StrategyVaultMethods`
  - `payment/processor.ts` line 6 — `PaymentProcessorMethods`  
  - `routers/agents.ts` line 16 — `AgentNFTMethods`

**Consolidation would help:** A single `contracts/types.ts` in `@axiom/config` with typed method interfaces for each contract would eliminate 3+ duplicated type definitions.

---

## 3. Event Handling — ⚠️ Partial Overlap (Indexer + Backend Store)

### Flow
1. **Indexer** (`apps/indexer/src/watcher.ts`): Polls blockchain logs, decodes them via `decodeAxiomLog()` into typed `AxiomEvent` objects. Passes them to a sink.
2. **Indexer sink** (`apps/indexer/src/sink.ts`): `postEvent()` sends events as HTTP POST to the backend's `/v1/events`.
3. **Backend** (`apps/backend/src/events/store.ts`): Receives events, stores them in a local `EventStore` (in-memory + JSON persistence).
4. **Backend** (`apps/backend/src/routers/events.ts`): Serves `/v1/events` (list/query) and accepts event POSTs from the indexer.
5. **Backend WS broadcaster** (`apps/backend/src/ws/broadcaster.ts`): Pushes events to subscribed WebSocket clients.
6. **Frontend** (`apps/frontend/src/hooks/useEventHistory.ts`, `useEventStream.ts`): Polls REST endpoint + subscribes WS for live events.

### Redundancy Points

#### a) Event Signature Definitions (DUPLICATE)
- **`apps/indexer/src/events.ts`** — `EVENT_SIGNATURES` object with 29 event signature strings + `AxiomEvent` union type (29 variants) + `EVENT_ABI` parsed abi items. **560 bytes of string definitions.**
- **`apps/indexer/src/watcher.ts`** — `TOPIC_TABLE` computes keccak256 topic hashes from `ethers.id(EVENT_SIGNATURES[name])` + `TOPIC_TO_EVENT` reverse map. Also has `DEFAULT_WATCH_LIST` mapping events to contract addresses. **Duplicate derivation from the same source.**
- **Backend** `apps/backend/src/events/payloads.ts` — Separate typed payload interfaces (TickPayload, TransferPayload, etc.) that partially overlap with indexer's `AxiomEvent` types but serve a different layer (business events vs raw chain events).

**Consolidation would help:** The `EVENT_SIGNATURES` + `AxiomEvent` type in `apps/indexer/src/events.ts` could live in `@axiom/config` — both the indexer's decoding and the backend's event store refer to these signatures (the backend's event store is agnostic, but the frontend's `useEventHistory` imports `AxiomEvent` from its local `useEventHistory.ts` — a copy of the shape, not from config).

#### b) Event Payload Field Extraction (DUPLICATE)
- **Backend** `apps/backend/src/events/payloads.ts` — `payloadField()`, `payloadNumber()` for typed extraction
- **Frontend** `apps/frontend/src/utils/events.ts` — `eventField<T>()`, `eventTokenId()` — same pattern, slightly different API

**Consolidation would not help significantly** — these are simple utilities in different environments.

#### c) TRANSFER_TOPIC constant (DUPLICATE)
- `apps/backend/src/utils/constants.ts` — `TRANSFER_TOPIC` hardcodes `keccak256("Transfer(address,address,uint256)")` result
- `apps/indexer/src/watcher.ts` — computes it dynamically via `ethers.id("Transfer(address,address,uint256)")`

**Consolidation would help slightly** — export from `@axiom/config` or compute centrally.

---

## 4. Crypto Operations — ⚠️ Clear Boundary with a Gap

### Ownership
| Operation | Owner | Location |
|-----------|-------|----------|
| EIP-712 domain/struct hashing | Oracle | `apps/oracle/src/crypto/eip712.ts` — exported via `@axiom/oracle/signer` |
| secp256k1 key operations | Oracle | `apps/oracle/src/crypto/secp256k1.ts` |
| AES-256-GCM encryption | Oracle | `apps/oracle/src/crypto/aes-gcm.ts` |
| ECIES key wrapping | Oracle | `apps/oracle/src/crypto/ecies.ts` |
| TEE signer | Oracle | `apps/oracle/src/signer.ts` — wraps the crypto above |

### Consumers
- **Backend** imports from `@axiom/oracle/signer`: `accessMessageHash`, `recoverAccessSigner`, `type Eip712Domain`, `type OwnershipProofInput/Result`. This is proper — the oracle owns the crypto domain.
- **Frontend** has its own `apps/frontend/src/abi/eip712.ts` which re-defines EIP-712 domain types for on-chain interaction (via wagmi's `signTypedDataAsync`). It defines `ACCESS_PROOF_TYPES` that mirrors the oracle's struct definitions — **partial duplication** of the proof schema (the field names match `AccessProofInput` in oracle).

### Gap
The frontend's `ACCESS_PROOF_TYPES` in `apps/frontend/src/abi/eip712.ts` duplicates the EIP-712 struct definition that exists in `apps/oracle/src/crypto/eip712.ts` (`ACCESS_PROOF_TYPEHASH` and `AccessProofInput`). While the frontend needs a different format (wagmi's type definitions vs ethers'), having the struct shapes in two places creates drift risk.

**Consolidation would help:** Share the EIP-712 type definitions in `@axiom/config` with adapters for both ethers (oracle/backend) and wagmi (frontend) usage.

---

## 5. Type Definitions — ⚠️ Good Centralization, Some Gaps

### Well-Shared
- `@axiom/config/types/orchestrator.ts` — `TickResult`, `TickRequest`, `TickRecommendation`, etc. Used by backend orchestrator + frontend hooks.
- `@axiom/config/types/transfer.ts` — `TransferInput`, `AccessProofStruct`, `OwnershipProofStruct`, `TransferResponse`, `TransferPhase`. Used by backend routers + frontend hooks.
- `@axiom/config/types/performance.ts` — `PerformanceMetrics`, `TradeHistoryEntry`. Used by backend routers + frontend hooks.
- `@axiom/config/types/hex.ts` — `Hex`, `Address`, `validateHex`, `validateAddress`, `toViemHex`. Used across almost everything.
- `@axiom/config/types/bigint.ts` — `bigintReplacer`. Used for JSON serialization across backend + indexer.
- `@axiom/config/types/schemas.ts` — Zod schemas for hex/address validation. Used across backend + oracle route schemas.
- `@axiom/config/types/contract.ts` — `TypedContract<T>`. Used by backend.

### Not-Shared (Duplications)

#### a) Backend Router Type Interfaces (DUPLICATE)
Each backend router file locally declares contract method interfaces even though they could be shared:
- `orchestrator/index.ts:15-17` — `StrategyVaultMethods`
- `payment/processor.ts:6-16` — `PaymentProcessorMethods`
- `routers/agents.ts:16-18` — `AgentNFTMethods`

#### b) Event Type Duplications
- `apps/indexer/src/events.ts:80-109` — `AxiomEvent` union type (29 variants) — this is the canonical typed event definition
- `apps/frontend/src/hooks/useEventHistory.ts:5-14` — `AxiomEvent` interface (simpler format, wire-level only)
- `apps/backend/src/events/payloads.ts:3-45` — Business event payload types (TickPayload, TransferPayload, etc.)

The indexer's `AxiomEvent` is comprehensive but not shared; the frontend redefines a wire-format version; the backend defines business-level variants.

**Consolidation would help:** The indexer's `AxiomEvent` type could live in `@axiom/config` and be consumed by both the backend and frontend (with appropriate transformations).

#### c) Route Schema Overlap (Minor)
Both backend and oracle define route schemas using `@axiom/config/types/schemas`:
- `apps/backend/src/route-schemas.ts` — `accessProofSchema`, `transferBodySchema`, `eventBodySchema`, `tickSchema`, etc.
- `apps/oracle/src/route-schemas.ts` — `transferValiditySchema`, `ownershipBodySchema`, `mintDataHashSchema`

These are intentionally different APIs, so not true overlap. However, the `accessProofSchema` in the backend partially overlaps with data structures in the oracle's `ownershipBodySchema`/`transferValiditySchema`. They handle different endpoints so consolidation is not critical.

---

## 6. API Key Auth — ✅ Centralized

### Files
- `packages/config/src/middleware/auth.ts` — `createApiKeyAuth()` function
- `apps/backend/src/server.ts:83` — `app.use(createApiKeyAuth(config.env?.AXIOM_API_KEY))`
- `apps/oracle/src/server.ts:47` — `app.use(createApiKeyAuth(config.env?.AXIOM_API_KEY))`

**Assessment:** Properly centralized. Both HTTP servers use the shared middleware from `@axiom/config`. The frontend sends `x-api-key` via `apps/frontend/src/utils/apiFetch.ts` — it's the counter-party, not duplicate auth logic.

---

## 7. Hex/Address Utilities — ✅ Centralized with Two Edges

### Central Hub
- `packages/config/src/types/hex.ts` — `Hex`, `Address` branded types, `validateHex()`, `validateAddress()`, `toViemHex()`
- `packages/config/src/types/schemas.ts` — `hexString`, `address`, `hexViem`, `addressViem` Zod schemas using the above

### Consumers
All modules import from the centralized source:
- Backend: `@axiom/config/types/hex`, `@axiom/config/types/schemas`, `@axiom/config/addresses`
- Oracle: `@axiom/config/types/hex`, `@axiom/config/types/schemas`
- Indexer: `@axiom/config/types/hex`, `@axiom/config/addresses`
- Frontend: `@axiom/config/addresses`, `@axiom/config/networks`, `@axiom/config/abis`

### Edge Cases
1. **The backend's `index.ts`** uses `viem`'s `getAddress()` directly instead of `@axiom/config/types/hex`'s `toViemHex()` or `validateAddress()`. Inconsistent import choice.
2. **The oracle's `server.ts`** uses `viem`'s `isHex()` and `ethers`' `isAddress()` and `hexlify()` directly, bypassing the shared validators. Minor — these are runtime input validators, not type transforms.
3. **The indexer's `watcher.ts`** uses `viem`'s `getAddress()` and `decodeEventLog()` alongside `@axiom/config/types/hex`'s `validateHex()`. Mixed imports.
4. **Multiple address validation sources:** `viem.isAddress`, `viem.getAddress`, `ethers.isAddress`, `@axiom/config/types/schemas.address` — used inconsistently across apps for the same task (EIP-55 checksum validation).

**Consolidation would help slightly** — standardizing on `@axiom/config/types/schemas.address` (the Zod schema) for all address validation would eliminate the import inconsistency. Not critical but would reduce mental overhead.

---

## Summary

| Area | Status | Criticality | Consolidation Priority |
|------|--------|-------------|----------------------|
| Env loading | ✅ Already centralized | — | Low |
| Contract interaction | ⚠️ Two patterns coexist | Medium | **High** (reduces duplicate address fallback + contract type definitions) |
| Event handling | ⚠️ Signatures duplicated between indexer events.ts and watcher.ts | Medium | **Medium** (move canonical event types + ABI to `@axiom/config`) |
| Crypto operations | ⚠️ Frontend EIP-712 types partially duplicate oracle's | Low | Low (different target libs) |
| Type definitions | ⚠️ Contract method types duplicated per callsite; event types fragmented | Medium | **High** (consolidate contract types + AxiomEvent in `@axiom/config`) |
| API key auth | ✅ Centralized | — | None needed |
| Hex/address utils | ✅ Centralized, inconsistent imports | Low | Low (standardize import preference) |

### Top 3 Consolidation Opportunities

1. **Contract method type interfaces** — Move `StrategyVaultMethods`, `PaymentProcessorMethods`, `AgentNFTMethods` from individual backend files into `@axiom/config/contracts/types.ts` (or similar). Currently 3+ duplicated interfaces with the same shapes.

2. **Canonical event definitions** — Move `EVENT_SIGNATURES`, `AxiomEvent` union type, and `EVENT_ABI` from `apps/indexer/src/events.ts` into `@axiom/config/events`. This would eliminate the signature duplication between `events.ts` and `watcher.ts`, and make typed events available to the backend store and frontend hooks without each redefining their own subset.

3. **Address resolution helper** — Create a single `resolveContractAddress(name)` in `@axiom/config/addresses` that handles the full fallback chain (env var → `DEPLOYED_ADDRESSES` default → exception), eliminating the manual fallback chains in `apps/backend/src/index.ts`.
