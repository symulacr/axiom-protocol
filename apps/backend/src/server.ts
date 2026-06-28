import { z } from "zod";
import express, { type Request, type Response, type Express, type NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { createServer, type Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { ethers, type Wallet } from "ethers";
import { TypedContract } from "@axiom/config/types/contract";
import { GALILEO_CHAIN_ID } from "@axiom/config/networks";
import { bigintReplacer } from "@axiom/config/types/bigint";

import { getComputeBaseUrl, createRouterClient } from "./compute/router.js";
import { discoverProviders } from "./compute/provider-discovery.js";
import { AGENT_NFT_ABI } from "@axiom/config/abis";

import { StrategyRunner } from "./orchestrator/index.js";
import { DefaultSignerOracleClient } from "./oracle/client.js";
import { type Eip712Domain, DEFAULT_EIP712_DOMAIN } from "@axiom/oracle/signer";
import { getSharedProvider } from "./provider.js";
import { createApiKeyAuth } from "@axiom/config/middleware/auth";
import { getEventStore } from "./events/store.js";
import { PaymentProcessorClient } from "./payment/processor.js";
import type { BackendEnv } from "./env-schema.js";
import { createHealthRouter } from "./routers/health.js";
import { createRoute } from "./routers/route-factory.js";
import { registerAgentRoutes } from "./routers/agents.js";
import { registerEventRoutes } from "./routers/events.js";
import { registerPerformanceRoutes } from "./routers/performance.js";
import { registerOrchestratorRoutes } from "./routers/orchestrator.js";
import { chatBodySchema, royaltySchema, archiveLookupSchema, archiveAccountSchema, archiveConfirmSchema, archiveClosestSchema } from "./route-schemas.js";
import { lookupSnapshots, lookupAccountTweets, confirmArchived, closestSnapshot } from "./services/wayback.js";
import { createLogger } from "./utils/logger.js";
import { getClients, registerClient, unregisterClient, type ConnectedClient } from "./ws/broadcaster.js";

const log = createLogger("server");

export interface ServerConfig {
  bind: string;
  port: number;
  evmRpc: string;
  storageRpc?: string;
  signer: Wallet;
  oracleBaseUrl: string;
  addresses?: { agentNft: `0x${string}`; vault: `0x${string}`; verifier: `0x${string}`; paymentProcessor?: `0x${string}` };
  env?: BackendEnv;
}

export function startServer(config: ServerConfig): { app: Express; httpServer: HttpServer } {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  // Request ID + logging
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
      log.info(`${req.method} ${req.originalUrl} ${res.statusCode}`, { duration: `${Date.now() - start}ms` });
    });
    next();
  });

  // Security middleware
  const DEV_FRONTEND_ORIGIN = 'http://localhost:5173';
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'", config.env?.AXIOM_FRONTEND_URL ?? DEV_FRONTEND_ORIGIN],
      },
    },
  }));
  app.use(cors({ origin: config.env?.AXIOM_FRONTEND_URL ?? DEV_FRONTEND_ORIGIN, methods: ["GET", "POST"] }));
  app.use(createApiKeyAuth(config.env?.AXIOM_API_KEY));
  app.use(rateLimit({ windowMs: 60_000, max: 100, standardHeaders: true, legacyHeaders: false }));
  app.set("json replacer", bigintReplacer);

  // Shared state
  const ogChainId = config.env?.AXIOM_CHAIN_ID ?? GALILEO_CHAIN_ID;
  const oracle = new DefaultSignerOracleClient({ baseUrl: config.oracleBaseUrl });
  const eip712Domain: Eip712Domain = {
    chainId: BigInt(ogChainId),
    verifyingContract: config.addresses?.verifier ?? DEFAULT_EIP712_DOMAIN.verifyingContract,
  };
  let orchestratorHandle: StrategyRunner | null = null;

  function getOrCreateOrchestrator(): StrategyRunner | null {
    if (!orchestratorHandle) {
      try {
        orchestratorHandle = new StrategyRunner({
          evmRpc: config.evmRpc, signer: config.signer,
          oracleBaseUrl: config.oracleBaseUrl, chainId: ogChainId, addresses: config.addresses,
        });
      } catch (err) {
        log.warn(`StrategyRunner init failed: ${err instanceof Error ? err.message : err} — will retry on next tick`);
      }
    }
    return orchestratorHandle;
  }

  const provider = getSharedProvider();
  let payment: PaymentProcessorClient | null = null;
  async function getPayment(): Promise<PaymentProcessorClient> {
    if (payment) return payment;
    const addr = config.addresses?.paymentProcessor;
    if (!addr) throw new Error("PaymentProcessor address not configured");
    const stub = new TypedContract<{ paymentToken: () => Promise<string> }>(addr, ["function paymentToken() view returns (address)"], provider);
    const tokenAddr = await stub.contract.paymentToken();
    payment = new PaymentProcessorClient({ address: addr, signer: config.signer, provider, paymentTokenAddress: tokenAddr });
    return payment;
  }

  // WebSocket heartbeat
  const HEARTBEAT_INTERVAL = 30_000;
  const MAX_MISSED_PINGS = 3;
  const MAX_WS_CLIENTS = 1000; // imported from utils/constants.ts via broadcaster
  const heartbeatTimer = setInterval(() => {
    const wsClients = getClients();
    for (const c of wsClients) {
      if (c.socket.readyState !== c.socket.OPEN) continue;
      if (c.missedPings >= MAX_MISSED_PINGS) { c.socket.terminate(); wsClients.delete(c); continue; }
      c.missedPings++;
      c.socket.ping();
    }
  }, HEARTBEAT_INTERVAL);

  // Health router
  app.use(createHealthRouter(provider, oracle, config.signer.address, config.addresses));

  // === Compute providers ===
  app.get("/v1/compute/providers", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const routerBaseUrl = getComputeBaseUrl();
      const resp = await fetch(`${routerBaseUrl}/models`, { headers: { 'X-Request-ID': res.locals.requestId as string } });
      const raw = await resp.json();
      const models = z.object({ data: z.array(z.record(z.string(), z.unknown())) }).parse(raw);
      const onChainProviders = await discoverProviders(config.evmRpc);
      const providerMap = new Map(onChainProviders.map(s => [s.model.toLowerCase(), s.provider]));
      const services = models.data.map((m: Record<string, unknown>) => {
        const id = String(m.id ?? "");
        const address = providerMap.get(id.toLowerCase()) ?? ethers.keccak256(ethers.toUtf8Bytes(`model:${id}`)).slice(0, 42) as `0x${string}`;
        const pricingRaw = m.pricing;
        const price = pricingRaw && typeof pricingRaw === 'object' && 'prompt' in pricingRaw ? String((pricingRaw as Record<string, unknown>).prompt ?? '') : undefined;
        return { address, model: id, endpoint: routerBaseUrl, price };
      });
      res.json({ services });
    } catch (err) { next(err); }
  });

  // === Chat completions proxy ===
  app.post("/v1/chat/completions", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { messages, tools } = chatBodySchema.parse(req.body ?? {});
      const client = await createRouterClient();
      const openaiRes = await client.chat.completions.create({
        model: config.env?.AXIOM_COMPUTE_MODEL ?? "qwen/qwen2.5-omni-7b",
        messages, tools, stream: true, max_tokens: 2048,
      });
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      for await (const chunk of openaiRes) { res.write(`data: ${JSON.stringify(chunk)}\n\n`); }
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (err) { next(err); }
  });

  // === Register route modules ===
  registerAgentRoutes(app, config, provider, oracle, eip712Domain);
  registerEventRoutes(app, config, getEventStore());
  registerPerformanceRoutes(app, config, getEventStore());
  registerOrchestratorRoutes(app, config, getOrCreateOrchestrator, ogChainId);

// === Wayback / Internet Archive routes ===
const archiveRouter = express.Router();

createRoute(archiveRouter, {
  path: "/v1/archive/snapshots", method: "get", schema: archiveLookupSchema,
  consumer: "useArchive", description: "List all Wayback snapshots for a URL",
}, async (parsed: { url: string; limit?: number }) => {
  const snapshots = await lookupSnapshots(parsed.url, parsed.limit ?? 50);
  return { url: parsed.url, count: snapshots.length, snapshots };
}, config);

createRoute(archiveRouter, {
  path: "/v1/archive/account", method: "post", schema: archiveAccountSchema,
  consumer: "useArchive", description: "List all archived tweets for an X/Twitter handle",
}, async (parsed: { handle: string; limit?: number }) => {
  const snapshots = await lookupAccountTweets(parsed.handle, parsed.limit ?? 100);
  return { handle: parsed.handle, count: snapshots.length, snapshots };
}, config);

createRoute(archiveRouter, {
  path: "/v1/archive/confirm", method: "post", schema: archiveConfirmSchema,
  consumer: "useArchive", description: "Confirm a URL was archived (deletion-evidence)",
}, async (parsed: { url: string }) => {
  return await confirmArchived(parsed.url);
}, config);

createRoute(archiveRouter, {
  path: "/v1/archive/closest", method: "get", schema: archiveClosestSchema,
  consumer: "useArchive", description: "Closest Wayback snapshot to a timestamp",
}, async (parsed: { url: string; timestamp?: string }) => {
  const snapshot = await closestSnapshot(parsed.url, parsed.timestamp);
  return { url: parsed.url, snapshot };
}, config);

app.use(archiveRouter);

// === Payment routes ===
const paymentRouter = express.Router();
createRoute(paymentRouter, {
  path: "/v1/agents/:id/earnings", method: "get", requireId: true,
  consumer: "usePayment", description: "Get agent earnings by token ID",
  }, async (_parsed, _req, res, { id, config: cfg }) => {
    const nftAddr = cfg.addresses?.agentNft;
    if (!nftAddr) { res.status(500).json({ error: "AgentNFT address not configured" }); return; }
    const nftTc = new TypedContract<{ creatorOf(tokenId: bigint): Promise<string> }>(nftAddr, AGENT_NFT_ABI, provider);
    const creator = await nftTc.contract.creatorOf(BigInt(id));
    if (!creator || creator === ethers.ZeroAddress) { res.status(404).json({ error: "Agent creator not registered for token" }); return; }
    const client = await getPayment();
    const earnings = await client.earningsOf(creator);
    return { tokenId: id, creator, earnings };
  }, config);

  createRoute(paymentRouter, {
    path: "/v1/agents/:id/royalty", schema: royaltySchema, requireId: true,
    consumer: "usePayment", description: "Encode royalty set transaction data",
  }, async (parsed: { bps: number }, _req, _res, { id }) => {
    const client = await getPayment();
    const txData = await client.encodeSetRoyalty(BigInt(id), parsed.bps);
    return { tokenId: id, bps: parsed.bps, ...txData };
  }, config);

  let paymentConfigCache: { data: unknown; timestamp: number } | null = null;
  const PAYMENT_CONFIG_TTL = 300_000;

  createRoute(paymentRouter, {
    path: "/v1/payment/config", method: "get",
    consumer: "usePayment", description: "Payment contract configuration (cached 5min)",
  }, async () => {
    if (paymentConfigCache && Date.now() - paymentConfigCache.timestamp < PAYMENT_CONFIG_TTL) return paymentConfigCache.data;
    const client = await getPayment();
    const [paymentToken, feeBps, treasury] = await Promise.all([client.paymentToken(), client.protocolFeeBps(), client.protocolTreasury()]);
    const result = { paymentToken, protocolFeeBps: feeBps, protocolTreasury: treasury };
    paymentConfigCache = { data: result, timestamp: Date.now() };
    return result;
  }, config);
  app.use(paymentRouter);

  // === Error handler ===
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    log.error("Unhandled error", { error: err.message, stack: err.stack });
    if (err instanceof z.ZodError) { res.status(400).json({ error: "Validation failed", details: err.issues, code: "VALIDATION_ERROR" }); return; }
    const status = typeof err === 'object' && err !== null && 'status' in err ? Number((err as Record<string, unknown>).status) : undefined;
    if (status && status >= 400 && status < 600) { res.status(status).json({ error: err.message, code: `HTTP_${status}` }); return; }
    const msg = err.message ?? "";
    if (/oracle|0g/i.test(msg)) { res.status(502).json({ error: "Upstream service error", code: "UPSTREAM_ERROR" }); return; }
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  });

  // === WebSocket server ===
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ noServer: true });
  httpServer.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/v1/stream") { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const wsClients = getClients();
      if (wsClients.size >= MAX_WS_CLIENTS) { ws.close(1013, "Too many connections"); socket.destroy(); return; }
      const topics = new Set(url.searchParams.getAll("topic").slice(0, 20));
      const client: ConnectedClient = { socket: ws as WebSocket, topics, missedPings: 0 };
      registerClient(client);
      ws.on("pong", () => { client.missedPings = 0; });
      ws.send(JSON.stringify({ topic: "hello", payload: { topics: Array.from(topics) }, ts: Date.now() }));
      ws.on("close", () => unregisterClient(client));
      ws.on("error", (err) => { log.warn("WebSocket client error", { error: (err as Error).message }); unregisterClient(client); });
    });
  });

  httpServer.listen(config.port, config.bind, () => {
    log.info(`Listening on http://${config.bind}:${config.port}`);
    log.info(`Signer: ${config.signer.address}`);
  });
  httpServer.on("close", () => { clearInterval(heartbeatTimer); });

  return { app, httpServer };
}
