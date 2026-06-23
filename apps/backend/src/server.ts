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
import { bigintReplacer, stringifyBigIntSafe, bigIntSafe } from "@axiom/config/types/bigint";
import type { AgentNFTMethods, StrategyVaultMethods } from "./contract-types.js";
import { ZeroGStorage, pickOGNetwork } from "./storage/0g.js";
// Compute via 0G Router API (OpenAI-compatible) — see compute/router.ts
import { getComputeBaseUrl } from "./compute/router.js";
import type OpenAI from "openai";
import { StrategyRunner, type StrategySpec, type MarketSignal, type TickResult } from "./orchestrator/index.js";
import { createOrchestratorHandle, getRunnerOrThrow, type OrchestratorHandle } from "./orchestrator/handle.js";
import { DefaultSignerOracleClient } from "./oracle/client.js";
import { accessMessageHash, type AccessProofInput, type Eip712Domain, DEFAULT_EIP712_DOMAIN } from "@axiom/oracle/signer";
import { loadEnv } from "./env.js";
import { createApiKeyAuth } from "@axiom/config/middleware/auth";
import { getEventStore } from "./events/store.js";
import { PaymentProcessorClient } from "./payment/processor.js";
import type { BackendEnv } from "./env-schema.js";
import { createHealthRouter } from "./routers/health.js";
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

const AGENT_NFT_ABI: string[] = [
  "function mint((string dataDescription, bytes32 dataHash)[] iDatas, address to) payable returns (uint256 tokenId)",
  "function mintFee() view returns (uint256)",
  "function intelligentDatasOf(uint256 tokenId) view returns (tuple(string dataDescription, bytes32 dataHash)[])",
  "function creatorOf(uint256 tokenId) view returns (address)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
];

const VAULT_ABI: string[] = [
  "function deposit(uint256 tokenId) payable",
  "function setStrategy(uint256 tokenId, bytes32 merkleRoot, uint256 dailyLimit)",
  "function balanceOf(uint256) view returns (uint256)",
  "function strategyOf(uint256) view returns (bytes32,uint256,uint64)",
];
/**
 * HTTP + WebSocket server for the Axiom Protocol backend.
 *
 * Endpoints (per the MW13 plan):
 *   GET  /health                                 liveness probe + signer/chain head
 *   GET  /v1/compute/providers                   list available inference services (read-only)
 *   POST /v1/compute/chat/completions            standalone chat completion (OpenAI-compatible)
 *   POST /v1/agents/mint                         upload encrypted strategy, call AxiomAgentNFT.mint
 *   POST /v1/agents/:id/transfer                 orchestrate the TEE oracle, call iTransferFrom
 *   POST /v1/vaults/:id/deposit                  relay native value to AxiomStrategyVault
 *   POST /v1/vaults/:id/strategy                 commit Merkle root + daily limit
 *   POST /v1/orchestrator/tick                  run a strategy tick (Promise.all fan-out)
 *   WS   /v1/stream                               real-time event log stream
 */
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

interface ConnectedClient {
  socket: WebSocket;
  topics: Set<string>;
}

function getIdParam(req: Request, res: Response) {
  const id = req.params.id;
  if (typeof id !== "string") { res.status(400).json({ error: "Missing id" }); return null; }
  return id;
}

export function startServer(config: ServerConfig): { app: Express; httpServer: HttpServer } {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  // Request ID + request logging (before security/route middleware)
  app.use((req, res, next) => {
    const requestId = crypto.randomUUID();
    res.setHeader("x-request-id", requestId);
    (req as any).requestId = requestId;
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
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'", config.env?.AXIOM_FRONTEND_URL ?? 'http://localhost:5173'],
      },
    },
  }));
  app.use(cors({
    origin: config.env?.AXIOM_FRONTEND_URL ?? "http://localhost:5173",
    methods: ["GET", "POST"],
  }));
  // Optional API key auth — skip if AXIOM_API_KEY is not set (local dev)
  app.use(createApiKeyAuth(config.env?.AXIOM_API_KEY));
  app.use(rateLimit({
    windowMs: 60_000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  }));
  // BigInt-safe JSON replacer for res.json(). Required because TickResult.onchain
  // .vaultBalance and StrategySpec.agentTokenId are bigint; without it res.json()
  // throws "TypeError: Do not know how to serialize a BigInt".
  // Source: https://expressjs.com/en/4x/api.html#app.set
  app.set("json replacer", bigintReplacer);

  const ogChainId = config.env?.AXIOM_CHAIN_ID ?? GALILEO_CHAIN_ID; // EIP-155 chain id; 16602 = Galileo testnet per https://docs.0g.ai/ai-context
  const _storage = new ZeroGStorage({
    indexerRpc: config.storageRpc ?? pickOGNetwork(ogChainId)?.storageRpc ?? "https://indexer-storage-testnet-turbo.0g.ai",
    evmRpc: config.evmRpc,
    signer: config.signer,
  });
  const oracle = new DefaultSignerOracleClient({ baseUrl: config.oracleBaseUrl });
  // EIP-712 domain for AccessProof recovery: the on-chain AxiomTeeVerifier
  // computes its domain separator from block.chainid + address(this), so the
  // backend MUST recover over the same digest. Falls back to the configured
  // Galileo testnet verifier when addresses.verifier is absent (dev/test).
  const eip712Domain: Eip712Domain = {
    chainId: BigInt(ogChainId),
    verifyingContract: config.addresses?.verifier ?? DEFAULT_EIP712_DOMAIN.verifyingContract,
  };
  let orchestratorHandle: OrchestratorHandle = createOrchestratorHandle();
  try {
    const runner = new StrategyRunner({
      evmRpc: config.evmRpc,
      signer: config.signer,
      oracleBaseUrl: config.oracleBaseUrl,
      chainId: ogChainId,
      addresses: config.addresses,
    });
    orchestratorHandle = { state: "ready", runner };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[server] StrategyRunner init failed (compute degraded): ${message}`);
    orchestratorHandle = { state: "errored", error: err instanceof Error ? err : new Error(String(err)) };
  }
  const provider = new ethers.JsonRpcProvider(config.evmRpc);
  // PaymentProcessor client: lazily resolved once we know both the processor
  // address and the on-chain payment token (read from the contract itself so
  // a token rotation via setPaymentToken needs no backend redeploy).
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

  const wsClients = new Set<ConnectedClient>();

  // Heartbeat every 30 seconds — terminate clients that miss 3 pings
  const HEARTBEAT_INTERVAL = 30_000;
  const MAX_MISSED_PINGS = 3;
  const heartbeatTimer = setInterval(() => {
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


  const MAX_WS_CLIENTS = 1000;

  function broadcast(topic: string, payload: unknown): void {
    const msg = stringifyBigIntSafe({ topic, payload: bigIntSafe(payload), ts: Date.now() });
    for (const c of wsClients) {
      if (c.socket.readyState !== c.socket.OPEN) continue;
      // Skip if client's buffer is backed up (>64KB)
      if (c.socket.bufferedAmount > 65536) continue;
      try {
        c.socket.send(msg);
      } catch {
        wsClients.delete(c);
      }
    }
  }

  app.use(createHealthRouter(provider, oracle, config.signer.address, config.addresses));

  app.get("/v1/compute/providers", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const routerBaseUrl = getComputeBaseUrl();
      const resp = await fetch(`${routerBaseUrl}/models`);
      const raw = await resp.json();
      const models = z.object({ data: z.array(z.record(z.string(), z.unknown())) }).parse(raw);
      // The router's /v1/models returns an OpenAI-style model list
      // ({ id, object, created, owned_by, ...}) but the frontend expects
      // { address, model, endpoint } per useProviders.ts.  Transform here.
      const services = models.data.map((m: Record<string, unknown>) => {
        const id = String(m.id ?? "");
        // Deterministic hex address derived from the model id
        const addrBytes = ethers.toUtf8Bytes(id).slice(0, 20);
        const padded = ethers.zeroPadValue(addrBytes, 20);
        const address = `0x${padded.slice(2)}` as `0x${string}`;
        return { address, model: id, endpoint: routerBaseUrl };
      });
      res.json({ services });
    } catch (err) {
      next(err);
    }
  });

  // ─── Compute — Direct Chat Completions ──────────────────────────────

  /** Chat completions proxy to 0G Compute Router. */
  app.post("/v1/compute/chat/completions", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { model, messages, max_tokens, temperature, stream: _stream } = chatCompletionsSchema.parse(req.body);

      let client: OpenAI;
      try {
        const { createComputeClient } = await import("./compute/router.js");
        client = createComputeClient();
      } catch (keyErr) {
        res.status(401).json({
          error: "No compute credentials configured",
          detail: (keyErr instanceof Error ? keyErr.message : String(keyErr)),
          help: "Set AXIOM_COMPUTE_API_KEY (sk-*, Router) or AXIOM_COMPUTE_DIRECT_KEY (app-sk-*, Direct) in .env",
        });
        return;
      }

      const completion = await client.chat.completions.create({
        model,
        messages,
        max_tokens: max_tokens ?? 512,
        temperature: temperature ?? 0.7,
        stream: false, // explicit until streaming is supported
      });

      res.json({
        id: completion.id,
        object: "chat.completion",
        created: completion.created,
        model: completion.model,
        choices: completion.choices?.map((c) => ({
          index: c.index,
          message: { role: c.message.role, content: c.message.content ?? "" },
          finish_reason: c.finish_reason,
        })) ?? [],
        usage: completion.usage
          ? {
              prompt_tokens: completion.usage.prompt_tokens,
              completion_tokens: completion.usage.completion_tokens,
              total_tokens: completion.usage.total_tokens,
            }
          : undefined,
      });
    } catch (err) {
      // Distinguish upstream errors from internal errors
      const status = (err as { status?: number }).status ?? 502;
      const message = err instanceof Error ? err.message : String(err);
      if (status >= 400 && status < 500) {
        res.status(status).json({ error: message });
      } else {
        next(err); // defer to global error handler for 5xx
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
      // Register the dataHash with the oracle's seen-set (Wave 6 A binding)
      // so the subsequent /v1/agents/:id/transfer call doesn't 400.
      try {
        await fetch(`${config.oracleBaseUrl}/v1/agents/mint`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataHash: encryptedStrategyUri }),
          signal: AbortSignal.timeout(2000),
        });
      } catch (err) {
        console.warn("[mint] oracle registration failed (non-fatal):", err instanceof Error ? err.message : String(err));
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
      if (!id) return;
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
        dataHash = ("0x" + id.padStart(64, "0").slice(-64)) as `0x${string}`;
        console.warn("[transfer] using synthetic dataHash for token", id, ":", dataHash);
      }
      // The on-chain verifier expects a 64-byte raw uncompressed public key.
      let pk = receiverPubKey64;
      if (pk.length === 130 && pk.startsWith("0x04")) {
        pk = ("0x" + pk.slice(4)) as `0x${string}`;
      } else if (ethers.getBytes(pk).length === 65) {
        pk = ethers.hexlify(ethers.getBytes(pk).slice(1)) as `0x${string}`;
      }

      // Challenge stage: no signed AccessProof yet — return a challenge so the
      // receiver wallet can sign the AccessProof digest. When the client
      // supplies re-key inputs (oldDataEncryptionKey + oldDataUri), trigger the
      // full re-key via oracle /v1/transfer-validity: the oracle downloads the
      // old ciphertext, decrypts, generates a fresh AES-256 key, re-encrypts,
      // uploads the new blob, ECIES-seals the new key for the receiver, and
      // signs the OwnershipProof. Otherwise fall back to sign-only
      // /v1/ownership (backward compat — sealedKey from request or zero pad).
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
        const sealedKey: `0x${string}` = (sealedKeyIn && sealedKeyIn.length >= 2 ? sealedKeyIn : ("0x" + "00".repeat(32))) as `0x${string}`;
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

      // Finalize: the frontend posted a signed AccessProof. Recover the
      // access signer via EIP-191, sign the matching OwnershipProof, and
      // return the full on-chain TransferValidityProof structs.
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
      // The sealedKey the client passes back is the re-keyed one (from the
      // challenge stage's transferValidity response) when re-keying occurred,
      // or the original caller-supplied / zero-pad value in the sign-only path.
      const finalSealedKey: `0x${string}` = (sealedKeyIn && sealedKeyIn.length >= 2 ? sealedKeyIn : ("0x" + "00".repeat(32))) as `0x${string}`;
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

  app.post("/v1/vaults/:id/deposit", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getIdParam(req, res);
      if (!id) return;
      const vaultAddr = config.addresses?.vault;
      if (!vaultAddr) {
        res.status(500).json({ error: "Vault address not configured" });
        return;
      }
      const { valueWei, depositor } = depositSchema.parse(req.body);
      const vaultTc = new TypedContract<StrategyVaultMethods>(vaultAddr, VAULT_ABI, config.signer);
      const tx = await vaultTc.contract.deposit(BigInt(id), { value: BigInt(valueWei) });
      const receipt = await tx.wait();
      res.json({ ok: true, tokenId: id, depositor, valueWei, txHash: receipt?.hash ?? tx.hash });
      broadcast("vault.deposit", { tokenId: id, depositor, valueWei });
    } catch (err) {
      next(err);
    }
  });

  app.post("/v1/vaults/:id/strategy", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getIdParam(req, res);
      if (!id) return;
      const vaultAddr = config.addresses?.vault;
      if (!vaultAddr) {
        res.status(500).json({ error: "Vault address not configured" });
        return;
      }
      const { merkleRoot, dailyLimitWei } = strategySchema.parse(req.body);
      const vaultTc = new TypedContract<StrategyVaultMethods>(vaultAddr, VAULT_ABI, config.signer);
      const tx = await vaultTc.contract.setStrategy(BigInt(id), merkleRoot, BigInt(dailyLimitWei));
      const receipt = await tx.wait();
      res.json({ ok: true, tokenId: id, merkleRoot, dailyLimitWei, txHash: receipt?.hash ?? tx.hash });
      broadcast("vault.strategy", { tokenId: id, merkleRoot });
    } catch (err) {
      next(err);
    }
  });
  // ─── Payment routes (AxiomPaymentProcessor) ───────────────────
  // The processor pulls an ERC-20 stable from the backend signer (operator).
  // payForAgent / payComputeProvider auto-approve the processor for the exact
  // amount when allowance is insufficient, so these routes are self-contained
  // for operator-driven flows. See apps/backend/src/payment/processor.ts.
  app.post("/v1/agents/:id/pay", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getIdParam(req, res);
      if (!id) return;
      const { amount } = paySchema.parse(req.body);
      const client = await getPayment();
      const { receipt, event } = await client.payForAgent(BigInt(id), BigInt(amount));
      res.status(200).json({
        ok: true,
        tokenId: id,
        amount,
        txHash: receipt.hash,
        payment: event,
      });
      broadcast("agent.pay", { tokenId: id, amount, txHash: receipt.hash });
    } catch (err) {
      next(err);
    }
  });

  app.post("/v1/compute/pay", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { provider, amount } = computePaySchema.parse(req.body);
      const client = await getPayment();
      const { receipt } = await client.payComputeProvider(provider, BigInt(amount));
      res.status(200).json({ ok: true, provider, amount, txHash: receipt.hash });
      broadcast("compute.pay", { provider, amount, txHash: receipt.hash });
    } catch (err) {
      next(err);
    }
  });

  app.get("/v1/agents/:id/earnings", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getIdParam(req, res);
      if (!id) return;
      const nftAddr = config.addresses?.agentNft;
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
      res.status(200).json({ tokenId: id, creator, earnings });
    } catch (err) {
      next(err);
    }
  });

  app.post("/v1/agents/:id/royalty", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getIdParam(req, res);
      if (!id) return;
      const { bps } = royaltySchema.parse(req.body);
      const client = await getPayment();
      // Return encoded calldata so the NFT owner (frontend user) can submit the
      // tx via wagmi useWriteContract. The backend deployer wallet is neither
      // creator nor owner, so on-chain modifier checks would always revert.
      const txData = await client.encodeSetRoyalty(BigInt(id), bps);
      res.status(200).json({ ok: true, tokenId: id, bps, ...txData });
      // The frontend broadcasts the actual tx; no backend broadcast here.
    } catch (err) {
      next(err);
    }
  });

  app.get("/v1/payment/config", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const client = await getPayment();
      const [paymentToken, feeBps, treasury] = await Promise.all([
        client.paymentToken(),
        client.protocolFeeBps(),
        client.protocolTreasury(),
      ]);
      res.status(200).json({ paymentToken, protocolFeeBps: feeBps, protocolTreasury: treasury });
    } catch (err) {
      next(err);
    }
  });

  // Wave 6: indexer -> backend event ingestion + dashboard history read.
  //   POST /v1/events            accepts { source, chainId, blockNumber,
  //                                txHash, logIndex, eventName, payload }
  //                                and stores it in an in-memory ring.
  //   GET  /v1/agents/:id/history  &  GET  /v1/agents/:id/events
  //                                both filter the ring by tokenId and
  //                                return the matching events for the
  //                                dashboard (aliases of the same query).
  // Body / response shape: see apps/backend/src/events/store.ts and
  // apps/indexer/src/sink.ts#HttpEventBody (keep in sync).
  // Refs: https://expressjs.com/en/4x/api.html#req.body
  //       https://expressjs.com/en/4x/api.html#res.json
  const events = getEventStore();

  app.get("/v1/agents/:id/history", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getIdParam(req, res);
      if (!id) return;
      const eventName = typeof req.query["eventName"] === "string" ? req.query["eventName"] : undefined;
      const source = typeof req.query["source"] === "string" ? req.query["source"] : undefined;
      const limitRaw = typeof req.query["limit"] === "string" ? Number(req.query["limit"]) : undefined;
      const limit = limitRaw !== undefined && Number.isInteger(limitRaw) && limitRaw > 0 ? limitRaw : undefined;
      const matches = events.queryByAgent({ tokenId: id, eventName, source, limit });
      res.status(200).json({ tokenId: id, events: matches });
    } catch (err) {
      next(err);
    }
  });
  app.post("/v1/events", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const b = eventBodySchema.parse(req.body);
      const stored = events.append({
        source: b.source,
        eventName: b.eventName,
        chainId: b.chainId,
        blockNumber: b.blockNumber,
        txHash: b.txHash,
        logIndex: b.logIndex,
        payload: b.payload,
        receivedAt: Date.now(),
      });
      res.status(200).json({ ok: true, stored });
    } catch (err) {
      next(err);
    }
  });

  app.get("/v1/events", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limitRaw = typeof req.query["limit"] === "string" ? Number(req.query["limit"]) : undefined;
      const limit = limitRaw !== undefined && Number.isInteger(limitRaw) && limitRaw > 0 ? limitRaw : 1000;
      const all = events.getAll(limit);
      const eventName = req.query.eventName as string | undefined;
      const filtered = eventName
        ? all.filter((e: any) => e.eventName === eventName)
        : all;
      const owner = req.query.owner as string | undefined;
      const ownerFiltered = owner
        ? filtered.filter((e: any) => {
            const payload = typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload;
            return payload?.owner === owner || payload?.to === owner || payload?.from === owner;
          })
        : filtered;
      res.status(200).json({ events: ownerFiltered });
    } catch (err) {
      next(err);
    }
  });

  app.get("/v1/agents/:id/events", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = getIdParam(req, res);
      if (!id) return;
      const eventName = typeof req.query["eventName"] === "string" ? req.query["eventName"] : undefined;
      const source = typeof req.query["source"] === "string" ? req.query["source"] : undefined;
      const limitRaw = typeof req.query["limit"] === "string" ? Number(req.query["limit"]) : undefined;
      const limit = limitRaw !== undefined && Number.isInteger(limitRaw) && limitRaw > 0 ? limitRaw : undefined;
      const matches = events.queryByAgent({ tokenId: id, eventName, source, limit });
      res.status(200).json({ tokenId: id, events: matches });
    } catch (err) {
      next(err);
    }
  });

  app.post("/v1/orchestrator/tick", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        vault,
        agentNft,
        agentTokenId,
        computeModel: reqComputeModel,
        strategy: strategyHint,
        signalSource,
        signalPayload,
      } = tickSchema.parse(req.body ?? {});
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
      const runner = getRunnerOrThrow(orchestratorHandle);
      const result: TickResult = await runner.runTick(spec, signal);
      res.status(200).json(result);
      broadcast("orchestrator.tick", {
        agentTokenId: spec.agentTokenId.toString(),
        recommendation: result.recommendation,
      });
    } catch (err) {
      next(err);
    }
  });

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
      if (wsClients.size >= MAX_WS_CLIENTS) {
        ws.close(1013, "Too many connections");
        socket.destroy();
        return;
      }
      const topics = new Set(url.searchParams.getAll("topic").slice(0, 20));
      const client: ConnectedClient = { socket: ws as WebSocket, topics };
      (ws as any).missedPings = 0;
      wsClients.add(client);
      ws.on("pong", () => { (ws as any).missedPings = 0; });
      ws.send(JSON.stringify({ topic: "hello", payload: { topics: Array.from(topics) }, ts: Date.now() }));
      ws.on("close", () => wsClients.delete(client));
      ws.on("error", () => wsClients.delete(client));
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
