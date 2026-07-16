# Chat Runtime — Execution Plan

**Manifest (source of truth):** [`.coverage/chat-runtime-manifest.json`](.coverage/chat-runtime-manifest.json)

**Goal:** One shared tool runtime (`@axiom/chat-runtime`), parallel sub-execution where safe, unified encode/orchestrate/archive facades — less code, less drift between chat UI and E2E bench.

---

## Quick status

| Metric | Value |
|--------|-------|
| Window | 7 Jul – 21 Jul 2026 |
| Wave | **W1** — runtime foundation (4 agents ∥) |
| Tasks | **6/35 done** |
| Gates met | **2/8** |
| Model | Sequential waves · parallel agents · **disjoint fileOwnership** |

```bash
pnpm --filter @axiom/backend run coverage-status --manifest chat-runtime
pnpm --filter @axiom/backend run coverage-status --manifest chat-runtime wave W1 active
pnpm --filter @axiom/backend run coverage-status --manifest chat-runtime agent W1 W1-A1 in_progress
pnpm --filter @axiom/backend run coverage-status --manifest chat-runtime done CRT-010
```

---

## Architecture (target)

```
packages/chat-runtime/     ← single runTool() + class executors
├── executors/read.ts
├── executors/encode.ts    mint | deposit | withdraw (encode→sign)
├── executors/orchestrate.ts  preflight ∥ → tick
├── executors/archive.ts   closest-first facade
├── parallel.ts            groupParallelTools()
└── session.ts             lastTokenId, persistence

apps/frontend/chat/        ← transport-browser.ts only
apps/backend/e2e/          ← transport-node.ts only
apps/backend/              ← /archive/query, /agents/mint/encode
```

---

## Tool classes (optimization focus)

| Class | Tools | Parallel? | Fast path |
|-------|-------|-----------|-----------|
| read | 4 | yes | cache / multicall |
| encode | 3 | no (nonce lane) | preflight ∥ then encode→preview→sign |
| orchestrate | 1 | preflight only | NOT_READY <500ms; simulate before live tick |
| archive | 3 | yes | `/closest` default; CDX opt-in |

---

## Waves (multi-agent, no file conflicts)

| Wave | Agents | Parallel | Checkpoint |
|------|--------|----------|------------|
| **W0** | 1 | — | Taxonomy + 12/12 gate ✅ |
| **W1** | 4 | ∥ | `runTool` + mint/encode router |
| **W2** | 5 | ∥ | All class executors + format |
| **W3** | 4 | ∥ | Transports + frontend/e2e wire |
| **W4** | 3 | ∥ | `groupParallelTools` + ChatPage batches |
| **W5** | 2 | ∥ | Archive query + async jobs |
| **W6** | 4 | ∥ | Session, prompt, UI components |
| **W7** | 4 | ∥ | server mount, E2E, CI, manifest |

**W1 spawn (example):** `W1-A1` package.json · `W1-A2` transport.ts · `W1-A3` run-tool.ts · `W1-A4` mint-encode router — no shared files.

Advance wave when every agent in wave is `done`.

---

## Phases (legacy map)

### P0 / W0 — Baseline ✅

- [x] **CRT-001** Tool taxonomy (`chat-tools.ts`)
- [x] **CRT-002** `classOfTool` + bench class summary
- [x] **CRT-003** ChatPage class badges + a11y hints
- [x] **CRT-004** Live gate 12/12 (no REUSE)
- [x] **CRT-005** Bench lanes from `toolsByClass`

### P1 — Shared runtime

- [ ] **CRT-010** Scaffold `@axiom/chat-runtime`
- [ ] **CRT-011** `ToolRuntime` transport interface
- [ ] **CRT-012** `runTool()` dispatcher
- [ ] **CRT-013** Unified `formatToolResult`
- [ ] **CRT-014** Encode executor (mint/deposit/withdraw)
- [ ] **CRT-015** `POST /v1/agents/mint/encode`
- [ ] **CRT-016** Archive executor (closest-first)
- [ ] **CRT-017** Orchestrate executor (preflight → tick)
- [ ] **CRT-018** Read executor
- [ ] **CRT-019** Browser transport → thin `tools.ts`
- [ ] **CRT-020** Node transport → delete `executeE2eTool` switch

### P2 — Parallel execution

- [ ] **CRT-021** `groupParallelTools()` dependency graph
- [ ] **CRT-022** ChatPage `Promise.all` tool batches
- [ ] **CRT-023** Encode preflight fan-out
- [ ] **CRT-024** Orchestrate preflight fan-out
- [ ] **CRT-025** E2E complex flow parallel reads

### P3 — Unified backend

- [x] **CRT-026** `POST /v1/archive/query` + CDX cache
- [x] **CRT-027** Async `archive_account_tweets` job *(stretch)*

### P4 — Session + UX

- [ ] **CRT-028** `ChatSession` + `applyToolResult`
- [ ] **CRT-029** System prompt from catalog hints
- [ ] **CRT-030** `sessionStorage` message persistence
- [ ] **CRT-031** Encode sign-preview card
- [ ] **CRT-032** Context compression for long threads
- [ ] **CRT-033** `simulate_tick` / dryRun alias

### P5 — Verification

- [ ] **CRT-040** Full E2E 12/12 regression
- [ ] **CRT-041** `coverage-status --manifest chat-runtime`
- [ ] **CRT-042** CI unit tests + parity on `runTool`
- [ ] **CRT-043** Update `gate.live-path` in coverage manifest

---

## Gates

| Gate | Target | Status |
|------|--------|--------|
| `gate.runtime-parity` | Frontend + bench share `runTool`, 11/11 same JSON | pending |
| `gate.loc-reduction` | Tool LOC ≤420 (from ~700) | pending |
| `gate.archive-fast` | Archive p95 <1s closest-first | partial |
| `gate.encode-unified` | Mint uses encode pipeline | pending |
| `gate.parallel-tools` | Independent tools in `Promise.all` | pending |
| `gate.session-memory` | Context + sessionStorage | pending |
| `gate.orchestrate-preflight` | NOT_READY without compute | pending |
| `gate.e2e-12-12` | Full live critical 12/12 | **met** |

---

## Agent spawn cheatsheet (current W1)

| Agent | Tasks | Exclusive files |
|-------|-------|-----------------|
| W1-A1 | CRT-010 | `packages/chat-runtime/package.json`, `tsconfig.json` |
| W1-A2 | CRT-011 | `transport.ts`, `types.ts` |
| W1-A3 | CRT-012 | `index.ts`, `run-tool.ts` |
| W1-A4 | CRT-015 | `routers/mint-encode.ts` only (mount in W7) |

---

## Verification commands

```bash
# Tool parity (CI-friendly)
E2E_LIVE_COMPUTE=0 pnpm --filter @axiom/backend run run-chat-bench

# Full live gate (production confidence)
cd apps/backend && unset E2E_REUSE_TOKEN && \
  E2E_LIVE_COMPUTE=1 node --import tsx src/cli/run-e2e.ts

# Nightly heavy bench
E2E_LIVE_COMPUTE=1 E2E_FULL_VAULT=1 \
  CHAT_BENCH_CONTEXT_ROUNDS=10 CHAT_BENCH_KEEPALIVE_ROUNDS=10 \
  node --import tsx src/cli/run-e2e.ts
```

---

## Blockers

| ID | Issue | Mitigation |
|----|-------|------------|
| `blk.ethers-skew` | ~~`pnpm run run-e2e` tsc fails (ethers 6.16 vs 6.17)~~ | **Resolved:** `pnpm` overrides pin `ethers@6.16.0`; `run-e2e` via `tsx` |
| `blk.mint-dual-path` | UI mint ≠ bench encode | CRT-015 + CRT-014 |

---

## Session memory (current vs target)

| | Today | After P4 |
|--|-------|----------|
| In-session | Full `messages` resent each LLM turn | Same + `ChatSession.context` |
| Cross-refresh | Lost (only `hasUsedChat` flag) | `sessionStorage` restore |
| Model hints | Tool schema only | System prompt from catalog + defaults |