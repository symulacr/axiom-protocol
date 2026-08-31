import { test, describe } from "bun:test";
import assert from "node:assert/strict";
import {
  PYTH_FEED_IDS,
  HERMES_URLS,
  PythOracle,
  getPythOracle,
  setPythOracle,
  pythPricesOrEmpty,
} from "./pyth.js";

const BTC_ID = PYTH_FEED_IDS["BTC"]!.slice(2).toLowerCase();
const ETH_ID = PYTH_FEED_IDS["ETH"]!.slice(2).toLowerCase();

/** Hermes-shaped payload for the two ids every case relies on. */
function hermesBody(): unknown {
  return [
    {
      id: BTC_ID,
      price: {
        price: "6712345000000",
        conf: "1234500000",
        expo: -8,
        publish_time: 1756665600,
      },
    },
    {
      id: ETH_ID,
      price: {
        price: "312345678",
        conf: "567890",
        expo: -8,
        publish_time: 1756665600,
      },
    },
  ];
}

function okFetch(
  body: unknown = hermesBody(),
): (url: string, init?: RequestInit) => Promise<Response> {
  return (url) =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as Promise<Response>;
}

describe("pyth feed-id map", () => {
  test("top-15 symbols all present with 0x + 64-hex ids", () => {
    const expected = [
      "BTC",
      "ETH",
      "SOL",
      "USDC",
      "ARB",
      "OP",
      "AVAX",
      "LINK",
      "POL",
      "DOGE",
      "ADA",
      "XRP",
      "BNB",
      "WBTC",
      "WETH",
    ];
    assert.deepEqual(Object.keys(PYTH_FEED_IDS).sort(), [...expected].sort());
    for (const id of Object.values(PYTH_FEED_IDS)) {
      assert.match(id, /^0x[0-9a-f]{64}$/);
    }
  });

  test("both Hermes cluster URLs are configured", () => {
    assert.deepEqual(
      [...HERMES_URLS],
      ["https://hermes.pyth.network", "https://hermes-beta.pyth.network"],
    );
  });
});

describe("PythOracle", () => {
  test("parses Hermes entries with expo applied and publishedAt in ms", async () => {
    const oracle = new PythOracle({ fetchImpl: okFetch(), cacheTtlMs: 0 });
    const prices = await oracle.latestAll();
    const btc = prices.find((p) => p.symbol === "BTC");
    assert.ok(btc);
    assert.equal(btc.price, "67123.45000000");
    assert.equal(btc.confidence, "12.34500000");
    assert.equal(btc.expo, -8);
    assert.equal(btc.publishedAt, 1756665600000);
  });

  test("30s cache: second call within TTL does not re-fetch", async () => {
    let calls = 0;
    const oracle = new PythOracle({
      fetchImpl: (url) => {
        calls += 1;
        return okFetch()(url);
      },
    });
    await oracle.latestAll();
    await oracle.latestAll();
    assert.equal(calls, 1);
  });

  test("cache TTL 0: every call re-fetches", async () => {
    let calls = 0;
    const oracle = new PythOracle({
      fetchImpl: (url) => {
        calls += 1;
        return okFetch()(url);
      },
      cacheTtlMs: 0,
    });
    await oracle.latestAll();
    await oracle.latestAll();
    assert.equal(calls, 2);
  });

  test("graceful degrade: all Hermes URLs failing → throws (route maps to 503)", async () => {
    const oracle = new PythOracle({
      fetchImpl: () => Promise.reject(new Error("unreachable")),
      cacheTtlMs: 0,
    });
    await assert.rejects(oracle.latestAll(), /unreachable/);
  });

  test("graceful degrade: non-2xx from the primary is retried on the fallback", async () => {
    const tried: string[] = [];
    const oracle = new PythOracle({
      fetchImpl: (url) => {
        tried.push(url);
        const status = url.includes("hermes.pyth.network") ? 401 : 200;
        return Promise.resolve(
          new Response(JSON.stringify(hermesBody()), { status }),
        ) as unknown as Promise<Response>;
      },
      cacheTtlMs: 0,
    });
    const prices = await oracle.latestAll();
    assert.ok(tried.some((u) => u.includes("hermes-beta")));
    assert.ok(prices.length > 0);
  });

  test("getPrice returns null for an unknown symbol", async () => {
    const oracle = new PythOracle({ fetchImpl: okFetch(), cacheTtlMs: 0 });
    assert.equal(await oracle.getPrice("PEPE"), null);
    const eth = await oracle.getPrice("eth");
    assert.equal(eth?.symbol, "ETH");
  });

  test("suggestedMinOut applies slippage bps and rejects bad inputs", async () => {
    const oracle = new PythOracle({ fetchImpl: okFetch(), cacheTtlMs: 0 });
    assert.equal(await oracle.suggestedMinOut("ETH", "2", 100), "1.980000");
    assert.equal(await oracle.suggestedMinOut("PEPE", "2", 100), null);
    assert.equal(await oracle.suggestedMinOut("ETH", "-1", 100), null);
  });
});

describe("pythPricesOrEmpty", () => {
  test("returns ok:false + empty prices instead of throwing when Hermes is down", async () => {
    setPythOracle(
      new PythOracle({
        fetchImpl: () => Promise.reject(new Error("unreachable")),
        cacheTtlMs: 0,
      }),
    );
    const out = await pythPricesOrEmpty();
    assert.equal(out.ok, false);
    assert.deepEqual(out.prices, []);
    assert.match(out.error ?? "", /unreachable/);
  });

  test("shared instance seam: getPythOracle returns the injected oracle", async () => {
    const oracle = new PythOracle({ fetchImpl: okFetch(), cacheTtlMs: 0 });
    setPythOracle(oracle);
    assert.equal(getPythOracle(), oracle);
    const out = await pythPricesOrEmpty();
    assert.equal(out.ok, true);
    assert.ok(out.prices.length > 0);
    setPythOracle(null);
  });
});
