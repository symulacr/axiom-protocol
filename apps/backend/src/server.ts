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
import { DefaultSignerOracleClient } from "./oracle/client.js";
import {
	HTTP,
	type Eip712Domain,
	DEFAULT_EIP712_DOMAIN,
	buildEip712Domain,
	resolveChatModel,
	resolveContextWindow,
	getRuntimeConfig,
} from "@axiom/config";
import { getSharedProvider } from "./provider.js";
import {
	createApiKeyAuth,
	enforceClientPathAllowlist,
	timingSafeTokenInList,
} from "@axiom/config/middleware/auth";
import { getEventStore } from "./events/store.js";
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
import { chatBodySchema, royaltySchema } from "./route-schemas.js";
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

REGISTERED_ROUTES.push({
	method: "GET",
	path: "/v1/stream",
	consumer: "ws",
	description: "WebSocket event stream (upgrade)",
});

export function isUpstreamTransportError(err: unknown): boolean {
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
	oracleBaseUrl: string;
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
			["/health", "/health/live"],
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

	registerHealthRoutes(app, config, provider, oracle);
	registerComputeRoutes(app, config);

	registerChatRoutes(app, config);

	registerAgentRoutes(app, config, provider, oracle, eip712Domain, nftTc);
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
	oracle: DefaultSignerOracleClient,
): void {
	app.use(createHealthRouter(provider, oracle, config));
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
				const { messages, tools, model: reqModel } = parsed;
				const DEFAULT_MODEL = resolveChatModel(config.env?.AXIOM_COMPUTE_MODEL);
				const resolvedModel = reqModel ?? DEFAULT_MODEL;
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
						{ signal: streamSignal },
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
				for await (const chunk of openaiRes) {
					if (res.writableEnded) break;
					if (!writeChunk(`data: ${JSON.stringify(chunk)}\n\n`)) break;
					n++;
				}
				if (!res.writableEnded) {
					if (n === 0) {
						writeChunk(
							`data: ${JSON.stringify({ choices: [{ delta: { content: "⚠ 0G Compute returned an empty response. Try again or check model availability." } }] })}\n\n`,
						);
					}
					const traceHeader =
						response?.headers?.get?.("x_0g_trace") ??
						(response?.headers as unknown as Record<string, string>)?.[
							"x_0g_trace"
						];
					if (traceHeader) {
						try {
							const trace =
								typeof traceHeader === "string"
									? JSON.parse(traceHeader)
									: traceHeader;
							writeChunk(
								`data: ${JSON.stringify({ type: "trace", trace })}\n\n`,
							);
						} catch {
							/* trace header not JSON — skip */
						}
					}
					writeChunk("data: [DONE]\n\n");
					res.end();
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
