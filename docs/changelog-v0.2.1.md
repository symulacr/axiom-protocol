# Changelog — v0.2.1 Deep Clean + Production Hardening

**2 commits | 65 source files | +2,093 / -1,243 = +850 net (+740 from pnpm-lock)**

---

## Critical Bug Fixes

- **Ghost ABI functions removed from VAULT_ABI**: `vaults()`, `totalDeposits()`, `getStrategy()` did not exist in the Solidity contract — calls always reverted at runtime. Replaced with real `balanceOf()` + `strategyOf()`. Added missing `setStrategy()` function.
- **Frontend vault dashboard now works**: `useVaultData.ts` was calling non-existent functions. Fixed to call `balanceOf()` and `strategyOf()` with correct return type parsing.
- **Backend server.ts**: Removed local VAULT_ABI extension hack — `setStrategy` now comes from canonical config ABI.

## Architecture Fixes

- **Frontend chainId awareness**: All 5 address getters (`getAxiomStrategyVaultAddress`, etc.) now respect their `_chainId` parameter instead of silently returning Galileo addresses on all chains. Aristotle mainnet throws a clear "not deployed" error.
- **Compute SDK migration**: Replaced 126-line manual `InferenceServing.getAllServices()` RPC wrapper with 0G Compute SDK's `ReadOnlyInferenceBroker.listService()`. Added `@0gfoundation/0g-compute-ts-sdk` as a declared dependency.
- **Storage layer**: Removed `withRetry()` wrapper — the SDK's `Indexer` handles retries internally. Kept `uploadToStorage()`/`downloadFromStorage()` for indexer (verified live).

## Dead Code Removed (~246 lines)

| Symbol | File | Lines | Evidence |
|--------|------|-------|----------|
| `ENV_KEYS` | `packages/config/src/env.ts` | 40 | Zero consumers (grep exit 1) |
| `createBroadcaster()` | `apps/backend/src/ws/broadcaster.ts` | 5 | Zero importers |
| `sendToClient()` | `apps/backend/src/ws/broadcaster.ts` | 10 | Zero importers |
| `getAddressForChain()` | `packages/config/src/addresses.ts` | 13 | Zero importers |
| `ADDRESSES` per-chain map | `packages/config/src/addresses.ts` | 14 | Only used by dead `getAddressForChain` |
| `WAVE_E5` const | `packages/config/src/addresses.ts` | 8 | Inlined into `DEPLOYED_ADDRESSES` |
| 5 deprecated address aliases | `apps/frontend/src/abi/addresses.ts` | 15 | Zero importers |
| `resolveComputeRouterUrl` + 3 others | `packages/config/src/networks.ts` | 32 | Zero importers |
| `bigIntSafe` + `stringifyBigIntSafe` | `packages/config/src/types/bigint.ts` | 20 | Zero importers |
| `EIP712_DOMAIN` deprecated const | `apps/frontend/src/abi/eip712.ts` | 7 | Zero importers |
| `withRetry()` | `packages/config/src/storage/0g.ts` | 20 | SDK handles retries internally |
| SSE fallback in `useOrchestratorTick.ts` | `apps/frontend/src/hooks/` | 108 | Broken + caused duplicate tick execution |
| Hand-rolled RFC 8785 serializer | `apps/indexer/src/serialization.ts` | 62 | Replaced with `canonicalize` npm package |
| Phantom dep `viem` from bench | `apps/bench/package.json` | 1 | Never imported |

## New Dependencies

| Package | Version | Purpose | Added To |
|---------|---------|---------|----------|
| `@0gfoundation/0g-compute-ts-sdk` | ^0.8.4 | Compute read-only broker (provider discovery) | `apps/backend` |
| `canonicalize` | ^3.0.0 | RFC 8785 canonical JSON (DA event serialization) | `apps/indexer` |

## Streaming & WSS Hardening

- **True LLM token streaming**: `runInference()` now passes `stream: true` to OpenAI when the `onChunk` callback is provided, emitting tokens as they arrive from the API async iterator. Removed the fake word-splitting post-processing.
- **Broken SSE fallback removed**: The SSE fallback in `useOrchestratorTick.ts` was calling `onChunk(undefined)` and causing **duplicate tick execution** (real gas cost). Deleted ~108 lines.
- **WS broadcaster reliability**: Added per-client try/catch in `sendToTopic`/`sendToClient`, `bigintReplacer` for safe serialization, WS error handler logging.

## Transfer Flow UX

- **Phase tracking**: Added `TransferPhase` type (`idle → challenge → signing → finalizing → confirming`) with horizontal stepper UI in `TransferModal`.
- **Retry guidance**: All error messages now include phase-specific retry instructions and nonce regeneration hints.
- **Mint oracle info**: Success block now warns about oracle registration requirement for future transfers.

## Oracle & Mint Hardening

- **Oracle registration timeout**: Increased from 2s to 15s with 1 retry attempt — prevents silent registration failures that would block future transfers.
- **Synthetic dataHash**: Upgraded from silent fallback to hard 400 error — no more fake data hashes.
- **Zero-padded sealedKey**: Production warning added when no valid sealedKey is provided.

## Dead Code Re-verification

The following symbols were previously reported as dead but verified LIVE:
- `resolveBlockExplorerUrl()` — used by `MarketPage.tsx:48` and `HistoryPage.tsx:43`
- `fetchStoragePeek()` — called at `orchestrator/index.ts:105` (always returns zero-hash but is actively called)
- `uploadToStorage()` + `downloadFromStorage()` — used by `indexer/src/index.ts:7`
- `InMemoryStorage` — used by oracle tests and dev fallback
- `useEventStream` — used by `HistoryPage.tsx:168`

## Nit: Comment Cleanup

Removed ~300 lines of noisy/obvious comments across all 6 packages (cosmetic section headers, trivial JSDoc, obvious inline restatements). Kept: security notes, architecture decisions, `// CEI:` patterns, EIP-712 domain binding explanations, benchmark methodology.
