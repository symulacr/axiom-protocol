#!/usr/bin/env bun
/**
 * generate-openapi.mjs — emit docs/openapi.json (OpenAPI 3.1.0) from the live zod schemas.
 *
 * Usage:
 *   bun scripts/generate-openapi.mjs            # writes apps/backend/docs/openapi.json
 *   bun run generate:openapi                    # same, via package.json
 *
 * The zod request schemas in ../src/route-schemas.ts and the skill schemas in
 * packages/config/src/skills/schemas.ts are the single source of truth — no duplicated
 * hand-written request specs. Response schemas live here (they were inline objects in the
 * handlers); bigint-on-the-wire fields are typed string (the app serializes bigints with
 * a JSON replacer).
 *
 * Deterministic output: component registration order is fixed, routes are sorted by
 * (method, path), and no timestamps/randomness are emitted — `git diff docs/openapi.json`
 * is clean when nothing changed.
 *
 * Regeneration is MANUAL: `bun run generate:openapi`. CI does NOT gate this file on
 * drift. The silent-omission guard lives in src/server/openapi-wiring.test.ts, which
 * boots the real app and asserts every REGISTERED_ROUTES path+method exists in the
 * committed spec — so a newly mounted route with no spec entry fails the test suite.
 *
 * Notes on what OpenAPI cannot express (documented via x-* extensions + descriptions):
 *   - POST /v1/chat/completions returns a text/event-stream of heterogeneous frames
 *     (see x-sse-events on the 200 response).
 *   - GET /v1/stream is a WebSocket upgrade, not plain HTTP (x-websocket + x-ws-events).
 *   - Both key tiers (server/client) share the `x-api-key` header; OpenAPI security
 *     schemes are keyed by header name, so the value-level tier split is documented in
 *     the securityScheme descriptions + per-route `security` arrays.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import * as zto from "@asteasolutions/zod-to-openapi";
import pkg from "../package.json" with { type: "json" };
import * as routeSchemas from "../src/route-schemas.js";
import * as skillSchemas from "../../../packages/config/src/skills/schemas.ts";

const { OpenAPIRegistry, OpenApiGeneratorV31, extendZodWithOpenApi } = zto;

// ---------------------------------------------------------------------------
// zod-to-openapi v9 + zod 4 wiring
// ---------------------------------------------------------------------------
extendZodWithOpenApi(z);
// v9's extendZodWithOpenApi only patches ZodType.prototype, but zod 4's trait
// classes (ZodPipe, ZodDefault, ZodOptional, …) do not inherit from ZodType, so
// `registry.register()` (which calls schema.openapi(refId)) would throw on them.
// Mirror the extension onto every zod class prototype that lacks it.
for (const key of Object.keys(z)) {
  const klass = z[key];
  if (
    typeof klass === "function" &&
    klass.prototype &&
    typeof klass.prototype.openapi === "undefined"
  ) {
    Object.defineProperty(klass.prototype, "openapi", {
      value: z.ZodType.prototype.openapi,
      writable: true,
      configurable: true,
    });
  }
}

const registry = new OpenAPIRegistry();

// ---------------------------------------------------------------------------
// Wire primitives.
//
// zod .regex()/refine() refinements are dropped by v9 (issue #392) unless they
// surface as JSON-Schema keywords, so hex/address/amount patterns are re-added
// explicitly via .meta({ pattern }) — verified to emit `pattern` in 3.1 output.
// ---------------------------------------------------------------------------
const HEX_PATTERN = "^0x[a-fA-F0-9]+$";
const ADDRESS_PATTERN = "^0x[a-fA-F0-9]{40}$";
const AMOUNT_PATTERN = "^\\d+(\\.\\d+)?$";
const TOKEN_ID_PATTERN = "^\\d+$";

const hexStr = z
  .string()
  .regex(new RegExp(HEX_PATTERN))
  .meta({ pattern: HEX_PATTERN, description: "0x-prefixed hex string" });
const addressStr = z
  .string()
  .regex(new RegExp(ADDRESS_PATTERN))
  .meta({
    pattern: ADDRESS_PATTERN,
    description: "0x-prefixed EVM address (20 bytes)",
    examples: ["0x0000000000000000000000000000000000000000"],
  });
const amountStr = z
  .string()
  .regex(new RegExp(AMOUNT_PATTERN))
  .meta({
    pattern: AMOUNT_PATTERN,
    description: "Decimal string (ether units), e.g. \"1.5\"",
    examples: ["1.5"],
  });
const tokenIdStr = z
  .string()
  .regex(new RegExp(TOKEN_ID_PATTERN))
  .meta({ pattern: TOKEN_ID_PATTERN, description: "Decimal token ID string" });
// bigint serializes as a decimal string via the app's JSON replacer.
const bigintStr = z
  .string()
  .meta({ description: "Serialized bigint (decimal string)" });

/** register a zod schema as a component; guarantees the v9 .openapi() seam exists. */
function reg(name, schema) {
  if (typeof schema.openapi !== "function") {
    const proto = Object.getPrototypeOf(schema);
    if (proto && z.ZodType?.prototype?.openapi) {
      Object.defineProperty(proto, "openapi", {
        value: z.ZodType.prototype.openapi,
        writable: true,
        configurable: true,
      });
    }
  }
  return registry.register(name, schema);
}

// ---------------------------------------------------------------------------
// Error envelope + error code catalog (deep plan §3)
// ---------------------------------------------------------------------------
const ERROR_CODES = [
  "VALIDATION_ERROR",
  "UPSTREAM_ERROR",
  "INTERNAL_ERROR",
  "CLIENT_PATH_DENIED",
  "SERVER_KEY_REQUIRED",
  "ADDRESS_NOT_CONFIGURED",
  "UNTRUSTED_EVENT_SOURCE",
  "INDEXER_UNAUTHORIZED",
  "NO_WS_SUBSCRIBER",
  "ORACLE_SIGNATURE_INVALID",
  "CLEARTEXT_DEK_REJECTED",
  "insufficient_balance",
  "compute_auth",
  "STREAM_ERROR",
  "-32000",
  // HTTP_<status> is a dynamic family (e.g. HTTP_502 for upstream fetch errors).
  "HTTP_400",
  "HTTP_401",
  "HTTP_403",
  "HTTP_404",
  "HTTP_500",
];

const errorCodeEnum = z
  .enum(ERROR_CODES)
  .meta({ description: "Stable error codes. HTTP_<status> is a dynamic family." });

const errorEnvelopeSchema = z.object({
  error: z.string().meta({ description: "Human-readable error message" }),
  code: errorCodeEnum.optional(),
  requestId: z
    .string()
    .optional()
    .meta({ description: "Echo of the x-request-id header (absent on a few legacy routes)" }),
});

const validationErrorEnvelopeSchema = z.object({
  error: z.string().meta({ description: "\"Validation failed\"" }),
  details: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .meta({ description: "Raw zod issue objects (path/message/code/expected/received…)" }),
  code: z.literal("VALIDATION_ERROR").optional(),
  requestId: z.string().optional(),
});

const errorEnvelopeRef = reg("ErrorEnvelope", errorEnvelopeSchema);
const validationEnvelopeRef = reg("ValidationErrorEnvelope", validationErrorEnvelopeSchema);
reg("ErrorCode", errorCodeEnum);

// ---------------------------------------------------------------------------
// Request schemas — the real zod schemas from route-schemas.ts (single source of
// truth) + the two scattered ones (mintEncode in routers/agents.ts, archiveQuery
// in services/archive.ts) mirrored here since they are not exported.
// ---------------------------------------------------------------------------
const chatBodyRef = reg("ChatBody", routeSchemas.chatBodySchema);
const providerRoutingRef = reg("ProviderRouting", routeSchemas.providerRoutingSchema);
const transferBodyRef = reg("TransferBody", routeSchemas.transferBodySchema);
const royaltyBodyRef = reg("RoyaltyBody", routeSchemas.royaltySchema);
const mintDataHashBodyRef = reg("MintDataHashBody", routeSchemas.mintDataHashSchema);
const vaultDepositBodyRef = reg("VaultDepositBody", routeSchemas.vaultDepositEncodeSchema);
const vaultWithdrawBodyRef = reg("VaultWithdrawBody", routeSchemas.vaultWithdrawEncodeSchema);
reg("AmountString", amountStr);
const eventBodyRef = reg("EventBody", routeSchemas.eventBodySchema);
const tickBodyRef = reg("TickBody", routeSchemas.tickSchema);
reg("ArchiveUrl", routeSchemas.archiveUrlSchema);
reg("ChatHistoryQuery", routeSchemas.chatHistoryQuerySchema);

const mintEncodeBodyRef = reg(
  "MintEncodeBody",
  z.object({
    dataDescription: z.string().min(1).max(1024),
    dataHash: hexStr,
    to: addressStr,
  }),
);

const archiveQueryBodyRef = reg(
  "ArchiveQueryBody",
  z.object({
    intent: z.enum(["lookup", "confirm", "account", "closest"]).default("lookup"),
    url: z
      .string()
      .optional()
      .meta({
        format: "uri",
        description:
          "Target URL (bare hosts are normalized to https://). SSRF-guarded: http(s) only, private/loopback hosts rejected. Required for lookup/confirm/closest.",
      }),
    handle: z.string().min(1).max(64).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
    timestamp: z
      .string()
      .optional()
      .meta({ description: "Wayback timestamp (YYYYMMDDhhmmss-ish; coerced to ISO)" }),
    fullList: z.boolean().optional(),
  }),
);

// ---------------------------------------------------------------------------
// Response schemas (deep plan §1.5). bigint-on-the-wire fields are typed string.
// ---------------------------------------------------------------------------
const healthResponseRef = reg(
  "HealthResponse",
  z.object({
    ok: z.boolean(),
    version: z.string(),
    signer: addressStr,
    chainHead: z.number().int().nonnegative(),
    oracle: z.literal("up"),
    oracleSigner: addressStr,
    uncompressedPubkey: hexStr,
    addresses: z
      .object({
        agentNft: addressStr,
        vault: addressStr,
        verifier: addressStr,
        paymentProcessor: addressStr.optional(),
      })
      .nullable()
      .optional(),
  }),
);
const liveResponseRef = reg("LiveResponse", z.object({ ok: z.literal(true), live: z.literal(true) }));
const oracleHealthResponseRef = reg(
  "OracleHealthResponse",
  z.object({
    ok: z.literal(true),
    signer: addressStr,
    uncompressedPubkey: hexStr,
    version: z.string(),
  }),
);
const mintResponseRef = reg(
  "MintResponse",
  z.object({ ok: z.literal(true), dataHash: hexStr, seen: z.boolean() }),
);

const providerServiceRef = reg(
  "ProviderService",
  z.object({
    address: addressStr,
    model: z.string(),
    endpoint: z.string().meta({ description: "Compute router base URL" }),
    price: z.string().optional(),
    trust_mode: z
      .enum(["standard", "verified", "private"])
      .optional()
      .meta({
        description:
          "Present only on the ?model= passthrough branch (mapped from router verifiability)",
      }),
  }),
);
const providersResponseRef = reg(
  "ProvidersResponse",
  z.object({
    services: z.array(providerServiceRef).meta({
      description:
        "No ?model: deterministic pseudo-address per router model. With ?model: real provider records (address/latency/pricing/TEE) with model + trust_mode.",
    }),
  }),
);
const configResponseRef = reg(
  "ConfigResponse",
  z.object({ model: z.string(), assistantName: z.literal("Axiom"), contextWindow: z.number().int().positive() }),
);

const storedEventRef = reg(
  "StoredEvent",
  z.object({
    source: z.string(),
    chainId: z.number().int(),
    blockNumber: z.number().int(),
    txHash: z.string().nullable(),
    logIndex: z.number().int(),
    eventName: z.string(),
    payload: z.record(z.string(), z.unknown()),
    receivedAt: z.number().int(),
    timestamp: z.number().int(),
  }),
);
const eventStoredResponseRef = reg("EventStoredResponse", z.object({ stored: storedEventRef }));
const eventsListResponseRef = reg("EventsListResponse", z.object({ events: z.array(storedEventRef) }));

const chatTranscriptRef = reg(
  "ChatTranscript",
  z.object({
    threadId: z.string(),
    wallet: addressStr.optional(),
    messages: z.array(z.record(z.string(), z.unknown())).meta({
      description: "OpenAI chat message params (role + content/tool_calls), incl. the assistant reply",
    }),
    msgCount: z.number().int(),
    ts: z.number().int(),
  }),
);
const chatHistoryResponseRef = reg(
  "ChatHistoryResponse",
  z.object({
    wallet: z.string().meta({ description: "Lowercased wallet address that keyed the thread" }),
    count: z.number().int(),
    transcripts: z.array(chatTranscriptRef),
  }),
);

const agentSummaryRef = reg(
  "AgentSummary",
  z.object({
    tokenId: z.string().meta({ description: "Numeric agent token ID (string)" }),
    owner: addressStr,
    dataDescription: z.string().optional(),
  }),
);
const agentsListResponseRef = reg("AgentListResponse", z.object({ owner: addressStr, agents: z.array(agentSummaryRef) }));

const registryStatsRef = reg(
  "AgentRegistryStats",
  z.object({
    totalMinted: z.number().int().nonnegative().meta({ description: "Distinct agent token IDs minted on-chain (full-range log scan)" }),
    latestTokenId: z.string().nullable().meta({ description: "Highest minted token ID (null when registry is empty)" }),
  }),
);

const transferChallengeStageRef = reg(
  "TransferChallengeStage",
  z.object({
    ok: z.literal(true),
    stage: z.literal("challenge"),
    tokenId: tokenIdStr,
    to: addressStr,
    dataHash: hexStr,
    targetPubkey: hexStr,
    accessProofNonce: z.union([z.string(), z.number()]),
    validUntil: z.union([z.string(), z.number()]),
    ownershipSignature: hexStr,
    signer: addressStr,
    oldDataHash: hexStr.optional(),
    newDataHash: hexStr.optional(),
    newDataUri: hexStr.optional(),
    sealedKey: hexStr.optional(),
    rekeyed: z.literal(true).optional(),
  }),
);
const transferFinalStageRef = reg(
  "TransferFinalStage",
  z.object({
    ok: z.literal(true),
    stage: z.literal("final"),
    tokenId: tokenIdStr,
    to: addressStr,
    accessSigner: addressStr,
    signer: addressStr,
    accessProof: z.object({
      dataHash: hexStr,
      targetPubkey: hexStr,
      nonce: z.union([z.string(), z.number()]),
      proof: hexStr,
      validUntil: z.union([z.string(), z.number()]),
    }),
    ownershipProof: z.object({
      oracleType: z.number().int(),
      dataHash: hexStr,
      sealedKey: hexStr,
      targetPubkey: hexStr,
      nonce: z.union([z.string(), z.number()]),
      proof: hexStr,
      validUntil: z.union([z.string(), z.number()]),
    }),
  }),
);
const transferResponseRef = reg(
  "TransferResponse",
  z.union([transferChallengeStageRef, transferFinalStageRef]).meta({
    description: "Two-step ownership transfer: challenge stage (signed ownership challenge) or final stage (full access proof)",
  }),
);

const txEncodeResponseRef = reg(
  "TxEncodeResponse",
  z.object({
    to: addressStr,
    data: hexStr,
    value: bigintStr.meta({ description: "Transaction value in wei (serialized bigint)" }),
  }),
);
const vaultEncodeResponseRef = reg(
  "VaultEncodeResponse",
  z.object({
    tokenId: tokenIdStr,
    to: addressStr,
    data: hexStr,
    value: bigintStr,
    amount: amountStr,
  }),
);
const royaltyResponseRef = reg(
  "RoyaltyResponse",
  z.object({
    tokenId: tokenIdStr,
    bps: z.number().int().min(0).max(10000),
    to: addressStr,
    data: hexStr,
    value: bigintStr,
  }),
);
const earningsResponseRef = reg(
  "EarningsResponse",
  z.object({ tokenId: tokenIdStr, creator: addressStr, earnings: bigintStr }),
);
const paymentConfigResponseRef = reg(
  "PaymentConfigResponse",
  z.object({
    paymentToken: addressStr,
    protocolFeeBps: bigintStr,
    protocolTreasury: addressStr,
  }),
);

const metricSummaryRef = reg(
  "MetricSummary",
  z.object({
    totalTicks: z.number().int(),
    buyCount: z.number().int(),
    sellCount: z.number().int(),
    holdCount: z.number().int(),
    buyRate: z.number(),
    winRate: z.number(),
  }),
);
const metricHistoryEntryRef = reg(
  "MetricHistoryEntry",
  z.object({
    timestamp: z.number().int(),
    action: z.string(),
    amount: z.number().nullable(),
    reason: z.string(),
    durationMs: z.number().nullable(),
    blockNumber: z.number().int(),
    txHash: z.string().nullable(),
  }),
);
const performanceMetricsRef = reg(
  "PerformanceMetrics",
  z.object({ metrics: metricSummaryRef, history: z.array(metricHistoryEntryRef) }),
);
const batchMetricsRef = reg(
  "BatchMetrics",
  z.object({
    results: z.record(z.string(), metricSummaryRef).meta({
      description: "Map of agent token ID → metrics",
    }),
  }),
);

const tickRecommendationRef = reg(
  "TickRecommendation",
  z.object({
    action: z.enum(["act", "hold"]),
    amount: z.number().optional(),
    confidence: z.number().optional(),
    reason: z.string(),
  }),
);
const tickResultRef = reg(
  "TickResult",
  z.object({
    recommendation: tickRecommendationRef,
    rawModelOutput: z.string(),
    onchain: z.object({
      vaultBalance: bigintStr,
      recentEvents: z.array(z.record(z.string(), z.unknown())),
    }),
    storage: z.object({ rootHash: hexStr, size: z.number().int() }),
    execution: z
      .object({
        success: z.boolean().optional(),
        status: z.enum(["success", "skipped", "executed", "failed"]).optional(),
        reason: z.string().optional(),
        txHash: hexStr.optional(),
        action: z.string().optional(),
        target: addressStr.optional(),
        result: hexStr.optional(),
        gasUsed: bigintStr.optional(),
      })
      .optional(),
    durationMs: z.number().int(),
  }),
);
const tickStreamAcceptedRef = reg(
  "TickStreamAccepted",
  z.object({ ok: z.literal(true), streamTopic: z.string().meta({ description: "e.g. tick.<tokenId>" }) }),
);

const routeInfoRef = reg(
  "RouteInfo",
  z.object({
    method: z.enum(["GET", "POST", "DELETE", "PUT"]),
    path: z.string(),
    consumer: z.string().optional(),
    description: z.string().optional(),
  }),
);
const routesResponseRef = reg(
  "RoutesResponse",
  z.object({
    routes: z.array(routeInfoRef),
    meta: z.object({
      version: z.string(),
      chainId: z.number().int(),
      signer: z.string().meta({ description: "Short signer address (0x1234…abcd)" }),
      startedAt: z.number().int(),
      uptimeMs: z.number().int(),
    }),
  }),
);

// Open-ended response payloads (archive facade, skill results).
const archiveResultRef = reg(
  "ArchiveResult",
  z.record(z.string(), z.unknown()).meta({
    description:
      "Intent-shaped archive result: lookup {url,count,snapshots,note?}, confirm {archived,snapshot}, account {handle,count,snapshots}, closest {url,snapshot}. `cached: true` on TTL hits.",
  }),
);
const skillResultRef = reg(
  "SkillResult",
  z.record(z.string(), z.unknown()).meta({
    description:
      "Skill-specific result object (bigint fields serialized as strings). See the skill's component schema for request shape.",
  }),
);

const metadataBodyRef = reg(
  "MetadataBody",
  z.object({
    datas: z.array(z.unknown()).meta({ description: "Unvalidated by design (consumer cli-only)" }),
  }),
);

// ---------------------------------------------------------------------------
// SSE frame types for POST /v1/chat/completions (deep plan §4.1)
// ---------------------------------------------------------------------------
const sseChunkFrameRef = reg(
  "ChatStreamChunkFrame",
  z.object({
    id: z.string(),
    object: z.literal("chat.completion.chunk"),
    created: z.number().int(),
    model: z.string(),
    choices: z.array(
      z.object({
        index: z.number().int(),
        delta: z
          .object({
            role: z.string().optional(),
            content: z.string().optional(),
            tool_calls: z.array(z.record(z.string(), z.unknown())).optional(),
          })
          .optional(),
        logprobs: z.unknown().optional(),
        finish_reason: z.string().nullable().optional(),
      }),
    ),
    usage: z.record(z.string(), z.unknown()).optional(),
  }),
);
const sseTerminalFrameRef = reg(
  "ChatStreamTerminalFrame",
  z.object({
    choices: z.array(z.unknown()).length(0).meta({ description: "Always []" }),
    usage: z.record(z.string(), z.unknown()).optional(),
    x_0g_trace: z.record(z.string(), z.unknown()).optional(),
  }).meta({
    description: "Router terminal chunk: usage + x_0g_trace with empty choices, right before [DONE]",
  }),
);
const sseTraceFrameRef = reg(
  "ChatStreamTraceFrame",
  z.object({
    type: z.literal("trace"),
    trace: z
      .record(z.string(), z.unknown())
      .meta({
        description:
          "Terminal chunk usage ∪ x_0g_trace ∪ providerHeader (from the upstream x-provider header, when present)",
      }),
  }),
);
const sseErrorFrameRef = reg(
  "ChatStreamErrorFrame",
  z.object({ error: z.string(), code: z.literal("STREAM_ERROR") }).meta({
    description: "Mid-stream failure (only after headers were already flushed)",
  }),
);
const sseDoneFrameRef = reg("ChatStreamDoneFrame", z.literal("[DONE]"));
const chatStreamEventRef = reg(
  "ChatStreamEvent",
  z.union([
    sseChunkFrameRef,
    sseTerminalFrameRef,
    sseTraceFrameRef,
    sseErrorFrameRef,
    sseDoneFrameRef,
  ]),
);

// ---------------------------------------------------------------------------
// WebSocket frame types for GET /v1/stream (deep plan §4.2)
// ---------------------------------------------------------------------------
const wsFrameEnvelopeRef = reg(
  "WsFrameEnvelope",
  z.object({
    topic: z.string(),
    payload: z.record(z.string(), z.unknown()),
    ts: z.number().int().meta({ description: "Epoch ms" }),
  }),
);
const wsHelloFrameRef = reg(
  "WsHelloFrame",
  z.object({
    topic: z.literal("hello"),
    payload: z.object({ topics: z.array(z.string()) }),
    ts: z.number().int(),
  }),
);
const wsTickFrameRef = reg(
  "WsTickFrame",
  z.object({
    topic: z.string().meta({ description: "tick.<tokenId>" }),
    payload: z.union([
      z.object({ type: z.literal("token"), content: z.string(), index: z.number().int() }),
      z.object({ type: z.literal("complete") }).and(z.record(z.string(), z.unknown())).meta({
        description: "complete: full TickResult payload spread onto the frame",
      }),
      z.object({ type: z.literal("error"), error: z.string() }),
    ]),
    ts: z.number().int(),
  }),
);
const wsOrchestratorFrameRef = reg(
  "WsOrchestratorFrame",
  z.object({
    topic: z.literal("orchestrator.tick"),
    payload: z.object({
      agentTokenId: tokenIdStr,
      recommendation: tickRecommendationRef,
    }),
    ts: z.number().int(),
  }),
);

// ---------------------------------------------------------------------------
// MCP (streamable-HTTP) shapes
// ---------------------------------------------------------------------------
const jsonRpcRequestRef = reg(
  "JsonRpcRequest",
  z.object({
    jsonrpc: z.literal("2.0"),
    id: z.union([z.string(), z.number(), z.null()]),
    method: z.string(),
    params: z.record(z.string(), z.unknown()).optional(),
  }),
);
const jsonRpcErrorRef = reg(
  "JsonRpcError",
  z.object({
    jsonrpc: z.literal("2.0"),
    error: z.object({ code: z.number().int(), message: z.string(), data: z.unknown().optional() }),
    id: z.union([z.string(), z.number(), z.null()]),
  }),
);
// 6 MCP tool input schemas (mcp/server.ts TOOLS, read-only facade).
reg(
  "McpListAgentsParams",
  z.object({ owner: z.string().regex(new RegExp(ADDRESS_PATTERN)).meta({ pattern: ADDRESS_PATTERN }) }),
);
reg(
  "McpGetAgentPerformanceParams",
  z.object({
    id: tokenIdStr,
    limit: z.number().int().positive().max(500).optional(),
  }),
);
reg(
  "McpGetEventsParams",
  z.object({
    eventName: z.string().optional(),
    owner: z.string().optional(),
    since: z.number().int().positive().optional(),
    limit: z.number().int().positive().optional(),
  }),
);
reg(
  "McpGetAgentPerformanceBatchParams",
  z.object({
    ids: z.string().meta({ description: "Comma-separated agent token IDs (max 50, e.g. \"1,2,3\")" }),
  }),
);
reg("McpGetPaymentConfigParams", z.object({}));
reg("McpListRoutesParams", z.object({}));

// ---------------------------------------------------------------------------
// Skill request schemas — 20 schemas for 22 routes (packages/config, src import).
// ---------------------------------------------------------------------------
const skillRefs = {};
for (const [name, schema] of Object.entries(skillSchemas)) {
  // The chat-runtime executor always appends a `context` object (chainId, walletAddress,
  // agentNft, vault, lastTokenId) to every skill body — document the real wire contract
  // (the REST handler validates only the declared skill fields; context is stripped).
  const withContext = schema.extend({
    context: z
      .record(z.string(), z.unknown())
      .optional()
      .meta({
        description:
          "Executor-supplied session context (chainId, walletAddress, agentNft, vault, lastTokenId); not validated by the route",
      }),
  });
  skillRefs[name] = reg(`Skill${name}`, withContext);
}

// ---------------------------------------------------------------------------
// Security schemes (backend plan §3).
// ---------------------------------------------------------------------------
registry.registerComponent("securitySchemes", "serverKey", {
  type: "apiKey",
  in: "header",
  name: "x-api-key",
  description:
    "Server key (AXIOM_API_KEY). Full access; also accepted by /v1/stream via ?token=. " +
    "SAME header as clientKey — the key VALUE distinguishes the tier.",
});
registry.registerComponent("securitySchemes", "clientKey", {
  type: "apiKey",
  in: "header",
  name: "x-api-key",
  description:
    "Browser key (AXIOM_CLIENT_API_KEY). SAME header as serverKey; only CLIENT_ALLOWED_ROUTES " +
    "are reachable (everything else → 403 CLIENT_PATH_DENIED).",
});
registry.registerComponent("securitySchemes", "indexerKey", {
  type: "apiKey",
  in: "header",
  name: "x-indexer-key",
  description:
    "Indexer key (AXIOM_INDEXER_API_KEY). Required IN ADDITION to x-api-key for POST /v1/events.",
});
registry.registerComponent("securitySchemes", "wsToken", {
  type: "apiKey",
  in: "query",
  name: "token",
  description:
    "Server or client key passed as ?token= on the /v1/stream WebSocket upgrade (fail-closed 401).",
});

const SEC = {
  public: [],
  serverOrClient: [{ serverKey: [] }, { clientKey: [] }],
  serverOnly: [{ serverKey: [] }],
  eventsPost: [
    { serverKey: [], indexerKey: [] },
    { clientKey: [], indexerKey: [] },
  ],
  ws: [{ wsToken: [] }],
};

// ---------------------------------------------------------------------------
// Shared response builders
// ---------------------------------------------------------------------------
const json = (schemaRef) => ({ "application/json": { schema: schemaRef } });
const errorResp = (description, codes = []) => {
  const r = { description, content: json(errorEnvelopeRef) };
  if (codes.length) r["x-error-codes"] = codes;
  return r;
};
const okResp = (description, schemaRef, extra = {}) => ({
  description,
  content: json(schemaRef),
  ...extra,
});

const RATE_LIMITED_RESPONSE = {
  description:
    "429 — express-rate-limit (60s window, AXIOM_RATE_LIMIT_MAX default 100). Plain-text body, not the JSON envelope.",
  headers: {
    "Retry-After": { schema: { type: "integer" } },
    "RateLimit-Policy": { schema: { type: "string" } },
    "RateLimit-Limit": { schema: { type: "integer" } },
    "RateLimit-Remaining": { schema: { type: "integer" } },
    "RateLimit-Reset": { schema: { type: "integer" } },
  },
  content: {
    "text/plain": {
      schema: { type: "string", const: "Too many requests, please try again later." },
    },
  },
};

const reqIdHeader = { "x-request-id": { schema: { type: "string", format: "uuid" } } };

// ---------------------------------------------------------------------------
// Route table — every mounted HTTP operation (server.ts mount order; oracle gap
// fixed in server.ts REGISTERED_ROUTES). Path style: Express :id → {id}.
// ---------------------------------------------------------------------------
const ROUTES = [
  // health
  {
    method: "get",
    path: "/health/live",
    summary: "Liveness probe",
    security: SEC.public,
    responses: {
      "200": okResp("Live", liveResponseRef),
    },
  },
  {
    method: "get",
    path: "/health",
    summary: "Health check (chain head, signer, addresses)",
    security: SEC.public,
    responses: {
      "200": okResp("Healthy", healthResponseRef),
      "503": {
        description: "Chain unhealthy — same shape with ok:false (or error envelope)",
        content: json(healthResponseRef),
      },
    },
  },
  {
    method: "get",
    path: "/api/health",
    summary: "Health check (unstripped /api prefix alias for proxies that keep /api)",
    security: SEC.public,
    responses: {
      "200": okResp("Healthy", healthResponseRef),
      "503": {
        description: "Chain unhealthy — same shape with ok:false (or error envelope)",
        content: json(healthResponseRef),
      },
    },
  },

  // oracle (in-process TEE signer; plain express routes, now in REGISTERED_ROUTES)
  {
    method: "get",
    path: "/oracle/health",
    summary: "TEE oracle signer pubkey + status",
    security: SEC.public,
    responses: {
      "200": okResp("Oracle status", oracleHealthResponseRef),
    },
  },
  {
    method: "post",
    path: "/oracle/v1/agents/mint",
    summary: "Register an agent dataHash with the oracle (marks seen)",
    security: SEC.serverOrClient,
    request: {
      body: {
        description: "dataHash must be 32 bytes (0x + 64 hex chars)",
        required: true,
        content: json(mintDataHashBodyRef),
      },
    },
    responses: {
      "200": okResp("Registered (or already seen)", mintResponseRef),
      "400": errorResp("Bad hash / validation. Legacy route: plain {error} body, no code/requestId", ["VALIDATION_ERROR"]),
    },
  },

  // compute
  {
    method: "get",
    path: "/v1/compute/providers",
    summary: "List compute providers; ?model= → real provider passthrough",
    security: SEC.serverOrClient,
    parameters: [
      {
        name: "model",
        in: "query",
        required: false,
        description: "Router model id — returns real provider records (address/latency/pricing/TEE)",
        schema: { type: "string" },
      },
    ],
    responses: {
      "200": okResp("Provider services", providersResponseRef),
      "502": errorResp("Router upstream failure (direct res.json, no requestId)", ["UPSTREAM_ERROR"]),
    },
  },
  {
    method: "get",
    path: "/v1/config",
    summary: "Backend configuration for the UI",
    security: SEC.serverOrClient,
    responses: {
      "200": okResp("Config", configResponseRef),
    },
  },

  // chat
  {
    method: "post",
    path: "/v1/chat/completions",
    summary: "Stream chat completions (OpenAI-compatible SSE; stream is forced true server-side)",
    security: SEC.serverOrClient,
    request: {
      body: {
        description: "Chat request (provider routing is mapped to X-0G-Provider-* headers, never forwarded as body)",
        required: true,
        content: json(chatBodyRef),
      },
    },
    responses: {
      "200": {
        description:
          "SSE stream (text/event-stream): OpenAI chat.completion.chunk frames → trace frame → [DONE]. See x-sse-events.",
        content: {
          "text/event-stream": {
            schema: { type: "array", items: { $ref: "#/components/schemas/ChatStreamEvent" } },
          },
        },
        headers: {
          ...reqIdHeader,
          "Cache-Control": { schema: { type: "string", const: "no-cache" } },
          "X-Accel-Buffering": { schema: { type: "string", const: "no" } },
        },
        "x-sse-content-type": "application/json",
        "x-sse-events": [
          { name: "chat.completion.chunk", description: "Raw upstream OpenAI chunk (choices non-empty)", schema: { $ref: "#/components/schemas/ChatStreamChunkFrame" } },
          { name: "terminal_chunk", description: "Router terminal chunk: choices [] + usage + x_0g_trace (captured, not displayed)", schema: { $ref: "#/components/schemas/ChatStreamTerminalFrame" } },
          { name: "trace", description: "Usage ∪ x_0g_trace ∪ providerHeader", schema: { $ref: "#/components/schemas/ChatStreamTraceFrame" } },
          { name: "error", description: "Mid-stream failure (STREAM_ERROR) — only after headers flushed", schema: { $ref: "#/components/schemas/ChatStreamErrorFrame" } },
          { name: "done", description: "Always last: data: [DONE]", schema: { $ref: "#/components/schemas/ChatStreamDoneFrame" } },
        ],
      },
      "400": { description: "Validation", content: json(validationEnvelopeRef) },
      "402": errorResp("Compute account has no balance", ["insufficient_balance"]),
      "502": errorResp("Compute auth failed (compute_auth) or upstream failure", ["compute_auth", "UPSTREAM_ERROR"]),
      "429": RATE_LIMITED_RESPONSE,
    },
  },
  {
    method: "get",
    path: "/v1/chat/history",
    summary: "Fetch persisted chat transcripts for a wallet (0G, newest-first)",
    security: SEC.serverOrClient,
    parameters: [
      {
        name: "wallet",
        in: "query",
        required: true,
        description: "Owner wallet address (lowercased for the thread key)",
        schema: { type: "string", pattern: ADDRESS_PATTERN },
      },
    ],
    responses: {
      "200": okResp("Transcripts", chatHistoryResponseRef),
      "400": { description: "Validation", content: json(validationEnvelopeRef) },
    },
  },

  // meta
  {
    method: "get",
    path: "/v1/routes",
    summary: "List mounted routes + backend meta (self-description)",
    security: SEC.serverOrClient,
    responses: {
      "200": okResp("Route registry", routesResponseRef),
    },
  },

  // agents
  {
    method: "get",
    path: "/v1/agents",
    summary: "List NFT agents owned by an address (log-scan, 120s cache)",
    security: SEC.serverOrClient,
    parameters: [
      {
        name: "owner",
        in: "query",
        required: true,
        description: "Owner address",
        schema: { type: "string", pattern: ADDRESS_PATTERN },
      },
      { name: "fresh", in: "query", required: false, schema: { type: "string", enum: ["1"] } },
      { name: "nocache", in: "query", required: false, schema: { type: "string", enum: ["1"] } },
    ],
    responses: {
      "200": okResp("Agents", agentsListResponseRef),
      "400": errorResp("Valid owner address required"),
      "503": errorResp("AgentNFT address not configured", ["ADDRESS_NOT_CONFIGURED"]),
    },
  },
  {
    method: "get",
    path: "/v1/agents/stats",
    summary:
      "Real on-chain agent registry stats: distinct mints + latest tokenId (60s cache)",
    security: SEC.serverOrClient,
    responses: {
      "200": okResp("AgentStats", registryStatsRef),
      "502": errorResp("Registry read failure"),
      "503": errorResp("AgentNFT address not configured"),
    },
  },
  {
    method: "post",
    path: "/v1/agents/{id}/transfer",
    summary: "Two-step ownership transfer (challenge → final)",
    security: SEC.serverOrClient,
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        description: "Agent token ID (numeric)",
        schema: { type: "string", pattern: TOKEN_ID_PATTERN },
      },
    ],
    request: {
      body: {
        description:
          "accessProof absent ⇒ challenge stage; present ⇒ final stage. Production requires sealedKey.",
        required: true,
        content: json(transferBodyRef),
      },
    },
    responses: {
      "200": okResp("Challenge or final stage", transferResponseRef),
      "400": errorResp("Missing/invalid id, cleartext DEK, accessProof mismatch", ["CLEARTEXT_DEK_REJECTED"]),
      "502": errorResp("Oracle request/signature failure", ["ORACLE_SIGNATURE_INVALID", "UPSTREAM_ERROR"]),
      "503": errorResp("Address not configured", ["ADDRESS_NOT_CONFIGURED"]),
    },
  },
  {
    method: "post",
    path: "/v1/agents/mint/encode",
    summary: "Encode a mint transaction (value = mint fee)",
    security: SEC.serverOrClient,
    request: { body: { description: "Mint parameters", required: true, content: json(mintEncodeBodyRef) } },
    responses: {
      "200": okResp("Encoded tx", txEncodeResponseRef),
      "503": errorResp("AgentNFT address not configured", ["ADDRESS_NOT_CONFIGURED"]),
    },
  },
  {
    method: "get",
    path: "/v1/agents/{id}/earnings",
    summary: "Creator earnings by token (300s cache)",
    security: SEC.serverOrClient,
    parameters: [
      { name: "id", in: "path", required: true, schema: { type: "string", pattern: TOKEN_ID_PATTERN } },
    ],
    responses: {
      "200": okResp("Earnings", earningsResponseRef),
      "404": errorResp("Agent creator not registered for token"),
      "503": errorResp("Address not configured", ["ADDRESS_NOT_CONFIGURED"]),
    },
  },
  {
    method: "post",
    path: "/v1/agents/{id}/royalty",
    summary: "Encode a royalty-set transaction",
    security: SEC.serverOrClient,
    parameters: [
      { name: "id", in: "path", required: true, schema: { type: "string", pattern: TOKEN_ID_PATTERN } },
    ],
    request: { body: { description: "Royalty basis points (0..10000)", required: true, content: json(royaltyBodyRef) } },
    responses: {
      "200": okResp("Encoded royalty tx", royaltyResponseRef),
      "400": errorResp("Validation (bps range)", ["VALIDATION_ERROR"]),
      "503": errorResp("Address not configured", ["ADDRESS_NOT_CONFIGURED"]),
    },
  },
  {
    method: "get",
    path: "/v1/payment/config",
    summary: "Payment contract configuration (300s cache)",
    security: SEC.serverOrClient,
    responses: {
      "200": okResp("Payment config", paymentConfigResponseRef),
      "503": errorResp("Payment processor not configured", ["ADDRESS_NOT_CONFIGURED"]),
    },
  },
  {
    method: "post",
    path: "/v1/agents/{id}/metadata",
    summary: "Encode a metadata-update transaction (body unvalidated; consumer cli-only)",
    security: SEC.serverOrClient,
    parameters: [
      { name: "id", in: "path", required: true, schema: { type: "string", pattern: TOKEN_ID_PATTERN } },
    ],
    request: { body: { description: "datas array (unvalidated by design)", required: true, content: json(metadataBodyRef) } },
    "x-unvalidated-body": true,
    responses: {
      "200": okResp("Encoded metadata tx", txEncodeResponseRef),
      "400": errorResp("Missing or invalid datas array"),
    },
  },
  {
    method: "post",
    path: "/v1/agents/{id}/deposit",
    summary: "Encode a vault deposit transaction (value = amount in wei)",
    security: SEC.serverOrClient,
    parameters: [
      { name: "id", in: "path", required: true, schema: { type: "string", pattern: TOKEN_ID_PATTERN } },
    ],
    request: { body: { description: "Deposit amount (decimal ether string)", required: true, content: json(vaultDepositBodyRef) } },
    responses: {
      "200": okResp("Encoded deposit tx", vaultEncodeResponseRef),
      "400": errorResp("Validation (amount format)", ["VALIDATION_ERROR"]),
      "503": errorResp("Vault not configured", ["ADDRESS_NOT_CONFIGURED"]),
    },
  },
  {
    method: "post",
    path: "/v1/agents/{id}/withdraw",
    summary: "Encode a vault withdraw transaction (value = 0)",
    security: SEC.serverOrClient,
    parameters: [
      { name: "id", in: "path", required: true, schema: { type: "string", pattern: TOKEN_ID_PATTERN } },
    ],
    request: { body: { description: "Withdraw amount (decimal ether string)", required: true, content: json(vaultWithdrawBodyRef) } },
    responses: {
      "200": okResp("Encoded withdraw tx", vaultEncodeResponseRef),
      "400": errorResp("Validation (amount format)", ["VALIDATION_ERROR"]),
      "503": errorResp("Vault not configured", ["ADDRESS_NOT_CONFIGURED"]),
    },
  },
  {
    method: "get",
    path: "/v1/agents/{id}/performance",
    summary: "Per-agent strategy metrics (30s cache)",
    security: SEC.serverOrClient,
    parameters: [
      { name: "id", in: "path", required: true, schema: { type: "string", pattern: TOKEN_ID_PATTERN } },
      {
        name: "limit",
        in: "query",
        required: false,
        description: "Max ticks to scan (default 500)",
        schema: { type: "integer", minimum: 1 },
      },
    ],
    responses: {
      "200": okResp("Metrics", performanceMetricsRef),
      "400": errorResp("Invalid id", ["VALIDATION_ERROR"]),
    },
  },
  {
    method: "get",
    path: "/v1/agents/performance/batch",
    summary: "Batch metrics for up to 50 agents",
    security: SEC.serverOrClient,
    parameters: [
      {
        name: "ids",
        in: "query",
        required: true,
        description: "Comma-separated agent token IDs (max 50)",
        schema: { type: "string", example: "1,2,3" },
      },
    ],
    responses: {
      "200": okResp("Metrics by id", batchMetricsRef),
      "400": errorResp("Maximum 50 agents per batch request"),
    },
  },

  // events
  {
    method: "post",
    path: "/v1/events",
    summary: "Append an event (indexer-only; dedupes on chainId:txHash:logIndex)",
    security: SEC.eventsPost,
    request: { body: { description: "Event to store", required: true, content: json(eventBodyRef) } },
    responses: {
      "200": okResp("Stored (or existing on dedupe)", eventStoredResponseRef),
      "400": errorResp("Untrusted event source", ["UNTRUSTED_EVENT_SOURCE", "VALIDATION_ERROR"]),
      "401": errorResp("Indexer key missing/invalid", ["INDEXER_UNAUTHORIZED"]),
    },
  },
  {
    method: "get",
    path: "/v1/events",
    summary: "Query stored events (optional filters)",
    security: SEC.serverOrClient,
    parameters: [
      { name: "eventName", in: "query", required: false, schema: { type: "string" } },
      { name: "owner", in: "query", required: false, description: "Payload owner/to/from address filter", schema: { type: "string" } },
      { name: "since", in: "query", required: false, description: "Only events received after this epoch ms", schema: { type: "integer", minimum: 1 } },
      { name: "limit", in: "query", required: false, description: "Max events (capped by AXIOM_MAX_EVENT_QUERY_LIMIT, default 500)", schema: { type: "integer", minimum: 1 } },
    ],
    responses: {
      "200": okResp("Events", eventsListResponseRef),
    },
  },

  // orchestrator
  {
    method: "post",
    path: "/v1/orchestrator/tick",
    summary: "Run an AI strategy tick (stream:true → 202 + WS stream to tick.<id>)",
    security: SEC.serverOrClient,
    "x-server-only-property": "executionPlan",
    request: {
      body: {
        description:
          "executionPlan requires the SERVER key (client key ⇒ 403 SERVER_KEY_REQUIRED).",
        required: true,
        content: json(tickBodyRef),
      },
    },
    responses: {
      "200": okResp("Tick result (also broadcast to WS topic orchestrator.tick)", tickResultRef),
      "202": okResp("Stream accepted — WS frames follow on tick.<id>", tickStreamAcceptedRef),
      "400": errorResp("stream requested without a WS subscriber", ["NO_WS_SUBSCRIBER", "VALIDATION_ERROR"]),
      "403": errorResp("Client key with executionPlan", ["SERVER_KEY_REQUIRED"]),
      "503": errorResp("Orchestrator not available"),
    },
  },

  // archive
  {
    method: "post",
    path: "/v1/archive/query",
    summary: "Unified archive facade (lookup/confirm/account/closest)",
    security: SEC.serverOrClient,
    request: { body: { description: "Archive query (url SSRF-guarded)", required: true, content: json(archiveQueryBodyRef) } },
    responses: {
      "200": okResp("Archive result", archiveResultRef),
      "400": errorResp("Validation (SSRF guard, intent, missing url/handle)", ["VALIDATION_ERROR"]),
    },
  },
];

// 22 skill routes: evm (8) · stocks (5) · osint (6) · unbroker (3, server-only)
const SKILL_ROUTES = [
  ["/v1/skills/evm/wallet", "evmTokenOwnerSchema", "Query EVM wallet native and ERC-20 balances"],
  ["/v1/skills/evm/multichain", "evmAddressSchema", "Query wallet balances across multiple EVM chains"],
  ["/v1/skills/evm/tx", "evmTxSchema", "Fetch an EVM transaction and its receipt"],
  ["/v1/skills/evm/token", "evmTokenSchema", "ERC-20 token metadata and price"],
  ["/v1/skills/evm/gas", "evmGasSchema", "Estimate EVM gas cost for a transaction"],
  ["/v1/skills/evm/whale", "evmWhaleSchema", "Scan for large (whale) ERC-20 transfers"],
  ["/v1/skills/evm/contract", "evmAddressSchema", "Inspect contract code and proxy implementation"],
  ["/v1/skills/evm/allowance", "evmAllowanceSchema", "Check ERC-20 allowances for known DEX spenders"],
  ["/v1/skills/stocks/quote", "stocksQuoteSchema", "Real-time stock quote"],
  ["/v1/skills/stocks/search", "stocksSearchSchema", "Yahoo Finance symbol search"],
  ["/v1/skills/stocks/history", "stocksHistorySchema", "Historical price data"],
  ["/v1/skills/stocks/compare", "stocksCompareSchema", "Compare multiple stock quotes"],
  ["/v1/skills/stocks/crypto", "stocksCryptoSchema", "Crypto pair quote (e.g. BTC-USD)"],
  ["/v1/skills/osint/sec_edgar", "osintSecEdgarSchema", "SEC EDGAR company submissions lookup"],
  ["/v1/skills/osint/usaspending", "osintUsaspendingSchema", "USASpending.gov federal award search"],
  ["/v1/skills/osint/ofac_sdn", "osintOfacSdnSchema", "OFAC SDN list name search"],
  ["/v1/skills/osint/company_search", "osintCompanySearchSchema", "GLEIF legal-entity search (keyless)"],
  ["/v1/skills/osint/entity_resolve", "osintEntityResolveSchema", "Resolve whether entity names refer to the same company"],
  ["/v1/skills/osint/courtlistener", "osintCourtlistenerSchema", "CourtListener opinions and RECAP search"],
  ["/v1/skills/unbroker/simulate", "unbrokerSchema", "Simulate an ERC-7857 transfer without sending"],
  ["/v1/skills/unbroker/route", "unbrokerSchema", "Compare transfer path options"],
  ["/v1/skills/unbroker/analyze", "unbrokerAnalyzeSchema", "Validate transfer proof and compute safety score"],
];

for (const [path, schemaName, description] of SKILL_ROUTES) {
  const serverOnly = path.startsWith("/v1/skills/unbroker/");
  ROUTES.push({
    method: "post",
    path,
    summary: description,
    security: serverOnly ? SEC.serverOnly : SEC.serverOrClient,
    ...(serverOnly ? { "x-required-principal": "server" } : {}),
    request: {
      body: {
        description: "Skill parameters",
        required: true,
        content: json(skillRefs[schemaName]),
      },
    },
    responses: {
      "200": okResp("Skill result", skillResultRef),
      "503": errorResp("AgentNFT not configured (unbroker)", ["ADDRESS_NOT_CONFIGURED"]),
      "502": errorResp("Upstream fetch failed", ["UPSTREAM_ERROR", "HTTP_502"]),
    },
  });
}

// MCP streamable-HTTP (server key only; /mcp is excluded from CLIENT_ALLOWED_ROUTES).
ROUTES.push(
  {
    method: "post",
    path: "/mcp",
    summary: "MCP streamable-HTTP endpoint (read-only tools; initialize first)",
    security: SEC.serverOnly,
    "x-required-principal": "server",
    "x-mcp-streamable-http": true,
    parameters: [
      {
        name: "mcp-session-id",
        in: "header",
        required: false,
        description: "Session id returned by initialize; required for subsequent requests",
        schema: { type: "string" },
      },
    ],
    request: {
      body: {
        description: "JSON-RPC 2.0 request (initialize first; sessionless requests → 400 JSON-RPC error)",
        required: true,
        content: json(jsonRpcRequestRef),
      },
    },
    responses: {
      "200": {
        description: "JSON-RPC response — JSON (Accept: application/json) or SSE (text/event-stream)",
        content: {
          "application/json": { schema: jsonRpcErrorRef },
          "text/event-stream": { schema: { type: "string" } },
        },
      },
      "400": { description: "Missing/unknown session or bad request", content: json(jsonRpcErrorRef) },
      "403": errorResp("Server key required", ["SERVER_KEY_REQUIRED"]),
      "404": { description: "Unknown session", content: json(jsonRpcErrorRef) },
      "500": { description: "Internal error", content: json(jsonRpcErrorRef) },
    },
  },
  {
    method: "get",
    path: "/mcp",
    summary: "MCP SSE stream for an existing session",
    security: SEC.serverOnly,
    "x-required-principal": "server",
    "x-mcp-sse-stream": true,
    parameters: [
      {
        name: "mcp-session-id",
        in: "header",
        required: true,
        schema: { type: "string" },
      },
    ],
    responses: {
      "200": { description: "SSE stream", content: { "text/event-stream": { schema: { type: "string" } } } },
      "400": { description: "Invalid or missing session ID (plain text)" },
    },
  },
  {
    method: "delete",
    path: "/mcp",
    summary: "Terminate an MCP session",
    security: SEC.serverOnly,
    "x-required-principal": "server",
    parameters: [
      {
        name: "mcp-session-id",
        in: "header",
        required: true,
        schema: { type: "string" },
      },
    ],
    responses: {
      "200": { description: "Session torn down (empty body)" },
      "400": { description: "Invalid or missing session ID (plain text)" },
    },
  },
);

// WebSocket upgrade stub — OpenAPI cannot model WS; documented via x-* extensions.
ROUTES.push({
  method: "get",
  path: "/v1/stream",
  summary: "WebSocket event stream (upgrade). Frames: {topic, payload, ts} with bigintReplacer.",
  security: SEC.ws,
  "x-websocket": true,
  "x-ws-events": [
    { name: "hello", description: "On connect: subscribed topic list echo", schema: { $ref: "#/components/schemas/WsHelloFrame" } },
    { name: "<eventName>", description: "StoredEvent broadcast (Tick, Transfer, Deposited, Withdrawn, StrategySet, Executed, transcript, …)", schema: { $ref: "#/components/schemas/WsFrameEnvelope" } },
    { name: "tick.<tokenId>", description: "Streamed tick: {type:token} chunks, {type:complete} TickResult, {type:error}", schema: { $ref: "#/components/schemas/WsTickFrame" } },
    { name: "orchestrator.tick", description: "Non-stream tick completion", schema: { $ref: "#/components/schemas/WsOrchestratorFrame" } },
  ],
  "x-ws-heartbeat": { intervalMs: 30000, maxMissedPings: 3 },
  "x-ws-max-clients": 1000,
  parameters: [
    {
      name: "token",
      in: "query",
      required: true,
      description: "Server or client API key (fail-closed 401 on mismatch)",
      schema: { type: "string" },
    },
    {
      name: "topic",
      in: "query",
      required: false,
      description: "Repeatable (≤20). Prefix subscription (tick. → all tick.*); * = everything",
      schema: { type: "string" },
    },
  ],
  responses: {
    "101": { description: "Switching Protocols — WS frames follow (JSON, bigints as strings)" },
    "401": { description: "Raw HTTP/1.1 401 Unauthorized (no body)" },
  },
});

// ---------------------------------------------------------------------------
// Generate + emit (deterministic: sorted routes, fixed component order)
// ---------------------------------------------------------------------------
ROUTES.sort((a, b) => (a.method + a.path).localeCompare(b.method + b.path));
for (const route of ROUTES) {
  registry.registerPath(route);
}

const doc = new OpenApiGeneratorV31(registry.definitions).generateDocument({
  openapi: "3.1.0",
  info: {
    title: "Axiom Protocol Backend",
    version: pkg.version ?? "0.1.0",
    description:
      "Axiom Protocol backend HTTP/WS surface: chat (SSE), agents, events, orchestrator, skills, archive, MCP (streamable-HTTP), WebSocket stream. " +
      "SSE/WS frame specs and the key-tier model are documented via x-* extensions (x-sse-events, x-websocket/x-ws-events, securityScheme descriptions).",
  },
  servers: [{ url: "http://localhost:3010", description: "local (AXIOM_PORT override)" }],
  security: [{ serverKey: [] }],
  "x-mcp-streamable-http": true,
  components: { securitySchemes: {} },
});

// Drop the empty components.parameters the generator always emits.
if (doc.components?.parameters && Object.keys(doc.components.parameters).length === 0) {
  delete doc.components.parameters;
}

const outPath = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "openapi.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`);

const pathCount = Object.keys(doc.paths).length;
const opCount = Object.values(doc.paths).reduce(
  (n, p) => n + Object.keys(p).filter((k) => k !== "parameters").length,
  0,
);
console.log(`wrote ${outPath}: ${pathCount} paths, ${opCount} operations, ${Object.keys(doc.components?.schemas ?? {}).length} schemas`);
