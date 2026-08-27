// In-process MCP tool dispatch (OE-11): each tool calls the same service functions the
// REST routers use, as plain functions — no HTTP self-call through mcpBaseUrl, no boot-order
// coupling between the MCP server and the listening HTTP server. The loopback path is kept
// as a fallback behind AXIOM_MCP_LOOPBACK=true (see mcp/server.ts).
import { z } from "zod";
import { ethers } from "ethers";
import { AGENT_NFT_ABI } from "@axiom/config/abis";
import { EVENT_NAMES, bigintReplacer } from "@axiom/config/constants";
import { getEventStore } from "../events/store.js";
import { QUERYABLE_EVENT_NAMES } from "../indexer/events.js";
import { getSharedProvider } from "../providers.js";
import type { ServerConfig } from "../config-types.js";
import type { PaymentProcessorClient } from "../payment/processor.js";
import pkg from "../../package.json" with { type: "json" };

// Shared TTL caches so repeated MCP reads hit the same cache generation as the REST surface.
// Keyed identically to the routers' caches (routers/agents.ts agentCache, routers/payment.ts
// paymentConfigCache) but with its own instance — a cold cache only costs one extra provider read.
const AGENT_LIST_TTL_MS = 120_000;
const CONFIG_TTL_MS = 300_000;

class TTLCache<T> {
  private readonly cache = new Map<string, { data: T; at: number }>();
  constructor(private readonly ttlMs: number) {}
  get(key: string): T | undefined {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.data;
    this.cache.delete(key);
    return undefined;
  }
  set(key: string, data: T): void {
    this.cache.set(key, { data, at: Date.now() });
  }
}

const agentCache = new TTLCache<unknown>(AGENT_LIST_TTL_MS);
const configCache = new TTLCache<unknown>(CONFIG_TTL_MS);

// Mirrors MAX_AGENT_ENUMERATION / AGENT_LOG_SCAN_BLOCKS in routers/agents.ts — the MCP
// tool must return the same shape and obey the same caps as GET /v1/agents.
const MAX_AGENT_ENUMERATION = 100;
const AGENT_LOG_SCAN_BLOCKS = 50_000;

export type McpToolOutcome =
  | { ok: true; payload: unknown }
  | { ok: false; status: number; message: string };

export interface McpToolDeps {
  config: ServerConfig;
  getPayment: () => Promise<PaymentProcessorClient>;
}

export type McpToolHandler = (
  args: Record<string, unknown>,
) => Promise<McpToolOutcome>;

const OWNER_SCHEMA = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .describe("Owner address (0x-prefixed, 40 hex chars)");

/** list_agents — GET /v1/agents?owner=… parity (routers/agents.ts). */
async function listAgents(
  deps: McpToolDeps,
  args: Record<string, unknown>,
): Promise<McpToolOutcome> {
  const owner = String(args.owner).toLowerCase();
  const cached = agentCache.get(owner);
  if (cached) return { ok: true, payload: cached };

  const nftAddr = deps.config.addresses?.agentNft;
  if (!nftAddr)
    return {
      ok: false,
      status: 503,
      message: "Agent NFT address not configured",
    };
  const provider = getSharedProvider();
  const iface = new ethers.Interface(AGENT_NFT_ABI);
  const balanceHex = await provider.call({
    to: nftAddr,
    data: iface.encodeFunctionData("balanceOf", [owner]),
  });
  const balance = BigInt(balanceHex);
  const tokens: { tokenId: string; owner: string; dataDescription?: string }[] =
    [];
  const transferTopic = iface.getEvent("Transfer")!.topicHash;
  if (balance > 0n) {
    const paddedOwner = ("0x" +
      "00".repeat(12) +
      owner.slice(2)) as `0x${string}`;
    const latest = await provider.getBlockNumber();
    const fromBlock = Math.max(0, latest - AGENT_LOG_SCAN_BLOCKS);
    let transferLogs = await provider.getLogs({
      address: nftAddr,
      fromBlock,
      toBlock: "latest",
      topics: [transferTopic, null, paddedOwner],
    });
    if (transferLogs.length === 0) {
      try {
        transferLogs = await provider.getLogs({
          address: nftAddr,
          fromBlock: 0,
          toBlock: "latest",
          topics: [transferTopic, null, paddedOwner],
        });
      } catch {
        // best-effort: a log fetch failure must not abort the owner lookup
      }
    }
    const uniqueTokenIds = [
      ...new Set(
        transferLogs.flatMap((entry) =>
          entry.topics[3] ? [BigInt(entry.topics[3])] : [],
        ),
      ),
    ];
    const ownerResults = await Promise.all(
      uniqueTokenIds.slice(0, MAX_AGENT_ENUMERATION).map(async (tokenId) => {
        const ownerHex = await provider.call({
          to: nftAddr,
          data: iface.encodeFunctionData("ownerOf", [tokenId]),
        });
        const currentOwner = ethers.getAddress("0x" + ownerHex.slice(26));
        return currentOwner.toLowerCase() === owner
          ? { tokenId: tokenId.toString(), owner }
          : null;
      }),
    );
    for (const t of ownerResults) if (t) tokens.push(t);
    const metadataResults = await Promise.allSettled(
      tokens.map(async (t) => {
        try {
          const dataHex = await provider.call({
            to: nftAddr,
            data: iface.encodeFunctionData("intelligentDatasOf", [
              BigInt(t.tokenId),
            ]),
          });
          const decoded = iface.decodeFunctionResult(
            "intelligentDatasOf",
            dataHex,
          );
          const datas = decoded[0] as Array<{ dataDescription: string }>;
          return datas[0]?.dataDescription ?? "";
        } catch {
          return "";
        }
      }),
    );
    tokens.forEach((token, i) => {
      const result = metadataResults[i];
      if (result?.status === "fulfilled")
        token.dataDescription = String(result.value ?? "");
    });
  }
  const result = { owner, agents: tokens };
  agentCache.set(owner, result);
  return { ok: true, payload: result };
}

/** get_agent_performance — GET /v1/agents/:id/performance parity (routers/performance.ts). */
function getAgentPerformance(
  _deps: McpToolDeps,
  args: Record<string, unknown>,
): McpToolOutcome {
  const id = String(args.id);
  const limit =
    args.limit !== undefined
      ? Math.min(Math.max(1, Number(args.limit)), 500)
      : 500;
  const ticks = getEventStore().queryByAgent({
    tokenId: id,
    eventName: EVENT_NAMES.Tick,
    limit,
  });
  const counts = { buyCount: 0, sellCount: 0, holdCount: 0 };
  const history = ticks.map((evt) => ({
    timestamp: evt.receivedAt,
    action: recordAction(evt.payload, counts),
    amount: payloadNumber(evt.payload, "amount") ?? null,
    reason: payloadField(evt.payload, "reason") ?? "",
    durationMs: payloadNumber(evt.payload, "durationMs") ?? null,
    blockNumber: evt.blockNumber,
    txHash: evt.txHash,
  }));
  return {
    ok: true,
    payload: {
      metrics: summarizeCounts(counts),
      history: history.toReversed(),
    },
  };
}

/** get_events — GET /v1/events parity (routers/events.ts). */
function getEvents(
  _deps: McpToolDeps,
  args: Record<string, unknown>,
): McpToolOutcome {
  const maxLimit = 500;
  const limit =
    args.limit !== undefined
      ? Math.min(Math.max(1, Number(args.limit)), maxLimit)
      : maxLimit;
  const since =
    args.since !== undefined && Number(args.since) > 0
      ? Number(args.since)
      : undefined;
  const eventName =
    args.eventName !== undefined ? String(args.eventName) : undefined;
  if (
    eventName !== undefined &&
    !QUERYABLE_EVENT_NAMES.includes(
      eventName as (typeof QUERYABLE_EVENT_NAMES)[number],
    )
  ) {
    return {
      ok: false,
      status: 400,
      message: `unknown eventName: "${eventName}"`,
    };
  }
  const all = getEventStore().getAll(limit, since, eventName);
  const owner = args.owner !== undefined ? String(args.owner) : undefined;
  const ownerFiltered = owner
    ? all.filter((e) => {
        const payload = e.payload as Record<string, unknown>;
        return (
          payload?.owner === owner ||
          payload?.to === owner ||
          payload?.from === owner
        );
      })
    : all;
  return { ok: true, payload: { events: ownerFiltered } };
}

/** get_agent_performance_batch — GET /v1/agents/performance/batch parity (routers/performance.ts). */
function getAgentPerformanceBatch(
  _deps: McpToolDeps,
  args: Record<string, unknown>,
): McpToolOutcome {
  const ids = String(args.ids)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s));
  if (ids.length === 0) return { ok: true, payload: { results: {} } };
  if (ids.length > 50)
    return {
      ok: false,
      status: 400,
      message: "Maximum 50 agents per batch request",
    };
  const results: Record<
    string,
    {
      totalTicks: number;
      buyCount: number;
      sellCount: number;
      holdCount: number;
      buyRate: number;
      winRate: number;
    }
  > = {};
  for (const id of ids) {
    const ticks = getEventStore().queryByAgent({
      tokenId: id,
      eventName: EVENT_NAMES.Tick,
      limit: 500,
    });
    const counts = { buyCount: 0, sellCount: 0, holdCount: 0 };
    for (const evt of ticks) recordAction(evt.payload, counts);
    results[id] = summarizeCounts(counts);
  }
  return { ok: true, payload: { results } };
}

/** get_payment_config — GET /v1/payment/config parity (routers/payment.ts, cached 5min). */
async function getPaymentConfig(
  deps: McpToolDeps,
  _args: Record<string, unknown>,
): Promise<McpToolOutcome> {
  const cached = configCache.get("config");
  if (cached) return { ok: true, payload: cached };
  const result = await deps.getPayment().then((c) => c.protocolConfig());
  // bigintReplacer parity: REST serializes bigints as strings via the json replacer.
  const serialized = JSON.parse(JSON.stringify(result, bigintReplacer));
  configCache.set("config", serialized);
  return { ok: true, payload: serialized };
}

/** list_routes — GET /v1/routes parity (server.ts meta route). */
async function listRoutes(
  _deps: McpToolDeps,
  _args: Record<string, unknown>,
): Promise<McpToolOutcome> {
  // REGISTERED_ROUTES is fully populated by the time any MCP session runs:
  // createMcpRouter is mounted after every register*Routes call in server.ts.
  const { REGISTERED_ROUTES } = await import("../routers/route-factory.js");
  return {
    ok: true,
    payload: {
      routes: REGISTERED_ROUTES,
      meta: { version: pkg.version },
    },
  };
}

// ─── performance helpers (inlined from routers/performance.ts local fns) ───
type ActionCounts = { buyCount: number; sellCount: number; holdCount: number };

function recordAction(payload: unknown, counts: ActionCounts): string {
  const action = payloadField(payload, "action") ?? "";
  if (action === "buy") counts.buyCount++;
  else if (action === "sell") counts.sellCount++;
  else counts.holdCount++;
  return action;
}

function payloadNumber(payload: unknown, key: string): number | undefined {
  const val =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)[key]
      : undefined;
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}

function payloadField(payload: unknown, key: string): string | undefined {
  const val =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)[key]
      : undefined;
  return val === undefined || val === null ? undefined : String(val);
}

function summarizeCounts(counts: ActionCounts) {
  const totalTicks = counts.buyCount + counts.sellCount + counts.holdCount;
  return {
    totalTicks,
    ...counts,
    buyRate: totalTicks > 0 ? counts.buyCount / totalTicks : 0,
    winRate:
      totalTicks > 0 ? (counts.buyCount + counts.sellCount) / totalTicks : 0,
  };
}

export interface McpInProcessToolDef {
  name: string;
  title: string;
  description: string;
  schema: Record<string, z.ZodTypeAny>;
  handler: McpToolHandler;
}

/** Tool registry consumed by mcp/server.ts — each handler is the in-process dispatch path. */
export function buildInProcessTools(deps: McpToolDeps): McpInProcessToolDef[] {
  return [
    {
      name: "list_agents",
      title: "List Agents",
      description:
        "List NFT agents owned by an address. GET /v1/agents?owner=… Returns tokenId, owner, and dataDescription per agent.",
      schema: { owner: OWNER_SCHEMA },
      handler: (args) => listAgents(deps, args),
    },
    {
      name: "get_agent_performance",
      title: "Get Agent Performance",
      description:
        "Strategy performance metrics and tick history for one agent. GET /v1/agents/:id/performance — the per-agent read surface (the repo has no GET /v1/agents/:id detail route).",
      schema: {
        id: z.string().regex(/^\d+$/).describe("Agent token ID"),
        limit: z
          .number()
          .int()
          .positive()
          .max(500)
          .optional()
          .describe("Max ticks to scan (default 500)"),
      },
      handler: (args) => Promise.resolve(getAgentPerformance(deps, args)),
    },
    {
      name: "get_events",
      title: "Get Events",
      description:
        "Query the event store with optional filters. GET /v1/events. Filters: eventName (e.g. Tick), owner (payload owner/to/from), since (epoch ms), limit.",
      schema: {
        eventName: z
          .string()
          .optional()
          .describe("Event name filter (e.g. Tick)"),
        owner: z
          .string()
          .optional()
          .describe("Payload owner/to/from address filter"),
        since: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Only events received after this epoch ms"),
        limit: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Max events (capped by server config)"),
      },
      handler: (args) => Promise.resolve(getEvents(deps, args)),
    },
    {
      name: "get_agent_performance_batch",
      title: "Get Agent Performance (Batch)",
      description:
        "Performance metrics for up to 50 agents in one call. GET /v1/agents/performance/batch?ids=1,2,3",
      schema: {
        ids: z
          .string()
          .describe('Comma-separated agent token IDs (max 50, e.g. "1,2,3")'),
      },
      handler: (args) => Promise.resolve(getAgentPerformanceBatch(deps, args)),
    },
    {
      name: "get_payment_config",
      title: "Get Payment Config",
      description:
        "Payment contract configuration (payment token, protocol fee bps, treasury). GET /v1/payment/config",
      schema: {},
      handler: (args) => getPaymentConfig(deps, args),
    },
    {
      name: "list_routes",
      title: "List Routes",
      description:
        "List all mounted REST routes plus backend meta (version, chainId, signer). GET /v1/routes",
      schema: {},
      handler: (args) => listRoutes(deps, args),
    },
  ];
}
