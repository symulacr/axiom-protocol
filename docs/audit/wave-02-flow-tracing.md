# Wave 2: Flow Tracing & Data Lineage — Closure Report

**Protocol:** 7×4 Wave Codebase Audit  
**Date:** 2026-06-28  
**Monorepo:** Axiom Protocol (`/home/eya/og`)  
**Agents:** 7/7 completed | **Duration:** ~8 minutes  

---

## Executive Summary

Wave 2 traced every major execution path and data lifecycle through the Axiom Protocol. The iNFT transfer flow is the most complex — a **19-hop ceremony** across frontend, backend, oracle, storage, and on-chain contracts. The error handling posture has **3 critical gaps**: no process-level unhandled rejection handler anywhere, 2 oracle endpoints lack any try/catch, and indexer log-decode failures crash the entire tick.

---

## 1. Flow Traces Completed

### Flow A: iNFT Transfer (Two-Phase Cryptographic Ceremony)
**19 hops, 14 files, 6 async boundaries**

```
User click (frontend)
  → useTransfer.ts (phase 1: POST /v1/agents/:id/transfer)
    → agents.ts route (oracle client request)
      → oracle POST /v1/transfer-validity
        → decrypt blob (AES-GCM) → re-encrypt → upload to 0G Storage → ECIES-seal new key
        → sign EIP-712 OwnershipProof
      ← OwnershipProof + newDataHash + sealedKey
    → Return to frontend
  → useTransfer.ts (phase 2: wallet signs AccessProof via wagmi)
    → POST /v1/agents/:id/transfer (finalize)
      → on-chain iTransferFrom() via ethers
        → _proofCheck verifies OwnershipProof + AccessProof
        → _transfer updates ownership + emits PublishedSealedKey
      ← tx receipt
    → EventStore append → WebSocket broadcast
  ← UI update
```

**Async boundaries:** HTTP request (backend→oracle), 0G Storage upload/download, EIP-712 signing (wallet), blockchain tx submission, event polling.

### Flow B: Orchestrator Strategy Tick
**14 hops, 8 files, 5 async boundaries**

```
Frontend execute button
  → useOrchestratorTick.ts → POST /v1/orchestrator/tick
    → orchestrator router → StrategyRunner.runTick()
      → Parallel: runInference() + fetchOnchainState() + fetchStoragePeek()
        → compute/router.ts → OpenAI SDK → 0G Compute Router API
      → parseRecommendation(rawModelOutput)
      → settleOnChain() → AxiomStrategyVault.execute() via ethers
    → EventStore append → WebSocket broadcast
  ← TickResult displayed via SSE stream
```

**Async boundaries:** HTTP request, OpenAI/0G Compute API call, 3-way parallel Promise.all, blockchain tx, WebSocket broadcast.

### Flow C: Indexer Event Polling
**11 hops, 6 files, 5 async boundaries**

```
Indexer main loop (12s interval, 50-block window)
  → Watcher.tick() → pollOnce()
    → ethers getLogs for 28 event types across 4 contracts
    → decodeEventLog per log
    → compose sink: stdout + POST to backend + optional 0G Storage batch
      → Backend POST /v1/events → EventStore.append() → WS broadcast
    → save checkpoint (atomic rename: data/checkpoint.json)
  → sleep 12s → repeat
```

**Critical finding:** A single log decode failure (line ~568-571) throws and aborts the entire tick — all other events in that window are lost.

### Flow D: Agent Mint
**10 hops, 6 files, 3 async boundaries**

```
Frontend MintForm
  → contract call AxiomAgentNFT.mint() via wallet
    → _safeMint → store IntelligentData[] → record creator → emit Transfer event
  → oracle POST /v1/agents/mint (register dataHash)
  → Indexer picks up Transfer event → decodes → stored
  → Frontend useAgents polls → displays new agent
```

---

## 2. Cross-Module Call Chains (5 mapped)

| Chain | Module Crossings | Key Finding |
|---|---|---|
| 1. Orchestrator Tick | Frontend→Backend→Compute Router→OpenAI→0G Compute→StrategyVault→WS | 3-way parallel `Promise.all` is well-structured |
| 2. Transfer Re-key | Backend→Oracle→Storage→Crypto→On-Chain | Backend imports oracle signer types directly — pragmatic coupling |
| 3. Indexer→Backend→EventStore | Indexer→Backend HTTP→EventStore→WS | Single log decode failure kills entire tick |
| 4. Frontend Transfer | Wagmi signing→Backend→On-Chain | Frontend orchestrates both phases with `useSignTypedData` |
| 5. Backend Startup | Env→Provider→Wallet→Server→Routes→WS | Clean sequential initialization |

---

## 3. Data Transformation Traces (5 data types)

| Data Type | Creation | Validation | Persistence | Transport |
|---|---|---|---|---|
| **IntelligentData** | `MintForm` → contract | Solidity require + Zod schemas | On-chain (ERC-7201 mapping) | EVM calldata |
| **EIP-712 Proofs** | Oracle `signer.ts` | Zod route schemas + on-chain ECDSA | On-chain (verified per-tx) | HTTP JSON → EVM calldata |
| **Indexer Events** | `ethers.decodeEventLog` | None (raw decode) | In-memory buffer + file (EventStore) | HTTP POST → WS |
| **TickResult** | OpenAI LLM output | `parseRecommendation()` regex | Transient (in-memory) | SSE stream → WS |
| **Encrypted Blob** | Oracle AES encrypt | 0G Storage root hash | 0G Storage (off-chain) | 0G Storage SDK |

---

## 4. State Management (22 locations, 6 types)

| State Type | Examples | Scope | Lifetime | Concurrency Safety |
|---|---|---|---|---|
| **In-memory** | EventStore buffer, WS client registry, StrategyRunner lazy init | Process | Process | Node single-threaded (none needed) |
| **On-chain** | ERC-7201 storage slots (ownership, balances, authorized users) | Global (per contract) | Permanent | EVM atomic |
| **File** | Indexer checkpoint.json | Process | Persistent (crash-safe via atomic rename) | Single-writer |
| **React** | `useTransfer`, `useOrchestratorTick`, dual-buffer streaming | Component | Component lifecycle | N/A (SPA) |
| **Cache** | 30s TTL agent listing, 5min provider discovery TTL | Process | TTL-bound | Promise dedup, no invalidation |
| **0G Storage** | Encrypted agent blobs | Per-token | Permanent | Content-addressed |

**Key gaps:**
- No distributed locking — TTL caches have no cross-process invalidation
- EventStore uses 3 redundant index structures with 1k cap per source
- Compute router re-resolves env vars on every call (zero caching)
- No process-wide concurrency primitives (relies entirely on Node event loop)

---

## 5. Error Handling Assessment (28 files analyzed)

| Risk | Finding | File:Line | Impact |
|---|---|---|---|
| **CRITICAL** | No `process.on('unhandledRejection')` in any app | All entry points | Async promise rejections silently swallowed |
| **CRITICAL** | `/v1/ownership` has no outer try/catch | `oracle/src/server.ts:141-231` | Runtime error returns 500 without structured response |
| **CRITICAL** | `/v1/agents/mint` has zero error handling | `oracle/src/server.ts:233-241` | Same — errors produce raw Express error page |
| MEDIUM | Indexer per-log decode throw kills entire tick | `watcher.ts:568-571` | All events in window lost |
| MEDIUM | OpenAI completion has no per-request timeout | `orchestrator/index.ts:88-129` | Hanging model blocks StrategyRunner |
| MEDIUM | 0G Storage SDK has no configurable timeout | `packages/config/src/storage/0g/index.ts` | Network hang blocks indexer |
| MEDIUM | EventStore not flushed on shutdown | `events/store.ts` | Data loss on unclean exit |
| LOW | Backend heartbeat timer leaked on process exit | `server.ts:123-134` | Timer prevents graceful shutdown |
| LOW | Wayback Machine inconsistent error handling | `services/wayback.ts` | Mixed throw vs null return |

**Solidity side:** Well-structured — all contracts use custom errors with NatSpec. `AxiomTeeVerifier` has 10 custom errors. `AxiomAgentNFT` has proper require checks. The oracle server routes are the weakest link.

---

## 6. Async & Side-Effects (49 operations)

| Category | Count | Key Finding |
|---|---|---|
| WebSocket | 3 | 30s heartbeat, max 1000 clients, no message-level backpressure |
| Timer | 3 | Backend heartbeat, indexer poll, frontend poll hooks |
| React effects | 12 | `useEffect` for data fetching, streaming, polling |
| HTTP requests | 8 | OpenAI, backend→oracle, indexer→backend, Wayback, 0G Storage |
| Blockchain txs | 7 | Contract calls via ethers — async with confirmation wait |
| Filesystem I/O | 3 | EventStore debounced file write, indexer checkpoint |
| Graceful shutdown | 4 | Oracle + Indexer have SIGTERM/SIGINT; **Backend has NONE** |

---

## 7. External Integrations (7 analyzed)

| Integration | Quality | Auth | Key Issues |
|---|---|---|---|
| 0G Chain (EVM RPC) | **Good** | Private key | Provider singleton reused across backend |
| 0G Storage | **Fair** | Private key | No configurable timeout; untested |
| 0G Compute (OpenAI) | **Good** | API key / SDK token | Key precedence chain: Direct > Router > Legacy |
| OpenAI SDK | **Good** | API key | No per-request timeout on completion calls |
| Wayback Machine | **Fair** | Public API | Inconsistent error handling (throw vs null) |
| WalletConnect (wagmi) | **Good** | OIDC + project ID | Well-configured with RainbowKit |
| Ethers/viem contracts | **Good** | Wallet PK | TypedContract<T> pattern provides compile-time safety |

**Tests missing for:** Compute router, Wayback integration, most frontend hooks.

---

## 8. Agent Reports Index

| Agent | Report | Key Metrics |
|---|---|---|
| W2-A1 Request Flow | `local://w2-a1-request-flow.md` | 4 flows, 584 lines, 19 max hops |
| W2-A2 Call Chains | `local://w2-a2-call-chains.md` | 5 chains, 810 lines, 27 files |
| W2-A3 Data Transform | `local://w2-a3-data-transformation.md` | 5 data types, 35 files |
| W2-A4 State Management | `local://w2-a4-state-management.md` | 22 locations, 6 types, 36 files |
| W2-A5 Error Flows | `local://w2-a5-error-flows.md` | 3 CRITICAL, 4 MEDIUM, 2 LOW |
| W2-A6 Async & Side-Effects | `local://w2-a6-async-side-effects.md` | 49 ops, 9 categories |
| W2-A7 External Integrations | `.omc/research/w2-a7-external-integrations.md` | 7 integrations, 2 fair |

---

*End of Wave 2 Closure Report. Ready for Wave 3: Dead Code & Technical Debt.*
