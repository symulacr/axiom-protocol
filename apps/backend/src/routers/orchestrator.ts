import type { Express, Request, Response, NextFunction } from "express";
import { tickSchema } from "../route-schemas.js";
import { getClients, sendToTopic } from "../ws/broadcaster.js";
import { sendError, extractErrorMessage } from "../utils/response.js";
import { getEventStore } from "../events/store.js";
import type {
  StrategyRunner,
  StrategySpec,
  MarketSignal,
} from "../orchestrator/index.js";
import type { TickResult } from "@axiom/config/types/orchestrator";
import type { EventStore } from "../events/store.js";
import type { ServerConfig } from "../server.js";
import { REGISTERED_ROUTES } from "./route-factory.js";
import { AGENT_NFT_ABI } from "@axiom/config/abis";
import { TypedContract } from "@axiom/config/types/contract";
import { getSharedProvider } from "../provider.js";
import { keccak256, solidityPacked } from "ethers";
import { ZERO_DATA_ROOT } from "../utils/constants.js";

async function resolveModelDataRoot(
  agentNft: `0x${string}`,
  agentTokenId: string,
  chainId: number,
): Promise<`0x${string}`> {
  try {
    const provider = getSharedProvider(chainId);
    const nftTc = new TypedContract<{ intelligentDatasOf(tokenId: bigint): Promise<Array<{ dataHash: string }>> }>(
      agentNft,
      AGENT_NFT_ABI,
      provider,
    );
    const datas = await nftTc.contract.intelligentDatasOf(BigInt(agentTokenId));
    const hash = datas?.[0]?.dataHash;
    if (typeof hash === "string" && hash.startsWith("0x") && hash.length === 66) {
      return hash as `0x${string}`;
    }
  } catch {
    // Fall back to zero root when chain metadata is unavailable.
  }
  return ZERO_DATA_ROOT;
}

function appendTickEvent(
  events: EventStore,
  chainId: number,
  spec: StrategySpec,
  result: TickResult,
): void {
  // Synthetic ticks share no on-chain tx; use a unique dedupe key per append
  // (store dedupes on chainId:txHash:logIndex — a fixed zero hash collapsed all ticks).
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

  REGISTERED_ROUTES.push({
    method: "POST",
    path: "/v1/orchestrator/tick",
    consumer: "useOrchestratorTick",
    description: "AI orchestrator tick (strategy recommendation)",
  });

  app.post(
    "/v1/orchestrator/tick",
    async (req: Request, res: Response, next: NextFunction) => {
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
        const DEFAULT_MODEL =
          config.env?.AXIOM_COMPUTE_MODEL ?? "qwen/qwen2.5-omni-7b";
        const modelDataRoot = await resolveModelDataRoot(
          agentNft,
          agentTokenId,
          chainId,
        );
        const spec: StrategySpec = {
          agentTokenId: BigInt(agentTokenId),
          agentNft,
          vault,
          computeModel: reqComputeModel ?? DEFAULT_MODEL,
          systemPrompt:
            "You are a crypto-native strategy assistant. Given the current vault balance and recent events, respond with a JSON object { action: 'buy' | 'sell' | 'hold', amount?: number, reason: string }.",
          modelDataRoot,
          modelEncryption: undefined,
        };
        const signal: MarketSignal = {
          source: signalSource ?? "manual:user",
          payload: signalPayload ?? { strategyHint: strategyHint ?? "hold" },
          emittedAt: Date.now(),
        };
        const runner = getOrCreateOrchestrator();
        if (!runner) {
          sendError(res, 503, "Orchestrator not available");
          return;
        }

        if (shouldStream) {
          const topic = `tick.${agentTokenId}`;
          let hasSubscribers = false;
          for (const c of getClients()) {
            if (c.topics.has(topic) || c.topics.has("*")) {
              hasSubscribers = true;
              break;
            }
          }
          if (!hasSubscribers) {
            res.status(400).json({
              error: "No WebSocket subscriber for streaming",
              code: "NO_WS_SUBSCRIBER",
            });
            return;
          }

          runner
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
            });
          res
            .status(202)
            .json({ ok: true, streamTopic: `tick.${agentTokenId}` });
          return;
        }

        const orchestratorResult = await runner.runTick(spec, signal);
        appendTickEvent(events, chainId, spec, orchestratorResult);
        sendToTopic("orchestrator.tick", {
          agentTokenId: spec.agentTokenId.toString(),
          recommendation: orchestratorResult.recommendation,
        });
        res.status(200).json(orchestratorResult);
      } catch (err) {
        next(err);
      }
    },
  );
}
