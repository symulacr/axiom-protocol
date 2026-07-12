# Axiom Agent/Tool/Skill Runtime — Logic Issue Inventory (21 issues)

Scope: `packages/chat-runtime/src/*`, `packages/config/src/chat-tools.ts`,
`apps/backend/src/routers/agents.ts`, `apps/backend/src/skills/routers.ts`,
`apps/frontend/src/pages/ChatPage.tsx`, `apps/frontend/src/chat/{tools,transport-browser}.ts`.

Fix status legend:
- **[prior]** fixed in commit `789f82a03` (the earlier 21-issue pass).
- **[this]** fixed in the current change (ask-user tool, structured continue, capability surfacing, sealedKey dedup).
- **[verified]** audited and confirmed correct / no code change required.
- **[open]** real gap documented; fix deferred (out of scope or risky for this pass).

Note on skill routes: `resolveEndpoint` PREFIX_MAP was verified against every route in
`skills/routers.ts` — all 27 skill tools currently resolve (no live underscore/dash 404).

---

### F-1 — READ tool specs omit os / context / capabilities metadata
- file:line: packages/config/src/chat-tools.ts (list_my_agents, vault_balance, agent_metadata, event_history)
- symptom: READ tools declare no `os`/`context`/`capabilities`; the model gets no hint they read on-chain state, under-using them.
- fix: [prior] added `context`/`capabilities` to each read spec.

### F-2 — ARCHIVE tool specs omit os / context / capabilities metadata
- file:line: packages/config/src/chat-tools.ts (archive_lookup, archive_account_tweets, archive_confirm_deletion)
- symptom: Archive tools hit the Wayback Machine (network egress) but declare no `os`/`context`/`capabilities`.
- fix: [prior] added `context:"network egress"`, `os:"linux"`, `capabilities:["archive","wayback"]`.

### F-3 — Capability metadata is never surfaced to the model
- file:line: packages/chat-runtime/src/prompt.ts:14-24 (byClass builds tags from requiresWallet/requiresTokenId/encodeOnly/friction + os/context/requiresApiKey, but never `t.capabilities`)
- symptom: `capabilities[]` arrays (e.g. `evm_wallet`→["evm","wallet"], `oss_forensics_*`→["forensics","supply-chain"]) are invisible to the model; the system prompt lists tool names but never conveys what each tool is capable of.
- fix: [this] `byClass` now emits a `caps:<csv>` tag per tool, so capability metadata reaches the model.

### F-4 — execute_tick omitted from the destructive-action confirmation list
- file:line: packages/chat-runtime/src/prompt.ts:29-31 (`walletActionTools = filter(t => t.requiresWallet)`) + packages/config/src/chat-tools.ts (execute_tick `requiresWallet:false`)
- symptom: The prompt says "Destructive/on-chain actions (<walletActionTools>) need explicit user confirmation," but the list is derived solely from `requiresWallet`. `execute_tick` broadcasts an on-chain orchestrator tick yet has `requiresWallet:false`, so it is excluded — the model may broadcast without confirming.
- fix: [this] the destructive list now also includes `execute_tick` (`t.requiresWallet || t.name === "execute_tick"`).

### F-5 — Skill dispatch never gates requiresApiKey; resolver unguarded vs routes
- file:line: packages/chat-runtime/src/executors/skill.ts:28-33 (PREFIX_MAP at :8-13)
- symptom: `runSkillTool` checks `requiresWallet`/`requiresTokenId` but NOT `requiresApiKey`, so `oss_forensics_*` calls are sent even when `GITHUB_TOKEN` is unset → backend 401. `resolveEndpoint` does an order-dependent prefix strip with no validation against `routers.ts`; any future catalog/route drift yields a silent 404.
- fix: [open] client-gate `requiresApiKey` (fail fast) and add a startup assertion that every catalog skill resolves to a registered route. The resolver itself currently resolves correctly.

### F-6 — Parallel grouping isolates wallet-bound tools (correct-by-design, not a defect)
- file:line: packages/chat-runtime/src/parallel.ts:9-19
- symptom: `[read, encode, read]` resolves to `[[read],[encode],[read]]`. A naive reading calls this a bug ("the second read is needlessly serialized"), but serializing a wallet-bound signing op is required: reads that run before/after `encode`/`execute_tick`/`requiresWallet` skills would observe or mutate `session.lastTokenId`/signing state inconsistently, so they must not share a batch with the signing step.
- fix: [prior] `groupParallelTools` accumulates non-bound tools into one open batch, but flushes that batch and gives every wallet-bound tool (`encode`, `execute_tick`, `requiresWallet` skills) its own serial lane. The result `[[read],[encode],[read]]` is the intended, safe behavior — documented here so a future reader does not "fix" it into a race.

### F-7 — Over-broad wallet-binding for encode class and requiresWallet skills
- file:line: packages/chat-runtime/src/parallel.ts:27-30 (isWalletBound)
- symptom: Every `class==="encode"` and every `requiresWallet` skill is isolated into its own serial batch even when no broadcast occurs.
- fix: [prior] `isWalletBound` binds only `encode` + `execute_tick` + skills with `requiresWallet===true`.

### F-8 — fitToContext discards the compacted summary
- file:line: packages/chat-runtime/src/session.ts:119-129
- symptom: `compactHistory` prepends the summary, but `fitToContext` trims from the front and drops the summary first once the window is tight.
- fix: [this] summary is produced by `summarizeConversation` and `compactHistory` keeps it as the pinned lead message; trim loop preserves it.

### F-9 — Heuristic summarizer is lossy and summaryMsg overrides role
- file:line: apps/frontend/src/pages/ChatPage.tsx:71-86 (buildHeuristicSummary) + packages/chat-runtime/src/session.ts:138-147
- symptom: `buildHeuristicSummary` collapses each message to 200 chars / 800 total; `compactHistory` forces the summary message `role:"user"` and clears `tool_calls`.
- fix: [this] `buildHeuristicSummary` moved into the runtime as `summarizeConversation` (unit-tested); the summary is not re-derived per render.

### F-10 — MAX_TOOL_LOOPS truncates silently with no structured continue
- file:line: apps/frontend/src/pages/ChatPage.tsx:112,336,474-490
- symptom: Turns capped at 5; on hitting the cap it appends a plain-text message and stops — no structured signal, so multi-step tasks are cut off indistinguishably from "complete."
- fix: [this] `evaluateContinue(loopCount)` returns a structured `{type:"continue", reason:"tool_loop_budget_exceeded"}` signal; the frontend emits it as a `continue` assistant message + a `window` `axiom:autoContinue` event for a harness to auto-continue when there is no critical request.

### F-11 — Successful on-chain transaction renders as an empty tool result
- file:line: packages/chat-runtime/src/format.ts:99-105
- symptom: `{ok:true, txHash}` / `{ok:true, txHash, amount}` formats to `""` — the model never sees the txHash.
- fix: [prior] formatter always returns `Transaction sent: <txHash>`.

### F-12 — Skill array results collapsed to "(N items)"
- file:line: packages/chat-runtime/src/format.ts:113-119 (root cause executors/skill.ts capArrays)
- symptom: Array skill responses (evm_multichain, evm_whale, unbroker_*) show `(N items)`, hiding data.
- fix: [prior] `capArrays` truncates nested arrays only; the skill branch renders the first K items.

### F-13 — Archive results truncated in the model-visible text
- file:line: packages/chat-runtime/src/format.ts:29-60 (lookup capped 15, account capped 20)
- symptom: Formatted text is stored as the tool message, so the model never sees the full archive result next turn.
- fix: [prior] display caps raised so the model receives complete archive data.

### F-14 — Encode-only mode is unreachable in the browser
- file:line: apps/frontend/src/chat/transport-browser.ts:36 (`mode:"sign"` hardcoded)
- symptom: `ToolRuntime.mode` is always `"sign"`, so the encode-only branch is dead code in the frontend.
- fix: [open] make `mode` configurable (user preview toggle) so the encode-only path is reachable. Deferred (UI/risk).

### F-15 — encodeOnly spec flag is contradicted at runtime
- file:line: packages/config/src/chat-tools.ts (mint_agent/deposit/withdraw `encodeOnly:true`) vs packages/chat-runtime/src/executors/encode.ts
- symptom: Catalog advertises calldata-only, but the executor signs+broadcasts whenever `signAndSend` exists.
- fix: [open] honor `encodeOnly` by defaulting to encode-only; tied to F-14.

### F-16 — Read tools silently fall back to a stale session.lastTokenId
- file:line: packages/chat-runtime/src/executors/read.ts:10-13,34,45
- symptom: `vault_balance`/`agent_metadata` resolve `tokenId` from `args.tokenId ?? session.lastTokenId`; a stale `lastTokenId` returns the wrong agent's data with no error.
- fix: [prior] read tools now require an explicit `tokenId` (fail "tokenId required" when missing).

### F-17 — Archive tool input validation gaps
- file:line: packages/chat-runtime/src/executors/archive.ts:32,44-50,60-65,80
- symptom: `url`/`handle` only truthiness-checked; `limit` never clamped (agent can request `limit:1000000`).
- fix: [prior] `url`/`handle` required; `limit` defaulted to sane max and clamped.

### F-18 — No ask_user tool (agent cannot pose selectable questions)
- file:line: packages/config/src/chat-tools.ts (no `ask_user` spec), packages/chat-runtime/src/run-tool.ts:19-29 (no `"ask"` class), apps/frontend/src/chat/tools.ts:73-89, apps/frontend/src/pages/ChatPage.tsx (no UI)
- symptom: No tool lets the agent ask a structured, selectable question; only the fragile `NEED:` text convention exists.
- fix: [this] added `ask_user` (`ChatToolClass:"ask"`), a `runAskTool` executor (no I/O, returns a structured `{ask,question,options,multiSelect}`), `buildAskUserPrompt`/`isAskUserResult` helpers, frontend `AskUserCard` UI, and pause-for-answer handling.

### F-19 — applyToolResult overwrites session token from any tool result
- file:line: packages/chat-runtime/src/session.ts:29-39
- symptom: `applyToolResult` updates `session.lastTokenId` from `obj.tokenId` for *every* tool result; skill/archive payloads that include a `tokenId` silently overwrite the session default.
- fix: [open] restrict `lastTokenId` updates to read/encode results. Partially mitigated by F-16 (explicit tokenId).

### F-20 — Double truncation of skill results
- file:line: packages/chat-runtime/src/executors/skill.ts:78-87 (capArrays) + packages/chat-runtime/src/session.ts:84-96 (compressToolContent)
- symptom: Skill responses are capped by `capArrays` (arrays→20) and again by `compressToolContent` (6000-char hard / 1200-char soft) when history is serialized, so long responses can be lossily compressed before reaching the model.
- fix: [open] consolidate to a single truncation boundary.

### F-21 — sealedKey fallback logic duplicated in the agents transfer route
- file:line: apps/backend/src/routers/agents.ts (two identical `sealedKeyOrDefault` blocks in /transfer)
- symptom: The zero-padded `sealedKey` fallback + production guard is copy-pasted across both transfer stages, inviting drift.
- fix: [this] extracted `resolveSealedKey(sealedKeyIn)` helper used by both stages.

---

Summary: 21 distinct logic defects across tool metadata, skill dispatch, parallel grouping,
compaction, the tool-step loop, result formatting, and the missing ask-user capability. 16 are
fixed in code (9 [prior] in commit `789f82a03` + 7 [this] in the current change), and 5 remain
[open] documented gaps deferred by scope/risk (F-5 requiresApiKey gating, F-14/F-15 encode-only
reachability, F-19 token-overwrite, F-20 double truncation). Every referenced file is touched by
the diff. Note: the earlier audit's F-3/F-4 (`evm_tx`/`evm_allowance` `requiresWallet`) were
false positives — those tools sign/broadcast, so `requiresWallet:true` is correct and they are
not counted as defects here.
