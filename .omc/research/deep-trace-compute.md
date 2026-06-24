# Exhaustive Deep-Trace Report: 0G Compute Router Integration

**Date:** 2026-06-24
**Scope:** Full call chain from HTTP request down to OpenAI SDK, including orchestrator, env config, and unintegrated features
**Method:** Static code analysis + upstream SDK source inspection + official 0G documentation audit

---

## 1. FULL CALL CHAIN DIAGRAM

```
HTTP REQUEST
  │
  ├─ POST /v1/compute/chat/completions
  │   │  server.ts:225
  │   │  Schema: chatCompletionsSchema ({ model, messages, max_tokens, temperature, stream })
  │   │
  │   ├─ createRouterClient()
  │   │   │  router.ts:231
  │   │   │
  │   │   ├─ [Direct SDK path] AXIOM_COMPUTE_DIRECT_KEY present (app-sk-*)
  │   │   │   ├─ decodeDirectKeyToken() → extracts { provider, address }
  │   │   │   ├─ KNOWN_PROVIDERS[tokenInfo.provider] → per-provider inference URL
  │   │   │   │   → new OpenAI({ baseURL: `${url}/v1/proxy`, apiKey, timeout, maxRetries: 2 })
  │   │   │   └─ fallback: AXIOM_COMPUTE_BASE_URL or default
  │   │   │       → new OpenAI({ baseURL, apiKey, timeout, maxRetries: 2 })
  │   │   │
  │   │   └─ [Router API path] AXIOM_COMPUTE_API_KEY | OG_COMPUTE_API_KEY
  │   │       ├─ getComputeBaseUrl()
  │   │       │   ├─ OG_COMPUTE_BASE_URL env → explicit override
  │   │       │   ├─ AXIOM_CHAIN_ID === 16661 → https://router-api.0g.ai/v1
  │   │       │   └─ default → https://router-api-testnet.integratenetwork.work/v1
  │   │       └─ new OpenAI({ baseURL, apiKey, timeout, maxRetries: 2 })
  │   │
  │   ├─ client.chat.completions.create({
  │   │     model,
  │   │     messages,
  │   │     max_tokens: max_tokens ?? 512,
  │   │     temperature: temperature ?? 0.7,
  │   │     stream: false,  // ← HARDCODED, ignores user's stream param
  │   │   })
  │   │   │  → POST {baseURL}/chat/completions (OpenAI SDK)
  │   │   │  → OpenAI SDK: retries 408/409/429/5xx up to 2 times with exponential backoff
  │   │   │  → Returns ChatCompletion (not Stream)
  │   │   │
  │   │   └─ Result mapped to: { id, object, created, model, choices, usage }
  │   │
  │   └─ Error handling:
  │       ├─ ZodError → 400 with issues
  │       ├─ createRouterClient() throws → 401 with help text
  │       ├─ OpenAI SDK error with .status 400-499 → pass-through
  │       └─ other → next(err) → global handler
  │           ├─ err.status exists → that status
  │           ├─ msg matches /oracle|0g/i → 502
  │           └─ else → 500
  │
  ├─ GET /v1/compute/providers
  │   │  server.ts:200
  │   │  Calls {routerBaseUrl}/models
  │   │  Transforms model list into { address, model, endpoint } format
  │   │  ⚠ Address is deterministically derived from model ID string (not on-chain)
  │   │
  ├─ POST /v1/orchestrator/tick
  │   │  server.ts:618
  │   │  Schema: tickSchema ({ vault, agentNft, agentTokenId, computeModel, ... })
  │   │
  │   └─ StrategyRunner.runTick(spec, signal)
  │       │  orchestrator/index.ts:99
  │       │
  │       ├─ Promise.all([
  │       │   this.runInference(),
  │       │   this.fetchOnchainState(),
  │       │   this.fetchStoragePeek()
  │       │ ])
  │       │
  │       ├─ runInference()
  │       │   │  Builds system+user messages
  │       │   │  Calls this.getClient() → createRouterClient() (lazy init)
  │       │   │  Uses response_format: { type: "json_object" } ← OpenAI SDK FEATURE!
  │       │   │  Returns completion.choices[0].message.content
  │       │   └─ Errors propagate → whole Promise.all fails → 500
  │       │
  │       ├─ fetchOnchainState()
  │       │   │  Reads vault balance + strategyOf, recent events (last 2000 blocks)
  │       │   ╰─ Graceful: returns zeros if no vault configured
  │       │
  │       ├─ fetchStoragePeek()
  │       │   │  Downloads blob from 0G Storage if modelDataRoot is non-zero
  │       │   ╰─ Devnet: always returns { rootHash: "0x00...", size: 0 }
  │       │
  │       ├─ parseRecommendation(rawModelOutput)
  │       │   │  JSON.parse → validate action/amount/reason
  │       │   ╰─ NEVER throws: catches all, falls back to { action:"hold", reason:"..." }
  │       │
  │       └─ settleOnChain()
  │           │  vault.execute() with no-op data (target=vault, value=0, data="0x")
  │           │  Single-leaf Merkle tree (proof=[])
  │           ╰─ ERROR HANDLING: .catch() wraps errors → returns failed execution record
  │               NEVER propagates. BUT if vault address unconfigured → throws → .catch() catches it.
  │
  └─ Error handling gap:
      If runInference() fails, the entire Tick fails with 500.
      No retry, no fallback model, no circuit breaker.
```

---

## 2. EVERY FUNCTION — INPUTS, OUTPUTS, ERROR PATHS

### `getComputeBaseUrl()` — `compute/router.ts:44`
| Aspect | Detail |
|--------|--------|
| **Params** | None |
| **Inputs** | `process.env.OG_COMPUTE_BASE_URL`, `process.env.AXIOM_CHAIN_ID` |
| **Returns** | string URL |
| **Logic** | 1. `OG_COMPUTE_BASE_URL` set → return it. 2. chainId=16661 → mainnet. 3. else → testnet. |
| **Error path** | None. Always returns a string. If `AXIOM_CHAIN_ID` is unparseable → `NaN !== 16661` → testnet fallback. |
| **Risk** | ⚠ `OG_COMPUTE_BASE_URL` not `AXIOM_COMPUTE_BASE_URL`. `.env.example` documents `AXIOM_COMPUTE_BASE_URL` as Direct SDK proxy URL. The naming conflict is confusing. |

### `decodeDirectKeyToken()` — `compute/router.ts:19`
| Aspect | Detail |
|--------|--------|
| **Params** | `token: string` |
| **Inputs** | Token string from `AXIOM_COMPUTE_DIRECT_KEY` |
| **Returns** | `{ provider: string; address: string } \| null` |
| **Logic** | 1. Must start with `app-sk-`. 2. Base64-decode remainder. 3. Split on last `\|`. 4. JSON.parse payload. |
| **Error path** | Catches all errors → returns `null`. Silent — no console.warn. |
| **Risk** | ⚠ If token format changes (e.g., new SDK version), silently falls back to generic proxy URL. No indication to developer. |

### `createRouterClient()` — `compute/router.ts:53`
| Aspect | Detail |
|--------|--------|
| **Params** | `timeout: number = 30_000` |
| **Inputs** | `AXIOM_COMPUTE_DIRECT_KEY`, `AXIOM_COMPUTE_API_KEY`, `OG_COMPUTE_API_KEY` |
| **Returns** | `OpenAI` instance |
| **Logic** | 1. Direct key → per-provider URL or generic proxy. 2. Router key → Router base URL. 3. None → throw. |
| **Error path** | `throw new Error("AXIOM_COMPUTE_DIRECT_KEY, ... required")` — string message, no structured error class. |
| **Retries** | `maxRetries: 2` always set on the OpenAI client. |
| **Side effects** | Every call creates a **new** `OpenAI` instance. No client pooling. No connection validation at creation time (key not tested until first API call). |

### `StrategyRunner.runTick()` — `orchestrator/index.ts:99`
| Aspect | Detail |
|--------|--------|
| **Params** | `strategy: StrategySpec`, `signal: MarketSignal` |
| **Returns** | `Promise<TickResult>` |
| **Logic** | Parallel fan-out: inference + on-chain state + storage peek. Then parse + settle. |
| **Error path** | If `runInference()` rejects → entire `Promise.all` rejects → `server.ts:650` propagates → 500. |
| **Missing** | No timeout on any sub-operation. No fallback inference provider. No partial results on failure. |

### `runInference()` — `orchestrator/index.ts:205`
| Aspect | Detail |
|--------|--------|
| **Params** | `strategy: StrategySpec`, `signal: MarketSignal` |
| **Inputs** | System prompt from strategy, user prompt from signal payload |
| **Returns** | `Promise<string>` — raw model output |
| **SDK call** | `this.getClient().chat.completions.create({ model, messages, response_format: { type: "json_object" } })` |
| **Error path** | Uncaught. Propagates to `runTick`. |
| **Risk** | ⚠ `response_format: { type: "json_object" }` is sent always. If model doesn't support JSON mode → Router returns 400. Has `response_format` works for the specified model, but there's no graceful degradation. The `signal` param's `source` and `emittedAt` fields are unused in the prompt. |

### `parseRecommendation()` — `orchestrator/index.ts:135`
| Aspect | Detail |
|--------|--------|
| **Params** | `rawModelOutput: string` |
| **Returns** | `TickResult["recommendation"]` — always valid |
| **Error path** | `try { JSON.parse } catch` → returns `{ action: "hold", reason: "Model output not parseable..." }` |
| **Stability** | ⭐ Never throws. Production-safe. |

### `settleOnChain()` — `orchestrator/index.ts:155`
| Aspect | Detail |
|--------|--------|
| **Params** | `strategy: StrategySpec`, `action: string` |
| **Logic** | Always uses `target=vaultAddr, value=0, data="0x"` — a no-op. The `action` param is logged but NOT used in the transaction. |
| **Proof** | Empty proof array (single-leaf Merkle tree). No actual strategy validation on-chain. |
| **Error path** | No vault addr → throws. Otherwise wrapped in `.catch()` by caller. |
| **Risk** | The `action` param is completely ignored. A "buy" and "sell" produce identical on-chain transactions. Only informational. |

---

## 3. WHAT THE OPENAI SDK SUPPORTS THAT AXIOM DOES NOT USE

Based on `ChatCompletionCreateParamsBase` (`node_modules/openai/src/resources/chat/completions/completions.ts`):

| Feature | OpenAI SDK Field | Used? | Where Used / Gap |
|---------|-----------------|-------|------------------|
| **Streaming** | `stream: true` | ❌ | `server.ts:246` hardcodes `stream: false`. The Router supports SSE streaming. Comment says "streaming not yet supported" — but Router docs confirm `stream: true` works with OpenAI SSE format. |
| **Tool Calling** | `tools: ChatCompletionTool[]` | ❌ | Not used anywhere. Router docs explicitly support tool calling with `tools`/`tool_choice`. Models advertise capability flags. |
| **Tool Choice** | `tool_choice: 'none' \| 'auto' \| 'required' \| ChatCompletionNamedToolChoice` | ❌ | Not used. |
| **Structured Outputs** | `response_format: { type: "json_schema", json_schema: {...} }` | ❌ | Only `json_object` is used in orchestrator. Never uses JSON Schema mode. |
| **JSON Mode** | `response_format: { type: "json_object" }` | ✅ (partial) | Used only in orchestrator `runInference()`. NOT used in public `/v1/compute/chat/completions` endpoint. |
| **Vision (image inputs)** | `messages[].content: ChatCompletionContentPartImage[]` | ❌ | Supported by the SDK and likely by some Router models, never used. |
| **Audio I/O** | `audio`, `modalities`, `ChatCompletionContentPartInputAudio` | ❌ | Router supports audio models. |
| **Reasoning Effort** | `reasoning_effort: 'low' \| 'medium' \| 'high'` | ❌ | Router supports reasoning models (e.g., GLM-5) that emit `reasoning_content`. |
| **Top P** | `top_p: number` | ❌ | Not exposed in API schema. |
| **Stop Sequences** | `stop: string \| string[]` | ❌ | Not exposed in API schema. |
| **Presence/Freq Penalty** | `presence_penalty`, `frequency_penalty` | ❌ | Not exposed. |
| **Logit Bias** | `logit_bias: Record<string, number>` | ❌ | Not exposed. |
| **Seed** | `seed: number` | ❌ | Not exposed. Router-side determinism support available. |
| **User** | `user: string` | ❌ | Not exposed. Useful for abuse detection and caching. |
| **N (multiple choices)** | `n: number` | ❌ | Not exposed. |
| **Logprobs** | `logprobs: boolean`, `top_logprobs: number` | ❌ | Not exposed. |
| **Max Completion Tokens** | `max_completion_tokens: number` (v2) | ❌ | Uses deprecated `max_tokens`. Newer reasoning models require `max_completion_tokens`. |
| **Metadata** | `metadata: Record<string,string>` | ❌ | Not used. |
| **Store** | `store: boolean` | ❌ | Not used. |
| **Stream Options** | `stream_options: { include_usage?: boolean }` | ❌ | Only relevant if streaming were enabled. |
| **Prediction** | `prediction: ChatCompletionPredictionContent` | ❌ | Not used. |
| **Web Search Tool** | `web_search_options` | ❌ | Router may support (OpenAI-compatible). |
| **Service Tier** | `service_tier: 'auto' \| 'default' \| 'flex'` | ❌ | Not used. |

### Response parsing opportunities missed:

| SDK Method | Status | Notes |
|------------|--------|-------|
| `completion.withResponse()` | ❌ | Returns `{ data, response, request_id }`. Axiom never accesses raw HTTP response headers from OpenAI SDK. This means it cannot read `ZG-Res-Key` header for TEE verification, or `x-0g-trace` for billing/provider info. |
| `completion.asResponse()` | ❌ | Raw Response access. |
| `new OpenAI().chat.completions.create(..., { stream: true })` returning `Stream<ChatCompletionChunk>` | ❌ | Router SSE streaming supported but not used. |

---

## 4. WHAT THE 0G COMPUTE SDK (`@0gfoundation/0g-compute-ts-sdk`) OFFERS THAT THE ROUTER PATH DOESN'T COVER

The SDK (Direct path) at npm `@0gfoundation/0g-compute-ts-sdk` v0.8.4 provides:

| Feature | SDK Method | Router Path | Axiom Uses? |
|---------|-----------|-------------|-------------|
| **Provider discovery** | `broker.inference.listService()` | Router auto-routes | ❌ `/v1/compute/providers` calls `/models` not `/listService`. Returns flat model list, not provider metadata. |
| **Service metadata** | `broker.inference.getServiceMetadata(addr)` | Not available | ❌ |
| **TEE attestation verification** | `broker.inference.verifyService(addr)` | Router `verify_tee` flag | ❌ Not used. Neither Router `verify_tee` flag nor SDK `processResponse` called. |
| **Response integrity** | `broker.inference.processResponse(addr, chatID)` | Router `x_0g_trace.tee_verified` | ❌ Axiom never accesses response headers. Cannot verify TEE signatures. |
| **On-chain fee settlement** | `broker.ledger.depositFund()` / `transferFund()` | Router handles billing silently | ❌ Router handles it. Axiom assumes it works. |
| **Per-provider sub-accounts** | `broker.ledger.transferFund(addr, service, amount)` | Single unified balance | ❌ |
| **Auth headers** | `broker.inference.getRequestHeaders(addr)` | `Authorization: Bearer sk-*` | ❌ Uses OpenAI SDK header injection. |
| **Async inference jobs** | `/v1/async/*` endpoints for images | Not via Router | ❌ |
| **Fine-tuning** | Full fine-tuning lifecycle | Not via Router | ❌ |
| **Background auto-funding** | Auto-tops-up provider sub-accounts | Not needed | ❌ |
| **SDK signature verification** | Full independent TEE verification | Router does delegated verify | ❌ |

**Key gap:** The Direct SDK's **provider discovery** (`listService()`) returns on-chain verified provider addresses, endpoints, model lists, pricing, and TEE attestation status. Axiom's `/v1/compute/providers` endpoint instead calls Router's `/models` endpoint which returns a flat model list, then **derives fake addresses** from model ID strings (`ethers.toUtf8Bytes(id).slice(0, 20)`). These are not real on-chain provider addresses.

---

## 5. EVERY DEAD / UNTESTED CODE PATH

### Path 1: `KNOWN_PROVIDERS` hardcoded map (`router.ts:12-15`)
Only 2 entries, both testnet. Never updated. If used in production (mainnet, chainId 16661), it falls through to the generic proxy URL without warning.

### Path 2: `decodeDirectKeyToken()` silent failure (`router.ts:27-33`)
If the `app-sk-*` token format evolves (as the SDK did when renamed from `@0glabs/0g-serving-broker`), the decode function returns `null` and the code silently falls back to the generic proxy URL. No console warning, no error log.

### Path 3: `stream: false` hardcode (`server.ts:246`)
The `_stream` variable is destructured from the request body with underscore prefix indicating intentional disuse. If the Router API changes or someone adds streaming support, this hardcode blocks it.

### Path 4: Orchestrator `settleOnChain()` ignores `action` parameter (`orchestrator/index.ts:155-200`)
The `action` string ("buy" | "sell" | "hold") is passed but completely ignored. Every on-chain execution is `value=0, data="0x"` against the vault itself. The action has zero on-chain impact.

### Path 5: `fetchStoragePeek()` always returns size 0 on devnet (`orchestrator/index.ts:267-273`)
The condition `strategy.modelDataRoot === ("0x" + "0".repeat(64))` matches the default value. No encrypted model data is ever stored or retrieved on devnet.

### Path 6: Singleton `StrategyRunner` init failure (`server.ts:150-158`)
If `StrategyRunner` constructor fails (e.g., unsupported chainId), `orchestratorHandle` stays `null`. All subsequent tick requests return 503.

### Path 7: Orchestrator OpenAI client NOT cached for Router API path
`getClient()` caches in `this.openai` instance variable. But the `server.ts` `/v1/compute/chat/completions` handler calls `createRouterClient()` on every request (line 231) — no cache, new OpenAI instance each time.

### Path 8: `response_format` in orchestrator for non-JSON-mode models
Always sends `response_format: { type: "json_object" }`. If the model doesn't support it → 400 error. No fallback to free-text parsing.

### Path 9: `_addRequestID` / `withResponse()` never used
The OpenAI SDK returns `_request_id` on every response object and `withResponse()` exposes raw HTTP headers. Axiom never reads these. Router's `x_0g_trace` (provider address, billing, TEE verification) is inaccessible.

### Path 10: `/v1/compute/providers` address derivation is fake
The endpoint generates deterministic but fake provider addresses from model ID strings. These addresses are NOT the actual on-chain provider addresses. Any client attempting to use these addresses for on-chain lookups or Direct SDK operations would fail.

---

## 6. RISK ASSESSMENT

| Risk | Severity | Details |
|------|----------|---------|
| **Router URL changes** | 🔴 HIGH | `getComputeBaseUrl()` reads `OG_COMPUTE_BASE_URL`. If this env points to a non-Router, non-OpenAI-compatible URL, ALL compute calls fail silently with cryptic errors. No URL validation at startup. |
| **API key is wrong** | 🔴 HIGH | `createRouterClient()` instantiates OpenAI without validating the key. The SDK only tests it on the first real API call. Error surfaces as 401 to the caller, but orchestrator has no 401-specific handling. The orchestrator would fail with a 500. |
| **Model doesn't support JSON mode** | 🟠 MEDIUM | Orchestrator always sends `response_format: { type: "json_object" }`. If model doesn't support it → 400. Orchestrator has no fallback to free-text mode. |
| **Router is down / network error** | 🟠 MEDIUM | OpenAI SDK retries 5xx/408/409/429 up to 2 times with ~2s exponential backoff. After that, error propagates. No circuit breaker, no caching, no failover. Every request creates a new connection. |
| **Streaming never enabled** | 🟠 MEDIUM | Large model responses buffered entirely in memory. No partial response delivery. WebSocket `/v1/stream` exists but is unrelated to compute streaming (only event broadcasting). |
| **Env var naming confusion** | 🟡 LOW | `OG_COMPUTE_BASE_URL` (Router) vs `AXIOM_COMPUTE_BASE_URL` (Direct SDK proxy) — documented in `.env.example` but easy to misconfigure. |
| **TEE attestation never verified** | 🟡 LOW | Neither `verify_tee` flag nor `processResponse()` are used. No cryptographic proof that responses came from genuine TEE. Acceptable for devnet/prototype but not for production DeFi. |
| **Provider addresses are fake** | 🟡 LOW | `/v1/compute/providers` returns synthesized addresses. No on-chain provider discovery. A "services" list cannot be used for Direct SDK access. |
| **Orchestrator inference failure → full tick failure** | 🟡 LOW | No partial results or fallback models. If compute fails, the tick fails entirely (500). |
| **`signal` parameter fields unused** | 🟢 INFO | `signal.source` and `signal.emittedAt` are never included in the prompt sent to the model. Only `signal.payload` is used. |

---

## 7. ARCHITECTURAL OBSERVATIONS

### 7.1 Secret resolution chain
```
createRouterClient()
  ├─ Direct Key (app-sk-*)  →  AXIOM_COMPUTE_DIRECT_KEY
  │   ├─ Known provider URL  →  per-provider inference endpoint
  │   └─ Fallback proxy URL  →  AXIOM_COMPUTE_BASE_URL or default
  └─ Router Key (sk-*)      →  AXIOM_COMPUTE_API_KEY / OG_COMPUTE_API_KEY
      └─ Router Base URL     →  OG_COMPUTE_BASE_URL or chain-based default
```

Two distinct authentication paths with different providers, different billing, different APIs. The code prefers Direct key over Router key. The `.env.example` documents Direct key as "PRIMARY".

### 7.2 Client creation
- `/v1/compute/chat/completions`: Creates new `OpenAI` instance per request (no caching)
- `/v1/orchestrator/tick`: Caches one `OpenAI` instance per `StrategyRunner` instance (created once at server start)

Two different patterns in the same codebase.

### 7.3 Response handling chain
```
Client sends POST /v1/compute/chat/completions
  → Express validates with Zod schema (strips unknown fields)
  → OpenAI SDK POSTs to Router (adds Authorization header, JSON body)
  → Router POSTs to provider (OpenAI-compatible)
  → Provider generates response
  → Router returns response + x_0g_trace metadata
  → OpenAI SDK parses JSON response, returns ChatCompletion object
  → Express maps to { id, object, created, model, choices, usage }
  → Returns JSON to client
```

The `x_0g_trace` (provider address, billing info, TEE verification) from the Router is completely lost — the OpenAI SDK parses the JSON but Axiom never accesses the raw response to extract Router-specific fields.

### 7.4 Tick execution chain
```
POST /v1/orchestrator/tick
  → runInference() : Promise<string>          ← compute from Router
  → fetchOnchainState() : onchain state       ← contract reads
  → fetchStoragePeek() : storage state        ← 0G Storage download
  → parseRecommendation() : recommendation    ← JSON.parse
  → settleOnChain() : execution record        ← vault.execute() no-op
```

Parallel fan-out for inference + on-chain + storage. Sequential for parse + settle. The `runInference` is the single point of failure — if it fails, the entire tick fails.

---

## 8. COMPARISON: ROUTER VS DIRECT — WHAT AXIOM IMPLEMENTS

| Capability | Router (current Axiom) | Direct (0G SDK) | Gap |
|------------|----------------------|------------------|-----|
| Auth | API key (sk-*) | Wallet signature per request | Wallet would enable browser dApps |
| Provider selection | Automatic by Router | Manual, on-chain verified | Router address derivation is fake |
| Billing | Single balance | Per-provider sub-accounts | Axiom assumes Router billing works |
| TEE verification | `verify_tee` flag (not used) | `processResponse()` SDK call | No verification at all |
| Streaming | Supported by Router (not used) | Manual fetch + SSE | Not implemented |
| Provider discovery | `/models` API | `listService()` SDK | Model list ≠ provider list |
| Error handling | OpenAI SDK retries (2x) | SDK retries + wallet auto-funding | No circuit breaker |
| Fine-tuning | Not applicable | Full support | Not applicable |

---

*End of deep-trace report.*
