import { z } from "zod";
import express, {
  type Request,
  type Response,
  type Express,
  type NextFunction,
} from "express";
import helmet from "helmet";
import * as Sentry from "@sentry/node";
import cors from "cors";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { createServer, type Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { ethers, type Wallet } from "ethers";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import {
  TypedContract,
  type AgentNFTMethods,
} from "@axiom/config/types/contract";
import { ARISTOTLE_CHAIN_ID } from "@axiom/config/networks";
import { bigintReplacer } from "@axiom/config";

import { getComputeBaseUrl, createRouterClient } from "./compute/index.js";
import { AGENT_NFT_ABI } from "@axiom/config/abis";

import { StrategyRunner } from "./orchestrator/index.js";
import { TeeSigner } from "./oracle/signer.js";
import { registerOracleRoutes, type OracleRouteDeps } from "./oracle/routes.js";
import {
  HTTP,
  type Eip712Domain,
  buildEip712Domain,
  resolveChatModel,
  resolveContextWindow,
  getRuntimeConfig,
} from "@axiom/config";
import { getSharedProvider } from "./provider.js";
import {
  ZeroGStorage,
  InMemoryStorage,
  type StorageAdapter,
} from "@axiom/config/storage/0g";
import {
  createApiKeyAuth,
  enforceClientPathAllowlist,
  timingSafeTokenInList,
} from "@axiom/config/middleware/auth";
import { getEventStore, payloadField } from "./events/store.js";
import { PaymentProcessorClient } from "./payment/processor.js";
import type { BackendEnv } from "./env-schema.js";
import { createHealthRouter } from "./routers/health.js";
import { createRoute, REGISTERED_ROUTES } from "./routers/route-factory.js";
import { registerAgentRoutes } from "./routers/agents.js";
import { registerEventRoutes } from "./routers/events.js";
import { registerVaultRoutes } from "./routers/vault.js";
import { registerPerformanceRoutes } from "./routers/performance.js";
import { registerOrchestratorRoutes } from "./routers/orchestrator.js";
import { createArchiveRouter } from "./services/archive.js";
import { createSkillRouters } from "./skills/routers.js";
import { createMcpRouter } from "./mcp/server.js";
import {
  chatBodySchema,
  chatHistoryQuerySchema,
  royaltySchema,
} from "./route-schemas.js";
import { createLogger } from "./utils/logger.js";
import { sendError } from "./utils/response.js";
import {
  getClients,
  registerClient,
  unregisterClient,
  type ConnectedClient,
} from "./ws/broadcaster.js";
import { TTLCache } from "./utils/response.js";
import pkg from "../package.json" with { type: "json" };
const log = createLogger("server");
const PKG_VERSION = pkg.version;
const MAX_WS_CLIENTS = getRuntimeConfig().wsMaxClients;
const LOCAL_BASE_URL = "http://localhost";

function shortSigner(addr: string): string {
  return addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

// Resolve the trace payload for the typed SSE frame. The router relays usage + x_0g_trace inside a
// terminal SSE chunk (choices: []) right before [DONE] — there is no x_0g_trace response header.
// Prefer the terminal chunk; fall back to the legacy header for upstreams that never send one.
function resolveTracePayload(
  terminalChunk: unknown,
  response: { headers?: unknown } | undefined,
): Record<string, unknown> | null {
  const headers = response?.headers as
    { get?(name: string): string | null } | Record<string, string> | undefined;
  const headerValue = (name: string): string | null | undefined => {
    if (headers && typeof headers.get === "function") {
      return headers.get(name);
    }
    return (headers as Record<string, string> | undefined)?.[name];
  };
  if (terminalChunk !== null && typeof terminalChunk === "object") {
    const chunk = terminalChunk as { usage?: unknown; x_0g_trace?: unknown };
    const trace: Record<string, unknown> = { usage: chunk.usage };
    if (chunk.x_0g_trace && typeof chunk.x_0g_trace === "object") {
      Object.assign(trace, chunk.x_0g_trace);
    }
    const providerHeader = headerValue("x-provider");
    if (providerHeader) trace.providerHeader = providerHeader;
    return trace;
  }
  const traceHeader = headerValue("x_0g_trace");
  if (!traceHeader) return null;
  try {
    const parsed =
      typeof traceHeader === "string" ? JSON.parse(traceHeader) : traceHeader;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

// Map the optional `provider` routing body to the canonical X-0G-Provider-* request headers.
// The `provider` body field itself is never forwarded (deprecated by the router).
//
// Cache-friendly default: the router round-robins providers when no routing
// header is sent (verified cache-hostile — 'Cache hit 0%'). Latency-sort makes
// the router stick to a single provider, so the prompt-cache prefix stays on
// the same provider for every client (UI and API alike). No address is
// hardcoded — sort:latency follows the live catalog. allowFallbacks only
// engages if that provider is unavailable.
const CACHE_FRIENDLY_DEFAULT_ROUTING = {
  sort: "latency" as const,
  allowFallbacks: true,
};

function buildProviderRoutingHeaders(
  provider: z.infer<typeof chatBodySchema>["provider"],
): Record<string, string> | undefined {
  if (!provider) return undefined;
  const h: Record<string, string> = {};
  if (provider.sort) h["X-0G-Provider-Sort"] = provider.sort;
  if (provider.address) h["X-0G-Provider-Address"] = provider.address;
  if (provider.allowFallbacks !== undefined)
    h["X-0G-Provider-Allow-Fallbacks"] = String(provider.allowFallbacks);
  if (provider.trustMode) h["X-0G-Provider-Trust-Mode"] = provider.trustMode;
  const maxPrompt = provider.maxPriceUsdPrompt;
  const maxCompletion = provider.maxPriceUsdCompletion;
  if (maxPrompt !== undefined) {
    // The router 400s when only a prompt cap is supplied (completion resolves <= 0); mirror the
    // prompt cap as a sane completion ceiling unless one is explicitly given.
    h["X-0G-Provider-Max-Price-Usd-Prompt"] = String(maxPrompt);
    h["X-0G-Provider-Max-Price-Usd-Completion"] = String(
      maxCompletion ?? maxPrompt,
    );
  } else if (maxCompletion !== undefined) {
    h["X-0G-Provider-Max-Price-Usd-Completion"] = String(maxCompletion);
  }
  return Object.keys(h).length > 0 ? h : undefined;
}

REGISTERED_ROUTES.push({
  method: "GET",
  path: "/v1/stream",
  consumer: "ws",
  description: "WebSocket event stream (upgrade)",
});

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

export interface ServerConfig {
  bind: string;
  port: number;
  evmRpc: string;
  signer: Wallet;
  /** Optional 0G storage for chat-transcript persistence AND the in-process oracle; null/undefined disables both (oracle falls back to InMemoryStorage). */
  chatStorage?: StorageAdapter | null;
  addresses?: {
    agentNft: `0x${string}`;
    vault: `0x${string}`;
    verifier: `0x${string}`;
    paymentProcessor?: `0x${string}`;
  };
  env?: BackendEnv;
}

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
      filter: (req, res) => {
        if (req.headers["x-no-compression"] !== undefined) return false;
        const type = res.getHeader("Content-Type");
        if (typeof type === "string" && type.includes("text/event-stream")) {
          return false;
        }
        return true;
      },
    }),
  );

  app.use((req, res, next) => {
    const requestId = crypto.randomUUID();
    res.setHeader("x-request-id", requestId);
    (req as Request & { requestId?: string }).requestId = requestId;
    res.locals.requestId = requestId;
    next();
  });
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      log.info(`${req.method} ${req.originalUrl} ${res.statusCode}`, {
        duration: `${Date.now() - start}ms`,
        requestId: res.locals.requestId,
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
  app.use(
    createApiKeyAuth(
      config.env?.AXIOM_API_KEY,
      ["/health", "/health/live", "/oracle/health"],
      process.env.AXIOM_DISABLE_AUTH === "true",
      process.env.AXIOM_CLIENT_API_KEY,
    ),
  );
  // Browser keys only reach an explicit allowlist (not vault execute, forensics, event inject).
  app.use(enforceClientPathAllowlist);
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
  app.set("json replacer", bigintReplacer);

  const ogChainId = config.env?.AXIOM_CHAIN_ID ?? ARISTOTLE_CHAIN_ID;
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
  const teeSigner = new TeeSigner(teeSignerPk, eip712Domain);
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

  registerHealthRoutes(app, config, provider, teeSigner);
  registerOracleRoutes(app, oracleDeps);
  // Oracle routes are plain Express mounts (no createRoute), so they never reached
  // REGISTERED_ROUTES — register them here so GET /v1/routes is a complete map.
  REGISTERED_ROUTES.push(
    {
      method: "GET",
      path: "/oracle/health",
      consumer: "oracle",
      description: "TEE oracle signer pubkey + status",
    },
    {
      method: "POST",
      path: "/oracle/v1/agents/mint",
      consumer: "oracle",
      description: "Register an agent dataHash with the oracle",
    },
  );
  registerComputeRoutes(app, config);

  registerChatRoutes(app, config);

  registerAgentRoutes(app, config, provider, oracleDeps, eip712Domain, nftTc);
  registerEventRoutes(app, config, getEventStore());
  registerPerformanceRoutes(app, config, getEventStore());
  registerOrchestratorRoutes(app, config, getOrCreateOrchestrator, ogChainId);
  registerArchiveRoutes(app, config);
  registerSkillRoutes(app, config);
  registerMetaRoutes(app, config, ogChainId, startedAt);

  registerPaymentRoutes(app, config, nftTc, getPayment);

  registerMcpRoutes(
    app,
    config,
    () => mcpBaseUrl ?? `http://127.0.0.1:${config.port}`,
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

type SharedProvider = ReturnType<typeof getSharedProvider>;

function registerHealthRoutes(
  app: Express,
  config: ServerConfig,
  provider: SharedProvider,
  teeSigner: TeeSigner,
): void {
  app.use(createHealthRouter(provider, teeSigner, config));
}

// Map the router's provider verifiability value (TeeTLS/TeeML/private) to the
// X-0G-Provider-Trust-Mode vocabulary (standard|verified|private).
function trustModeFromVerifiability(
  verifiability: unknown,
): "standard" | "verified" | "private" {
  const v =
    typeof verifiability === "string" ? verifiability.toLowerCase() : "";
  if (v.includes("private")) return "private";
  if (v.includes("tee")) return "verified";
  return "standard";
}

function registerComputeRoutes(app: Express, config: ServerConfig): void {
  const modelsCache = new TTLCache<Record<string, unknown>[]>(60_000);
  async function fetchRouterModels(
    requestId?: string,
  ): Promise<Record<string, unknown>[]> {
    const cached = modelsCache.get("models");
    if (cached) return cached;
    const routerBaseUrl = getComputeBaseUrl();
    const resp = await fetch(`${routerBaseUrl}/models`, {
      ...(requestId ? { headers: { "X-Request-ID": requestId } } : {}),
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) return [];
    const raw = await resp.json();
    const parsed = z
      .object({ data: z.array(z.record(z.string(), z.unknown())) })
      .parse(raw);
    modelsCache.set("models", parsed.data);
    return parsed.data;
  }

  async function fetchModelWindows(): Promise<Record<string, number>> {
    try {
      const models = await fetchRouterModels();
      const out: Record<string, number> = {};
      for (const m of models) {
        const id = String(m.id ?? "");
        const cw = m.context_window;
        if (id && typeof cw === "number") out[id] = cw;
      }
      return out;
    } catch {
      return {};
    }
  }

  // Passthrough to the router's provider discovery (real addresses + latency/pricing/TEE info).
  // Router model ids are versioned (e.g. deepseek-v4-flash-0731), so an exact model_id query is
  // attempted first and falls back to listing all providers and filtering locally by exact/prefix.
  const providersCache = new TTLCache<Record<string, unknown>[]>(60_000);
  async function fetchRouterProviders(
    model: string,
  ): Promise<Record<string, unknown>[]> {
    const cacheKey = `providers:${model}`;
    const cached = providersCache.get(cacheKey);
    if (cached) return cached;
    const routerBaseUrl = getComputeBaseUrl();
    const fetchAll = async (qs: string): Promise<Record<string, unknown>[]> => {
      const resp = await fetch(`${routerBaseUrl}/providers${qs}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!resp.ok) return [];
      const raw = await resp.json();
      const parsed = z
        .object({ data: z.array(z.record(z.string(), z.unknown())) })
        .safeParse(raw);
      return parsed.success ? parsed.data.data : [];
    };
    let providers = await fetchAll(`?model_id=${encodeURIComponent(model)}`);
    if (providers.length === 0) providers = await fetchAll("");
    providers = providers.filter((p) => {
      const id = String(p.model_id ?? "");
      return id === model || id.startsWith(model);
    });
    providersCache.set(cacheKey, providers);
    return providers;
  }

  createRoute(
    app,
    {
      path: "/v1/compute/providers",
      method: "get",
      consumer: "useCompute",
      description:
        "List compute providers (router models + deterministic pseudo-addresses)",
    },
    async (_parsed: unknown, req: Request, res: Response) => {
      const routerBaseUrl = getComputeBaseUrl();
      // ?model=<id> → real provider discovery passthrough (address/latency/pricing/TEE info)
      const model =
        typeof req.query?.model === "string" ? req.query.model : undefined;
      if (model) {
        const providers = await fetchRouterProviders(model);
        if (providers.length === 0) {
          res.status(HTTP.BAD_GATEWAY).json({
            error: `Compute router returned no providers for model: ${model}`,
            code: "UPSTREAM_ERROR",
          });
          return;
        }
        res.json({
          services: providers.map((p: Record<string, unknown>) => ({
            ...p,
            model: String(p.model_id ?? ""),
            endpoint: routerBaseUrl,
            trust_mode: trustModeFromVerifiability(p.verifiability),
          })),
        });
        return;
      }
      const models = await fetchRouterModels();
      if (models.length === 0) {
        res.status(HTTP.BAD_GATEWAY).json({
          error: "Compute router returned no models",
          code: "UPSTREAM_ERROR",
        });
        return;
      }
      const services = models.map((m: Record<string, unknown>) => {
        const id = String(m.id ?? "");
        const address = ethers
          .keccak256(ethers.toUtf8Bytes(`model:${id}`))
          .slice(0, 42) as `0x${string}`;
        const pricingRaw = m.pricing;
        const price =
          pricingRaw && typeof pricingRaw === "object" && "prompt" in pricingRaw
            ? String((pricingRaw as Record<string, unknown>).prompt ?? "")
            : undefined;
        return { address, model: id, endpoint: routerBaseUrl, price };
      });
      res.json({ services });
    },
    config,
  );

  createRoute(
    app,
    {
      path: "/v1/config",
      method: "get",
      consumer: "config",
      description: "Backend configuration",
    },
    async (_parsed: unknown, _req: Request, res: Response) => {
      const model = resolveChatModel(config.env?.AXIOM_COMPUTE_MODEL);
      const windows = await fetchModelWindows();
      res.json({
        model,
        assistantName: "Axiom",
        contextWindow: resolveContextWindow(model, windows),
      });
    },
    config,
  );
}
const EMPTY_RESPONSE_FALLBACK =
  "⚠ 0G Compute returned an empty response. Try again or check model availability.";

// Narrow an SSE chunk's `choices[0].delta.content` without trusting an unchecked shape.
function sseDeltaContent(chunk: unknown): string {
  if (typeof chunk !== "object" || chunk === null || !("choices" in chunk)) {
    return "";
  }
  const choices = chunk.choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const first = choices[0];
  if (typeof first !== "object" || first === null || !("delta" in first)) {
    return "";
  }
  const delta = first.delta;
  if (typeof delta !== "object" || delta === null || !("content" in delta)) {
    return "";
  }
  return typeof delta.content === "string" ? delta.content : "";
}

// After-effect for a completed chat turn: upload the transcript to 0G and record the pointer in the
// EventStore (`chat::transcript` bucket). Fail-soft by contract — persistence must never break the
// chat response or the request handler.
//
// Wallet-keyed sessions: when a wallet address is supplied, the threadId is the (lowercased) wallet
// so every turn of the same wallet shares one stable thread; without a wallet a random UUID is used.
//
// Transport-AES note: ZeroGStorage encrypts blobs with a per-instance key that is regenerated on
// every boot, which would make transcripts undecryptable after a restart. To keep chat history
// retrievable we stamp the hex transport key into the EventStore payload alongside the rootHash;
// the history route later decrypts with that stamped key via downloadWithOpts. (InMemoryStorage
// ignores encryption and carries no key.)
async function persistChatTranscript(
  storage: StorageAdapter | null | undefined,
  chainId: number,
  requestMessages: readonly unknown[],
  assistantContent: string,
  wallet?: string,
): Promise<void> {
  if (!storage) return;
  try {
    const walletKey = wallet?.toLowerCase();
    const threadId = walletKey ?? crypto.randomUUID();
    const ts = Date.now();
    const transcript = {
      threadId,
      ...(walletKey ? { wallet: walletKey } : {}),
      messages: [
        ...requestMessages,
        { role: "assistant", content: assistantContent },
      ],
      msgCount: requestMessages.length + 1,
      ts,
    };
    const transportKey =
      storage instanceof ZeroGStorage
        ? ethers.hexlify(storage.transportKey)
        : undefined;
    const { rootHash } = await storage.upload(
      new TextEncoder().encode(JSON.stringify(transcript)),
    );
    getEventStore().append({
      source: "chat",
      chainId,
      eventName: "transcript",
      blockNumber: 0,
      txHash: rootHash,
      logIndex: 0,
      payload: {
        rootHash,
        threadId,
        msgCount: transcript.msgCount,
        ts,
        ...(walletKey ? { wallet: walletKey } : {}),
        ...(transportKey ? { transportKey } : {}),
      },
    });
  } catch (err) {
    log.error("chat transcript persistence failed", { err });
  }
}

// Download one chat-transcript blob. ZeroGStorage blobs were encrypted with the transport key
// stamped in the EventStore payload at upload time, so a later instance (with a fresh per-boot
// key) still decrypts. Legacy blobs without a stamped key fall back to the current instance key.
async function downloadChatTranscript(
  storage: StorageAdapter | null | undefined,
  rootHash: string,
  payload: unknown,
): Promise<Uint8Array> {
  if (!storage) throw new Error("chat storage not configured");
  const rootHashHex = rootHash as `0x${string}`;
  if (storage instanceof ZeroGStorage) {
    const transportKey = payloadField(payload, "transportKey");
    if (transportKey) {
      const result = await storage.downloadWithOpts(rootHashHex, {
        symmetricKey: ethers.getBytes(transportKey),
      });
      return result.data;
    }
  }
  return storage.download(rootHashHex);
}

function registerChatRoutes(app: Express, config: ServerConfig): void {
  createRoute(
    app,
    {
      path: "/v1/chat/completions",
      method: "post",
      schema: chatBodySchema,
      consumer: "chat-runtime",
      description: "Stream chat completions",
    },
    async (
      parsed: z.infer<typeof chatBodySchema>,
      req: Request,
      res: Response,
    ) => {
      try {
        const { messages, tools, model: reqModel, wallet, provider } = parsed;
        const DEFAULT_MODEL = resolveChatModel(config.env?.AXIOM_COMPUTE_MODEL);
        const resolvedModel = reqModel ?? DEFAULT_MODEL;
        const providerHeaders = buildProviderRoutingHeaders(
          provider ?? CACHE_FRIENDLY_DEFAULT_ROUTING,
        );
        const client = await createRouterClient(resolvedModel);
        const streamAbort = new AbortController();
        const streamTimeoutMs = Number.parseInt(
          process.env.AXIOM_CHAT_STREAM_TIMEOUT_MS ?? "",
          10,
        );
        const upstreamSignal =
          Number.isFinite(streamTimeoutMs) && streamTimeoutMs > 0
            ? AbortSignal.timeout(streamTimeoutMs)
            : undefined;
        const streamSignal = upstreamSignal
          ? AbortSignal.any([streamAbort.signal, upstreamSignal])
          : streamAbort.signal;
        const { data: openaiRes, response } = await client.chat.completions
          .create(
            {
              model: resolvedModel,
              messages: messages as ChatCompletionMessageParam[],
              tools: tools as ChatCompletionTool[] | undefined,
              stream: true,
              max_tokens: 2048,
            },
            {
              signal: streamSignal,
              ...(providerHeaders ? { headers: providerHeaders } : {}),
            },
          )
          .withResponse();
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();
        req.on("close", () => streamAbort.abort());
        const writeChunk = (chunk: string): boolean => {
          try {
            return res.write(chunk);
          } catch {
            streamAbort.abort();
            req.destroy();
            return false;
          }
        };
        let n = 0;
        let assistantContent = "";
        // Terminal chunk: the router sends choices:[] + usage + x_0g_trace just before [DONE].
        let terminalChunk: unknown = null;
        for await (const chunk of openaiRes) {
          if (res.writableEnded) break;
          if (
            terminalChunk === null &&
            chunk !== null &&
            typeof chunk === "object"
          ) {
            const choices = (chunk as { choices?: unknown }).choices;
            const hasUsageOrTrace =
              (chunk as { usage?: unknown }).usage !== undefined ||
              (chunk as { x_0g_trace?: unknown }).x_0g_trace !== undefined;
            if (
              Array.isArray(choices) &&
              choices.length === 0 &&
              hasUsageOrTrace
            ) {
              terminalChunk = chunk;
            }
          }
          if (!writeChunk(`data: ${JSON.stringify(chunk)}\n\n`)) break;
          n++;
          assistantContent += sseDeltaContent(chunk);
        }
        if (!res.writableEnded) {
          if (n === 0) {
            assistantContent = EMPTY_RESPONSE_FALLBACK;
            writeChunk(
              `data: ${JSON.stringify({ choices: [{ delta: { content: EMPTY_RESPONSE_FALLBACK } }] })}\n\n`,
            );
          }
          const trace = resolveTracePayload(terminalChunk, response);
          if (trace) {
            writeChunk(`data: ${JSON.stringify({ type: "trace", trace })}\n\n`);
          }
          writeChunk("data: [DONE]\n\n");
          res.end();
          // Transcript persistence is a pure after-effect: the stream is already finalized.
          await persistChatTranscript(
            config.chatStorage,
            config.env?.AXIOM_CHAIN_ID ?? ARISTOTLE_CHAIN_ID,
            messages,
            assistantContent,
            wallet,
          );
        }
      } catch (err) {
        log.error("chat completions upstream failed", { err });
        const errMsg = err instanceof Error ? err.message : String(err);
        if (res.headersSent || res.writableEnded) {
          try {
            res.write(
              `data: ${JSON.stringify({ error: errMsg, code: "STREAM_ERROR" })}\n\ndata: [DONE]\n\n`,
            );
          } catch {
            /* socket already closed */
          }
          res.destroy();
          return;
        }
        // Surface payment/auth failures clearly (0G router returns a 402 insufficient_balance code)
        const e = err as {
          status?: number;
          code?: string;
          error?: { message?: string; code?: string };
          message?: string;
        };
        const status = e?.status;
        const code = e?.code ?? e?.error?.code;
        const msg = e?.error?.message ?? e?.message ?? "";
        if (
          status === 402 ||
          code === "insufficient_balance" ||
          /insufficient balance/i.test(String(msg))
        ) {
          res.status(402).json({
            error:
              "Compute account has no balance. Fund the 0G Compute provider account linked to AXIOM_COMPUTE_API_KEY, then retry.",
            code: "insufficient_balance",
          });
          return;
        }
        if (status === 401 || status === 403) {
          res.status(502).json({
            error: "Compute auth failed. Check AXIOM_COMPUTE_API_KEY.",
            code: "compute_auth",
          });
          return;
        }
        res.status(502).json({
          error: msg
            ? `Compute upstream: ${String(msg).slice(0, 200)}`
            : "compute upstream error",
        });
      }
    },
    config,
  );

  // Wallet-keyed history: every transcript persisted for this wallet (stable threadId =
  // lowercased wallet) is downloaded and returned newest-first. Fail-soft per transcript —
  // one unreadable blob must not break the whole history.
  createRoute(
    app,
    {
      path: "/v1/chat/history",
      method: "get",
      schema: chatHistoryQuerySchema,
      consumer: "chat-runtime",
      description: "Fetch persisted chat transcripts for a wallet",
    },
    async (
      parsed: z.infer<typeof chatHistoryQuerySchema>,
      _req: Request,
      res: Response,
      { config: cfg },
    ) => {
      const wallet = parsed.wallet.toLowerCase();
      const events = getEventStore().getAll(100, undefined, "transcript");
      const transcripts: unknown[] = [];
      for (const evt of events) {
        if (payloadField(evt.payload, "wallet") !== wallet) continue;
        const rootHash = evt.txHash;
        if (!rootHash) continue;
        try {
          const blob = await downloadChatTranscript(
            cfg.chatStorage,
            rootHash,
            evt.payload,
          );
          transcripts.push(JSON.parse(new TextDecoder().decode(blob)));
        } catch (err) {
          log.warn("chat transcript download failed", {
            rootHash,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      transcripts.reverse(); // newest turn first
      res.json({ wallet, count: transcripts.length, transcripts });
    },
    config,
  );
}

function registerArchiveRoutes(app: Express, config: ServerConfig): void {
  app.use(createArchiveRouter(config));
}

function registerSkillRoutes(app: Express, config: ServerConfig): void {
  app.use(createSkillRouters(config));
}

function registerMetaRoutes(
  app: Express,
  config: ServerConfig,
  ogChainId: number,
  startedAt: number,
): void {
  createRoute(
    app,
    {
      path: "/v1/routes",
      method: "get",
      consumer: "meta",
      description: "List mounted routes",
    },
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
}

function registerMcpRoutes(
  app: Express,
  config: ServerConfig,
  getBaseUrl: () => string,
): void {
  REGISTERED_ROUTES.push({
    method: "POST",
    path: "/mcp",
    consumer: "mcp",
    description: "MCP streamable HTTP endpoint (read-only tools)",
  });
  app.use("/mcp", createMcpRouter(config, { baseUrl: getBaseUrl }));
}

function registerPaymentRoutes(
  app: Express,
  config: ServerConfig,
  nftTc: TypedContract<AgentNFTMethods> | null,
  getPayment: () => Promise<PaymentProcessorClient>,
): void {
  const paymentRouter = express.Router();
  createRoute(
    paymentRouter,
    {
      path: "/v1/agents/:id/earnings",
      method: "get",
      requireId: true,
      requireAddress: "paymentProcessor",
      consumer: "usePayment",
      description: "Get agent earnings by token ID",
    },
    async (_parsed, _req, res, { id }) => {
      res.setHeader("Cache-Control", "public, max-age=300");
      if (!nftTc) {
        sendError(
          res,
          HTTP.SERVICE_UNAVAILABLE,
          "AgentNFT address not configured",
        );
        return;
      }
      const creator = await nftTc.contract.creatorOf(BigInt(id));
      if (!creator || creator === ethers.ZeroAddress) {
        sendError(
          res,
          HTTP.NOT_FOUND,
          "Agent creator not registered for token",
        );
        return;
      }
      const client = await getPayment();
      const earnings = await client.earningsOf(creator);
      return { tokenId: id, creator, earnings };
    },
    config,
  );

  createRoute(
    paymentRouter,
    {
      path: "/v1/agents/:id/royalty",
      schema: royaltySchema,
      requireId: true,
      requireAddress: "paymentProcessor",
      consumer: "usePayment",
      description: "Encode royalty set transaction data",
    },
    async (parsed: { bps: number }, _req, _res, { id }) => {
      const client = await getPayment();
      const txData = await client.encodeSetRoyalty(BigInt(id), parsed.bps);
      return { tokenId: id, bps: parsed.bps, ...txData };
    },
    config,
  );

  const paymentConfigCache = new TTLCache<{
    paymentToken: string;
    protocolFeeBps: bigint;
    protocolTreasury: string;
  }>(300_000);

  createRoute(
    paymentRouter,
    {
      path: "/v1/payment/config",
      method: "get",
      requireAddress: "paymentProcessor",
      consumer: "usePayment",
      description: "Payment contract configuration (cached 5min)",
    },
    async (_parsed, _req, res) => {
      res.setHeader("Cache-Control", "public, max-age=300");
      const cached = paymentConfigCache.get("config");
      if (cached) return cached;
      const client = await getPayment();
      const result = await client.protocolConfig();
      paymentConfigCache.set("config", result);
      return result;
    },
    config,
  );

  registerVaultRoutes(paymentRouter, config);

  createRoute(
    paymentRouter,
    {
      path: "/v1/agents/:id/metadata",
      method: "post",
      requireId: true,
      requireAddress: "agentNft",
      consumer: "cli-only",
      description: "Encode transaction to update agent metadata on-chain",
    },
    async (_parsed, req, res, { id, config: cfg }) => {
      const nftAddr = cfg.addresses?.agentNft;
      if (!nftAddr) {
        sendError(res, HTTP.INTERNAL, "AgentNFT address not configured");
        return;
      }
      const { datas } = req.body ?? {};
      if (!datas || !Array.isArray(datas)) {
        sendError(res, HTTP.BAD_REQUEST, "Missing or invalid datas array");
        return;
      }
      if (!nftTc) {
        sendError(res, HTTP.INTERNAL, "AgentNFT not configured");
        return;
      }
      const encoded = nftTc.iface.encodeFunctionData("update", [
        BigInt(id),
        datas,
      ]);
      return { to: nftAddr, data: encoded, value: "0" };
    },
    config,
  );

  app.use(paymentRouter);
}

function registerNotFoundHandler(app: Express): void {
  app.use((req: Request, res: Response) => {
    if (req.path.startsWith("/v1/") || req.path.startsWith("/health")) {
      sendError(res, HTTP.NOT_FOUND, `No ${req.method} route for ${req.path}`);
      return;
    }
  });
}

function registerErrorHandlers(app: Express): void {
  Sentry.setupExpressErrorHandler(app);

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
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
      res
        .status(status)
        .json({ error: err.message, code: `HTTP_${status}`, requestId });
      return;
    }
    if (isUpstreamTransportError(err)) {
      res.status(HTTP.BAD_GATEWAY).json({
        error: "Upstream service error",
        code: "UPSTREAM_ERROR",
        requestId,
      });
      return;
    }
    res.status(HTTP.INTERNAL).json({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
      requestId,
    });
  });
}

function setupWebSocketServer(
  httpServer: HttpServer,
  config: ServerConfig,
): void {
  const wss = new WebSocketServer({ noServer: true });
  httpServer.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", LOCAL_BASE_URL);
    if (url.pathname !== "/v1/stream") {
      socket.destroy();
      return;
    }
    const serverKeys = config.env?.AXIOM_API_KEY
      ? config.env.AXIOM_API_KEY.split(",")
          .map((k) => k.trim())
          .filter(Boolean)
      : [];
    const clientKeys = process.env.AXIOM_CLIENT_API_KEY
      ? process.env.AXIOM_CLIENT_API_KEY.split(",")
          .map((k) => k.trim())
          .filter(Boolean)
      : [];
    const apiKeys = [...serverKeys, ...clientKeys];
    // Fail closed: a missing API key denies WS upgrades unless auth is explicitly disabled.
    if (apiKeys.length === 0) {
      if (process.env.AXIOM_DISABLE_AUTH !== "true") {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
    } else {
      const token = url.searchParams.get("token") ?? "";
      if (!token || !timingSafeTokenInList(token, apiKeys)) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
    }
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
