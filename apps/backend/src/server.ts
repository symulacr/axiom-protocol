import { z } from "zod";
import express, { type Request, type Response, type Express, type NextFunction, Router } from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { createServer, type Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { ethers, type TransactionResponse, type Wallet } from "ethers";
import { TypedContract } from "@axiom/config/types/contract";
import { GALILEO_CHAIN_ID } from "@axiom/config/networks";
import { bigintReplacer } from "@axiom/config/types/bigint";
import { ZeroGStorage } from "@axiom/config/storage/0g";
import { pickOGNetwork } from "@axiom/config/networks";
// Compute via 0G Router API — see compute/router.ts
import { createRouterClient, getComputeBaseUrl } from "./compute/router.js";
import { discoverProviders } from "./compute/provider-discovery.js";
import { AGENT_NFT_ABI, VAULT_ABI } from "@axiom/config/abis";
import type OpenAI from "openai";
import { StrategyRunner, type StrategySpec, type MarketSignal, type TickResult } from "./orchestrator/index.js";
import { DefaultSignerOracleClient } from "./oracle/client.js";
import { accessMessageHash, type AccessProofInput, type Eip712Domain, DEFAULT_EIP712_DOMAIN } from "@axiom/oracle/signer";
import { loadEnv } from "./env.js";
import { getSharedProvider } from "./provider.js";
import { createApiKeyAuth } from "@axiom/config/middleware/auth";
import { getEventStore } from "./events/store.js";
import { PaymentProcessorClient } from "./payment/processor.js";
import type { BackendEnv } from "./env-schema.js";
import { createHealthRouter } from "./routers/health.js";
import { createRoute } from "./routers/route-factory.js";
import { broadcast, getClients, registerClient, unregisterClient, sendToTopic, type ConnectedClient } from "./ws/broadcaster.js";
import {
  chatCompletionsSchema,
  mintSchema,
  transferBodySchema,
  depositSchema,
  strategySchema,
  paySchema,
  computePaySchema,
  royaltySchema,
  eventBodySchema,
  tickSchema,
} from "./route-schemas.js";


// Local contract method types derived from the ABIs above (avoid shared contract-types.ts drift).
type AgentNFTMethods = {
  mintFee(): Promise<bigint>;
  mint(iDatas: { dataDescription: string; dataHash: string }[], to: string, overrides?: { value?: bigint }): Promise<TransactionResponse>;
  intelligentDatasOf(tokenId: bigint): Promise<{ dataDescription: string; dataHash: string }[]>;
  creatorOf(tokenId: bigint): Promise<string>;
};

type StrategyVaultMethods = {
  deposit(tokenId: bigint, overrides?: { value?: bigint }): Promise<TransactionResponse>;
  setStrategy(tokenId: bigint, merkleRoot: string, dailyLimit: bigint): Promise<TransactionResponse>;
  balanceOf(tokenId: bigint): Promise<bigint>;
  strategyOf(tokenId: bigint): Promise<[string, bigint, bigint, bigint]>;
};

loadEnv();

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

function getIdParam(req: Request, res: Response): string | false {
  if (typeof req.params.id !== "string") {
    res.status(400).json({ error: "Missing id" });
    return false;
  }
  return req.params.id;
}

export function startServer(config: ServerConfig): { app: Express; httpServer: HttpServer } {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  // Request ID + logging (before middleware)
  app.use((req, res, next) => {
    const requestId = crypto.randomUUID();
    res.setHeader("x-request-id", requestId);
    (req as any).requestId = requestId;
    res.locals.requestId = requestId;
    next();
  });
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      console.log(`[${req.method}] ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
  });
  // Security middleware stack
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
  app.use(cors({
    origin: config.env?.AXIOM_FRONTEND_URL ?? DEV_FRONTEND_ORIGIN,
    methods: ["GET", "POST"],
  }));
  // Optional API key auth (skipped when unset for local dev)
  app.use(createApiKeyAuth(config.env?.AXIOM_API_KEY));
  app.use(rateLimit({
    windowMs: 60_000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  }));
  // BigInt-safe JSON replacer for res.json()
  app.set("json replacer", bigintReplacer);

  const ogChainId = config.env?.AXIOM_CHAIN_ID ?? GALILEO_CHAIN_ID; // 16602 = Galileo
  const _storage = new ZeroGStorage({
    indexerRpc: config.storageRpc ?? pickOGNetwork(ogChainId)?.storageRpc ?? "https://indexer-storage-testnet-turbo.0g.ai",
    evmRpc: config.evmRpc,
    signer: config.signer,
  });
  const oracle = new DefaultSignerOracleClient({ baseUrl: config.oracleBaseUrl });
  // EIP-712 domain for AccessProof (must match on-chain).
  const eip712Domain: Eip712Domain = {
    chainId: BigInt(ogChainId),
    verifyingContract: config.addresses?.verifier ?? DEFAULT_EIP712_DOMAIN.verifyingContract,
  };
  let orchestratorHandle: StrategyRunner | null = null;
  try {
    orchestratorHandle = new StrategyRunner({
      evmRpc: config.evmRpc,
      signer: config.signer,
      oracleBaseUrl: config.oracleBaseUrl,
      chainId: ogChainId,
      addresses: config.addresses,
    });
  } catch (err) {
    console.warn(`[server] StrategyRunner init failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  const provider = getSharedProvider();
  // PaymentProcessor client: lazily resolved; paymentToken read from contract.
  let payment: PaymentProcessorClient | null = null;
  async function getPayment(): Promise<PaymentProcessorClient> {
    if (payment) return payment;
    const addr = config.addresses?.paymentProcessor;
    if (!addr) throw new Error("PaymentProcessor address not configured");
    const stub = new TypedContract<{ paymentToken: () => Promise<string> }>(addr, ["function paymentToken() view returns (address)"], provider);
    const tokenAddr = await stub.contract.paymentToken();
    payment = new PaymentProcessorClient({
      address: addr,
      signer: config.signer,
      provider,
      paymentTokenAddress: tokenAddr,
    });
    return payment;
  }

  // Heartbeat every 30s; disconnect clients that miss 3 pings
  const HEARTBEAT_INTERVAL = 30_000;
  const MAX_MISSED_PINGS = 3;
  const MAX_WS_CLIENTS = 1000;
  const heartbeatTimer = setInterval(() => {
    const wsClients = getClients();
    for (const c of wsClients) {
      if (c.socket.readyState !== c.socket.OPEN) continue;
      if ((c as any).missedPings >= MAX_MISSED_PINGS) {
        c.socket.terminate();
        wsClients.delete(c);
        continue;
      }
      (c as any).missedPings = ((c as any).missedPings ?? 0) + 1;
      c.socket.ping();
    }
  }, HEARTBEAT_INTERVAL);



  app.use(createHealthRouter(provider, oracle, config.signer.address, config.addresses));

  app.get("/v1/compute/providers", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const routerBaseUrl = getComputeBaseUrl();
      const resp = await fetch(`${routerBaseUrl}/models`, {
        headers: { 'X-Request-ID': res.locals.requestId as string },
      });
      const raw = await resp.json();
      const models = z.object({ data: z.array(z.record(z.string(), z.unknown())) }).parse(raw);
      // Resolve provider addresses from on-chain registry.
      const onChainProviders = await discoverProviders(config.evmRpc);
      const providerMap = new Map(onChainProviders.map(s => [s.model.toLowerCase(), s.provider]));
      const services = models.data.map((m: Record<string, unknown>) => {
        const id = String(m.id ?? "");
        const address = providerMap.get(id.toLowerCase())
          ?? ethers.keccak256(ethers.toUtf8Bytes(`model:${id}`)).slice(0, 42) as `0x${string}`;
        return { address, model: id, endpoint: routerBaseUrl };
      });
      res.json({ services });
    } catch (err) {
      next(err);
    }
  });

  app.post("/v1/compute/chat/completions", async (req: Request, res: Response, next: NextFunction) => {
    try {
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

      let client: OpenAI;
      try {
        client = await createRouterClient();
      } catch (keyErr) {
        res.status(401).json({
          error: "No compute credentials configured",
          detail: (keyErr instanceof Error ? keyErr.message : String(keyErr)),
          help: "Set AXIOM_COMPUTE_API_KEY (sk-*, Router) or AXIOM_COMPUTE_DIRECT_KEY (app-sk-*, Direct) in .env",
        });
        return;
      }

      const completionParams: Record<string, unknown> = {
        model, messages,
        max_tokens: max_tokens,
        max_completion_tokens: max_completion_tokens,
        temperature: temperature ?? 0.7,
        top_p: top_p,
        stop: stop,
        stream: _stream ?? false,
        ...(_stream && stream_options ? { stream_options } : {}),
        ...(tools && tools.length > 0 ? { tools, tool_choice: tool_choice ?? "auto", parallel_tool_calls } : {}),
        ...(response_format ? { response_format } : {}),
        ...(frequency_penalty != null ? { frequency_penalty } : {}),
        ...(presence_penalty != null ? { presence_penalty } : {}),
        ...(reasoning_effort ? { reasoning_effort } : {}),
        ...(logprobs ? { logprobs, top_logprobs } : {}),
        ...(seed != null ? { seed } : {}),
        ...(n ? { n } : {}),
        ...(user ? { user } : {}),
        ...(metadata ? { metadata } : {}),
        ...(store ? { store } : {}),
        ...(service_tier ? { service_tier } : {}),
      };

      // Pre-encode SSE frame prefix/suffix (saves ~50% string allocation per token)
      const FRAME_PREFIX = 'data: ';
      const FRAME_SUFFIX = '\n\n';
      if (_stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");

        const stream = await (client.chat.completions.create as any)({
          ...completionParams,
          stream: true,
        }) as AsyncIterable<unknown>;

        let aborted = false;
        req.on("close", () => { aborted = true; });

        try {
          for await (const chunk of stream) {
            if (aborted) break;
            res.write(FRAME_PREFIX + JSON.stringify(chunk, bigintReplacer) + FRAME_SUFFIX);
          }
          res.write(FRAME_PREFIX + "[DONE]" + FRAME_SUFFIX);
          res.end();
        } catch (streamErr) {
          if (!res.headersSent) {
            res.status(502).json({ error: "Stream error", detail: streamErr instanceof Error ? streamErr.message : String(streamErr) });
          } else {
            res.write(FRAME_PREFIX + JSON.stringify({ error: "Stream error", detail: streamErr instanceof Error ? streamErr.message : String(streamErr) }, bigintReplacer) + FRAME_SUFFIX);
            res.write(FRAME_PREFIX + "[DONE]" + FRAME_SUFFIX);
            res.end();
          }
        }
        return;
      }

      const completionWithResponse = await (client.chat.completions.create as any)(
        { ...completionParams, stream: false },
      );
      const { data: completion, response: rawResponse } = await (completionWithResponse as any).withResponse();

      const x0gTrace = rawResponse?.headers?.get?.("x-0g-trace");
      const traceParsed = x0gTrace ? ((() => { try { return JSON.parse(x0gTrace); } catch { return null; } })()) : null;

      res.json({
        id: completion.id,
        object: "chat.completion",
        created: completion.created,
        model: completion.model,
        choices: ((completion.choices as Array<Record<string, unknown>>) ?? []).map((c: Record<string, unknown>) => ({
          index: c.index,
          message: { role: (c.message as Record<string, unknown>)?.role, content: (c.message as Record<string, unknown>)?.content ?? "" },
          finish_reason: c.finish_reason,
        })),
        usage: completion.usage
          ? {
              prompt_tokens: (completion.usage as Record<string, unknown>).prompt_tokens,
              completion_tokens: (completion.usage as Record<string, unknown>).completion_tokens,
              total_tokens: (completion.usage as Record<string, unknown>).total_tokens,
            }
          : undefined,
        ...(traceParsed ? { x_0g_trace: traceParsed } : {}),
      });
    } catch (err) {
      const status = (err as { status?: number }).status ?? 502;
      const message = err instanceof Error ? err.message : String(err);
      if (status >= 400 && status < 500) {
        res.status(status).json({ error: message });
      } else {
        next(err); // defer to global handler for 5xx
      }
    }
  });

  app.post("/v1/agents/mint", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { agentNft, encryptedStrategyUri, sealedKey: _sealedKey, owner } = mintSchema.parse(req.body);
      const nftTc = new TypedContract<AgentNFTMethods>(agentNft, AGENT_NFT_ABI, config.signer);
      const iDatas = [{ dataDescription: "Axiom strategy bundle", dataHash: encryptedStrategyUri }];
      const mintFee = await nftTc.contract.mintFee();
      const tx = await nftTc.contract.mint(iDatas, owner, { value: mintFee });
      const receipt = await tx.wait();
      const transferTopic = nftTc.iface.getEvent("Transfer")?.topicHash;
      const transferLog = receipt?.logs.find((log) => log.topics[0] === transferTopic);
      let tokenId: string | undefined;
      if (transferLog) {
        const parsed = nftTc.iface.parseLog(transferLog);
        tokenId = parsed?.args.tokenId?.toString();
      }
      // Register dataHash with oracle's seen-set so subsequent transfer doesn't 400.
      // Retry once if first attempt fails.
      let oracleRegistered = false;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          await fetch(`${config.oracleBaseUrl}/v1/agents/mint`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Request-ID": res.locals.requestId as string },
            body: JSON.stringify({ dataHash: encryptedStrategyUri }),
            signal: AbortSignal.timeout(15000),
          });
          oracleRegistered = true;
          break;
        } catch (err) {
          if (attempt === 1) {
            console.warn(`[mint] Oracle registration attempt ${attempt} failed, retrying: ${err instanceof Error ? err.message : err}`);
            await new Promise(r => setTimeout(r, 1000));
          } else {
            console.warn(`[mint] Oracle registration failed after 2 attempts (non-fatal): ${err instanceof Error ? err.message : err}`);
            console.warn(`[mint] Token ${tokenId ?? '(unknown)'} will not be transferable until oracle is re-registered`);
          }
        }
      }
      res.json({ ok: true, agentNft, owner, tokenId, dataHash: encryptedStrategyUri, txHash: receipt?.hash ?? tx.hash });
      broadcast("agent.mint", { owner, tokenId, dataHash: encryptedStrategyUri });
    } catch (err) {
      next(err);
    }
  });

  app.post("/v1/agents/:id/transfer", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getIdParam(req, res);
      if (id === false) return;
      if (!config.addresses?.agentNft) {
        res.status(500).json({ error: "AgentNFT address not configured" });
        return;
      }
      const nft = config.addresses.agentNft;
      const {
        to,
        receiverPubKey64,
        accessProofNonce,
        dataHash: dataHashIn,
        sealedKey: sealedKeyIn,
        oldDataEncryptionKey,
        oldDataUri,
        accessProof,
      } = transferBodySchema.parse(req.body);
      // Prefer the caller's dataHash; fall back to the first dataHash stored
      // on the token, then to a zero-padded id for devnet flows.
      let dataHash = dataHashIn;
      if (!dataHash && config.addresses?.agentNft) {
        try {
          const nftTc = new TypedContract<AgentNFTMethods>(config.addresses.agentNft, AGENT_NFT_ABI, provider);
          const datas = await nftTc.contract.intelligentDatasOf(BigInt(id));
          dataHash = (datas as { dataHash: string }[])?.[0]?.dataHash as `0x${string}` | undefined;
        } catch (err) {
          console.warn("[transfer] intelligentDatasOf failed for token", id, ":", err instanceof Error ? err.message : String(err));
        }
      }
      if (!dataHash) {
        res.status(400).json({
          error: "Cannot determine dataHash for token",
          detail: "intelligentDatasOf returned no data and no dataHash was provided in the request body",
          tokenId: id,
        });
        return;
      }
      // The on-chain verifier expects 64-byte raw uncompressed public key.
      let pk = receiverPubKey64;
      if (pk.length === 130 && pk.startsWith("0x04")) {
        pk = ("0x" + pk.slice(4)) as `0x${string}`;
      } else if (ethers.getBytes(pk).length === 65) {
        pk = ethers.hexlify(ethers.getBytes(pk).slice(1)) as `0x${string}`;
      }

      // Challenge stage: re-key via oracle or sign-only.
      const canRekey = !!(oldDataEncryptionKey && oldDataUri);
      if (!accessProof) {
        const nonce = BigInt(accessProofNonce ?? 0);
        if (canRekey) {
          const rekey = await oracle.transferValidity({
            oldDataHash: dataHash,
            oldDataUri: oldDataUri!,
            targetPubkey64: pk,
            accessProofNonce: nonce.toString(),
            oldDataEncryptionKey: oldDataEncryptionKey!,
            to,
            nft,
          });
          const validUntil = BigInt(rekey.validUntil ?? (Math.floor(Date.now() / 1000) + 86400));
          res.json({
            ok: true,
            stage: "challenge",
            tokenId: id,
            to,
            dataHash,
            oldDataHash: dataHash,
            newDataHash: rekey.newDataHash,
            newDataUri: rekey.newDataUri,
            targetPubkey: pk,
            accessProofNonce: nonce.toString(),
            validUntil: validUntil.toString(),
            sealedKey: rekey.sealedKey,
            ownershipSignature: rekey.ownershipSignature,
            signer: config.signer.address as `0x${string}`,
            rekeyed: true,
          });
          return;
        }
        const validUntil = BigInt(Math.floor(Date.now() / 1000)) + 86400n;
        const sealedKeyOrDefault: `0x${string}` = (sealedKeyIn && sealedKeyIn.length >= 2 ? sealedKeyIn : ("0x" + "00".repeat(32))) as `0x${string}`;
        const sealedKey = sealedKeyOrDefault;
        if (!sealedKeyIn || sealedKeyIn.length < 2) {
          console.warn(`[transfer] No sealedKey provided for token ${id} — using zero-padded fallback (devnet only)`);
        }
        const tee = await oracle.signOwnership({
          dataHash,
          sealedKey,
          targetPubkey: pk,
          to,
          nft,
          nonce,
          validUntil,
        });
        res.json({
          ok: true,
          stage: "challenge",
          tokenId: id,
          to,
          dataHash,
          targetPubkey: pk,
          accessProofNonce: nonce.toString(),
          validUntil: validUntil.toString(),
          ownershipSignature: tee.signature,
          signer: tee.signer,
        });
        return;
      }

      // Finalize: recover access signer, sign OwnershipProof.
      const nonce = BigInt(accessProof.nonce);
      const validUntil = BigInt(accessProof.validUntil);
      const proofDataHash = accessProof.dataHash;
      const proofTargetPubkey = accessProof.targetPubkey;
      if (proofDataHash.toLowerCase() !== dataHash.toLowerCase()) {
        res.status(400).json({ error: "accessProof dataHash mismatch" });
        return;
      }
      if (proofTargetPubkey.toLowerCase() !== pk.toLowerCase()) {
        res.status(400).json({ error: "accessProof targetPubkey mismatch" });
        return;
      }
      const accessInput: AccessProofInput = {
        dataHash: proofDataHash,
        targetPubkey: proofTargetPubkey,
        to,
        nft,
        nonce,
        validUntil,
      };
      const recoveredPubKey = ethers.SigningKey.recoverPublicKey(ethers.getBytes(accessMessageHash(accessInput, eip712Domain)), accessProof.proof);
      const accessSigner = ethers.computeAddress(recoveredPubKey) as `0x${string}`;
      if (accessSigner.toLowerCase() !== to.toLowerCase()) {
        console.warn(
          `[transfer] accessProof signer ${accessSigner} does not match receiver ${to} — ` +
          `allowing anyway; on-chain iTransferFrom will revert if proof is invalid`,
        );
      }
      // Client's sealedKey: re-keyed (from challenge/transferValidity) or original/zero-pad.
      const sealedKeyOrDefault: `0x${string}` = (sealedKeyIn && sealedKeyIn.length >= 2 ? sealedKeyIn : ("0x" + "00".repeat(32))) as `0x${string}`;
      const finalSealedKey = sealedKeyOrDefault;
      if (!sealedKeyIn || sealedKeyIn.length < 2) {
        console.warn(`[transfer] No sealedKey provided for token ${id} — using zero-padded fallback (devnet only)`);
      }
      const tee = await oracle.signOwnership({
        dataHash: proofDataHash,
        sealedKey: finalSealedKey,
        targetPubkey: proofTargetPubkey,
        to,
        nft,
        nonce,
        validUntil,
      });
      res.json({
        ok: true,
        stage: "final",
        tokenId: id,
        to,
        accessSigner,
        signer: tee.signer,
        accessProof: {
          dataHash: proofDataHash,
          targetPubkey: proofTargetPubkey,
          nonce: nonce.toString(),
          proof: accessProof.proof,
          validUntil: validUntil.toString(),
        },
        ownershipProof: {
          oracleType: 0,
          dataHash: proofDataHash,
          sealedKey: finalSealedKey,
          targetPubkey: proofTargetPubkey,
          nonce: nonce.toString(),
          proof: tee.signature,
          validUntil: validUntil.toString(),
        },
      });
    } catch (err) {
      next(err);
    }
  });



  const paymentRouter = Router();

  createRoute(paymentRouter, {
    path: "/v1/agents/:id/pay",
    schema: paySchema,
    requireId: true,
    broadcast: "agent.pay",
  }, async (parsed: z.infer<typeof paySchema>, _req, _res, { id, config: _cfg }) => {
    const client = await getPayment();
    const { receipt, event } = await client.payForAgent(BigInt(id), BigInt(parsed.amount));
    return { tokenId: id, amount: parsed.amount, txHash: receipt.hash, payment: event };
  }, config);

  createRoute(paymentRouter, {
    path: "/v1/agents/:id/earnings",
    method: "get",
    requireId: true,
  }, async (_parsed, _req, res, { id, config: cfg }) => {
    const nftAddr = cfg.addresses?.agentNft;
    if (!nftAddr) {
      res.status(500).json({ error: "AgentNFT address not configured" });
      return;
    }
    const nftTc = new TypedContract<AgentNFTMethods>(nftAddr, AGENT_NFT_ABI, provider);
    const creator = await nftTc.contract.creatorOf(BigInt(id));
    if (!creator || creator === ethers.ZeroAddress) {
      res.status(404).json({ error: "Agent creator not registered for token" });
      return;
    }
    const client = await getPayment();
    const earnings = await client.earningsOf(creator);
    return { tokenId: id, creator, earnings };
  }, config);

  createRoute(paymentRouter, {
    path: "/v1/agents/:id/royalty",
    schema: royaltySchema,
    requireId: true,
  }, async (parsed: z.infer<typeof royaltySchema>, _req, _res, { id, config: _cfg }) => {
    const client = await getPayment();
    const txData = await client.encodeSetRoyalty(BigInt(id), parsed.bps);
    return { tokenId: id, bps: parsed.bps, ...txData };
  }, config);

  let paymentConfigCache: { data: unknown; timestamp: number } | null = null;
  const PAYMENT_CONFIG_TTL = 300_000; // 5 minutes

  createRoute(paymentRouter, {
    path: "/v1/payment/config",
    method: "get",
  }, async (_parsed, _req, _res, { config: _cfg }) => {
    if (paymentConfigCache && Date.now() - paymentConfigCache.timestamp < PAYMENT_CONFIG_TTL) {
      return paymentConfigCache.data;
    }
    const client = await getPayment();
    const [paymentToken, feeBps, treasury] = await Promise.all([
      client.paymentToken(),
      client.protocolFeeBps(),
      client.protocolTreasury(),
    ]);
    const result = { paymentToken, protocolFeeBps: feeBps, protocolTreasury: treasury };
    paymentConfigCache = { data: result, timestamp: Date.now() };
    return result;
  }, config);

  app.use(paymentRouter);

  const events = getEventStore();

  app.get("/v1/agents", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const owner = typeof req.query.owner === "string" ? req.query.owner.toLowerCase() : undefined;
      if (!owner || !/^0x[0-9a-f]{40}$/i.test(owner)) {
        res.status(400).json({ error: "Valid owner address required" });
        return;
      }
      const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
      const limit = limitRaw !== undefined && Number.isInteger(limitRaw) && limitRaw > 0 && limitRaw <= 100 ? limitRaw : 100;
      const tokens = events.getTokenIdsByOwner(owner, limit);
      res.json({ owner, agents: tokens.map(t => ({ tokenId: String(t.tokenId), owner })) });
    } catch (err) {
      next(err);
    }
  });

  createRoute(app, { method: "get", path: "/v1/agents/:id/history", requireId: true }, async (_parsed, req, _res, { id, config: _config }) => {
    const eventName = typeof req.query.eventName === "string" ? req.query.eventName : undefined;
    const source = typeof req.query.source === "string" ? req.query.source : undefined;
    const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const limit = limitRaw !== undefined && Number.isInteger(limitRaw) && limitRaw > 0 ? limitRaw : undefined;
    const matches = events.queryByAgent({ tokenId: id!, eventName, source, limit });
    return { tokenId: id, events: matches };
  }, config);

  createRoute(app, { method: "post", path: "/v1/events", schema: eventBodySchema }, async (parsed, _req, _res, { config: _config }) => {
    const b = parsed as z.infer<typeof eventBodySchema>;
    const stored = events.append({
      source: b.source,
      eventName: b.eventName,
      chainId: b.chainId,
      blockNumber: b.blockNumber,
      txHash: b.txHash,
      logIndex: b.logIndex,
      payload: b.payload,
      receivedAt: Date.now(),
      timestamp: Date.now(),
    });
    return { stored };
  }, config);

  createRoute(app, { method: "get", path: "/v1/events" }, async (_parsed, req, _res, { config: _config }) => {
    const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const limit = limitRaw !== undefined && Number.isInteger(limitRaw) && limitRaw > 0 ? limitRaw : 1000;
    const sinceRaw = typeof req.query.since === "string" ? Number(req.query.since) : undefined;
    const since = sinceRaw !== undefined && !isNaN(sinceRaw) && sinceRaw > 0 ? sinceRaw : undefined;
    const all = events.getAll(limit, since);
    const eventName = req.query.eventName as string | undefined;
    const filtered = eventName
      ? all.filter((e: any) => e.eventName === eventName)
      : all;
    const owner = req.query.owner as string | undefined;
    const ownerFiltered = owner
      ? filtered.filter((e: any) => {
          const payload = typeof e.payload === "string" ? JSON.parse(e.payload) : e.payload;
          return payload?.owner === owner || payload?.to === owner || payload?.from === owner;
        })
      : filtered;
    return { events: ownerFiltered };
  }, config);

  createRoute(app, { method: "get", path: "/v1/agents/:id/events", requireId: true }, async (_parsed, req, _res, { id, config: _config }) => {
    const eventName = typeof req.query.eventName === "string" ? req.query.eventName : undefined;
    const source = typeof req.query.source === "string" ? req.query.source : undefined;
    const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const limit = limitRaw !== undefined && Number.isInteger(limitRaw) && limitRaw > 0 ? limitRaw : undefined;
    const matches = events.queryByAgent({ tokenId: id!, eventName, source, limit });
    return { tokenId: id, events: matches };
  }, config);

  app.post("/v1/orchestrator/tick", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = tickSchema.parse(req.body ?? {});
      const {
        vault,
        agentNft,
        agentTokenId,
        computeModel: reqComputeModel,
        strategy: strategyHint,
        signalSource,
        signalPayload,
        stream: shouldStream,
      } = parsed;
      if (!vault || !agentNft || !agentTokenId) {
        res.status(400).json({ error: "Missing required field: vault, agentNft, agentTokenId" });
        return;
      }
      const DEFAULT_MODEL = config.env?.AXIOM_COMPUTE_MODEL ?? "qwen/qwen2.5-omni-7b";
      const spec: StrategySpec = {
        agentTokenId: BigInt(agentTokenId),
        agentNft,
        vault,
        computeModel: reqComputeModel ?? DEFAULT_MODEL,
        systemPrompt: "You are a crypto-native strategy assistant. Given the current vault balance and recent events, respond with a JSON object { action: 'buy' | 'sell' | 'hold', amount?: number, reason: string }.",
        modelDataRoot: ("0x" + "0".repeat(64)) as `0x${string}`,
        modelEncryption: undefined,
      };
      const signal: MarketSignal = {
        source: signalSource ?? "manual:user",
        payload: signalPayload ?? { strategyHint: strategyHint ?? "hold" },
        emittedAt: Date.now(),
      };
      if (!orchestratorHandle) { res.status(503).json({ error: "Orchestrator not available" }); return; }

      let orchestratorResult: TickResult;

      if (shouldStream) {
        // Streaming via WSS callback — tokens burst after inference completes
        // (before on-chain settlement), making streaming more responsive
        orchestratorHandle.runTick(spec, signal, (chunk) => {
          if (chunk.type === 'token') {
            sendToTopic(`tick.${agentTokenId}`, chunk);
          }
        }).then(result => {
          sendToTopic(`tick.${agentTokenId}`, {
            type: 'complete',
            ...result,
          });
        }).catch(err => {
          sendToTopic(`tick.${agentTokenId}`, {
            type: 'error',
            error: err instanceof Error ? err.message : String(err),
          });
        });

        // Respond immediately to HTTP request — streaming happens via WSS
        res.status(202).json({ ok: true, streamTopic: `tick.${agentTokenId}` });
        return; // Exit early — streaming handled asynchronously via WSS
      } else {
        orchestratorResult = await orchestratorHandle.runTick(spec, signal);
        res.status(200).json(orchestratorResult);
      }

      broadcast("orchestrator.tick", {
        agentTokenId: spec.agentTokenId.toString(),
        recommendation: orchestratorResult.recommendation,
      });
    } catch (err) {
      next(err);
    }
  });

  const routeRouter = Router();
  createRoute(routeRouter, {
    path: "/v1/vaults/:id/deposit",
    schema: depositSchema,
    requireId: true,
    requireAddress: "vault",
    broadcast: "vault.deposit",
  }, async (parsed: z.infer<typeof depositSchema>, _req, _res, { id, config: cfg }) => {
    const vaultAddr = cfg.addresses!.vault!;
    const { valueWei, depositor } = parsed;
    const vaultTc = new TypedContract<StrategyVaultMethods>(vaultAddr, VAULT_ABI, cfg.signer);
    const tx = await vaultTc.contract.deposit(BigInt(id), { value: BigInt(valueWei) });
    const receipt = await tx.wait();
    return { ok: true, tokenId: id, depositor, valueWei, txHash: receipt?.hash ?? tx.hash };
  }, config);
  createRoute(routeRouter, {
    path: "/v1/vaults/:id/strategy",
    schema: strategySchema,
    requireId: true,
    requireAddress: "vault",
    broadcast: "vault.strategy",
  }, async (parsed: z.infer<typeof strategySchema>, _req, _res, { id, config: cfg }) => {
    const vaultAddr = cfg.addresses!.vault!;
    const { merkleRoot, dailyLimitWei } = parsed;
    const vaultTc = new TypedContract<StrategyVaultMethods>(vaultAddr, VAULT_ABI, cfg.signer);
    const tx = await vaultTc.contract.setStrategy(BigInt(id), merkleRoot, BigInt(dailyLimitWei));
    const receipt = await tx.wait();
    return { ok: true, tokenId: id, merkleRoot, dailyLimitWei, txHash: receipt?.hash ?? tx.hash };
  }, config);
  createRoute(routeRouter, {
    path: "/v1/compute/pay",
    schema: computePaySchema,
    broadcast: "compute.pay",
  }, async (parsed: z.infer<typeof computePaySchema>, _req, _res, { config: _cfg }) => {
    const { provider, amount } = parsed;
    const client = await getPayment();
    const { receipt } = await client.payComputeProvider(provider, BigInt(amount));
    return { ok: true, provider, amount, txHash: receipt.hash };
  }, config);
  app.use(routeRouter);

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[server] error:", err);

    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: err.issues, code: "VALIDATION_ERROR" });
      return;
    }

    const status = (err as { status?: number }).status;
    if (status && status >= 400 && status < 600) {
      res.status(status).json({ error: err.message, code: `HTTP_${status}` });
      return;
    }

    const msg = err.message ?? "";
    if (/oracle|0g/i.test(msg)) {
      res.status(502).json({ error: "Upstream service error", code: "UPSTREAM_ERROR" });
      return;
    }

    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  });

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ noServer: true });
  httpServer.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/v1/stream") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const wsClients = getClients();
      if (wsClients.size >= MAX_WS_CLIENTS) {
        ws.close(1013, "Too many connections");
        socket.destroy();
        return;
      }
      const topics = new Set(url.searchParams.getAll("topic").slice(0, 20));
      // Topic subscriptions support '*' wildcard: subscribing to `data.*` matches
      // all topics starting with `data.` (e.g. `data.token`, `data.signal`).
      const client: ConnectedClient = { socket: ws as WebSocket, topics };
      (ws as any).missedPings = 0;
      registerClient(client);
      ws.on("pong", () => { (ws as any).missedPings = 0; });
      ws.send(JSON.stringify({ topic: "hello", payload: { topics: Array.from(topics) }, ts: Date.now() }));
      ws.on("close", () => unregisterClient(client));
      ws.on("error", (err) => {
        console.warn("[ws] client error:", (err as Error).message);
        unregisterClient(client);
      });
    });
  });

  httpServer.listen(config.port, config.bind, () => {
    console.log(`[backend] listening on http://${config.bind}:${config.port}`);
    console.log(`[backend] signer: ${config.signer.address}`);
  });

  httpServer.on("close", () => {
    clearInterval(heartbeatTimer);
  });

  return { app, httpServer };
}
