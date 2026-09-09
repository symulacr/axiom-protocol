import { test, describe } from "bun:test";
import assert from "node:assert/strict";
import express from "express";
import type http from "node:http";
import { Wallet } from "ethers";
import { registerComputeRoutes } from "./compute.js";
import { getComputeBaseUrl } from "../providers.js";
import type { ServerConfig } from "../config-types.js";

const CHAIN_ID = 16602;
const ROUTER_HOST = new URL(getComputeBaseUrl()).host;

function makeConfig(model?: string): ServerConfig {
  return {
    bind: "127.0.0.1",
    port: 0,
    evmRpc: "http://127.0.0.1:1",
    signer: new Wallet("0x" + "44".repeat(32)),
    env: {
      AXIOM_CHAIN_ID: CHAIN_ID,
      ...(model ? { AXIOM_COMPUTE_MODEL: model } : {}),
    } as ServerConfig["env"],
  } as ServerConfig;
}

/** Stub the compute router upstream; the test's own request to the local
 *  server (and anything else) passes through to the real fetch. */
async function withRouterStub(
  modelsResponder: () => Response,
  fn: (url: string) => Promise<void>,
): Promise<void> {
  const prevFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      input instanceof Request ? new URL(input.url) : new URL(String(input));
    if (url.host === ROUTER_HOST) return modelsResponder();
    return prevFetch(input, init);
  }) as typeof fetch;
  const app = express();
  app.use(express.json());
  registerComputeRoutes(app, makeConfig("deepseek-v4-flash"), CHAIN_ID);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const { port } = server.address() as { port: number };
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    globalThis.fetch = prevFetch;
    await new Promise<void>((r) => {
      (server as http.Server).closeAllConnections?.();
      server.close(() => r());
    });
  }
}

const modelsJson = (rows: Array<Record<string, unknown>>): Response =>
  new Response(JSON.stringify({ data: rows }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("/v1/config model caps exposure", () => {
  test("live catalog context_length + max_completion_tokens land in /v1/config", async () => {
    await withRouterStub(
      () =>
        modelsJson([
          {
            id: "deepseek-v4-flash",
            context_length: 1_000_000,
            max_completion_tokens: 39_321,
          },
        ]),
      async (url) => {
        const res = await fetch(`${url}/v1/config`);
        assert.equal(res.status, 200);
        const body = (await res.json()) as Record<string, unknown>;
        assert.equal(body.model, "deepseek-v4-flash");
        assert.equal(body.contextWindow, 1_000_000);
        assert.equal(body.maxCompletionTokens, 39_321);
      },
    );
  });

  test("the legacy context_window row name is still honored", async () => {
    await withRouterStub(
      () => modelsJson([{ id: "deepseek-v4-flash", context_window: 262_144 }]),
      async (url) => {
        const body = (await (await fetch(`${url}/v1/config`)).json()) as Record<
          string,
          unknown
        >;
        assert.equal(body.contextWindow, 262_144);
        // Cap absent from the catalog row → fallback map still answers.
        assert.equal(body.maxCompletionTokens, 39_321);
      },
    );
  });

  test("router down → static fallback (1M window, 39321 cap) for the default model", async () => {
    await withRouterStub(
      () => new Response("router down", { status: 500 }),
      async (url) => {
        const body = (await (await fetch(`${url}/v1/config`)).json()) as Record<
          string,
          unknown
        >;
        assert.equal(body.contextWindow, 1_000_000);
        assert.equal(body.maxCompletionTokens, 39_321);
      },
    );
  });

  test("unknown model + router down → 32768 window fallback, null cap", async () => {
    const prevFetch = globalThis.fetch;
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const url =
        input instanceof Request ? new URL(input.url) : new URL(String(input));
      if (url.host === ROUTER_HOST)
        return new Response("down", { status: 500 });
      return prevFetch(input, init);
    }) as typeof fetch;
    const app = express();
    app.use(express.json());
    registerComputeRoutes(app, makeConfig("no/such-model"), CHAIN_ID);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", r));
    const { port } = server.address() as { port: number };
    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/config`);
      const body = (await res.json()) as Record<string, unknown>;
      assert.equal(body.model, "no/such-model");
      assert.equal(body.contextWindow, 32_768);
      assert.equal(body.maxCompletionTokens, null);
    } finally {
      globalThis.fetch = prevFetch;
      await new Promise<void>((r) => {
        server.closeAllConnections?.();
        server.close(() => r());
      });
    }
  });
});

describe("/v1/compute/providers catalog caps passthrough", () => {
  test("model rows carry context_length + max_completion_tokens when numeric", async () => {
    await withRouterStub(
      () =>
        modelsJson([
          {
            id: "deepseek-v4-flash",
            context_length: 1_000_000,
            max_completion_tokens: 39_321,
            pricing: { prompt: "0.1" },
          },
          { id: "qwen2.5-omni", context_window: 32_768 },
        ]),
      async (url) => {
        const res = await fetch(`${url}/v1/compute/providers`);
        assert.equal(res.status, 200);
        const body = (await res.json()) as {
          services: Array<Record<string, unknown>>;
        };
        const flash = body.services.find(
          (s) => s.model === "deepseek-v4-flash",
        );
        assert.ok(flash);
        assert.equal(flash.context_length, 1_000_000);
        assert.equal(flash.max_completion_tokens, 39_321);
        const qwen = body.services.find((s) => s.model === "qwen2.5-omni");
        assert.ok(qwen);
        // Legacy row name maps to the catalog name; absent cap stays absent.
        assert.equal(qwen.context_length, 32_768);
        assert.equal("max_completion_tokens" in qwen, false);
      },
    );
  });
});
