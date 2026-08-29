import { test, beforeEach, afterEach } from "bun:test";
import assert from "node:assert/strict";
import { createRouterClient } from "../src/providers.js";

// Fresh client per case: each test sets a distinct API key, so the module's
// (baseURL, key)-keyed client cache rebuilds instead of returning the
// previous test's client.
let keySeq = 0;

const SAVED: Record<string, string | undefined> = {};
function saveEnv(keys: string[]) {
  for (const k of keys) SAVED[k] = process.env[k];
}
function restoreEnv(keys: string[]) {
  for (const k of keys) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
}

const ENV_KEYS = [
  "AXIOM_COMPUTE_API_KEY",
  "OG_COMPUTE_API_KEY",
  "AXIOM_COMPUTE_DIRECT_KEY",
  "AXIOM_COMPUTE_MAX_PRICE_USD",
  "AXIOM_COMPUTE_TRUST_MODE",
  "AXIOM_CHAIN_ID",
];

beforeEach(() => {
  saveEnv(ENV_KEYS);
});

afterEach(() => {
  restoreEnv(ENV_KEYS);
});

async function routerClientHeaders(): Promise<Record<string, string>> {
  process.env.AXIOM_COMPUTE_API_KEY = `test-key-${++keySeq}`;
  delete process.env.AXIOM_COMPUTE_DIRECT_KEY;
  const client = await createRouterClient();
  // buildRequest is public on the OpenAI client; it merges defaultHeaders into
  // the outgoing header set — asserting the real request surface, not internals.
  // req.headers is a Headers instance at runtime (Bun lowercases keys).
  const { req } = await (
    client as unknown as {
      buildRequest(o: object): Promise<{
        req: { headers: Headers | Record<string, string> };
      }>;
    }
  ).buildRequest({ method: "get", path: "/models" });
  const get = (name: string): string | undefined =>
    typeof (req.headers as Headers).get === "function"
      ? ((req.headers as Headers).get(name) ?? undefined)
      : ((req.headers as Record<string, string>)[name] ??
        (req.headers as Record<string, string>)[name.toLowerCase()]);
  return {
    "X-0G-Provider-Max-Price-Usd-Prompt": get(
      "x-0g-provider-max-price-usd-prompt",
    ),
    "X-0G-Provider-Max-Price-Usd-Completion": get(
      "x-0g-provider-max-price-usd-completion",
    ),
    "X-0G-Provider-Trust-Mode": get("x-0g-provider-trust-mode"),
  };
}

test("router client sends X-0G-Provider price-cap + trust-mode default headers", async () => {
  process.env.AXIOM_COMPUTE_MAX_PRICE_USD = "0.000002";
  delete process.env.AXIOM_COMPUTE_TRUST_MODE;
  const headers = await routerClientHeaders();
  assert.equal(headers["X-0G-Provider-Max-Price-Usd-Prompt"], "0.000002");
  assert.equal(headers["X-0G-Provider-Max-Price-Usd-Completion"], "0.000002");
  assert.equal(headers["X-0G-Provider-Trust-Mode"], "verified");
});

test("trust mode override is honored; price caps omitted when AXIOM_COMPUTE_MAX_PRICE_USD is unset", async () => {
  delete process.env.AXIOM_COMPUTE_MAX_PRICE_USD;
  process.env.AXIOM_COMPUTE_TRUST_MODE = "private";
  const headers = await routerClientHeaders();
  assert.equal(headers["X-0G-Provider-Trust-Mode"], "private");
  assert.equal(headers["X-0G-Provider-Max-Price-Usd-Prompt"], undefined);
  assert.equal(headers["X-0G-Provider-Max-Price-Usd-Completion"], undefined);
});
