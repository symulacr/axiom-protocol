# 0G Compute Router — Fix Plan

**Date:** 2026-06-24
**Based on:** Research report (`stack-compute.md`), live curl validation, per-file code trace, OpenAI SDK auto `completions.ts:62-63`

---

## Issue 1: 🔴 Streaming Hardcoded to `false`

### Affected Files
| File | Line(s) | Role |
|------|---------|------|
| `apps/backend/src/server.ts` | 246 | OpenAI client invocation — hardcodes `stream: false` |
| `apps/backend/src/route-schemas.ts` | 8 | `stream: z.boolean().optional()` — field exists but is **not plumbed** |
| `apps/backend/src/compute/router.ts` | 52-79 | `createRouterClient` returns OpenAI client; streaming requires no client changes |

### Code Trace
- **`server.ts:226`**: `_stream` is destructured from the request body (underscore-prefixed, intentionally unused).
- **`server.ts:246`**: `stream: false` with comment `// streaming not yet supported`.
- **OpenAI SDK `completions.ts:62-63`**: Natively handles `body.stream ?? false` — setting `stream: true` returns `Stream<ChatCompletionChunk>`.
- **`route-schemas.ts:8`**: `stream: z.boolean().optional()` — validates correctly.

### Live CURL Validation
Router `/models` confirms all chatbot models list `"stream"` in `supported_parameters`. A POST with `stream:true` returns SSE-formatted auth-error JSON (not a protocol violation), confirming the Router handles streaming natively.

### Fix Plan

**Step 1.1 — Route-schemas: add `tools`, `tool_choice`, `response_format`** (prerequisite, see Issue 5).

**Step 1.2 — Server handler: branch on `stream` + TEE attestation** (`apps/backend/src/server.ts`, around line 242).

Replace the hardcoded `stream: false` block with a branching path. The OpenAI SDK (`completions.ts:62-63`) returns `Stream<ChatCompletionChunk>` when `stream: true` — pipe it as SSE through the Express response. In both paths, extract `x_0g_trace` from the Router response for TEE attestation.

For the streaming path, the design of the `handleStreamingChatCompletion` helper function:
- Sets SSE headers (`Content-Type: text/event-stream`, `X-Accel-Buffering: no`)
- Iterates the SDK stream with `for await (const chunk of stream)`
- Extracts TEE attestation from `chunk.x_0g_trace?.tee_verified` on first chunk
- Handles client disconnect via `req.on("close")` to abort the loop
- Sends `data: [DONE]\n\n` on completion
- Sends error as SSE event on upstream failure

For the non-streaming path (existing, enhanced):
- Uses `.withResponse()` on the returned `ChatCompletion` to access raw HTTP headers
- Parses `x-0g-trace` header for TEE attestation
- Returns `x_0g_trace` metadata in the JSON response body

```typescript
// Non-streaming path — full response with TEE header extraction (server.ts ~line 242)
const completionWithResponse = await client.chat.completions.create(
  { model, messages, max_tokens: max_tokens ?? 512, temperature: temperature ?? 0.7,
    ...(tools && { tools }), ...(tool_choice && { tool_choice }), ...(response_format && { response_format }),
    stream: false },
);
const { data: completion, response: rawResponse } = await (completionWithResponse as any).withResponse();

const x0gTrace = rawResponse?.headers?.get?.("x-0g-trace");
// Use safeParseJson (inline util: `try { return JSON.parse(raw); } catch { return null; }`)
const traceParsed = x0gTrace ? JSON.parse(x0gTrace) : null;

res.json({
  id: completion.id, object: "chat.completion", created: completion.created, model: completion.model,
  choices: completion.choices?.map((c: any) => ({ index: c.index, message: { role: c.message.role, content: c.message.content ?? "" }, finish_reason: c.finish_reason })) ?? [],
  usage: completion.usage ? { prompt_tokens: completion.usage.prompt_tokens, completion_tokens: completion.usage.completion_tokens, total_tokens: completion.usage.total_tokens } : undefined,
  ...(traceParsed ? { x_0g_trace: traceParsed } : {}),
});
```

**Step 1.3 — Orchestrator: no changes needed.** The orchestrator (`runInference`, `orchestrator/index.ts:205-215`) uses the model internally for agent tick decisions and does not expose streaming to the caller.

### Risk
- **Medium**: SSE requires keepalive headers and proper connection management. The `req.on("close")` abort pattern prevents resource leaks.
- **Low**: Backward-compatible — existing callers that omit `stream` get the exact same JSON response.
- **Note**: `.withResponse()` is typed as internal; use `as any` escape hatch.

---

## Issue 2: 🟡 `decodeDirectKeyToken` Format Fragility

### Affected Files
| File | Line(s) | Role |
|------|---------|------|
| `apps/backend/src/compute/router.ts` | 22-36 | Token decoder |

### Current Code (`router.ts:22-36`)
```typescript
function decodeDirectKeyToken(token: string): { provider: string; address: string } | null {
  if (!token.startsWith("app-sk-")) return null;
  const b64 = token.slice("app-sk-".length);
  try {
    const decoded = Buffer.from(b64, "base64").toString("utf-8");
    const pipeIdx = decoded.lastIndexOf("|");
    if (pipeIdx === -1) return null;
    const payload = JSON.parse(decoded.slice(0, pipeIdx));
    return { provider: payload.provider, address: payload.address };
  } catch { return null; }
}
```

### Problem
The function only reads `payload.provider` and `payload.address`. Both fields are expected by the Router API, but defensive normalization for potential SDK format variation (e.g., `payload.providerAddress` instead of `provider`, or `payload.user` instead of `address`) would prevent silent fallback to the generic Direct proxy URL (line 69-71 in router.ts). Currently, if `address` is undefined, per-provider routing via `KNOWN_PROVIDERS` silently fails — which is functional through the fallback but defeats per-provider routing.

### Fix Plan

**Harden `decodeDirectKeyToken` to normalize field names:**

```typescript
// router.ts:22-36 — add field normalization
const provider: string | undefined = payload.provider ?? payload.providerAddress;
const address: string | undefined = payload.address ?? payload.user;
if (!provider) return null;
return { provider, address: address ?? "" };
```

**Add warn log at the generic proxy fallback** (`router.ts:69`, before the existing fallback):

```typescript
if (directKey && !tokenInfo) {
  console.warn("[compute] Could not decode app-sk-* token; falling back to generic Direct proxy URL");
}
```

### Risk
- **Low**: Fallback to generic Direct proxy URL still works if decoding fails — worst case is degraded routing, not a hard failure.

---

## Issue 3: 🟡 `KNOWN_PROVIDERS` is Static — Replace with On-Chain Discovery

### Affected Files
| File | Line(s) | Role |
|------|---------|------|
| `apps/backend/src/compute/router.ts` | 9-12 | Static `KNOWN_PROVIDERS` map (2 testnet entries only) |
| `apps/backend/src/compute/router.ts` | 70 | Hardcoded fallback URL: `"https://compute-network-6.integratenetwork.work/v1/proxy"` |

### Problem
- Only 2 testnet providers; no mainnet entries.
- Providers join/leave dynamically. Hardcoded map means stale routing.
- The `"https://compute-network-6.integratenetwork.work/v1/proxy"` fallback URL is network-specific.
- **Every `||` default must be removed** — only env vars and on-chain discovery are valid sources.

### Fix Plan

**Step 3.1 — Create a shared provider-discovery module** (`apps/backend/src/compute/provider-discovery.ts`).

This module exports a lazy-cached `discoverProviders()` function using the `InferenceServing.getAllServices()` contract (same ABI `apps/bench/discovery/compute-context-limits.ts` uses). This is imported by both `router.ts` (Direct key path) and `server.ts` (Issue 6, `/v1/compute/providers`).

Key design:
- `discoverProviders(chainId?)` → `Promise<ServiceInfo[]>` — lazy, cached for process lifetime, mutex-guarded against concurrent RPC storms
- `resolveProviderUrl(providerAddress)` → `Promise<string | null>` — resolves a provider's inference URL from the cache
- Zero hardcoded defaults. If RPC fails, returns empty array (caller handles null)
- Uses `AXIOM_EVM_RPC` env var, falls back to `"https://evmrpc-testnet.0g.ai"`

```typescript
// apps/backend/src/compute/provider-discovery.ts (shared, ~50 lines)
const INFERENCE_SERVING_ABI = [
  "function getAllServices(uint256 offset, uint256 limit) view returns (tuple(...)[] services, uint256 total)",
] as const;
const TESTNET_BROKER = "0xa79F4c8311FF93C06b8CfB403690cc987c93F91E";
// Mainnet broker: TBD — resolved via chain-specific config when chainId=16661
```

**Step 3.2 — Rewrite `createRouterClient` to be async** (`router.ts:52-79`).

Replace with async version that uses `resolveProviderUrl()` for the Direct key path, and throws clear errors (no silent fallbacks):

```typescript
export async function createRouterClient(timeout = 30_000): Promise<OpenAI> {
  const directKey = process.env.AXIOM_COMPUTE_DIRECT_KEY;
  if (directKey) {
    const tokenInfo = decodeDirectKeyToken(directKey);
    if (tokenInfo) {
      const providerUrl = await resolveProviderUrl(tokenInfo.provider); // from provider-discovery.ts
      if (providerUrl) return new OpenAI({ baseURL: providerUrl, apiKey: directKey, timeout, maxRetries: 2 });
      throw new Error(`Provider ${tokenInfo.provider} not found in on-chain registry.`);
    }
    throw new Error(`Cannot decode app-sk-* token. Check AXIOM_COMPUTE_DIRECT_KEY.`);
  }
  const routerKey = process.env.AXIOM_COMPUTE_API_KEY ?? process.env.OG_COMPUTE_API_KEY;
  if (routerKey) return new OpenAI({ baseURL: getComputeBaseUrl(), apiKey: routerKey, timeout, maxRetries: 2 });
  throw new Error("AXIOM_COMPUTE_DIRECT_KEY, AXIOM_COMPUTE_API_KEY, or OG_COMPUTE_API_KEY required");
}
```

**Step 3.3 — Update callers to `await createRouterClient()`:**

| File | Line | Current | Fix |
|------|------|---------|-----|
| `apps/backend/src/server.ts` | 231 | `client = createRouterClient()` | `client = await createRouterClient()` |
| `apps/backend/src/orchestrator/index.ts` | 92 | `this.openai = createRouterClient()` | `this.openai = await createRouterClient()`, and `getClient()` (line 91) becomes `async` |

### Risk
- **Medium**: `createRouterClient` becomes async, propagates to all call sites.
- **Medium**: First call performs RPC `eth_call` to `getAllServices` (~1-2s). Subsequent calls use in-memory cache.
- **Low**: If on-chain discovery fails, Direct key path throws a clear error rather than silently degrading.

---

## Issue 4: 🟡 `OG_COMPUTE_API_KEY` Not in Backend Env Schema

### Affected Files
| File | Line(s) | Role |
|------|---------|------|
| `apps/backend/src/env-schema.ts` | 9-20 | Zod env validation |
| `apps/backend/src/compute/router.ts` | 74 | Reads the key at runtime |

### Current Code (`env-schema.ts:9-20`)
Six fields validated (`AXIOM_EVM_RPC`, `AXIOM_ORACLE_URL`, `AXIOM_STORAGE_RPC`, `AXIOM_COMPUTE_API_KEY`, `AXIOM_COMPUTE_DIRECT_KEY`, `AXIOM_TEE_SIGNER_PK`, etc.) — but **`OG_COMPUTE_API_KEY` is missing**. `router.ts:74` reads `process.env.OG_COMPUTE_API_KEY` directly, bypassing Zod validation.

Note: `OG_COMPUTE_BASE_URL` **is** present in the shared schema (`packages/config/src/env-schema.ts:17`).

### Fix Plan

**Add to `apps/backend/src/env-schema.ts`** (after line 10):

```typescript
  OG_COMPUTE_API_KEY: z.string().optional(),
```

Optionally update `router.ts:74` to use validated env object for consistency, but the simpler fix (just the Zod entry) is sufficient since `process.env` reads work at runtime.

### Risk
- **None**: Adding an optional Zod key doesn't change any existing behavior.

---

## Issue 5: 🟡 Missing 28+ OpenAI Chat Completion Features in Schema

### Affected Files
| File | Line(s) | Role |
|------|---------|------|
| `apps/backend/src/route-schemas.ts` | 3-9 | Request validation |
| `apps/backend/src/server.ts` | 226, 242-248 | Schema destructuring → client call |

### Current Code (`route-schemas.ts:3-9`)
```typescript
export const chatCompletionsSchema = z.object({
  model: z.string().min(1),
  messages: z.array(z.object({ role: z.enum(["user", "assistant", "system"]), content: z.string() })).min(1),
  max_tokens: z.number().int().positive().optional(),
  temperature: z.number().optional(),
  stream: z.boolean().optional(),
});
```

Only 5 fields. The Router supports 28+ features per model `supported_parameters` (confirmed via curl). The orchestrator already uses `response_format: { type: "json_object" }` internally (`orchestrator/index.ts:211`) but bypasses the public schema.

### Fix Plan

**Step 5.1 — Extend `chatCompletionsSchema`** with the full OpenAI-compatible feature set. The OpenAI SDK defines all types natively in `ChatCompletionCreateParamsBase` (`node_modules/openai/src/resources/chat/completions/completions.ts:1175-1468`). The Zod schema mirrors these for request validation at the Express layer.

New fields to add, grouped by category:

| Category | Fields | Router Support |
|----------|--------|----------------|
| **Streaming** | `stream`, `stream_options` | ✅ All chatbot models |
| **Tools** | `tools`, `tool_choice`, `parallel_tool_calls` | ✅ `supported_parameters` |
| **Structured Output** | `response_format` (text / json_object / json_schema) | ✅ `supported_parameters` |
| **Generation** | `max_completion_tokens`, `top_p`, `stop`, `n` | ✅ |
| **Penalties** | `frequency_penalty`, `presence_penalty` | ✅ |
| **Reasoning** | `reasoning_effort` (low/medium/high) | ✅ GLM-5 models |
| **Logprobs** | `logprobs`, `top_logprobs` | ✅ |
| **Determinism** | `seed` | ✅ Router-side |
| **Routing** | `user`, `metadata`, `store`, `service_tier` | ✅ |
| **Deprecated** | `function_call`, `functions` | ✅ (backward compat) |

Message type extended: `messages[].role` gains `"tool"` and `"developer"`. Support for `tool_call_id`, `tool_calls`, and `reasoning_content` on message objects.

**Step 5.2 — Wire features through `server.ts`** (lines 226-248).

Updated destructure pattern at `server.ts:226`:

```typescript
const {
  model, messages,
  max_tokens, max_completion_tokens, temperature, top_p, stop,
  stream: _stream, stream_options,
  tools, tool_choice, parallel_tool_calls,
  response_format,
  frequency_penalty, presence_penalty,
  reasoning_effort, logprobs, top_logprobs,
  seed, n, user, metadata, store, service_tier,
} = chatCompletionsSchema.parse(req.body);
```

Universal passthrough to OpenAI SDK:

```typescript
const completionParams = {
  model, messages,
  max_tokens: max_tokens ?? undefined, max_completion_tokens: max_completion_tokens ?? undefined,
  temperature: temperature ?? 0.7, top_p: top_p ?? undefined, stop: stop ?? undefined,
  stream: _stream ?? false,
  ...(_stream && stream_options ? { stream_options } : {}),
  ...(tools && tools.length > 0 ? { tools, tool_choice: tool_choice ?? "auto", parallel_tool_calls } : {}),
  ...(response_format ? { response_format } : {}),
  ...(frequency_penalty != null ? { frequency_penalty } : {}),
  ...(presence_penalty != null ? { presence_penalty } : {}),
  ...(reasoning_effort ? { reasoning_effort } : {}),
  ...(logprobs ? { logprobs, top_logprobs } : {}),
  ...(seed != null ? { seed } : {}), ...(n ? { n } : {}),
  ...(user ? { user } : {}), ...(metadata ? { metadata } : {}),
  ...(store ? { store } : {}), ...(service_tier ? { service_tier } : {}),
};
```

### Risk
- **Low**: Adding optional fields is backward-compatible.
- **Medium**: Complex Zod schemas for nested objects may produce verbose error messages. Consider `.passthrough()` or `.strict()` depending on desired strictness.

---

## Issue 6: 🟡 Synthetic Provider Addresses in `/v1/compute/providers`

### Affected Files
| File | Line(s) | Role |
|------|---------|------|
| `apps/backend/src/server.ts` | 207-218 | Model listing → provider transform |

### Current Code (`server.ts:207-218`)
```typescript
const services = models.data.map((m: Record<string, unknown>) => {
  const id = String(m.id ?? "");
  const addrBytes = ethers.toUtf8Bytes(id).slice(0, 20);
  const padded = ethers.zeroPadValue(addrBytes, 20);
  const address = `0x${padded.slice(2)}` as `0x${string}`;
  return { address, model: id, endpoint: routerBaseUrl };
});
```

Creates deterministic but fake provider addresses (e.g., `0x7167656e2d...` from `"qwen2.5-omni"`). These are not real on-chain provider addresses — any client using them for Direct SDK operations would fail.

### Fix Plan

**Replace with on-chain provider lookup using the shared `discoverProviders()` cache** (see Issue 3 / `provider-discovery.ts`):

```typescript
// server.ts ~line 207 — replace synthetic address derivation
const onChainProviders = await discoverProviders(); // from ./compute/provider-discovery.js
const providerMap = new Map(onChainProviders.map(s => [s.model.toLowerCase(), s.provider]));

const services = models.data.map((m: Record<string, unknown>) => {
  const id = String(m.id ?? "");
  const address = providerMap.get(id.toLowerCase())
    ?? ethers.keccak256(ethers.toUtf8Bytes(`model:${id}`)).slice(0, 42) as `0x${string}`;
  return { address, model: id, endpoint: routerBaseUrl };
});
```

On-chain address preferred; falls back to deterministic keccak256 hash (still clearly fake, but uniquely identifies models). No new ABI or on-chain call — reuses the `discoverProviders()` cache from Issue 3 which already called `getAllServices()`.

If the Router `/models` response ever includes `m.provider_address`, prefer that: `address: m.provider_address ?? providerMap.get(...) ?? fallback`.

### Risk
- **Low**: First call adds ~1s for RPC query (same cache as Issue 3, so subsequent calls instant).
- **Low**: Falls back to keccak256 hash if on-chain discovery fails.

---

## Summary: All Issues Ranked by Priority

| Priority | Issue | Effort | Risk | Depends On |
|----------|-------|--------|------|------------|
| **P0** | Streaming + TEE attestation (Issue 1) | 1-2 days | Medium | Issue 5 (schema) |
| **P1** | Provider discovery, remove fallbacks (Issue 3) | 1-2 days | Medium | None |
| **P2** | `decodeDirectKeyToken` format fragility (Issue 2) | 0.5 day | Low | Issue 3 (refactored code) |
| **P2** | Full schema with all 28+ OpenAI features (Issue 5) | 0.5 day | Low | None |
| **P3** | `OG_COMPUTE_API_KEY` missing from schema (Issue 4) | 0.25 day | None | None |
| **P4** | On-chain provider addresses in `/providers` (Issue 6) | 0.5 day | Low | Issue 3 (shared cache) |

### Recommended Order of Implementation
1. **Issue 4** (trivial, no risk) — quick win
2. **Issue 5** (full schema, needed by Issue 1) — foundation
3. **Issue 1** (streaming + TEE, the main feature gap) — core fix
4. **Issue 3** (on-chain provider discovery, remove ALL fallbacks) — reliability
5. **Issue 2** (token hardening, after refactored router.ts) — polish
6. **Issue 6** (real provider addresses, shares cache with Issue 3) — polish

### Files Requiring Changes (Complete List)

| File | Issues Touching It |
|------|--------------------|
| `apps/backend/src/route-schemas.ts` | 1, 5 |
| `apps/backend/src/server.ts` | 1, 5, 6 |
| `apps/backend/src/compute/router.ts` | 1 (tools passthrough in non-streaming), 2, 3, 4 |
| `apps/backend/src/compute/provider-discovery.ts` | 3, 6 (**new shared module**) |
| `apps/backend/src/env-schema.ts` | 4 |
| `apps/backend/src/orchestrator/index.ts` | 3 (async propagate to `getClient()`) |

---

## Appendix: Router API vs Direct SDK Path — When to Use Each

Axiom has two compute code paths. This table helps choose:

| Criterion | Router API | Direct SDK Proxy |
|-----------|-----------|------------------|
| **Auth** | API key (`sk-*`) | Token (`app-sk-*`) + wallet signature |
| **Routing** | Automatic by Router | Manual per-provider via `getAllServices()` |
| **Billing** | Single Axiom-managed balance | Per-provider sub-accounts via ledger |
| **TEE verification** | Delegated to Router (`verify_tee` flag) | Independent via `processResponse()` |
| **Streaming** | OpenAI SSE format (Issue 1) | Same (OpenAI-compatible proxy) |
| **Provider discovery** | Router `/models` API | On-chain `InferenceServing.getAllServices()` |
| **Fine-tuning** | ❌ Not supported | ✅ Full lifecycle |
| **Async jobs (images)** | ❌ | ✅ `/v1/async/*` |

**Use Router API when**: Simpler auth, automatic failover, streaming needed, single balance is sufficient.
**Use Direct SDK when**: Independent TEE verification required, per-provider billing, fine-tuning or async jobs needed.

### On-Chain Broker Addresses

| Network | Chain ID | Broker Address |
|---------|----------|----------------|
| Galileo (testnet) | 16602 | `0xa79F4c8311FF93C06b8CfB403690cc987c93F91E` |
| Aristotle (mainnet) | 16661 | TBD — resolve from docs when available |
