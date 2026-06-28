import type { Express, Request, Response, NextFunction } from "express";
import { tickSchema } from "../route-schemas.js";
import { broadcast, getClients, sendToTopic } from "../ws/broadcaster.js";
import { getEventStore } from "../events/store.js";
import type { StrategyRunner, StrategySpec, MarketSignal } from "../orchestrator/index.js";
import type { ServerConfig } from "../server.js";

export function registerOrchestratorRoutes(
  app: Express,
  config: ServerConfig,
  getOrCreateOrchestrator: () => StrategyRunner | null,
  chainId: number,
): void {
  const events = getEventStore();

  app.post("/v1/orchestrator/tick", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = tickSchema.parse(req.body ?? {});
      const { vault, agentNft, agentTokenId, computeModel: reqComputeModel, strategy: strategyHint, signalSource, signalPayload, stream: shouldStream } = parsed;
      const DEFAULT_MODEL = config.env?.AXIOM_COMPUTE_MODEL ?? "qwen/qwen2.5-omni-7b";
      const spec: StrategySpec = {
        agentTokenId: BigInt(agentTokenId), agentNft, vault,
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
      const runner = getOrCreateOrchestrator();
      if (!runner) { res.status(503).json({ error: "Orchestrator not available" }); return; }

      if (shouldStream) {
        const topic = `tick.${agentTokenId}`;
        let hasSubscribers = false;
        for (const c of getClients()) {
          if (c.topics.has(topic) || c.topics.has('*')) { hasSubscribers = true; break; }
        }
        if (!hasSubscribers) { res.status(400).json({ error: "No WebSocket subscriber for streaming", code: "NO_WS_SUBSCRIBER" }); return; }

        runner.runTick(spec, signal, (chunk) => {
          if (chunk.type === 'token') sendToTopic(`tick.${agentTokenId}`, chunk);
        }).then(result => {
          sendToTopic(`tick.${agentTokenId}`, { type: 'complete', ...result });
        }).catch(err => {
          sendToTopic(`tick.${agentTokenId}`, { type: 'error', error: err instanceof Error ? err.message : String(err) });
        });
        res.status(202).json({ ok: true, streamTopic: `tick.${agentTokenId}` });
        return;
      }

      const orchestratorResult = await runner.runTick(spec, signal);
      events.append({
        source: "orchestrator", eventName: "Tick", chainId,
        blockNumber: 0, txHash: "0x" + "0".repeat(64), logIndex: 0,
        payload: {
          tokenId: spec.agentTokenId.toString(),
          action: orchestratorResult.recommendation.action,
          amount: orchestratorResult.recommendation.amount ?? null,
          reason: orchestratorResult.recommendation.reason,
          durationMs: orchestratorResult.durationMs,
          executionSuccess: orchestratorResult.execution?.success ?? null,
          vaultBalance: orchestratorResult.onchain.vaultBalance.toString(),
        },
        receivedAt: Date.now(), timestamp: Date.now(),
      });
      broadcast("orchestrator.tick", {
        agentTokenId: spec.agentTokenId.toString(),
        recommendation: orchestratorResult.recommendation,
      });
      res.status(200).json(orchestratorResult);
    } catch (err) {
      next(err);
    }
  });
}
