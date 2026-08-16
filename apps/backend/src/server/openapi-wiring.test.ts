/**
 * openapi-wiring.test.ts — OpenAPI spec ↔ real frontend/chat-runtime consumer wiring assert
 *
 * Proves that `apps/backend/docs/openapi.json` (hand-maintained route tables in
 * scripts/generate-openapi.mjs, rendered against the zod request schemas by
 * `bun run generate:openapi` — NOT derived from REGISTERED_ROUTES) matches how the
 * frontend and chat-runtime actually call the backend. Static contract checks read
 * the spec JSON, resolve $refs, and assert per-consumer existence / params /
 * bodies / responses. The route-coverage test boots one throwaway server (port 0,
 * InMemoryStorage) so REGISTERED_ROUTES is populated, then asserts every mounted
 * path+method appears in the committed spec — that kills the silent-omission class
 * (a route mounted without a spec entry). No network beyond 127.0.0.1, no new deps
 * (bun:test + node:fs).
 *
 * Consumer fixture below is derived from /tmp/openapi-deep-frontend.md (31-consumer
 * field table) and /tmp/openapi-frontend-plan.md; HTTP consumers only — WS (#22/23),
 * on-chain and local consumers are excluded by design. Corrections baked in from the
 * deep dive:
 *   - M1:  useAgents response items carry {tokenId, owner, dataDescription?} ONLY —
 *          the backend (routers/agents.ts:272) never sends dataHash/uri.
 *   - M7:  chat-runtime execute_tick body is {vault, agentNft, agentTokenId,
 *          computeModel?} only — no strategy/signal fields or executionPlan.
 *   - M3:  oracle mint body is {dataHash} (the extra `to` from encode.ts:331 is
 *          silently stripped by mintDataHashSchema — flag only, not asserted).
 *
 * -----------------------------------------------------------------------------------
 * openapi-typescript EVALUATION (plan-only — do NOT add the dep yet)
 * -----------------------------------------------------------------------------------
 * Research verdict from the deep plan §(c):
 *   - openapi-typescript v7 (openapi-ts org) is the maintained, sponsor-backed TS
 *     generator; full OpenAPI 3.1 support; CLI: `bunx openapi-typescript spec.json -o
 *     generated.d.ts`. openapi-typescript-codegen is unmaintained.
 *   - openapi-fetch (same org) is on a deprecation path toward feTS — do NOT adopt it;
 *     the frontend has a bespoke apiFetch (retry/abort/timeout) and only wants the
 *     generated types, not a client.
 *   - Generate-from-spec vs zod inference: community consensus is zod = single source
 *     of truth when you own the API (z.infer for types, zod→OpenAPI for docs/clients).
 *     Generate-from-spec tools (orval, openapi-zod-client) are for third-party specs.
 *   - Verdict: PARTIAL adoption, later — generate `packages/config/src/openapi/
 *     generated.d.ts` from the local spec and add `satisfies`-style assignability
 *     asserts between manual types (TickRequest/TickResult/TransferResponse/
 *     EncodeResponse/PaymentConfig/PerformanceMetrics/ChatHistoryResponse/
 *     ComputeProvider) and the generated paths types. M2 (bigint-as-string) is a
 *     guaranteed first catch. Keep hand-written zod-derived types as the public API.
 *   - NOT added now: the real prerequisite is backend response schemas in the spec
 *     (same work this wiring test needs); without them generated types degrade to
 *     `unknown`. Add once `generate:openapi` output is stable.
 * -----------------------------------------------------------------------------------
 */

import { test, describe, beforeAll, afterAll } from "bun:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { Wallet } from "ethers";
import { z } from "zod";
import { InMemoryStorage } from "@axiom/config/storage/0g";
// Data dir must be pinned before server boot (EventStore file lock).
process.env.AXIOM_DATA_DIR = join(tmpdir(), `axiom-openapi-${process.pid}`);
import { startServer, type ServerConfig } from "../server.js";
import { REGISTERED_ROUTES } from "../routers/route-factory.js";

const SPEC_URL = new URL("../../docs/openapi.json", import.meta.url);
const SPEC_EXISTS = existsSync(SPEC_URL);
const SKIP_REASON =
  "apps/backend/docs/openapi.json not generated yet (run `bun run generate:openapi` in apps/backend) — wiring asserts skipped; re-run once the spec lands";

/* ------------------------------------------------------------------ */
/* Consumer fixture — static, hand-maintained, linted by the tests    */
/* ------------------------------------------------------------------ */

type BodyType =
  "string" | "number" | "boolean" | "array" | "object" | "unknown";

interface ConsumerCall {
  id: string;
  path: string; // Express-style template (":id"), converted to "{id}" in the test
  method: "GET" | "POST";
  auth: "public" | "client" | "server";
  transport: "json" | "sse";
  responseStatus?: number; // default 200
  pathParams?: string[];
  query?: string[]; // query params the consumer actually sends
  body?: Record<string, BodyType>; // request fields sent → wire JSON type ("unknown" = presence only)
  response?: string[]; // consumed top-level response fields (JSON transports)
  file: string; // provenance: file:line of the call site
}

const CONSUMER_CALLS: ConsumerCall[] = [
  // ---- apps/frontend/src HTTP consumers (#1-21 of the deep-plan table) ----
  {
    id: "useHealth",
    path: "/health",
    method: "GET",
    auth: "public",
    transport: "json",
    response: ["ok", "version", "signer", "chainHead", "oracle", "addresses"],
    file: "apps/frontend/src/hooks/useHealth.ts:26",
  },
  {
    id: "useAgents",
    path: "/v1/agents",
    method: "GET",
    auth: "client",
    transport: "json",
    query: ["owner"],
    response: ["agents"], // items = {tokenId, owner, dataDescription?} — M1 subset, asserted below
    file: "apps/frontend/src/hooks/useAgents.ts:31",
  },
  {
    id: "useChatHistory",
    path: "/v1/chat/history",
    method: "GET",
    auth: "client",
    transport: "json",
    query: ["wallet"],
    response: ["wallet", "count", "transcripts"],
    file: "apps/frontend/src/hooks/useChatHistory.ts:46",
  },
  {
    id: "useEventHistory",
    path: "/v1/events",
    method: "GET",
    auth: "client",
    transport: "json",
    query: ["since", "owner"],
    response: ["events"],
    file: "apps/frontend/src/hooks/useEventHistory.ts:68",
  },
  {
    id: "usePerformance",
    path: "/v1/agents/:id/performance",
    method: "GET",
    auth: "client",
    transport: "json",
    pathParams: ["id"],
    response: ["metrics", "history"],
    file: "apps/frontend/src/hooks/usePerformance.ts:36",
  },
  {
    id: "usePerformanceBatch",
    path: "/v1/agents/performance/batch",
    method: "GET",
    auth: "client",
    transport: "json",
    query: ["ids"],
    response: ["results"],
    file: "apps/frontend/src/hooks/usePerformanceBatch.ts:28",
  },
  {
    id: "useProviders",
    path: "/v1/compute/providers",
    method: "GET",
    auth: "client",
    transport: "json",
    query: ["model"],
    response: ["services"], // router passthrough — item fields untyped (z.record)
    file: "apps/frontend/src/hooks/useProviders.ts:86",
  },
  {
    id: "useMintWizard.encode",
    path: "/v1/agents/mint/encode",
    method: "POST",
    auth: "client",
    transport: "json",
    body: { dataDescription: "string", dataHash: "string", to: "string" },
    response: ["to", "data", "value"],
    file: "apps/frontend/src/hooks/useMintWizard.ts:60",
  },
  {
    id: "useMintWizard.registerOracle",
    path: "/oracle/v1/agents/mint",
    method: "POST",
    auth: "client",
    transport: "json",
    body: { dataHash: "string" },
    response: ["ok"],
    file: "apps/frontend/src/hooks/useMintWizard.ts:45",
  },
  {
    id: "useOrchestratorTick.tick",
    path: "/v1/orchestrator/tick",
    method: "POST",
    auth: "client",
    transport: "json",
    body: {
      vault: "string",
      agentNft: "string",
      agentTokenId: "string",
      computeModel: "string",
      strategy: "string",
      signalSource: "string",
      signalPayload: "unknown",
      stream: "boolean",
      executionPlan: "object",
    },
    response: [
      "recommendation",
      "rawModelOutput",
      "onchain",
      "storage",
      "durationMs",
    ],
    file: "apps/frontend/src/hooks/useOrchestratorTick.ts:80",
  },
  {
    id: "useOrchestratorTick.tickStream",
    path: "/v1/orchestrator/tick",
    method: "POST",
    auth: "client",
    transport: "sse",
    responseStatus: 202, // HTTP init {ok, streamTopic}; result arrives over WS
    body: {
      vault: "string",
      agentNft: "string",
      agentTokenId: "string",
      stream: "boolean",
    },
    response: ["ok", "streamTopic"],
    file: "apps/frontend/src/hooks/useOrchestratorTick.ts:108",
  },
  {
    id: "usePayment.getPaymentConfig",
    path: "/v1/payment/config",
    method: "GET",
    auth: "client",
    transport: "json",
    response: ["paymentToken", "protocolFeeBps", "protocolTreasury"],
    file: "apps/frontend/src/hooks/usePayment.ts:73",
  },
  {
    id: "usePayment.getEarnings",
    path: "/v1/agents/:id/earnings",
    method: "GET",
    auth: "client",
    transport: "json",
    pathParams: ["id"],
    response: ["tokenId", "creator", "earnings"],
    file: "apps/frontend/src/hooks/usePayment.ts:130",
  },
  {
    id: "usePayment.setRoyalty",
    path: "/v1/agents/:id/royalty",
    method: "POST",
    auth: "client",
    transport: "json",
    pathParams: ["id"],
    body: { bps: "number" },
    // Wire truth (server.ts:1075): {tokenId, bps, to, data, value} — NO `ok`.
    // FE type usePayment.ts:38-40 over-declares `ok: true` (dead field, unused by PaymentPanel).
    response: ["tokenId", "bps", "to", "data", "value"],
    file: "apps/frontend/src/hooks/usePayment.ts:141",
  },
  {
    id: "useTransfer.prepare",
    path: "/v1/agents/:id/transfer",
    method: "POST",
    auth: "client",
    transport: "json",
    pathParams: ["id"],
    body: {
      to: "string",
      receiverPubKey64: "string",
      accessProofNonce: "string",
    },
    response: [
      "ok",
      "stage",
      "tokenId",
      "dataHash",
      "targetPubkey",
      "accessProofNonce",
      "validUntil",
    ],
    file: "apps/frontend/src/hooks/useTransfer.ts:118",
  },
  {
    id: "useTransfer.finalize",
    path: "/v1/agents/:id/transfer",
    method: "POST",
    auth: "client",
    transport: "json",
    pathParams: ["id"],
    body: {
      to: "string",
      receiverPubKey64: "string",
      dataHash: "string",
      sealedKey: "string",
      accessProof: "object",
    },
    response: ["ok", "stage", "accessProof", "ownershipProof"],
    file: "apps/frontend/src/hooks/useTransfer.ts:196",
  },
  {
    id: "useTransfer.sealDekForOracle",
    path: "/oracle/health",
    method: "GET",
    auth: "public",
    transport: "json",
    response: ["uncompressedPubkey"],
    file: "apps/frontend/src/hooks/useTransfer.ts:63",
  },
  {
    id: "useVaultWrite.deposit",
    path: "/v1/agents/:id/deposit",
    method: "POST",
    auth: "client",
    transport: "json",
    pathParams: ["id"],
    body: { amount: "string" },
    response: ["to", "data", "value"],
    file: "apps/frontend/src/hooks/useVaultWrite.ts:46",
  },
  {
    id: "useVaultWrite.withdraw",
    path: "/v1/agents/:id/withdraw",
    method: "POST",
    auth: "client",
    transport: "json",
    pathParams: ["id"],
    body: { amount: "string" },
    response: ["to", "data", "value"],
    file: "apps/frontend/src/hooks/useVaultWrite.ts:46",
  },
  {
    id: "ChatPage.config",
    path: "/v1/config",
    method: "GET",
    auth: "client",
    transport: "json",
    response: ["contextWindow"],
    file: "apps/frontend/src/pages/ChatPage.tsx:817",
  },
  {
    id: "ChatPage.runAgent",
    path: "/v1/chat/completions",
    method: "POST",
    auth: "client",
    transport: "sse",
    body: {
      model: "string",
      messages: "array",
      tools: "array",
      stream: "boolean",
      wallet: "string",
      provider: "object",
    },
    file: "apps/frontend/src/pages/ChatPage.tsx:941",
  },
  // ---- packages/chat-runtime executors (in-browser via transport-browser.ts) ----
  {
    id: "read.list_my_agents",
    path: "/v1/agents",
    method: "GET",
    auth: "client",
    transport: "json",
    query: ["owner"],
    response: ["agents"],
    file: "packages/chat-runtime/src/executors/read.ts:19",
  },
  {
    id: "read.event_history",
    path: "/v1/events",
    method: "GET",
    auth: "client",
    transport: "json",
    query: ["limit", "eventName"],
    response: ["events"],
    file: "packages/chat-runtime/src/executors/read.ts:94",
  },
  {
    id: "encode.mint_agent",
    path: "/v1/agents/mint/encode",
    method: "POST",
    auth: "client",
    transport: "json",
    body: { dataDescription: "string", dataHash: "string", to: "string" },
    response: ["to", "data", "value"],
    file: "packages/chat-runtime/src/executors/encode.ts:124",
  },
  {
    id: "encode.registerDataHashWithOracle",
    path: "/oracle/v1/agents/mint",
    method: "POST",
    auth: "client",
    transport: "json",
    body: { dataHash: "string" }, // M3: encode.ts:331 also sends `to` — stripped by mintDataHashSchema (flag only)
    response: ["ok"],
    file: "packages/chat-runtime/src/executors/encode.ts:331",
  },
  {
    id: "encode.deposit",
    path: "/v1/agents/:id/deposit",
    method: "POST",
    auth: "client",
    transport: "json",
    pathParams: ["id"],
    body: { amount: "string" },
    response: ["to", "data", "value"],
    file: "packages/chat-runtime/src/executors/encode.ts:177",
  },
  {
    id: "encode.withdraw",
    path: "/v1/agents/:id/withdraw",
    method: "POST",
    auth: "client",
    transport: "json",
    pathParams: ["id"],
    body: { amount: "string" },
    response: ["to", "data", "value"],
    file: "packages/chat-runtime/src/executors/encode.ts:177",
  },
  {
    id: "orchestrate.execute_tick",
    path: "/v1/orchestrator/tick",
    method: "POST",
    auth: "client",
    transport: "json",
    body: {
      vault: "string",
      agentNft: "string",
      agentTokenId: "string",
      computeModel: "string",
    }, // M7: slim body only
    response: [
      "recommendation",
      "rawModelOutput",
      "onchain",
      "storage",
      "durationMs",
    ],
    file: "packages/chat-runtime/src/executors/orchestrate.ts:101",
  },
  {
    id: "archive.query",
    path: "/v1/archive/query",
    method: "POST",
    auth: "client",
    transport: "json",
    body: {
      intent: "string",
      url: "string",
      handle: "string",
      limit: "number",
      fullList: "boolean",
    },
    // response is free-form archive JSON (whole body echoed) — no field asserts
    file: "packages/chat-runtime/src/executors/archive.ts:13",
  },
  {
    id: "skill.evm.wallet",
    path: "/v1/skills/evm/wallet",
    method: "POST",
    auth: "client",
    transport: "json",
    body: { context: "object" },
    file: "packages/chat-runtime/src/executors/skill.ts:67",
  },
  {
    id: "skill.unbroker.simulate",
    path: "/v1/skills/unbroker/simulate",
    method: "POST",
    auth: "server", // unbroker_* is excluded from CLIENT_TOOL_CATALOG (tools.ts:18-20) — server key only
    transport: "json",
    body: { context: "object" },
    file: "packages/chat-runtime/src/executors/skill.ts:67",
  },
];

/* ------------------------------------------------------------------ */
/* Spec loading — minimal zod envelope validation (rest stays unknown) */
/* ------------------------------------------------------------------ */

const OpenApiEnvelope = z.object({
  openapi: z.string(),
  paths: z.record(z.string(), z.unknown()),
  // Lossless: z.object strips unknown keys by default, which would DROP
  // components.schemas and break every #/components/schemas/* $ref below.
  components: z.record(z.string(), z.unknown()).optional(),
  security: z.array(z.record(z.string(), z.array(z.unknown()))).optional(),
});
type SpecEnvelope = z.infer<typeof OpenApiEnvelope>;

function loadSpec(): SpecEnvelope | null {
  if (!SPEC_EXISTS) return null;
  const raw = readFileSync(SPEC_URL, "utf8");
  const parsed: unknown = JSON.parse(raw);
  const result = OpenApiEnvelope.safeParse(parsed);
  if (!result.success) {
    assert.fail(
      `docs/openapi.json is not a valid OpenAPI envelope: ${result.error.issues[0]?.message ?? "parse error"}`,
    );
  }
  return result.data;
}

const spec = loadSpec();

/* ------------------------------------------------------------------ */
/* Spec helpers — cycle-safe $ref resolution, schema walks (no `any`)  */
/* ------------------------------------------------------------------ */

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isUnknownArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

function resolveJsonPointer(ref: string): unknown {
  if (!ref.startsWith("#/")) return undefined; // external refs unsupported — treat as unresolvable
  const parts = ref
    .slice(2)
    .split("/")
    .map((p) => decodeURIComponent(p));
  let cur: unknown = spec;
  for (const part of parts) {
    if (!isObject(cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

function derefSchema(schema: unknown, seen: Set<string> = new Set()): unknown {
  if (!isObject(schema)) return schema ?? {};
  const ref = schema.$ref;
  if (typeof ref !== "string") return schema;
  if (!ref.startsWith("#/") || seen.has(ref)) return {}; // external/cycle → unknown
  seen.add(ref);
  return derefSchema(resolveJsonPointer(ref), seen);
}

/** Members of every present anyOf/oneOf/allOf combinator, in that order. */
function combinatorMembers(s: object): unknown[] {
  const out: unknown[] = [];
  for (const k of ["anyOf", "oneOf", "allOf"] as const) {
    const member = s[k];
    if (isUnknownArray(member)) out.push(...member);
  }
  return out;
}

/** Union of primitive type tokens: "string" | "number" | "integer" | "boolean" | "array" | "object" | "null". */
function typeTokens(
  schema: unknown,
  seen: Set<string> = new Set(),
): Set<string> {
  const s = derefSchema(schema, seen);
  const tokens = new Set<string>();
  if (!isObject(s)) return tokens;
  if (typeof s.type === "string") tokens.add(s.type);
  else if (isUnknownArray(s.type))
    for (const t of s.type) if (typeof t === "string") tokens.add(t);
  for (const m of combinatorMembers(s))
    for (const t of typeTokens(m, seen)) tokens.add(t);
  return tokens;
}

/** Union of object property names, including through oneOf/anyOf/allOf members. */
function collectProperties(
  schema: unknown,
  seen: Set<string> = new Set(),
): Set<string> {
  const s = derefSchema(schema, seen);
  const props = new Set<string>();
  if (!isObject(s)) return props;
  const properties = s.properties;
  if (isObject(properties))
    for (const k of Object.keys(properties)) props.add(k);
  for (const m of combinatorMembers(s))
    for (const p of collectProperties(m, seen)) props.add(p);
  return props;
}

function findPropertySchema(schema: unknown, name: string): unknown {
  const s = derefSchema(schema);
  if (!isObject(s)) return undefined;
  const properties = s.properties;
  if (isObject(properties) && properties[name] !== undefined)
    return properties[name];
  for (const m of combinatorMembers(s)) {
    const found = findPropertySchema(m, name);
    if (found !== undefined) return found;
  }
  return undefined;
}

function typeCompatible(expected: BodyType, tokens: Set<string>): boolean {
  if (expected === "unknown" || tokens.size === 0) return true; // untyped / z.unknown accepts anything
  switch (expected) {
    case "string":
      return tokens.has("string");
    case "number":
      return tokens.has("number") || tokens.has("integer");
    case "boolean":
      return tokens.has("boolean");
    case "array":
      return tokens.has("array");
    case "object":
      return tokens.has("object");
    default:
      return true;
  }
}

function openapiTemplate(expressPath: string): string {
  return expressPath.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function getOperation(call: ConsumerCall): {
  p: string;
  pathItem: Record<string, unknown>;
  method: string;
  op: Record<string, unknown>;
} | null {
  const p = openapiTemplate(call.path);
  const pathItem = spec?.paths?.[p];
  if (!isObject(pathItem)) return null;
  const op = pathItem[call.method.toLowerCase()];
  if (!isObject(op)) return null;
  return { p, pathItem, method: call.method, op };
}

/** Prefer application/json, else the first media type carrying a schema. */
function jsonSchemaOf(content: Record<string, unknown>): unknown {
  const json = content["application/json"];
  if (isObject(json) && json.schema !== undefined) return json.schema;
  for (const mt of Object.keys(content)) {
    const media = content[mt];
    if (isObject(media) && media.schema !== undefined) return media.schema;
  }
  return undefined;
}

function successResponse(op: Record<string, unknown>, status: number): unknown {
  const responses = op.responses;
  if (!isObject(responses)) return null;
  const resp = responses[String(status)] ?? responses.default;
  if (resp === undefined) return null;
  return derefSchema(resp);
}

function queryDeclared(
  pathItem: Record<string, unknown>,
  op: Record<string, unknown>,
  q: string,
): boolean {
  const allParams: unknown[] = [];
  for (const holder of [pathItem, op]) {
    const params = holder.parameters;
    if (isUnknownArray(params)) allParams.push(...params);
  }
  for (const pRaw of allParams) {
    const p = derefSchema(pRaw);
    if (isObject(p) && p.in === "query" && p.name === q) return true;
  }
  // M8: manual req.query routes (agents owner, events since/owner/limit/eventName,
  // perf ids, providers model, chat/history wallet) must be surfaced via
  // x-query-fields when they aren't explicit parameters.
  const xqf = op["x-query-fields"] ?? pathItem["x-query-fields"];
  if (isUnknownArray(xqf)) return xqf.includes(q);
  if (isObject(xqf)) {
    if (isUnknownArray(xqf.fields) && xqf.fields.includes(q)) return true;
    if (Object.hasOwn(xqf, q)) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* M2 bigint-as-string invariant walk                                 */
/* ------------------------------------------------------------------ */

const M2_STRING_FIELDS: Record<string, true> = {
  vaultBalance: true,
  protocolFeeBps: true,
  earnings: true,
};
// blockNumber is bigint → string ONLY in the tick response (orchestrator/index.ts:474
// `BigInt(log.blockNumber)`). /v1/events and /v1/agents/:id/performance emit genuine
// JS numbers (events/store.ts:97, routers/performance.ts:91) — must NOT be forced string.
const M2_BLOCKNUMBER_PATHS: Record<string, true> = {
  "/v1/orchestrator/tick": true,
};

function walkM2(
  schema: unknown,
  pathLabel: string,
  fieldSet: Record<string, true>,
  failures: string[],
  seen: Set<string>,
): void {
  const s = derefSchema(schema, seen);
  if (!isObject(s)) return;
  const properties = s.properties;
  if (isObject(properties)) {
    for (const [name, prop] of Object.entries(properties)) {
      if (fieldSet[name] === true) {
        const tokens = typeTokens(prop);
        if (!tokens.has("string")) {
          failures.push(
            `M2 bigint-as-string: ${pathLabel}.${name} must be type string (bigintReplacer stringifies bigints on the wire); spec has ${[...tokens].join(" | ") || "no type info"}`,
          );
        }
      }
      walkM2(prop, `${pathLabel}.${name}`, fieldSet, failures, seen);
    }
  }
  for (const k of ["anyOf", "oneOf", "allOf"] as const) {
    const member = s[k];
    if (isUnknownArray(member))
      for (const m of member) walkM2(m, pathLabel, fieldSet, failures, seen);
  }
  if (s.items !== undefined)
    walkM2(s.items, `${pathLabel}[]`, fieldSet, failures, seen);
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

test("fixture sanity: ≥20 HTTP consumers, unique ids, valid shapes", () => {
  assert.ok(
    CONSUMER_CALLS.length >= 20,
    `fixture covers ${CONSUMER_CALLS.length} HTTP consumers — need ≥20 (derived from the 31-consumer table, WS/on-chain/local excluded)`,
  );
  const ids = CONSUMER_CALLS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, "consumer ids must be unique");
  for (const c of CONSUMER_CALLS) {
    assert.ok(
      c.path.startsWith("/"),
      `${c.id}: path must be an absolute Express template`,
    );
    assert.ok(
      c.method === "GET" || c.method === "POST",
      `${c.id}: method must be GET|POST`,
    );
    assert.ok(c.file.length > 0, `${c.id}: provenance file:line required`);
    assert.ok(
      ["public", "client", "server"].includes(c.auth),
      `${c.id}: auth tier ${c.auth}`,
    );
    assert.ok(
      ["json", "sse"].includes(c.transport),
      `${c.id}: transport ${c.transport}`,
    );
    assert.ok(
      !c.pathParams || c.pathParams.every((p) => c.path.includes(`:${p}`)),
      `${c.id}: pathParams ${c.pathParams?.join(",")} must appear in the Express template`,
    );
    assert.ok(
      !c.query || c.query.every((q) => typeof q === "string" && q.length > 0),
      `${c.id}: query names`,
    );
  }
});

describe.skipIf(!SPEC_EXISTS)(
  `openapi wiring-assert — consumers vs apps/backend/docs/openapi.json${SPEC_EXISTS ? "" : ` (SKIPPED: ${SKIP_REASON})`}`,
  () => {
    test("spec sanity: OpenAPI 3.x document with a paths object", () => {
      assert.match(
        spec?.openapi ?? "",
        /^3\.\d+\.\d+$/,
        "docs/openapi.json must be an OpenAPI 3.x document",
      );
      assert.ok(
        spec?.paths && typeof spec.paths === "object",
        "spec.paths must exist",
      );
    });

    test("(a) every consumer path+method exists in spec.paths", () => {
      const missing: string[] = [];
      for (const call of CONSUMER_CALLS) {
        const op = getOperation(call);
        if (!op)
          missing.push(
            `${call.id} → ${call.method} ${openapiTemplate(call.path)}`,
          );
      }
      assert.equal(
        missing.length,
        0,
        `consumers hitting routes with NO spec entry:\n  ${missing.join("\n  ")}`,
      );
    });

    test("(b) every consumer query param is declared (query parameter or x-query-fields)", () => {
      const failures: string[] = [];
      for (const call of CONSUMER_CALLS) {
        const op = getOperation(call);
        if (!op || !call.query) continue;
        for (const q of call.query) {
          if (!queryDeclared(op.pathItem, op.op, q)) {
            failures.push(
              `${call.id}: query param "${q}" not declared (no ?${q}= parameter and no x-query-fields entry)`,
            );
          }
        }
      }
      assert.equal(
        failures.length,
        0,
        `undeclared query params:\n  ${failures.join("\n  ")}`,
      );
    });

    test("(c) every consumer success response exists with content", () => {
      const failures: string[] = [];
      for (const call of CONSUMER_CALLS) {
        const op = getOperation(call);
        if (!op) continue; // existence covered by (a)
        const status = call.responseStatus ?? 200;
        const resp = successResponse(op.op, status);
        if (resp === null) {
          failures.push(
            `${call.id}: no ${status} response (or default) schema`,
          );
          continue;
        }
        const content = isObject(resp) ? resp.content : undefined;
        if (!isObject(content) || Object.keys(content).length === 0) {
          failures.push(
            `${call.id}: ${status} response has no content media types`,
          );
          continue;
        }
        const needsJson =
          call.transport === "json" || (call.response?.length ?? 0) > 0;
        if (needsJson && jsonSchemaOf(content) === undefined) {
          failures.push(
            `${call.id}: ${status} response has no JSON schema (media types: ${Object.keys(content).join(", ")})`,
          );
        }
      }
      assert.equal(
        failures.length,
        0,
        `missing/invalid success responses:\n  ${failures.join("\n  ")}`,
      );
    });

    test("request bodies: every consumer body field is declared with a compatible type", () => {
      const failures: string[] = [];
      for (const call of CONSUMER_CALLS) {
        const op = getOperation(call);
        if (!op || !call.body) continue;
        const requestBody = derefSchema(op.op.requestBody);
        const content = isObject(requestBody) ? requestBody.content : undefined;
        const schema = isObject(content) ? jsonSchemaOf(content) : undefined;
        if (schema === undefined) {
          failures.push(`${call.id}: no application/json requestBody schema`);
          continue;
        }
        const props = collectProperties(schema);
        for (const [field, expected] of Object.entries(call.body)) {
          if (!props.has(field)) {
            failures.push(
              `${call.id}: body field "${field}" missing from requestBody schema (declared: ${[...props].sort().join(", ") || "none"})`,
            );
            continue;
          }
          const tokens = typeTokens(findPropertySchema(schema, field));
          if (!typeCompatible(expected, tokens)) {
            failures.push(
              `${call.id}: body field "${field}" expected ${expected} but spec types ${[...tokens].join(" | ") || "unknown"}`,
            );
          }
        }
      }
      assert.equal(
        failures.length,
        0,
        `request body drift:\n  ${failures.join("\n  ")}`,
      );
    });

    test("responses: every consumed top-level response field exists in the success schema", () => {
      const failures: string[] = [];
      for (const call of CONSUMER_CALLS) {
        if (!call.response || call.response.length === 0) continue;
        const op = getOperation(call);
        if (!op) continue; // existence covered by (a)
        const status = call.responseStatus ?? 200;
        const resp = successResponse(op.op, status);
        if (resp === null) continue; // covered by (c)
        const content = isObject(resp) ? resp.content : undefined;
        const schema = isObject(content) ? jsonSchemaOf(content) : undefined;
        if (schema === undefined) continue; // covered by (c)
        const props = collectProperties(schema);
        const missing = call.response.filter((f) => !props.has(f));
        if (missing.length > 0) {
          failures.push(
            `${call.id}: response fields missing from ${status} schema: ${missing.join(", ")} (declared: ${[...props].sort().join(", ") || "none"})`,
          );
        }
      }
      assert.equal(
        failures.length,
        0,
        `response field drift:\n  ${failures.join("\n  ")}`,
      );
    });

    test("M1: useAgents response items carry the server subset {tokenId, owner, dataDescription?}", () => {
      const call = CONSUMER_CALLS.find((c) => c.id === "useAgents");
      if (call === undefined) assert.fail("fixture must include useAgents");
      const op = getOperation(call);
      if (op === null) assert.fail("useAgents op missing (covered by (a))");
      const resp = successResponse(op.op, 200);
      if (resp === null)
        assert.fail("useAgents 200 response missing (covered by (c))");
      const content = isObject(resp) ? resp.content : undefined;
      if (!isObject(content))
        assert.fail("useAgents 200 response has no content");
      const schema = derefSchema(jsonSchemaOf(content));
      const agentsProp =
        isObject(schema) && isObject(schema.properties)
          ? schema.properties.agents
          : undefined;
      const agentsSchema = derefSchema(agentsProp);
      const items = derefSchema(
        isObject(agentsSchema) ? agentsSchema.items : undefined,
      );
      const props = collectProperties(items);
      for (const f of ["tokenId", "owner"]) {
        assert.ok(
          props.has(f),
          `agents[].${f} must be in the response schema (server sends it — routers/agents.ts:272)`,
        );
      }
      // M1 wire truth: the backend NEVER sends dataHash/uri — they must not be required.
      const requiredRaw = isObject(items) ? items.required : undefined;
      const required: string[] = isUnknownArray(requiredRaw)
        ? requiredRaw.filter((r): r is string => typeof r === "string")
        : [];
      const forbidden = ["dataHash", "uri"].filter((f) => required.includes(f));
      assert.equal(
        forbidden.length,
        0,
        `agents[] must not require ${forbidden.join("/")} (server never sends them; FE type fixed to match — useAgents.ts)`,
      );
    });

    test("M2 bigint-as-string invariants (vaultBalance / blockNumber / protocolFeeBps / earnings)", () => {
      const failures: string[] = [];
      const paths = spec?.paths ?? {};
      for (const [path, pathItem] of Object.entries(paths)) {
        if (!isObject(pathItem)) continue;
        const fieldSet: Record<string, true> = { ...M2_STRING_FIELDS };
        if (M2_BLOCKNUMBER_PATHS[path] === true) fieldSet.blockNumber = true;
        for (const [method, op] of Object.entries(pathItem)) {
          if (!isObject(op) || !isObject(op.responses)) continue; // skip path-level noise (parameters, summary, ...)
          for (const [code, response] of Object.entries(op.responses)) {
            if (!/^2\d\d$/.test(code)) continue; // success responses only
            const resp = derefSchema(response);
            const content = isObject(resp) ? resp.content : undefined;
            if (!isObject(content)) continue;
            for (const mt of Object.keys(content)) {
              const media = content[mt];
              if (isObject(media) && media.schema !== undefined) {
                walkM2(
                  media.schema,
                  `${path} ${method.toUpperCase()} ${code}`,
                  fieldSet,
                  failures,
                  new Set(),
                );
              }
            }
          }
        }
      }
      assert.equal(
        failures.length,
        0,
        `bigint-as-string drift (bigintReplacer at server.ts:305):\n  ${failures.join("\n  ")}`,
      );
    });

    test("securitySchemes: server+client keys exist; /oracle paths carry client security", () => {
      const componentsRaw = spec?.components;
      const schemes: Record<string, unknown> =
        isObject(componentsRaw) && isObject(componentsRaw.securitySchemes)
          ? componentsRaw.securitySchemes
          : {};
      const keys = Object.keys(schemes);
      const findTierKey = (tier: string): string | null => {
        const exact = keys.find((k) => k.toLowerCase() === tier);
        if (exact) return exact;
        return keys.find((k) => k.toLowerCase().includes(tier)) ?? null;
      };
      const clientKey = findTierKey("client");
      const serverKey = findTierKey("server");
      if (clientKey === null || serverKey === null) {
        assert.fail(
          `securitySchemes missing client/server key (have: ${keys.join(", ") || "none"})`,
        );
      }
      const clientScheme = schemes[clientKey];
      assert.ok(
        isObject(clientScheme) &&
          clientScheme.type === "apiKey" &&
          clientScheme.in === "header" &&
          clientScheme.name === "x-api-key",
        `client scheme "${clientKey}" must be apiKey header x-api-key (got ${JSON.stringify(clientScheme)})`,
      );

      const oraclePaths = Object.keys(spec?.paths ?? {}).filter((p) =>
        p.startsWith("/oracle"),
      );
      assert.ok(
        oraclePaths.length > 0,
        "no /oracle paths in spec (expected /oracle/health + /oracle/v1/agents/mint for the oracle surface)",
      );
      const globalSecurity: unknown[] = spec?.security ?? [];
      const failures: string[] = [];
      for (const p of oraclePaths) {
        const pathItem = spec?.paths?.[p];
        if (!isObject(pathItem)) continue;
        for (const [method, op] of Object.entries(pathItem)) {
          if (!isObject(op) || !isObject(op.responses)) continue; // skip path-level noise
          const effective: unknown[] = isUnknownArray(op.security)
            ? op.security
            : globalSecurity;
          if (effective.length === 0) continue; // explicitly public (e.g. /oracle/health)
          const hasClient = effective.some(
            (s) => isObject(s) && Object.hasOwn(s, clientKey),
          );
          if (!hasClient) {
            failures.push(
              `${p} ${method.toUpperCase()} does not carry client security (security: ${JSON.stringify(effective)})`,
            );
          }
        }
      }
      assert.equal(
        failures.length,
        0,
        `oracle client-security drift:\n  ${failures.join("\n  ")}`,
      );
    });

    // Route coverage: boot a throwaway server so every router registers itself,
    // then assert REGISTERED_ROUTES ⊆ spec.paths — kills the silent-omission
    // class (route mounted, no spec entry). Reverse direction (spec ⊇ consumers)
    // is covered by test (a) above.
    let bootedServer: Server | null = null;
    beforeAll(() => {
      const { httpServer } = startServer({
        bind: "127.0.0.1",
        port: 0,
        evmRpc: "http://127.0.0.1:1",
        signer: new Wallet("0x" + "44".repeat(32)),
        chatStorage: new InMemoryStorage(),
        addresses: {
          agentNft: ("0x" + "00".repeat(19) + "01") as `0x${string}`,
          vault: ("0x" + "00".repeat(19) + "02") as `0x${string}`,
          verifier: ("0x" + "00".repeat(19) + "03") as `0x${string}`,
        },
        env: {
          AXIOM_TEE_SIGNER_PK: "0x" + "11".repeat(32),
        } as unknown as ServerConfig["env"],
      });
      bootedServer = httpServer;
    });
    afterAll(() => {
      bootedServer?.closeAllConnections?.();
      bootedServer?.close();
    });

    test("(r) every REGISTERED_ROUTES path+method appears in the spec", () => {
      assert.ok(
        REGISTERED_ROUTES.length >= 40,
        `only ${REGISTERED_ROUTES.length} routes registered — server boot incomplete`,
      );
      const failures: string[] = [];
      for (const r of REGISTERED_ROUTES) {
        const template = openapiTemplate(r.path);
        const pathItem = spec?.paths?.[template];
        if (!isObject(pathItem)) {
          failures.push(`registered but not in spec: ${r.method} ${template}`);
          continue;
        }
        if (!isObject(pathItem[r.method.toLowerCase()])) {
          failures.push(
            `path in spec but method missing: ${r.method} ${template}`,
          );
        }
      }
      assert.equal(
        failures.length,
        0,
        `spec drift (run \`bun run generate:openapi\` + commit):\n  ${failures.join("\n  ")}`,
      );
    });
  },
);
