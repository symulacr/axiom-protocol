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
import rateLimit from "express-rate-limit";
import { createServer, type Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { ethers, type Wallet } from "ethers";
import { TypedContract, type AgentNFTMethods } from "@axiom/config/types/contract";
import { GALILEO_CHAIN_ID } from "@axiom/config/networks";
import { bigintReplacer } from "@axiom/config/types/bigint";

import {
  getComputeBaseUrl,
  createRouterClient,
  resolveModel,
} from "./compute/router.js";
import { discoverProviders } from "./compute/provider-discovery.js";
import { AGENT_NFT_ABI, VAULT_ABI } from "@axiom/config/abis";

import { StrategyRunner } from "./orchestrator/index.js";
import { DefaultSignerOracleClient } from "./oracle/client.js";
import { type Eip712Domain, DEFAULT_EIP712_DOMAIN, buildEip712Domain } from "@axiom/config";
import { getSharedProvider } from "./provider.js";
import { createApiKeyAuth } from "@axiom/config/middleware/auth";
import { getEventStore } from "./events/store.js";
import { PaymentProcessorClient } from "./payment/processor.js";
import type { BackendEnv } from "./env-schema.js";
import { createHealthRouter } from "./routers/health.js";
import { createRoute, REGISTERED_ROUTES } from "./routers/route-factory.js";
import { registerAgentRoutes } from "./routers/agents.js";
import { registerEventRoutes } from "./routers/events.js";
import { registerPerformanceRoutes } from "./routers/performance.js";
import { registerOrchestratorRoutes } from "./routers/orchestrator.js";
import { createMintEncodeRouter } from "./routers/mint-encode.js";
import { createArchiveQueryRouter } from "./routers/archive-query.js";
import { createArchiveJobsRouter } from "./routers/archive-jobs.js";
import { createSkillEvmRouter } from "./routers/skill-evm.js";
import { createSkillStocksRouter } from "./routers/skill-stocks.js";
import { createSkillOsintRouter } from "./routers/skill-osint.js";
import { createSkillUnbrokerRouter } from "./routers/skill-unbroker.js";
import { createSkillOssForensicsRouter } from "./routers/skill-oss-forensics.js";
import {
  chatBodySchema,
  royaltySchema,
  vaultDepositEncodeSchema,
  vaultWithdrawEncodeSchema,
  vaultExecuteSchema,
} from "./route-schemas.js";
import { createLogger } from "./utils/logger.js";
import { sendError } from "./utils/response.js";
import {
  getClients,
  registerClient,
  unregisterClient,
  type ConnectedClient,
} from "./ws/broadcaster.js";
import { MAX_WS_CLIENTS } from "./utils/constants.js";
import { TTLCache } from "./utils/cache.js";

const log = createLogger("server");

export interface ServerConfig {
  bind: string;
  port: number;
  evmRpc: string;
  signer: Wallet;
  oracleBaseUrl: string;
  addresses?: {
    agentNft: `0x${string}`;
    vault: `0x${string}`;
    verifier: `0x${string}`;
    paymentProcessor?: `0x${string}`;
  };
  env?: BackendEnv;
}

// FLAG: startServer is 237 lines — exceeds 100-line threshold. Consider refactoring route registrations into smaller helpers.

export function startServer(config: ServerConfig): {
  app: Express;
  httpServer: HttpServer;
} {
  const app = express();
  // Railway (and other reverse proxies) set X-Forwarded-For; required for express-rate-limit.
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "2mb" }));

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
      });
    });
    next();
  });

  const DEV_FRONTEND_ORIGIN = "http://localhost:5173";
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: [
            "'self'",
            config.env?.AXIOM_FRONTEND_URL ?? DEV_FRONTEND_ORIGIN,
          ],
        },
      },
    }),
  );
  app.use(
    cors({
      origin: config.env?.AXIOM_FRONTEND_URL ?? DEV_FRONTEND_ORIGIN,
      methods: ["GET", "POST"],
    }),
  );
  app.use(
    createApiKeyAuth(
      config.env?.AXIOM_API_KEY,
      ["/health"],
      process.env.NODE_ENV !== "production",
    ),
  );
  const rateLimitMax = Number.parseInt(
    process.env.AXIOM_RATE_LIMIT_MAX ?? "100",
    10,
  );
  app.use(
    rateLimit({
      windowMs: 60_000,
      max: Number.isFinite(rateLimitMax) && rateLimitMax > 0 ? rateLimitMax : 100,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );
  app.set("json replacer", bigintReplacer);

  const ogChainId = config.env?.AXIOM_CHAIN_ID ?? GALILEO_CHAIN_ID;
  const oracle = new DefaultSignerOracleClient({
    baseUrl: config.oracleBaseUrl,
    apiKey: config.env?.AXIOM_API_KEY,
  });
  const eip712Domain: Eip712Domain = buildEip712Domain(
    ogChainId,
    config.addresses?.verifier ?? DEFAULT_EIP712_DOMAIN.verifyingContract,
  );
  let orchestratorHandle: StrategyRunner | null = null;

  function getOrCreateOrchestrator(): StrategyRunner | null {
    if (!orchestratorHandle) {
      try {
        orchestratorHandle = new StrategyRunner({
          evmRpc: config.evmRpc,
          signer: config.signer,
          oracleBaseUrl: config.oracleBaseUrl,
          apiKey: config.env?.AXIOM_API_KEY,
          chainId: ogChainId,
          addresses: config.addresses,
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
  async function getPayment(): Promise<PaymentProcessorClient> {
    if (payment) return payment;
    const addr = config.addresses?.paymentProcessor;
    if (!addr) throw new Error("PaymentProcessor address not configured");
    const stub = new TypedContract<{ paymentToken: () => Promise<string> }>(
      addr,
      ["function paymentToken() view returns (address)"],
      provider,
    );
    const tokenAddr = await stub.contract.paymentToken();
    payment = new PaymentProcessorClient({
      address: addr,
      signer: config.signer,
      provider,
      paymentTokenAddress: tokenAddr,
    });
    return payment;
  }

  const HEARTBEAT_INTERVAL = 30_000;
  const MAX_MISSED_PINGS = 3;
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

  app.use(
    createHealthRouter(
      provider,
      oracle,
      config.signer.address,
      config.addresses,
    ),
  );

  app.get(
    "/v1/compute/providers",
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const routerBaseUrl = getComputeBaseUrl();
        const resp = await fetch(`${routerBaseUrl}/models`, {
          headers: { "X-Request-ID": res.locals.requestId as string },
        });
        if (!resp.ok) {
          res.status(502).json({
            error: `Compute router returned ${resp.status}`,
            code: "UPSTREAM_ERROR",
          });
          return;
        }
        const raw = await resp.json();
        const models = z
          .object({ data: z.array(z.record(z.string(), z.unknown())) })
          .parse(raw);
        const onChainProviders = await discoverProviders(config.evmRpc);
        const providerMap = new Map(
          onChainProviders.map((s) => [s.model.toLowerCase(), s.provider]),
        );
        const services = models.data.map((m: Record<string, unknown>) => {
          const id = String(m.id ?? "");
          const address =
            providerMap.get(id.toLowerCase()) ??
            (ethers
              .keccak256(ethers.toUtf8Bytes(`model:${id}`))
              .slice(0, 42) as `0x${string}`);
          const pricingRaw = m.pricing;
          const price =
            pricingRaw &&
            typeof pricingRaw === "object" &&
            "prompt" in pricingRaw
              ? String((pricingRaw as Record<string, unknown>).prompt ?? "")
              : undefined;
          return { address, model: id, endpoint: routerBaseUrl, price };
        });
        res.json({ services });
      } catch (err) {
        next(err);
      }
    },
  );

  app.post(
    "/v1/chat/completions",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const {
          messages,
          tools,
          model: reqModel,
        } = chatBodySchema.parse(req.body ?? {});
        const resolvedModel = resolveModel(reqModel);
        const client = await createRouterClient(resolvedModel, {
          signer: config.signer,
        });
        const openaiRes = await client.chat.completions.create({
          model: resolvedModel,
          messages: messages as any,
          tools: tools as any,
          stream: true,
          max_tokens: 2048,
        });
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        let clientClosed = false;
        req.on("close", () => {
          clientClosed = true;
        });
        for await (const chunk of openaiRes) {
          if (clientClosed || res.writableEnded) break;
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
        if (!res.writableEnded) {
          res.write("data: [DONE]\n\n");
          res.end();
        }
      } catch (err) {
        next(err);
      }
    },
  );

  registerAgentRoutes(app, config, provider, oracle, eip712Domain, nftTc);
  app.use(createMintEncodeRouter(config, provider));
  registerEventRoutes(app, config, getEventStore());
  registerPerformanceRoutes(app, config, getEventStore());
  registerOrchestratorRoutes(app, config, getOrCreateOrchestrator, ogChainId);

  app.use(createArchiveQueryRouter(config));
  app.use(createArchiveJobsRouter(config));
  app.use(createSkillEvmRouter(config));
  app.use(createSkillStocksRouter(config));
  app.use(createSkillOsintRouter(config));
  app.use(createSkillUnbrokerRouter(config));
  app.use(createSkillOssForensicsRouter(config));

  app.get("/v1/routes", (_req: Request, res: Response) => {
    res.json({ routes: REGISTERED_ROUTES });
  });

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
    async (_parsed, _req, res, { id, config: cfg }) => {
      const nftAddr = cfg.addresses?.agentNft;
      if (!nftAddr) {
        sendError(res, 500, "AgentNFT address not configured");
        return;
      }
      const nftTc = new TypedContract<{
        creatorOf(tokenId: bigint): Promise<string>;
      }>(nftAddr, AGENT_NFT_ABI, provider);
      const creator = await nftTc.contract.creatorOf(BigInt(id));
      if (!creator || creator === ethers.ZeroAddress) {
        sendError(res, 404, "Agent creator not registered for token");
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
    async () => {
      const cached = paymentConfigCache.get("config");
      if (cached) return cached;
      const client = await getPayment();
      const [paymentToken, feeBps, treasury] = await Promise.all([
        client.paymentToken(),
        client.protocolFeeBps(),
        client.protocolTreasury(),
      ]);
      const result = {
        paymentToken,
        protocolFeeBps: feeBps,
        protocolTreasury: treasury,
      };
      paymentConfigCache.set("config", result);
      return result;
    },
    config,
  );
  // NOTE: no frontend hook consumes this; backend/bench-only vault execution encode.
  createRoute(
    paymentRouter,
    {
      path: "/v1/vaults/:id/execute",
      schema: vaultExecuteSchema,
      requireId: true,
      requireAddress: "vault",
      consumer: "cli-only",
      description: "Execute a transaction from a strategy vault",
    },
    async (parsed, _req, _res, { id, config: cfg }) => {
      const vaultAddr = cfg.addresses?.vault!;
      const { target, value, data, proof } = parsed as z.infer<
        typeof vaultExecuteSchema
      >;
      const vaultTc = new TypedContract<{
        execute(
          tokenId: bigint,
          target: string,
          value: bigint,
          data: string,
          proof: string[],
        ): Promise<any>;
      }>(vaultAddr, VAULT_ABI, cfg.signer);
      const tx = await vaultTc.contract.execute(
        BigInt(id),
        target,
        BigInt(String(value)),
        data,
        proof,
      );
      const receipt = await tx.wait();
      return { ok: true, txHash: tx.hash, status: receipt?.status };
    },
    config,
  );

  createRoute(
    paymentRouter,
    {
      path: "/v1/agents/:id/deposit",
      schema: vaultDepositEncodeSchema,
      requireId: true,
      requireAddress: "vault",
      consumer: "chat-runtime",
      description: "Encode vault deposit transaction (value = native OG amount)",
    },
    async (parsed: { amount: string }, _req, _res, { id, config: cfg }) => {
      const vaultAddr = cfg.addresses?.vault!;
      const iface = new ethers.Interface([
        "function deposit(uint256 tokenId) payable",
      ]);
      const data = iface.encodeFunctionData("deposit", [BigInt(id)]);
      const value = ethers.parseEther(parsed.amount);
      return {
        tokenId: id,
        to: vaultAddr,
        data,
        value: value.toString(),
        amount: parsed.amount,
      };
    },
    config,
  );

  createRoute(
    paymentRouter,
    {
      path: "/v1/agents/:id/withdraw",
      schema: vaultWithdrawEncodeSchema,
      requireId: true,
      requireAddress: "vault",
      consumer: "chat-runtime",
      description: "Encode vault withdraw transaction (amount in native OG)",
    },
    async (parsed: { amount: string }, _req, _res, { id, config: cfg }) => {
      const vaultAddr = cfg.addresses?.vault!;
      const iface = new ethers.Interface([
        "function withdraw(uint256 tokenId, uint256 amount)",
      ]);
      const amountWei = ethers.parseEther(parsed.amount);
      const data = iface.encodeFunctionData("withdraw", [BigInt(id), amountWei]);
      return {
        tokenId: id,
        to: vaultAddr,
        data,
        value: "0",
        amount: parsed.amount,
      };
    },
    config,
  );
  // NOTE: no frontend hook consumes this; agent_metadata is read on-chain via chat-runtime, not this route.

  createRoute(
    paymentRouter,
    {
      path: "/v1/agents/:id/metadata",
      consumer: "cli-only",
      description: "Encode transaction to update agent metadata on-chain",
    },
    async (_parsed, req, res, { id, config: cfg }) => {
      const nftAddr = cfg.addresses?.agentNft;
      if (!nftAddr) {
        sendError(res, 500, "AgentNFT address not configured");
        return;
      }
      const { datas } = req.body ?? {};
      if (!datas || !Array.isArray(datas)) {
        sendError(res, 400, "Missing or invalid datas array");
        return;
      }
      const nftTc = new TypedContract<any>(nftAddr, AGENT_NFT_ABI, provider);
      const encoded = nftTc.iface.encodeFunctionData("update", [
        BigInt(id),
        datas,
      ]);
      return { to: nftAddr, data: encoded, value: "0" };
    },
    config,
  );

  app.use(paymentRouter);

  Sentry.setupExpressErrorHandler(app);

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    log.error("Unhandled error", { error: err.message, stack: err.stack });
    if (err instanceof z.ZodError) {
      res.status(400).json({
        error: "Validation failed",
        details: err.issues,
        code: "VALIDATION_ERROR",
      });
      return;
    }
    const status =
      typeof err === "object" && err !== null && "status" in err
        ? Number((err as Record<string, unknown>).status)
        : undefined;
    if (status && status >= 400 && status < 600) {
      res.status(status).json({ error: err.message, code: `HTTP_${status}` });
      return;
    }
    const msg = err.message ?? "";
    if (/oracle|0g/i.test(msg)) {
      res
        .status(502)
        .json({ error: "Upstream service error", code: "UPSTREAM_ERROR" });
      return;
    }
    res
      .status(500)
      .json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  });

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ noServer: true });
  httpServer.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/v1/stream") {
      socket.destroy();
      return;
    }
    const apiKeys = config.env?.AXIOM_API_KEY
      ? config.env.AXIOM_API_KEY.split(",")
          .map((k) => k.trim())
          .filter(Boolean)
      : [];
    if (apiKeys.length > 0) {
      const token = url.searchParams.get("token");
      if (!token || !apiKeys.includes(token)) {
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

  httpServer.listen(config.port, config.bind, () => {
    log.info(`Listening on http://${config.bind}:${config.port}`);
    log.info(`Signer: ${config.signer.address}`);
  });
  httpServer.on("close", () => {
    clearInterval(heartbeatTimer);
  });

  return { app, httpServer };
}
