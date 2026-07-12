# Tools & Skills Inventory + Skill-Call Audit

Audit of how AGENTS invoke SKILLS and TOOLS in the Axiom runtime. Source files:
`packages/chat-runtime/src/{executors/skill.ts,run-tool.ts,parallel.ts,prompt.ts,format.ts,session.ts}`,
`packages/config/src/chat-tools.ts`, `apps/backend/src/skills/routers.ts`,
`apps/frontend/src/chat/{tools.ts,transport-browser.ts}`.

---

## 1. SKILL-CALL AUDIT

When the model decides to call a skill tool, the call flows through a well-defined
pipeline. The frontend builds the OpenAI-style function schema from `CHAT_TOOL_CATALOG`
(`apps/frontend/src/chat/tools.ts`, `TOOLS`), and the system prompt from
`buildSystemPrompt` (`prompt.ts`). When the model emits a `function_call`, the frontend's
`useToolHandlers` routes it to `runBrowserTool` (`transport-browser.ts`), which constructs a
`ToolRuntime` (http fetch wrapper that prepends `BACKEND_URL`, adds `x-api-key` when `API_KEY`
is set, and exposes the wagmi `publicClient`/`wallet`) and calls `runTool` (`run-tool.ts`).

`runTool` first does a `getChatToolSpec(name)` lookup; an unknown name returns
`{error:"Unknown tool"}`. It then `switch`es on `spec.class` — `read`, `encode`,
`orchestrate`, `archive`, or `skill` — and for the `skill` class calls `runSkillTool`
(`skill.ts`). Inside `runSkillTool`: (1) it enforces `requiresWallet` (fails "Wallet not
connected" if `ctx.wallet?.address` is absent) and `requiresTokenId` (fails "tokenId required"
if no `args.tokenId` and no `ctx.session.lastTokenId`); (2) it calls `resolveEndpoint(name)`,
which scans `PREFIX_MAP` for the longest matching prefix and returns
`base + name.slice(prefix.length)`; (3) it `POST`s `{...args, context:{chainId, walletAddress,
agentNft, vault, lastTokenId}}` to that endpoint via `ctx.http.fetch`; (4) on `!res.ok` it
returns a structured error; on success it `JSON.parse`s and runs `capArrays(data, 20)`, then
returns `{ok:true, content: JSON.stringify(...)}`. `capArrays` recursively truncates every
array to its first 20 elements, wrapping it as `{truncated, data}`. The frontend then feeds the
result through `formatToolResult` (`format.ts`), which for skill-class tools renders
`key: value` lines (arrays shown as `(N items)`) before returning it to the model as a tool
message. Parallelism is governed by `groupParallelTools` (`parallel.ts`): wallet-bound tools
(`encode` class, `execute_tick`, and any `skill` with `requiresWallet`) are each run in their
own serialized batch, while non-wallet-bound tools are batched concurrently.

**Gaps found:**

- **Underscore-vs-dash route mismatch: NONE.** `PREFIX_MAP` maps `oss_forensics_` →
  `/v1/skills/oss-forensics/` and `osint_` → `/v1/skills/osint/` (etc.), and `routers.ts`
  registers exactly `/v1/skills/oss-forensics/investigate|commits|ioc|audit` and
  `/v1/skills/osint/{sec_edgar,usaspending,ofac_sdn,opencorporates,entity_resolve,courtlistener}`.
  All 27 skill tools resolve to a registered backend route. Every prefix (`evm_`, `stocks_`,
  `unbroker_`, `osint_`, `oss_forensics_`) has a corresponding mount in `createSkillRouters`.

- **`requiresWallet` / `requiresTokenId` gating: PRESENT** for skills, enforced server-side of
  the runtime in `runSkillTool`. Note the `requiresTokenId` fallback silently uses
  `ctx.session.lastTokenId`, so a tool proceeds if a session default token exists even when the
  agent omitted `tokenId`.

- **`requiresApiKey` (GITHUB_TOKEN) is NOT gated client-side.** The four `oss_forensics_*`
  tools declare `requiresApiKey:"GITHUB_TOKEN"`, but `runSkillTool` never checks it — the
  request is always sent and the backend reads `process.env.GITHUB_TOKEN` itself
  (`ghHeaders`). The agent only discovers a missing token after a failed call. (The value IS
  surfaced to the model as prompt metadata, see below.)

- **Capability metadata is NOT surfaced to the model.** `buildSystemPrompt` includes name,
  label, `[wallet/token/sign/friction]` tags, and `(os; context; requiresApiKey)` meta bits —
  but the `capabilities[]` arrays defined in `chat-tools.ts` (e.g. `["evm","wallet"]`,
  `["osint","edgar"]`, `["forensics","supply-chain"]`) are never rendered into the system prompt
  nor into the function `description` (`tools.ts` uses `t.hint`, not `t.capabilities`). The
  model therefore sees capability tags nowhere. Other defined fields (`hint`, `friction`,
  `encodeOnly`) are likewise not all exposed (only `friction` as a tag and `encodeOnly`/`sign`).

- **An agent CANNOT ask the user a question via a tool.** There is no `ask_user`/clarify tool in
  `CHAT_TOOL_CATALOG`. The only mechanism is the textual convention in the system prompt:
  "If any required tool parameter is missing or ambiguous, STOP... Ask with exactly:
  `NEED: <param> — <what you need>`." The agent emits plain text and relies on the frontend to
  parse `NEED:`; there is no structured, reliable question round-trip. This is a real
  interaction gap for ambiguous-input scenarios.

- **Double truncation.** Skill results are capped by `capArrays` (arrays→20) and again by
  `compressToolContent` (`session.ts`, 6000-char hard cap / 1200-char soft JSON-summary) when
  history is serialized. Long skill responses can be lossily compressed before they reach the
  model.

---

## 2. CAPABILITY INVENTORY (all 39 tools, grouped by class)

Values pulled directly from `packages/config/src/chat-tools.ts`. `capabilities`/`os`/`context`/
`requiresApiKey` shown blank when undefined. `requiresWallet`/`requiresTokenId` default to
`false` per the `skill()`/`tool()` helpers.

### READ (4)
| name | class | requiresWallet | requiresTokenId | capabilities | os | context | requiresApiKey |
|---|---|---|---|---|---|---|---|
| list_my_agents | read | true | false | — | — | — | — |
| vault_balance | read | false | true | — | — | — | — |
| agent_metadata | read | false | true | — | — | — | — |
| event_history | read | false | false | — | — | — | — |

### ENCODE (3)
| name | class | requiresWallet | requiresTokenId | capabilities | os | context | requiresApiKey |
|---|---|---|---|---|---|---|---|
| mint_agent | encode | true | false | — | — | — | — |
| deposit | encode | true | true | — | — | — | — |
| withdraw | encode | true | true | — | — | — | — |

### ORCHESTRATE (2)
| name | class | requiresWallet | requiresTokenId | capabilities | os | context | requiresApiKey |
|---|---|---|---|---|---|---|---|
| execute_tick | orchestrate | false | false | — | — | — | — |
| simulate_tick | orchestrate | false | false | — | — | — | — |

### ARCHIVE (3)
| name | class | requiresWallet | requiresTokenId | capabilities | os | context | requiresApiKey |
|---|---|---|---|---|---|---|---|
| archive_lookup | archive | false | false | — | — | — | — |
| archive_account_tweets | archive | false | false | — | — | — | — |
| archive_confirm_deletion | archive | false | false | — | — | — | — |

### SKILL (27)
| name | class | requiresWallet | requiresTokenId | capabilities | os | context | requiresApiKey |
|---|---|---|---|---|---|---|---|
| evm_wallet | skill | false | false | evm, wallet | — | reads default provider chain | — |
| evm_multichain | skill | false | false | evm, multichain | — | reads multiple EVM chains | — |
| evm_tx | skill | true | false | evm, tx | — | reads default provider chain | — |
| evm_token | skill | false | false | evm, token | — | reads default provider chain | — |
| evm_gas | skill | false | false | evm, gas | — | reads default provider chain | — |
| evm_whale | skill | false | false | evm, whale | — | reads default provider chain | — |
| evm_contract | skill | false | false | evm, contract | — | reads default provider chain | — |
| evm_allowance | skill | true | false | evm, allowance | — | reads default provider chain | — |
| unbroker_simulate | skill | false | true | — | — | — | — |
| unbroker_route | skill | false | true | — | — | — | — |
| unbroker_analyze | skill | false | true | — | — | — | — |
| unbroker_execute | skill | true | true | — | — | — | — |
| stocks_quote | skill | false | false | — | — | — | — |
| stocks_search | skill | false | false | — | — | — | — |
| stocks_history | skill | false | false | — | — | — | — |
| stocks_compare | skill | false | false | — | — | — | — |
| stocks_crypto | skill | false | false | — | — | — | — |
| osint_sec_edgar | skill | false | false | osint, edgar | — | external OSINT APIs | — |
| osint_usaspending | skill | false | false | osint, usaspending | — | external OSINT APIs | — |
| osint_ofac_sdn | skill | false | false | osint, ofac | — | external OSINT APIs | — |
| osint_opencorporates | skill | false | false | osint, opencorporates | — | external OSINT APIs | — |
| osint_entity_resolve | skill | false | false | osint, entity-resolve | — | external OSINT APIs | — |
| osint_courtlistener | skill | false | false | osint, courtlistener | — | external OSINT APIs | — |
| oss_forensics_investigate | skill | false | false | forensics, supply-chain | linux | network egress | GITHUB_TOKEN |
| oss_forensics_commits | skill | false | false | forensics, commits | linux | network egress | GITHUB_TOKEN |
| oss_forensics_ioc | skill | false | false | forensics, ioc | linux | network egress | GITHUB_TOKEN |
| oss_forensics_audit | skill | false | false | forensics, audit | linux | network egress | GITHUB_TOKEN |

### ASK (1) — added in this change
| name | class | requiresWallet | requiresTokenId | capabilities | os | context | requiresApiKey |
|---|---|---|---|---|---|---|---|
| ask_user | ask | false | false | ask, clarify | — | yields to user mid-turn | — |

`ask_user` is a first-class `ChatToolClass`. Its executor (`runAskTool`) performs **no I/O** —
it returns a structured `{ ask:true, question, options[], multiSelect, selectable:true }` that the
frontend renders as the `AskUserCard` (2–4 one-tap options). The agent pauses for the answer
rather than inventing one, satisfying active-questioning best practice.

---

**Summary:** All 27 skill tools resolve to valid backend routes (no underscore/dash mismatch), wallet/token gating is enforced for skills, and `ask_user` now gives the agent a structured
clarify-and-wait capability (replacing the fragile `NEED:` text convention). Remaining gaps:
`requiresApiKey` (GITHUB_TOKEN) is still ungated client-side (F-5), and the rich `capabilities[]`
metadata — previously invisible — is **now surfaced to the model** via a `caps:<csv>` tag in the
system prompt (F-19, fixed this change).
