import type { z } from "zod";
import type { Express, Request, Response } from "express";
import { tickSchema } from "../route-schemas.js";
import { getClients, sendToTopic } from "../ws/broadcaster.js";
import { sendError, extractErrorMessage, TTLCache } from "../utils/response.js";
import { getEventStore } from "../events/store.js";
import type {
  StrategyRunner,
  StrategySpec,
  MarketSignal,
} from "../orchestrator/index.js";
import type { TickResult } from "@axiom/config/types/orchestrator";
import type { EventStore } from "../events/store.js";
import type { ServerConfig } from "../config-types.js";
import { createRoute } from "./route-factory.js";
import { readAgentDataHash } from "../skills/shared.js";
import { AGENT_NFT_ABI } from "@axiom/config/abis";
import { HTTP } from "@axiom/config/constants";
import { resolveChatModel } from "@axiom/config/chat-tools";
import { TypedContract } from "@axiom/config/types/contract";
import { getSharedProvider } from "../providers.js";
import { keccak256, solidityPacked } from "ethers";
import { ZERO_DATA_ROOT } from "@axiom/config/constants";
import { createLogger } from "../utils/logger.js";

const log = createLogger("orchestrator-router");

const modelDataRootCache = new TTLCache<`0x${string}`>(5 * 60 * 1000, 1000);

/** Per-token in-flight tick registry — enforces one concurrent tick per tokenId. */
const inFlightTicks = new Set<string>();

/** @internal One tick at a time per tokenId; false = tick already running. */
export function tryAcquireTickSlot(agentTokenId: string): boolean {
  const key = String(agentTokenId);
  if (inFlightTicks.has(key)) return false;
  inFlightTicks.add(key);
  return true;
}

/** @internal Release the token's tick slot when its run settles. */
export function releaseTickSlot(agentTokenId: string): void {
  inFlightTicks.delete(String(agentTokenId));
}

// These sources make the orchestrator fabricate a hold tick without touching
// compute inference (test-harness affordance). Reachable only when the
// operator set AXIOM_ALLOW_E2E_MOCK_TICKS=1 AND the caller holds the server key.
const E2E_SKIP_SOURCES: ReadonlySet<string> = new Set([
  "manual:e2e",
  "manual:e2e-mock",
  "manual:e2e-availability",
]);

export function isE2eMockTickAllowed(
  signalSource: string | undefined,
  principal: string | undefined,
  allowFlag: string | undefined,
): boolean {
  if (!signalSource || !E2E_SKIP_SOURCES.has(signalSource)) return true;
  return allowFlag === "1" && principal === "server";
}

async function resolveModelDataRoot(
  agentNft: `0x${string}`,
  agentTokenId: string,
  chainId: number,
): Promise<`0x${string}`> {
  const cacheKey = `${agentNft}:${agentTokenId}`;
  const cached = modelDataRootCache.get(cacheKey);
  if (cached) return cached;
  try {
    const provider = getSharedProvider(chainId);
    const nftTc = new TypedContract<{
      intelligentDatasOf(tokenId: bigint): Promise<Array<{ dataHash: string }>>;
    }>(agentNft, AGENT_NFT_ABI, provider);
    const hash = await readAgentDataHash(nftTc.contract, BigInt(agentTokenId));
    if (
      typeof hash === "string" &&
      hash.startsWith("0x") &&
      hash.length === 66
    ) {
      const root = hash as `0x${string}`;
      modelDataRootCache.set(cacheKey, root);
      return root;
    }
  } catch {
    /* ignore */
  }
  return ZERO_DATA_ROOT;
}

function appendTickEvent(
  events: EventStore,
  chainId: number,
  spec: StrategySpec,
  result: TickResult,
): void {
  const tickTxHash = keccak256(
    solidityPacked(
      ["uint256", "uint64", "string"],
      [spec.agentTokenId, BigInt(Date.now()), result.recommendation.action],
    ),
  ) as `0x${string}`;
  events.append({
    source: "orchestrator",
    eventName: "Tick",
    chainId,
    blockNumber: 0,
    txHash: tickTxHash,
    logIndex: 0,
    payload: {
      tokenId: spec.agentTokenId.toString(),
      action: result.recommendation.action,
      amount: result.recommendation.amount ?? null,
      confidence: result.recommendation.confidence ?? null,
      reason: result.recommendation.reason,
      durationMs: result.durationMs,
      executionSuccess: result.execution?.success ?? null,
      vaultBalance: result.onchain.vaultBalance.toString(),
    },
  });
}

export function registerOrchestratorRoutes(
  app: Express,
  config: ServerConfig,
  getOrCreateOrchestrator: () => StrategyRunner | null,
  chainId: number,
): void {
  const events = getEventStore();

  createRoute(
    app,
    {
      path: "/v1/orchestrator/tick",
      method: "post",
      schema: tickSchema,
      consumer: "useOrchestratorTick",
      description: "AI orchestrator tick (strategy recommendation)",
    },
    async (parsed: z.infer<typeof tickSchema>, req: Request, res: Response) => {
      const {
        vault,
        agentNft,
        agentTokenId,
        computeModel: reqComputeModel,
        strategy: strategyHint,
        signalSource,
        signalPayload,
        stream: shouldStream,
        executionPlan,
        systemPrompt,
      } = parsed;
      const DEFAULT_MODEL = resolveChatModel(
        config.env?.AXIOM_COMPUTE_MODEL,
        chainId,
      );
      const modelDataRoot = await resolveModelDataRoot(
        agentNft,
        agentTokenId,
        chainId,
      );
      // Client keys may tick but must not supply Merkle execute plans (server-signed vault settlement).
      const principal = (req as { authPrincipal?: string }).authPrincipal;
      if (executionPlan && principal === "client")
        return sendError(
          res,
          HTTP.FORBIDDEN,
          "executionPlan requires server API key",
          "SERVER_KEY_REQUIRED",
        );
      // Inference-skip sources are a test-harness affordance — never reachable
      // in a deployment that did not opt in via env.
      if (
        !isE2eMockTickAllowed(
          signalSource,
          principal,
          config.env?.AXIOM_ALLOW_E2E_MOCK_TICKS,
        )
      )
        return sendError(
          res,
          HTTP.FORBIDDEN,
          "e2e mock tick sources require AXIOM_ALLOW_E2E_MOCK_TICKS=1 and the server API key",
          "E2E_MOCK_TICKS_DISABLED",
        );
      const spec: StrategySpec = {
        agentTokenId: BigInt(agentTokenId),
        agentNft,
        vault,
        computeModel: reqComputeModel ?? DEFAULT_MODEL,
        systemPrompt:
          systemPrompt ??
          "You are a crypto-native strategy assistant. Given the current vault balance and recent events, respond with a JSON object { action: 'act' | 'hold', amount?: number, reason: string }.",
        modelDataRoot,
        executionPlan: executionPlan
          ? {
              target: executionPlan.target as `0x${string}`,
              value: executionPlan.value,
              data: executionPlan.data as `0x${string}` | undefined,
              merkleProof: executionPlan.merkleProof as `0x${string}`[],
            }
          : undefined,
      };
      const signal: MarketSignal = {
        source: signalSource ?? "manual:user",
        payload: signalPayload ?? { strategyHint: strategyHint ?? "hold" },
        emittedAt: Date.now(),
      };
      const runner = getOrCreateOrchestrator();
      if (!runner)
        return sendError(
          res,
          HTTP.SERVICE_UNAVAILABLE,
          "Orchestrator not available",
        );

      // One in-flight tick per token: concurrent runs would race the tx nonce
      // (double-spend / replacement) and interleave tick events. Different
      // tokenIds stay fully parallel.
      const tickKey = String(spec.agentTokenId);
      if (!tryAcquireTickSlot(tickKey))
        return sendError(
          res,
          HTTP.CONFLICT,
          "tick already in flight for this token",
          "TICK_IN_FLIGHT",
        );

      if (shouldStream) {
        const topic = `tick.${agentTokenId}`;
        const hasSubscribers = [...getClients()].some(
          (c) => c.topics.has(topic) || c.topics.has("*"),
        );
        if (!hasSubscribers) {
          releaseTickSlot(tickKey);
          return void res.status(HTTP.BAD_REQUEST).json({
            error: "No WebSocket subscriber for streaming",
            code: "NO_WS_SUBSCRIBER",
          });
        }

        void runner
          .runTick(spec, signal, (chunk) => {
            if (chunk.type === "token")
              sendToTopic(`tick.${agentTokenId}`, chunk);
          })
          .then((result) => {
            appendTickEvent(events, chainId, spec, result);
            sendToTopic(`tick.${agentTokenId}`, {
              type: "complete",
              ...result,
            });
          })
          .catch((err) => {
            sendToTopic(`tick.${agentTokenId}`, {
              type: "error",
              error: extractErrorMessage(err),
            });
          })
          .finally(() => {
            releaseTickSlot(tickKey);
          });
        res
          .status(HTTP.ACCEPTED)
          .json({ ok: true, streamTopic: `tick.${agentTokenId}` });
        return;
      }

      // R4 optimistic settlement: the recommendation + execution plan are final once
      // inference returns — only the vault receipt wait sits behind them. With an
      // executionPlan we respond at the broadcast boundary (status "pending", real
      // txHash) and finish settlement in the background; completion goes out over the
      // existing paths: EventStore Tick append (broadcasts its eventName to WS) and
      // sendToTopic("tick.<id>") with the settled TickResult. Hold ticks / skipped
      // settlements resolve before the pending hook fires, so the response is the
      // full settled TickResult — byte-compatible with the pre-R4 shape.
      const topic = `tick.${agentTokenId}`;
      let optimisticSettled = false;
      const tickPromise = runner
        .runTick(spec, signal, undefined, (pending, base) => {
          // Broadcast boundary: respond with the settled base + pending execution.
          if (optimisticSettled || res.headersSent) return;
          optimisticSettled = true;
          res.status(HTTP.OK).json({ ...base, execution: pending });
        })
        .then((result) => {
          // No broadcast happened (hold tick / skipped settlement): settle the
          // response with the full TickResult — identical shape to pre-R4.
          if (!optimisticSettled && !res.headersSent) {
            optimisticSettled = true;
            res.status(HTTP.OK).json(result);
          }
          appendTickEvent(events, chainId, spec, result);
          sendToTopic(topic, { type: "complete", ...result });
          return result;
        });
      void tickPromise.catch((err) => {
        if (!res.headersSent) {
          sendError(res, HTTP.INTERNAL, extractErrorMessage(err));
        }
        log.warn("background tick settlement failed", {
          error: extractErrorMessage(err),
          tokenId: spec.agentTokenId.toString(),
        });
        appendTickEvent(events, chainId, spec, {
          recommendation: { action: "hold", reason: "tick failed" },
          rawModelOutput: "",
          onchain: { vaultBalance: 0n, recentEvents: [] },
          storage: { rootHash: ZERO_DATA_ROOT, size: 0 },
          execution: {
            status: "failed",
            success: false,
            result:
              `0x${extractErrorMessage(err).slice(0, 128)}` as `0x${string}`,
          },
          durationMs: 0,
        });
        sendToTopic(topic, {
          type: "error",
          error: extractErrorMessage(err),
        });
      });
      await tickPromise
        .catch(() => {})
        .finally(() => {
          releaseTickSlot(tickKey);
        });
    },
    config,
  );
}
