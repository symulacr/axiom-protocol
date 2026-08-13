import { test } from "bun:test";
import assert from "node:assert/strict";
import express from "express";
import { createSkillRouters } from "./routers.js";
import { evmWhaleSchema } from "@axiom/config/skills/schemas";
import { REGISTERED_ROUTES } from "../routers/route-factory.js";
import type { ServerConfig } from "../server.js";

function buildSkillApp() {
  const config = {
    bind: "0.0.0.0",
    port: 0,
    evmRpc: "https://evmrpc.0g.ai",
    signer: {} as ServerConfig["signer"],
    oracleBaseUrl: "http://oracle",
    env: {} as unknown as ServerConfig["env"],
  } as unknown as ServerConfig;

  const app = express();
  app.use(express.json());
  app.use(createSkillRouters(config));
  return app;
}

test("registers all 22 skill routes under /v1/skills/", () => {
  buildSkillApp();
  const skills = REGISTERED_ROUTES.filter((r) =>
    r.path.startsWith("/v1/skills/"),
  );
  const unique = new Set(skills.map((r) => r.path));
  assert.equal(
    unique.size,
    22,
    `expected 22 distinct skill routes, got ${unique.size}`,
  );
  for (const p of [
    "/v1/skills/evm/wallet",
    "/v1/skills/evm/whale",
    "/v1/skills/stocks/quote",
    "/v1/skills/osint/sec_edgar",
    "/v1/skills/unbroker/analyze",
  ]) {
    assert.ok(unique.has(p), `missing registered route ${p}`);
  }
});

test("evm_whale honors caller values but defaults the missing block range (audit §6)", () => {
  const input = { token: "0x" + "a".repeat(40), minValue: "500" };
  const parsed = evmWhaleSchema.parse(input);
  assert.equal(parsed.token, input.token, "caller token must be honored");
  assert.equal(parsed.minValue, "500", "caller minValue must be honored");
  assert.equal(
    typeof parsed.fromBlock,
    "number",
    "fromBlock should default to a number",
  );
  assert.equal(
    typeof parsed.toBlock,
    "number",
    "toBlock should default to a number",
  );
  assert.ok(
    parsed.toBlock >= parsed.fromBlock,
    "default range must be non-empty",
  );
  // token stays required, so a call without it must fail validation.
  assert.throws(
    () => evmWhaleSchema.parse({ minValue: "1" }),
    "token is required",
  );
});

import type { Express } from "express";
import { FetchRequest, Interface } from "ethers";

/** Stub outbound external HTTP while letting the in-process test server through. */
async function withExternalFetchStub(
  handler: (url: URL, init?: RequestInit) => Response | Promise<Response>,
  fn: () => Promise<void>,
): Promise<void> {
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      input instanceof Request ? new URL(input.url) : new URL(String(input));
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      return orig(input, init);
    }
    return handler(url, init);
  }) as unknown as typeof fetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = orig;
  }
}

/** Stub ethers' JSON-RPC transport (Node http/https via FetchRequest.getUrlFunc). */
async function withEthersRpcStub(
  rpc: (method: string, params: unknown[]) => unknown,
  fn: () => Promise<void>,
): Promise<void> {
  FetchRequest.registerGetUrl(async (req) => {
    const body = req.body
      ? (JSON.parse(new TextDecoder().decode(req.body)) as
          | { method?: string; params?: unknown[]; id?: number }
          | Array<{ method?: string; params?: unknown[]; id?: number }>)
      : null;
    const respond = (
      p: { method?: string; params?: unknown[]; id?: number } | null,
    ) => ({
      jsonrpc: "2.0",
      id: p?.id ?? 0,
      result: rpc(p?.method ?? "", p?.params ?? []),
    });
    const results = Array.isArray(body) ? body.map(respond) : respond(body);
    return {
      statusCode: 200,
      statusMessage: "OK",
      headers: { "content-type": "application/json" },
      body: new TextEncoder().encode(JSON.stringify(results)),
    };
  });
  try {
    await fn();
  } finally {
    FetchRequest.registerGetUrl(FetchRequest.createGetUrlFunc());
  }
}

async function postSkill(
  app: Express,
  path: string,
  body: unknown,
): Promise<{ status: number; json: () => Promise<unknown> }> {
  const server = app.listen(0);
  try {
    const addr = server.address() as { port: number };
    const res = await fetch(`http://127.0.0.1:${addr.port}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: () => res.json() };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("stocks/quote returns a serialized quote from the Yahoo chart endpoint", async () => {
  const app = buildSkillApp();
  await withExternalFetchStub(
    async (url) => {
      if (url.pathname.endsWith("/test/getcrumb")) {
        return new Response("crumb123", {
          status: 200,
          headers: { "set-cookie": "A1=1" },
        });
      }
      if (url.pathname.includes("/v8/finance/chart/")) {
        return new Response(
          JSON.stringify({
            chart: {
              result: [
                {
                  meta: {
                    symbol: "AAPL",
                    regularMarketPrice: 210.5,
                    chartPreviousClose: 205.1,
                    currency: "USD",
                    exchangeName: "NMS",
                    marketState: "REGULAR",
                  },
                  timestamp: [],
                  indicators: { quote: [{}] },
                },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    },
    async () => {
      const res = await postSkill(app, "/v1/skills/stocks/quote", {
        symbol: "AAPL",
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        symbol?: string;
        price?: number;
        currency?: string;
        exchange?: string;
      };
      assert.equal(body.symbol, "AAPL");
      assert.equal(body.price, 210.5);
      assert.equal(body.currency, "USD");
      assert.equal(body.exchange, "NMS");
    },
  );
});

test("stocks/quote with a non-JSON upstream returns an empty quote instead of crashing", async () => {
  const app = buildSkillApp();
  await withExternalFetchStub(
    async (url) => {
      if (url.pathname.endsWith("/test/getcrumb")) {
        return new Response("crumb456", {
          status: 200,
          headers: { "set-cookie": "B1=1" },
        });
      }
      if (url.pathname.includes("/v8/finance/chart/")) {
        return new Response("<html>rate limited</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      return new Response("not found", { status: 404 });
    },
    async () => {
      const res = await postSkill(app, "/v1/skills/stocks/quote", {
        symbol: "MSFT",
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { symbol?: string; price?: number };
      assert.equal(
        body.symbol,
        undefined,
        "non-JSON upstream must not fabricate a quote",
      );
      assert.equal(
        body.price,
        undefined,
        "non-JSON upstream must not fabricate a price",
      );
    },
  );
});

test("evm/token resolves ERC-20 metadata via the shared provider", async () => {
  const erc20Iface = new Interface([
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
  ]);
  const app = buildSkillApp();
  await withEthersRpcStub(
    (method, params) => {
      if (method === "eth_call") {
        const data = ((params[0] as { data?: string })?.data ?? "0x").slice(
          0,
          10,
        );
        if (data === erc20Iface.getFunction("name")!.selector) {
          return erc20Iface.encodeFunctionResult("name", ["Axiom Token"]);
        }
        if (data === erc20Iface.getFunction("symbol")!.selector) {
          return erc20Iface.encodeFunctionResult("symbol", ["AXM"]);
        }
        if (data === erc20Iface.getFunction("decimals")!.selector) {
          return erc20Iface.encodeFunctionResult("decimals", [18]);
        }
        return "0x";
      }
      if (method === "eth_chainId") return "0x411d";
      return null;
    },
    async () => {
      const res = await postSkill(app, "/v1/skills/evm/token", {
        address: "0x" + "a".repeat(40),
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        name?: string;
        symbol?: string;
        decimals?: number;
      };
      assert.equal(body.name, "Axiom Token");
      assert.equal(body.symbol, "AXM");
      // ethers returns uint8 as bigint, which serialize() stringifies.
      assert.equal(String(body.decimals), "18");
    },
  );
});

test("osint/sec_edgar fetches the CIK submissions JSON via cachedFetch", async () => {
  const app = buildSkillApp();
  await withExternalFetchStub(
    async (url) => {
      if (url.hostname === "data.sec.gov") {
        return new Response(
          JSON.stringify({ cik: "0000320193", entityName: "APPLE INC" }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    },
    async () => {
      const res = await postSkill(app, "/v1/skills/osint/sec_edgar", {
        cik: "320193",
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { cik?: string; entityName?: string };
      assert.equal(body.cik, "0000320193");
      assert.equal(body.entityName, "APPLE INC");
    },
  );
});

test("osint/ofac_sdn returns the sanctions-search HTML payload", async () => {
  const app = buildSkillApp();
  await withExternalFetchStub(
    async (url) => {
      if (url.hostname === "sanctionssearch.ofac.treas.gov") {
        return new Response("<html><body>SDN match</body></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      return new Response("not found", { status: 404 });
    },
    async () => {
      const res = await postSkill(app, "/v1/skills/osint/ofac_sdn", {
        name: "Vladimir Putin",
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        name?: string;
        source?: string;
        html?: string;
      };
      assert.equal(body.name, "Vladimir Putin");
      assert.equal(body.source, "ofac-sanctions-search");
      assert.ok(body.html?.includes("SDN match"), "HTML payload echoed");
    },
  );
});
