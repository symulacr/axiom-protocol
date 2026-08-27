import { test } from "bun:test";
import assert from "node:assert/strict";
import express from "express";
import type http from "node:http";
import type { WebSocket } from "ws";
import { registerOrchestratorRoutes } from "./orchestrator.js";
import {
  registerClient,
  unregisterClient,
  type ConnectedClient,
} from "../ws/broadcaster.js";
import { bigintReplacer } from "@axiom/config/constants";
import type {
  StrategyRunner,
  StrategySpec,
  MarketSignal,
} from "../orchestrator/index.js";
import type { TickResult } from "@axiom/config/types/orchestrator";
import type { ServerConfig } from "../config-types.js";

/** Fake WS subscriber (mirrors broadcaster.test.ts fakeClient) that records frames. */
function fakeSubscriber(topics: string[]): {
  client: ConnectedClient;
  frames: Array<Record<string, unknown>>;
} {
  const frames: Array<Record<string, unknown>> = [];
  const socket = {
    readyState: 1, // OPEN
    OPEN: 1,
    bufferedAmount: 0,
    send: (m: string) =>
      void frames.push(JSON.parse(m) as Record<string, unknown>),
    terminate: () => void 0,
  } as unknown as WebSocket;
  return {
    client: { socket, topics: new Set(topics), missedPings: 0 },
    frames,
  };
}

/** Stub runner: resolves with the settled TickResult after invoking the R4
 *  pending hook (mirrors StrategyRunner.settleOnChain's broadcast→wait split).
 *  The deferred gate lets the test hold settlement open and observe the
 *  optimistic response before the settled WS frame lands. */
function makeRunner(
  result: TickResult,
  opts: { gate?: Promise<void>; broadcastDelay?: number } = {},
): StrategyRunner {
  return {
    runTick: (
      _spec: StrategySpec,
      _signal: MarketSignal,
      _onChunk?: unknown,
      onExecutionPending?: (
        pending: NonNullable<TickResult["execution"]>,
        base: Omit<TickResult, "execution">,
      ) => void,
    ): Promise<TickResult> => {
      const settle = async (): Promise<TickResult> => {
        if (result.execution?.status === "executed" && onExecutionPending) {
          const { execution: _e, ...base } = result;
          onExecutionPending(
            {
              status: "pending",
              txHash: result.execution.txHash,
              action: result.execution.action,
              target: result.execution.target,
            },
            base,
          );
        }
        if (opts.gate) await opts.gate;
        return result;
      };
      return opts.broadcastDelay
        ? new Promise<TickResult>((resolve) =>
            setTimeout(() => settle().then(resolve), opts.broadcastDelay),
          )
        : settle();
    },
  } as unknown as StrategyRunner;
}

function makeConfig(): ServerConfig {
  return {
    bind: "0.0.0.0",
    port: 0,
    evmRpc: "http://127.0.0.1:1",
    signer: {} as ServerConfig["signer"],
  } as unknown as ServerConfig;
}

function buildApp(runner: StrategyRunner): http.Server {
  const app = express();
  app.use(express.json());
  // The host app sets this globally (server.ts:191) — BigInt fields in the tick
  // response ride the replacer; mirror it so the harness serializes identically.
  app.set("json replacer", bigintReplacer);
  registerOrchestratorRoutes(app, makeConfig(), () => runner, 16661);
  return app.listen(0, "127.0.0.1");
}

function baseUrl(server: http.Server): string {
  const addr = server.address() as { port: number };
  return `http://127.0.0.1:${addr.port}`;
}

const SETTLED_ACT: TickResult = {
  recommendation: { action: "act", confidence: 0.9, reason: "signal up" },
  rawModelOutput: '{"action":"act"}',
  onchain: { vaultBalance: 1n, recentEvents: [] },
  storage: { rootHash: "0xee", size: 2 },
  execution: {
    status: "executed",
    success: true,
    txHash: "0x" + "ab".repeat(32),
    action: "act",
    target: ("0x" + "00".repeat(19) + "01") as `0x${string}`,
    result: "0x",
  },
  durationMs: 5,
};

const HOLD_RESULT: TickResult = {
  recommendation: { action: "hold", reason: "quiet" },
  rawModelOutput: '{"action":"hold"}',
  onchain: { vaultBalance: 0n, recentEvents: [] },
  storage: { rootHash: "0xee", size: 2 },
  durationMs: 3,
};

test("act tick with executed settlement responds early with execution.status=pending + txHash, then emits the settled complete frame over tick.<id>", async () => {
  let releaseSettlement!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseSettlement = resolve;
  });
  const runner = makeRunner(SETTLED_ACT, { gate });
  const server = buildApp(runner);
  const sub = fakeSubscriber(["tick.7"]);
  const frames = sub.frames;
  registerClient(sub.client);
  try {
    const res = await fetch(`${baseUrl(server)}/v1/orchestrator/tick`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        vault: "0x" + "00".repeat(19) + "02",
        agentNft: "0x" + "00".repeat(19) + "01",
        agentTokenId: "7",
      }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    // Optimistic shape: full recommendation/onchain/storage + pending execution.
    const rec = body.recommendation as Record<string, unknown>;
    assert.equal(rec.action, "act");
    const exec = body.execution as Record<string, unknown>;
    assert.equal(
      exec.status,
      "pending",
      "response marks settlement as pending",
    );
    assert.equal(
      exec.txHash,
      "0x" + "ab".repeat(32),
      "pending carries the broadcast txHash",
    );
    assert.equal(
      "success" in exec,
      false,
      "pending execution reports no success yet",
    );

    // Release the receipt wait; the settled frame goes out over the WS topic.
    releaseSettlement();
    await new Promise((r) => setTimeout(r, 30));
    // Frames wrap payloads: { topic, payload: { type: "complete", ...TickResult } }.
    const complete = frames.find(
      (f) =>
        (f.payload as Record<string, unknown> | undefined)?.type === "complete",
    ) as Record<string, unknown> | undefined;
    assert.ok(complete, "settled TickResult is broadcast on tick.7");
    const settledExec = (complete.payload as Record<string, unknown>)
      .execution as Record<string, unknown>;
    assert.equal(settledExec.status, "executed");
    assert.equal(settledExec.success, true);
    // Settled shape is backward-compatible: same fields as pre-R4, txHash unchanged.
    assert.equal(settledExec.txHash, exec.txHash);
  } finally {
    unregisterClient(sub.client);
    await new Promise<void>((resolve) => {
      server.closeAllConnections?.();
      server.close(() => resolve());
    });
  }
});

test("hold tick (no settlement) responds with the full settled TickResult — byte-compatible with the pre-R4 shape", async () => {
  const runner = makeRunner(HOLD_RESULT);
  const server = buildApp(runner);
  try {
    const res = await fetch(`${baseUrl(server)}/v1/orchestrator/tick`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        vault: "0x" + "00".repeat(19) + "02",
        agentNft: "0x" + "00".repeat(19) + "01",
        agentTokenId: "8",
      }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    const rec = body.recommendation as Record<string, unknown>;
    assert.equal(rec.action, "hold");
    assert.equal(
      "execution" in body,
      false,
      "hold tick has no execution field",
    );
    assert.equal("durationMs" in body, true);
  } finally {
    await new Promise<void>((resolve) => {
      server.closeAllConnections?.();
      server.close(() => resolve());
    });
  }
});

test("background settlement failure emits a failure Tick event + error frame over tick.<id>", async () => {
  const runner = {
    runTick: () =>
      new Promise<TickResult>((_resolve, reject) =>
        setTimeout(() => reject(new Error("receipt timeout")), 5),
      ),
  } as unknown as StrategyRunner;
  const sub = fakeSubscriber(["tick.9"]);
  const frames = sub.frames;
  registerClient(sub.client);
  const server = buildApp(runner);
  try {
    const res = await fetch(`${baseUrl(server)}/v1/orchestrator/tick`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        vault: "0x" + "00".repeat(19) + "02",
        agentNft: "0x" + "00".repeat(19) + "01",
        agentTokenId: "9",
      }),
    });
    assert.equal(
      res.status,
      500,
      "failure before any response surfaces as 500",
    );
    await new Promise((r) => setTimeout(r, 30));
    const errorFrame = frames.find(
      (f) =>
        (f.payload as Record<string, unknown> | undefined)?.type === "error",
    ) as Record<string, unknown> | undefined;
    assert.ok(errorFrame, "error frame broadcast on tick.9");
    assert.match(
      String((errorFrame.payload as Record<string, unknown>).error),
      /receipt timeout/,
    );
  } finally {
    unregisterClient(sub.client);
    await new Promise<void>((resolve) => {
      server.closeAllConnections?.();
      server.close(() => resolve());
    });
  }
});
