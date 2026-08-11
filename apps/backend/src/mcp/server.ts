import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { requireServerAuth } from "@axiom/config/middleware/auth";
import { createLogger } from "../utils/logger.js";
import type { ServerConfig } from "../server.js";
import pkg from "../../package.json" with { type: "json" };

const log = createLogger("mcp");
const PKG_VERSION = pkg.version;
const MCP_CALL_TIMEOUT_MS = 15_000;

// Read-only facade: each tool maps 1:1 to a GET route the backend self-calls with the server API key (MCP client = server-privileged REST consumer); no write tools exposed.
interface McpToolDef {
  name: string;
  title: string;
  description: string;
  schema: Record<string, z.ZodTypeAny>;
  buildUrl: (args: Record<string, unknown>) => string;
}

const TOOLS: McpToolDef[] = [
  {
    name: "list_agents",
    title: "List Agents",
    description:
      "List NFT agents owned by an address. GET /v1/agents?owner=… Returns tokenId, owner, and dataDescription per agent.",
    schema: {
      owner: z
        .string()
        .regex(/^0x[0-9a-fA-F]{40}$/)
        .describe("Owner address (0x-prefixed, 40 hex chars)"),
    },
    buildUrl: (a) => `/v1/agents?owner=${encodeURIComponent(String(a.owner))}`,
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
    buildUrl: (a) =>
      `/v1/agents/${encodeURIComponent(String(a.id))}/performance${
        a.limit !== undefined ? `?limit=${Number(a.limit)}` : ""
      }`,
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
    buildUrl: (a) => {
      const q = new URLSearchParams();
      if (a.eventName !== undefined) q.set("eventName", String(a.eventName));
      if (a.owner !== undefined) q.set("owner", String(a.owner));
      if (a.since !== undefined) q.set("since", String(a.since));
      if (a.limit !== undefined) q.set("limit", String(a.limit));
      const qs = q.toString();
      return `/v1/events${qs ? `?${qs}` : ""}`;
    },
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
    buildUrl: (a) =>
      `/v1/agents/performance/batch?ids=${encodeURIComponent(String(a.ids))}`,
  },
  {
    name: "get_payment_config",
    title: "Get Payment Config",
    description:
      "Payment contract configuration (payment token, protocol fee bps, treasury). GET /v1/payment/config",
    schema: {},
    buildUrl: () => "/v1/payment/config",
  },
  {
    name: "list_routes",
    title: "List Routes",
    description:
      "List all mounted REST routes plus backend meta (version, chainId, signer). GET /v1/routes",
    schema: {},
    buildUrl: () => "/v1/routes",
  },
];

async function callReadEndpoint(
  config: ServerConfig,
  baseUrl: string,
  path: string,
): Promise<{ content: { type: "text"; text: string }[]; isError: boolean }> {
  const headers: Record<string, string> = { accept: "application/json" };
  const apiKey = config.env?.AXIOM_API_KEY;
  if (apiKey) headers["x-api-key"] = apiKey;
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      headers,
      signal: AbortSignal.timeout(MCP_CALL_TIMEOUT_MS),
    });
    const text = await res.text();
    if (!res.ok) {
      return {
        content: [
          {
            type: "text",
            text: `GET ${path} failed (HTTP ${res.status}): ${text.slice(0, 500)}`,
          },
        ],
        isError: true,
      };
    }
    return { content: [{ type: "text", text }], isError: false };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `GET ${path} failed: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      isError: true,
    };
  }
}

function buildMcpServer(
  config: ServerConfig,
  getBaseUrl: () => string,
): McpServer {
  const server = new McpServer({ name: "axiom", version: PKG_VERSION });
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.schema,
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async (args: Record<string, unknown>) =>
        callReadEndpoint(config, getBaseUrl(), tool.buildUrl(args)),
    );
  }
  return server;
}

function sendJsonRpcError(
  res: Response,
  status: number,
  message: string,
): void {
  if (res.headersSent) return;
  res.status(status).json({
    jsonrpc: "2.0",
    error: { code: -32000, message },
    id: null,
  });
}

/** Mount at /mcp, server API key only: /mcp is deliberately absent from CLIENT_ALLOWED_ROUTES, so client keys are denied. */
export function createMcpRouter(
  config: ServerConfig,
  opts: { baseUrl: () => string },
): Router {
  const transports = new Map<string, StreamableHTTPServerTransport>();
  const router = Router();
  router.use(requireServerAuth);

  router.post("/", async (req: Request, res: Response) => {
    const sessionId =
      typeof req.headers["mcp-session-id"] === "string"
        ? (req.headers["mcp-session-id"] as string)
        : undefined;
    try {
      let transport: StreamableHTTPServerTransport | undefined;
      if (sessionId) {
        transport = transports.get(sessionId);
        if (!transport) {
          // Unknown or stale session id gets a 404 per the MCP streamable-HTTP spec
          sendJsonRpcError(res, 404, "Unknown session ID");
          return;
        }
      }
      if (!transport) {
        if (!isInitializeRequest(req.body)) {
          sendJsonRpcError(
            res,
            400,
            "Bad Request: initialize required (no valid session ID provided)",
          );
          return;
        }
        const created = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          // enableJsonResponse: POST returns direct JSON while the GET SSE stream stays unchanged; clients must accept both per spec
          enableJsonResponse: true,
          onsessioninitialized: (sid: string) => {
            transports.set(sid, created);
            log.info("MCP session initialized", { sessionId: sid });
          },
        });
        created.onclose = () => {
          const sid = created.sessionId;
          if (sid && transports.get(sid) === created) {
            transports.delete(sid);
          }
        };
        transport = created;
        const server = buildMcpServer(config, opts.baseUrl);
        await server.connect(transport);
      }
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      log.error("MCP POST handler failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      sendJsonRpcError(res, 500, "Internal server error");
    }
  });

  async function handleMcpSession(
    req: Request,
    res: Response,
    method: "GET" | "DELETE",
  ): Promise<void> {
    const sessionId =
      typeof req.headers["mcp-session-id"] === "string"
        ? (req.headers["mcp-session-id"] as string)
        : undefined;
    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    try {
      const transport = transports.get(sessionId);
      if (transport) await transport.handleRequest(req, res);
    } catch (err) {
      log.error(`MCP ${method} handler failed`, {
        error: err instanceof Error ? err.message : String(err),
      });
      if (!res.headersSent) res.status(500).send("Internal server error");
    }
  }

  router.get("/", async (req: Request, res: Response) => {
    await handleMcpSession(req, res, "GET");
  });

  router.delete("/", async (req: Request, res: Response) => {
    await handleMcpSession(req, res, "DELETE");
  });

  return router;
}
