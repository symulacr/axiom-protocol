import { z } from "zod";
import express, {
  type Request,
  type Response,
  type Express,
  type NextFunction,
} from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { createServer, type Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { ServerConfig } from "./config-types.js";
import {
  TypedContract,
  type AgentNFTMethods,
} from "@axiom/config/types/contract";
import { ARISTOTLE_CHAIN_ID } from "@axiom/config/networks";
import { bigintReplacer } from "@axiom/config/constants";

import { logEffectiveComputeConfig } from "./providers.js";
import { AGENT_NFT_ABI } from "@axiom/config/abis";

import { StrategyRunner } from "./orchestrator/index.js";
import { TeeSigner } from "./oracle/signer.js";
import { registerOracleRoutes, type OracleRouteDeps } from "./oracle/routes.js";
import { type Eip712Domain, buildEip712Domain } from "@axiom/config/eip712";
import { getRuntimeConfig, HTTP } from "@axiom/config/constants";
import { getSharedProvider } from "./providers.js";
import { InMemoryStorage } from "@axiom/config/storage/0g";
import {
  createApiKeyAuth,
  enforceClientPathAllowlist,
  timingSafeMatch,
} from "@axiom/config/middleware/auth";
import { getEventStore } from "./events/store.js";
import { PaymentProcessorClient } from "./payment/processor.js";

import { createHealthRouter } from "./routers/health.js";
import { createRoute, REGISTERED_ROUTES } from "./routers/route-factory.js";
import { registerAgentRoutes } from "./routers/agents.js";
import { registerEventRoutes } from "./routers/events.js";
import { registerComputeRoutes } from "./routers/compute.js";
import { registerChatRoutes } from "./routers/chat.js";
import { registerPaymentRoutes } from "./routers/payment.js";
import { registerGovernanceRoutes } from "./routers/governance.js";
import { pushRouteMeta, routeMeta } from "./routers/shared.js";
import { registerPerformanceRoutes } from "./routers/performance.js";
import { registerOrchestratorRoutes } from "./routers/orchestrator.js";
import { createArchiveRouter } from "./services/archive.js";
import { createSkillRouters } from "./skills/routers.js";
import { createMcpRouter } from "./mcp/server.js";
import { createLogger } from "./utils/logger.js";
import { getSentry } from "./utils/logger.js";
import { sendError } from "./utils/response.js";
import {
  getClients,
  registerClient,
  unregisterClient,
  type ConnectedClient,
} from "./ws/broadcaster.js";
import pkg from "../package.json" with { type: "json" };
const log = createLogger("server");
const PKG_VERSION = pkg.version;
const MAX_WS_CLIENTS = getRuntimeConfig().wsMaxClients;
const LOCAL_BASE_URL = "http://localhost";

function shortSigner(addr: string): string {
  return addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

pushRouteMeta(["GET", "/v1/stream", "ws", "WebSocket event stream (upgrade)"]);

function isUpstreamTransportError(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  const code = e?.code ?? e?.cause?.code;
  if (typeof code !== "string") return false;
  return [
    "ECONNREFUSED",
    "ENOTFOUND",
    "ECONNRESET",
    "ETIMEDOUT",
    "ETIME",
    "EAI_AGAIN",
    "ECONNABORTED",
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_SOCKET",
    "UND_ERR_HEADERS_TIMEOUT",
  ].includes(code);
}

export type { ServerConfig };

export function assertStartupAuthNotDisabledInProduction(
  env: Record<string, string | undefined>,
): void {
  if (env.AXIOM_DISABLE_AUTH === "true" && env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to start: AXIOM_DISABLE_AUTH=true is not permitted when " +
        "NODE_ENV=production. API-key auth must be enabled in production — set " +
        "AXIOM_DISABLE_AUTH=false (or unset it).",
    );
  }
}

export function startServer(config: ServerConfig): {
  app: Express;
  httpServer: HttpServer;
} {
  assertStartupAuthNotDisabledInProduction(process.env);

  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "2mb" }));
  app.use(
    compression({
      // x-no-compression opt-out; SSE streams must stay unbuffered.
      filter: (req, res) => {
        const type = res.getHeader("Content-Type");
        return (
          req.headers["x-no-compression"] === undefined &&
          !(typeof type === "string" && type.includes("text/event-stream"))
        );
      },
    }),
  );

  app.use((req, res, next) => {
    const requestId = crypto.randomUUID();
    const start = Date.now();
    res.setHeader("x-request-id", requestId);
    (req as Request & { requestId?: string }).requestId = requestId;
    res.locals.requestId = requestId;
    res.on("finish", () => {
      log.info(`${req.method} ${req.originalUrl} ${res.statusCode}`, {
        duration: `${Date.now() - start}ms`,
        requestId,
      });
    });
    next();
  });

  const frontendOrigin = config.env?.AXIOM_FRONTEND_URL;
  const connectSrc = ["'self'"];
  if (frontendOrigin) connectSrc.push(frontendOrigin);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          connectSrc,
        },
      },
    }),
  );
  // CORS is fail-closed: only the configured frontend origin is allowed; unset denies cross-origin rather than a dev default.
  app.use(
    cors({
      origin: frontendOrigin ?? false,
      methods: ["GET", "POST"],
    }),
  );
  // Global limiter mounts BEFORE auth so x-api-key brute-forcing (401s) is throttled too.
  const rateLimitMax = Number.parseInt(
    process.env.AXIOM_RATE_LIMIT_MAX ?? "100",
    10,
  );
  app.use(
    rateLimit({
      windowMs: 60_000,
      max:
        Number.isFinite(rateLimitMax) && rateLimitMax > 0 ? rateLimitMax : 100,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );
  app.use(
    createApiKeyAuth(
      config.env?.AXIOM_API_KEY,
      // "/api/health": some proxies forward the /api prefix unstripped (L5-06).
      ["/health", "/api/health", "/health/live", "/oracle/health"],
      process.env.AXIOM_DISABLE_AUTH === "true",
      process.env.AXIOM_CLIENT_API_KEY,
    ),
  );
  // Browser keys only reach an explicit allowlist (not vault execute, forensics, event inject).
  app.use(enforceClientPathAllowlist);
  app.set("json replacer", bigintReplacer);

  const ogChainId = config.env?.AXIOM_CHAIN_ID ?? ARISTOTLE_CHAIN_ID;
  if (ogChainId === ARISTOTLE_CHAIN_ID) {
    console.warn(
      "[boot] AXIOM_CHAIN_ID=16661 (0G mainnet) — mainnet requires a distinct production signer set (runtime signer, TEE signer, storage signer)",
    );
  }
  logEffectiveComputeConfig(ogChainId, config.env?.AXIOM_COMPUTE_MODEL);
  const startedAt = Date.now();
  // Resolved post-listen so MCP self-calls work even on ephemeral ports (tests bind port 0).
  let mcpBaseUrl: string | null = null;
  const eip712Domain: Eip712Domain = buildEip712Domain(
    ogChainId,
    // verifier is env-required (resolveAddress throws at boot if unset) — no silent mainnet fallback
    config.addresses!.verifier,
  );
  // In-process oracle: the TEE signer is booted here from the same PK the trusted-signer
  // checks used, so proofs are inherently from the trusted signer (no HTTP oracle hop).
  const teeSignerPk = config.env?.AXIOM_TEE_SIGNER_PK;
  if (!teeSignerPk) throw new Error("AXIOM_TEE_SIGNER_PK required");
  const teeSigner = new TeeSigner(teeSignerPk, eip712Domain, ogChainId);
  // InMemory fallback is fine for dev/test, but in production it silently loses chat
  // transcripts AND oracle re-key blobs (the in-process oracle shares this storage) —
  // fail loud instead of serving fake storage.
  const oracleStorage = config.chatStorage ?? new InMemoryStorage();
  if (
    oracleStorage instanceof InMemoryStorage &&
    process.env.NODE_ENV === "production"
  ) {
    throw new Error(
      "Refusing to start: NODE_ENV=production without real 0G storage " +
        "(AXIOM_STORAGE_INDEXER_RPC). The InMemoryStorage fallback would silently lose " +
        "chat transcripts and oracle re-key blobs — set AXIOM_STORAGE_INDEXER_RPC (+ " +
        "AXIOM_STORAGE_PRIVATE_KEY) or run with NODE_ENV=development/test.",
    );
  }
  const oracleDeps: OracleRouteDeps = {
    signer: teeSigner,
    storage: oracleStorage,
    chainId: BigInt(ogChainId),
    verifier: config.addresses!.verifier,
    env: config.env,
  };
  let orchestratorHandle: StrategyRunner | null = null;

  function getOrCreateOrchestrator(): StrategyRunner | null {
    if (!orchestratorHandle) {
      try {
        orchestratorHandle = new StrategyRunner({
          evmRpc: config.evmRpc,
          signer: config.signer,
          chainId: ogChainId,
          addresses: config.addresses,
          storage: config.chatStorage ?? undefined,
        });
      } catch (err) {
        log.warn(
          `StrategyRunner init failed: ${err instanceof Error ? err.message : err} — will retry on next tick`,
        );
      }
    }
    return orchestratorHandle;
  }

  const provider = getSharedProvider();

  const nftAddr = config.addresses?.agentNft;
  const nftTc = nftAddr
    ? new TypedContract<AgentNFTMethods>(nftAddr, AGENT_NFT_ABI, provider)
    : null;

  let payment: PaymentProcessorClient | null = null;
  let paymentPromise: Promise<PaymentProcessorClient> | null = null;
  async function getPayment(): Promise<PaymentProcessorClient> {
    if (payment) return payment;
    if (!paymentPromise) {
      paymentPromise = (async () => {
        const addr = config.addresses?.paymentProcessor;
        if (!addr) throw new Error("PaymentProcessor address not configured");
        const stub = new TypedContract<{ paymentToken: () => Promise<string> }>(
          addr,
          ["function paymentToken() view returns (address)"],
          provider,
        );
        const tokenAddr = await stub.contract.paymentToken();
        const client = new PaymentProcessorClient({
          address: addr,
          signer: config.signer,
          provider,
          paymentTokenAddress: tokenAddr,
        });
        payment = client;
        paymentPromise = null;
        return client;
      })().catch((err) => {
        paymentPromise = null;
        throw err;
      });
    }
    return paymentPromise;
  }

  const HEARTBEAT_INTERVAL = getRuntimeConfig().wsHeartbeatIntervalMs;
  const MAX_MISSED_PINGS = getRuntimeConfig().wsMaxMissedPings;
  const heartbeatTimer = setInterval(() => {
    const wsClients = getClients();
    for (const c of wsClients) {
      if (c.socket.readyState !== c.socket.OPEN) continue;
      if (c.missedPings >= MAX_MISSED_PINGS) {
        c.socket.terminate();
        unregisterClient(c);
        continue;
      }
      c.missedPings++;
      c.socket.ping();
    }
  }, HEARTBEAT_INTERVAL);

  app.use(createHealthRouter(provider, teeSigner, config));
  registerOracleRoutes(app, oracleDeps);
  // Oracle routes are plain Express mounts (no createRoute) — register them so
  // GET /v1/routes is a complete map.
  pushRouteMeta(
    ["GET", "/oracle/health", "oracle", "TEE oracle signer pubkey + status"],
    [
      "POST",
      "/oracle/v1/agents/mint",
      "oracle",
      "Register an agent dataHash with the oracle",
    ],
  );
  registerComputeRoutes(app, config, ogChainId);

  registerChatRoutes(app, config, ogChainId);

  registerAgentRoutes(app, config, provider, oracleDeps, eip712Domain, nftTc);
  registerEventRoutes(app, config, getEventStore());
  registerPerformanceRoutes(app, config, getEventStore());
  registerOrchestratorRoutes(app, config, getOrCreateOrchestrator, ogChainId);
  app.use(createArchiveRouter(config));
  app.use(createSkillRouters(config));
  createRoute(
    app,
    routeMeta("/v1/routes", "meta", "List mounted routes", { method: "get" }),
    async (_parsed: unknown, _req: Request, res: Response) => {
      res.json({
        routes: REGISTERED_ROUTES,
        meta: {
          version: PKG_VERSION,
          chainId: ogChainId,
          signer: shortSigner(config.signer.address),
          startedAt,
          uptimeMs: Date.now() - startedAt,
        },
      });
    },
    config,
  );

  registerPaymentRoutes(app, config, nftTc, getPayment);

  // M12: pending rotation timelocks (verifier/teeSigner/treasury) were observable
  // nowhere in prod — read-only surface, no contract address required at boot.
  registerGovernanceRoutes(app, config, provider);

  pushRouteMeta(
    ["POST", "/mcp", "mcp", "MCP streamable HTTP endpoint (read-only tools)"],
    ["GET", "/mcp", "mcp", "MCP SSE session stream (requires mcp-session-id)"],
    [
      "DELETE",
      "/mcp",
      "mcp",
      "Terminate an MCP session (requires mcp-session-id)",
    ],
  );
  app.use(
    "/mcp",
    // OE-11: getPayment lets MCP tools dispatch in-process; mcpBaseUrl stays only for
    // the AXIOM_MCP_LOOPBACK=true fallback path.
    createMcpRouter(
      config,
      () => mcpBaseUrl ?? `http://127.0.0.1:${config.port}`,
      { getPayment },
    ),
  );

  registerNotFoundHandler(app);
  registerErrorHandlers(app);

  const httpServer = createServer(app);
  setupWebSocketServer(httpServer, config);

  httpServer.listen(config.port, config.bind, () => {
    const addr = httpServer.address();
    if (addr && typeof addr === "object") {
      mcpBaseUrl = `http://127.0.0.1:${addr.port}`;
    }
    log.info(`Listening on http://${config.bind}:${config.port}`);
    log.info(`Signer: ${config.signer.address}`);
    log.info(
      `Axiom backend v${PKG_VERSION} — ${REGISTERED_ROUTES.length} routes mounted, WS /v1/stream`,
    );
  });
  httpServer.on("close", () => {
    clearInterval(heartbeatTimer);
  });

  return { app, httpServer };
}

function registerNotFoundHandler(app: Express): void {
  // Terminal 404 for EVERY unmatched path — hanging non-/v1 requests is a bug.
  // WS upgrades (/v1/stream) bypass Express entirely via the httpServer "upgrade"
  // event, so they never reach this handler.
  app.use((req: Request, res: Response) => {
    sendError(res, HTTP.NOT_FOUND, `No ${req.method} route for ${req.path}`);
  });
}

function registerErrorHandlers(app: Express): void {
  // @sentry/node is lazy: both middlewares attach from one resolved promise so Sentry's
  // handler always precedes the terminal JSON handler, loaded or not. A load failure
  // degrades to no-op capture, never a missing terminal handler.
  void getSentry()
    .catch(() => null)
    .then((Sentry) => {
      Sentry?.setupExpressErrorHandler(app);
      app.use(
        (err: Error, _req: Request, res: Response, _next: NextFunction) => {
          const requestId = res.locals.requestId;
          log.error("Unhandled error", {
            error: err.message,
            stack: err.stack,
            requestId,
          });
          if (err instanceof z.ZodError) {
            res.status(HTTP.BAD_REQUEST).json({
              error: "Validation failed",
              details: err.issues,
              code: "VALIDATION_ERROR",
              requestId,
            });
            return;
          }
          const status =
            typeof err === "object" && err !== null && "status" in err
              ? Number((err as Record<string, unknown>).status)
              : undefined;
          if (status && status >= 400 && status < 600) {
            sendError(res, status, err.message, `HTTP_${status}`);
            return;
          }
          if (isUpstreamTransportError(err)) {
            sendError(
              res,
              HTTP.BAD_GATEWAY,
              "Upstream service error",
              "UPSTREAM_ERROR",
            );
            return;
          }
          sendError(
            res,
            HTTP.INTERNAL,
            "Internal server error",
            "INTERNAL_ERROR",
          );
        },
      );
    });
}

/** WS auth header path: clients pass Sec-WebSocket-Protocol: ["axiom", base64(token)].
 *  Returns the decoded token, or null when the header is absent/malformed. */
const WS_AUTH_SUBPROTOCOL = "axiom";

/** Comma-separated key list -> trimmed, non-empty entries. */
function splitKeys(v: string | undefined): string[] {
  return (v ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}
function wsTokenFromSubprotocols(
  header: string | string[] | undefined,
): string | null {
  const parts = Array.isArray(header) ? header : header?.split(",");
  const protocols = (parts ?? []).map((p) => p.trim()).filter(Boolean);
  if (protocols.length === 0) return null;
  // Exactly ["axiom", b64] carries the token; bare "axiom" (no payload) fails auth below.
  if (protocols[0] !== WS_AUTH_SUBPROTOCOL || protocols.length < 2) return null;
  try {
    const token = Buffer.from(protocols[1]!, "base64").toString("utf8");
    return token || null;
  } catch {
    return null;
  }
}

function setupWebSocketServer(
  httpServer: HttpServer,
  config: ServerConfig,
): void {
  // Echo the offered subprotocols back verbatim: header-path auth clients
  // expect ["axiom", b64(token)] to survive negotiation (RFC 6455 requires
  // the server to select from the client's list — echoing all of them keeps
  // both the marker and the token visible to the client).
  const wss = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols: Set<string>) =>
      protocols.size > 0 ? Array.from(protocols).join(", ") : false,
  });
  httpServer.on("upgrade", (req, socket, head) => {
    // Uniform 401 for every denied upgrade (auth missing or token invalid).
    const deny = (): void => {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
    };
    const url = new URL(req.url ?? "/", LOCAL_BASE_URL);
    if (url.pathname !== "/v1/stream") {
      socket.destroy();
      return;
    }
    const apiKeys = [
      ...splitKeys(config.env?.AXIOM_API_KEY),
      ...splitKeys(process.env.AXIOM_CLIENT_API_KEY),
    ];
    // Fail closed: a missing API key denies WS upgrades unless auth is explicitly disabled.
    if (apiKeys.length === 0) {
      if (process.env.AXIOM_DISABLE_AUTH !== "true") {
        deny();
        return;
      }
    } else {
      // Dual-path auth (token must never leak into proxy logs via the URL):
      // PREFERRED: Sec-WebSocket-Protocol: axiom, base64(token) — echoed back so
      // the client's negotiation succeeds. FALLBACK: legacy ?token= query param
      // (kept working: existing frontends/proxies still use it).
      const token =
        wsTokenFromSubprotocols(req.headers["sec-websocket-protocol"]) ??
        url.searchParams.get("token") ??
        "";
      if (!token || !timingSafeMatch(token, apiKeys)) {
        deny();
        return;
      }
    }
    // Echo the client's subprotocols back so header-path clients (which send
    // ["axiom", b64(token)]) complete negotiation successfully — the ws
    // server is constructed with handleProtocols for this (see below).
    wss.handleUpgrade(req, socket, head, (ws) => {
      const wsClients = getClients();
      if (wsClients.size >= MAX_WS_CLIENTS) {
        ws.close(1013, "Too many connections");
        socket.destroy();
        return;
      }
      const topics = new Set(url.searchParams.getAll("topic").slice(0, 20));
      const client: ConnectedClient = {
        socket: ws as WebSocket,
        topics,
        missedPings: 0,
      };
      registerClient(client);
      ws.on("pong", () => {
        client.missedPings = 0;
      });
      ws.send(
        JSON.stringify({
          topic: "hello",
          payload: { topics: Array.from(topics) },
          ts: Date.now(),
        }),
      );
      ws.on("close", () => unregisterClient(client));
      ws.on("error", (err) => {
        log.warn("WebSocket client error", { error: (err as Error).message });
        unregisterClient(client);
      });
    });
  });
}
