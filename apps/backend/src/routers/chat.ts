import type { Express, Request, Response } from "express";
import type { z } from "zod";
import { ethers } from "ethers";
import type { ServerConfig } from "../config-types.js";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { ARISTOTLE_CHAIN_ID } from "@axiom/config/networks";
import { HTTP } from "@axiom/config/constants";
import { resolveChatModel } from "@axiom/config/chat-tools";
import type { StorageAdapter } from "@axiom/config/storage/0g";
import { getEventStore, payloadField } from "../events/store.js";
import { chatBodySchema, chatHistoryQuerySchema } from "../route-schemas.js";
import { createRouterClient } from "../providers.js";
import { sendError, trimErrorMessage } from "../utils/response.js";
import { createLogger } from "../utils/logger.js";
import { createRoute } from "./route-factory.js";
import { routeMeta } from "./shared.js";
import { downloadBlobCached } from "../oracle/routes.js";

const log = createLogger("server");

// Resolve the trace payload for the typed SSE frame. The router relays usage + x_0g_trace inside a
// terminal SSE chunk (choices: []) right before [DONE] — there is no x_0g_trace response header.
// Prefer the terminal chunk; fall back to the legacy header for upstreams that never send one.
function resolveTracePayload(
  terminalChunk: unknown,
  response: { headers?: unknown } | undefined,
): Record<string, unknown> | null {
  const headers = response?.headers as
    { get?(name: string): string | null } | Record<string, string> | undefined;
  const headerValue = (name: string): string | null | undefined =>
    typeof headers?.get === "function"
      ? headers.get(name)
      : (headers as Record<string, string> | undefined)?.[name];
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
// An empty provider object is treated as absent: the cache-friendly defaults apply, so
// the prompt-cache prefix stays on one provider. Why the defaults: the router round-robins
// providers when no routing header is sent (verified cache-hostile — 'Cache hit 0%');
// latency-sort makes the router stick to a single provider for every client (UI and API
// alike). No address is hardcoded — sort:latency follows the live catalog. allowFallbacks
// only engages if that provider is unavailable. A non-empty provider object suppresses the
// defaults: only the fields it names become headers.
const CACHE_FRIENDLY_DEFAULT_ROUTING: NonNullable<
  z.infer<typeof chatBodySchema>["provider"]
> = {
  sort: "latency",
  allowFallbacks: true,
};

function buildProviderRoutingHeaders(
  provider: z.infer<typeof chatBodySchema>["provider"],
): Record<string, string> {
  const hasExplicitFields =
    provider !== undefined && Object.keys(provider).length > 0;
  const p = hasExplicitFields ? provider : CACHE_FRIENDLY_DEFAULT_ROUTING;
  const h: Record<string, string> = {};
  if (p.sort) h["X-0G-Provider-Sort"] = p.sort;
  if (p.address) h["X-0G-Provider-Address"] = p.address;
  if (p.allowFallbacks !== undefined)
    h["X-0G-Provider-Allow-Fallbacks"] = String(p.allowFallbacks);
  if (p.trustMode) h["X-0G-Provider-Trust-Mode"] = p.trustMode;
  const maxPrompt = p.maxPriceUsdPrompt;
  const maxCompletion = p.maxPriceUsdCompletion;
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
  return h;
}

const EMPTY_RESPONSE_FALLBACK =
  "⚠ 0G Compute returned an empty response. Try again or check model availability.";

// Narrow an SSE chunk's `choices[0].delta.content` without trusting an unchecked shape.
function sseDeltaContent(chunk: unknown): string {
  const choices = (chunk as { choices?: unknown } | null)?.choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const content = (choices[0] as { delta?: { content?: unknown } } | null)
    ?.delta?.content;
  return typeof content === "string" ? content : "";
}

// After-effect for a completed chat turn: upload the transcript to 0G and record the pointer in the
// EventStore (`chat::transcript` bucket). Fail-soft by contract — persistence must never break the
// chat response or the request handler.
//
// Wallet-keyed sessions: when a wallet address is supplied, the threadId is the (lowercased) wallet
// so every turn of the same wallet shares one stable thread; without a wallet a random UUID is used.
//
// Transport-AES note: ZeroGStorage encrypts blobs with an AES transport key that is load-or-created
// server-side (AXIOM_DATA_DIR/.data — see storage/0g.ts) and never leaves the server. The EventStore
// payload carries only the rootHash pointer; a restart decrypts with the same persisted key.
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
      },
    });
  } catch (err) {
    // Non-Error SDK failures serialize as {} — surface code+message or the log is useless.
    const e = err as { code?: string; message?: string };
    log.error("chat transcript persistence failed", {
      err: `${e?.code ? `${e.code}: ` : ""}${e?.message ?? String(err)}`,
    });
  }
}

// SIWE-lite ownership proof for GET /v1/chat/history: EIP-191 personal_sign over the exact ASCII
// message `axiom-chat-history-v1:${address.toLowerCase()}:${timestamp}` (unix seconds), presented
// via x-wallet-address / x-wallet-timestamp / x-wallet-signature. The recovered signer must equal
// the queried wallet and the timestamp must be within 300s of now (replay window).
const WALLET_PROOF_MAX_AGE_SECONDS = 300;

function verifyWalletProof(req: Request, wallet: string): boolean {
  const address = String(req.headers["x-wallet-address"] ?? "").toLowerCase();
  const timestamp = Number(req.headers["x-wallet-timestamp"]);
  const signature = String(req.headers["x-wallet-signature"] ?? "");
  if (!address || !signature || !Number.isFinite(timestamp)) return false;
  if (address !== wallet.toLowerCase()) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > WALLET_PROOF_MAX_AGE_SECONDS) return false;
  try {
    const recovered = ethers.verifyMessage(
      `axiom-chat-history-v1:${address}:${timestamp}`,
      signature,
    );
    return recovered.toLowerCase() === address;
  } catch {
    return false;
  }
}

export function registerChatRoutes(
  app: Express,
  config: ServerConfig,
  ogChainId: number,
): void {
  createRoute(
    app,
    routeMeta(
      "/v1/chat/completions",
      "chat-runtime",
      "Stream chat completions",
      {
        schema: chatBodySchema,
      },
    ),
    async (
      parsed: z.infer<typeof chatBodySchema>,
      req: Request,
      res: Response,
    ) => {
      try {
        const { messages, tools, model: reqModel, wallet, provider } = parsed;
        const DEFAULT_MODEL = resolveChatModel(
          config.env?.AXIOM_COMPUTE_MODEL,
          ogChainId,
        );
        const resolvedModel = reqModel ?? DEFAULT_MODEL;
        const providerHeaders = buildProviderRoutingHeaders(provider);
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
              headers: providerHeaders,
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
            const c = chunk as {
              choices?: unknown;
              usage?: unknown;
              x_0g_trace?: unknown;
            };
            if (
              Array.isArray(c.choices) &&
              c.choices.length === 0 &&
              (c.usage !== undefined || c.x_0g_trace !== undefined)
            )
              terminalChunk = chunk;
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
          // Void (S-5): persistChatTranscript never rejects — its body is fully try/caught —
          // so releasing the socket slot immediately is safe.
          void persistChatTranscript(
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
        const jsonFail = (
          failStatus: number,
          error: string,
          failCode?: string,
        ): void => {
          res
            .status(failStatus)
            .json(failCode ? { error, code: failCode } : { error });
        };
        if (
          status === 402 ||
          code === "insufficient_balance" ||
          /insufficient balance/i.test(String(msg))
        ) {
          jsonFail(
            402,
            "Compute account has no balance. Fund the 0G Compute provider account linked to AXIOM_COMPUTE_API_KEY, then retry.",
            "insufficient_balance",
          );
          return;
        }
        if (status === 401 || status === 403) {
          jsonFail(
            502,
            "Compute auth failed. Check AXIOM_COMPUTE_API_KEY.",
            "compute_auth",
          );
          return;
        }
        if (status === 429 || /rate limit/i.test(String(msg))) {
          jsonFail(
            429,
            "Compute provider is rate-limiting requests. Retry in a moment.",
            "rate_limit_exceeded",
          );
          return;
        }
        jsonFail(
          502,
          msg
            ? `Compute upstream: ${trimErrorMessage(e)}`
            : "compute upstream error",
        );
      }
    },
    config,
  );

  // Wallet-keyed history: every transcript persisted for this wallet (stable threadId =
  // lowercased wallet) is downloaded and returned newest-first. Fail-soft per transcript —
  // one unreadable blob must not break the whole history. Read requires a SIWE-lite
  // ownership proof (headers) proving the caller controls the queried wallet's key.
  createRoute(
    app,
    routeMeta(
      "/v1/chat/history",
      "chat-runtime",
      "Fetch persisted chat transcripts for a wallet",
      { method: "get", schema: chatHistoryQuerySchema },
    ),
    async (
      parsed: z.infer<typeof chatHistoryQuerySchema>,
      req: Request,
      res: Response,
      { config: cfg },
    ) => {
      const wallet = parsed.wallet.toLowerCase();
      if (!verifyWalletProof(req, wallet))
        return sendError(
          res,
          HTTP.UNAUTHORIZED,
          "wallet ownership proof missing, expired, or invalid",
          "WALLET_PROOF_INVALID",
        );
      const events = getEventStore().getAll(100, undefined, "transcript");
      const jobs = events.flatMap((evt) => {
        const rootHash = evt.txHash;
        if (
          payloadField(evt.payload, "wallet") !== wallet ||
          !rootHash ||
          !cfg.chatStorage
        )
          return [];
        return [{ rootHash }];
      });
      type DownloadSlot = { ok: true; value: unknown } | { ok: false };
      const slots = new Array<DownloadSlot>(jobs.length);
      let nextJob = 0;
      const worker = async (): Promise<void> => {
        while (nextJob < jobs.length) {
          const i = nextJob++;
          const { rootHash } = jobs[i]!;
          try {
            // Transcript blobs are rootHash-addressed and immutable — the
            // oracle's LRU (same storage instance, see server.ts) keeps
            // repeat /v1/chat/history restores from re-hitting 0G storage.
            const blob = await downloadBlobCached(cfg.chatStorage!, rootHash);
            slots[i] = {
              ok: true,
              value: JSON.parse(new TextDecoder().decode(blob)),
            };
          } catch (err) {
            slots[i] = { ok: false };
            log.warn("chat transcript download failed", {
              rootHash,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(6, jobs.length) }, () => worker()),
      );
      const transcripts = slots
        .filter((s): s is { ok: true; value: unknown } => s.ok)
        .map((s) => s.value);
      transcripts.reverse(); // newest turn first
      res.json({ wallet, count: transcripts.length, transcripts });
    },
    config,
  );
}
