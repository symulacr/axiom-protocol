import { test, beforeEach, afterEach } from "bun:test";
import assert from "node:assert/strict";
import { FallbackProvider, JsonRpcProvider } from "ethers";
import { getSharedProvider, sendRpcRaw } from "../src/providers.js";

// getSharedProvider caches by resolved RPC URL in a module-level Map, and the
// resolved URL depends on env. Unique chain ids per case give unique cache
// entries without touching the module internals or cross-case pollution.
const SAVED: Record<string, string | undefined> = {};
const ENV_KEYS = ["AXIOM_EVM_RPC", "AXIOM_EVM_RPC_FALLBACKS", "AXIOM_CHAIN_ID"];

beforeEach(() => {
  for (const k of ENV_KEYS) SAVED[k] = process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
});

let chainSeq = 30000;

test("no fallback URLs → plain JsonRpcProvider (exact class, not FallbackProvider)", () => {
  process.env.AXIOM_EVM_RPC = "https://rpc-a.example";
  delete process.env.AXIOM_EVM_RPC_FALLBACKS;
  const cid = String(++chainSeq);
  process.env.AXIOM_CHAIN_ID = cid;
  const provider = getSharedProvider(Number(cid));
  assert.ok(provider instanceof JsonRpcProvider);
  assert.ok(!(provider instanceof FallbackProvider));
});

test("fallback URLs present → FallbackProvider with quorum 1 over primary+fallbacks", () => {
  process.env.AXIOM_EVM_RPC = "https://rpc-b.example";
  process.env.AXIOM_EVM_RPC_FALLBACKS =
    "https://rpc-b2.example,https://rpc-b3.example";
  const cid = String(++chainSeq);
  process.env.AXIOM_CHAIN_ID = cid;
  const provider = getSharedProvider(Number(cid));
  assert.ok(provider instanceof FallbackProvider);
  const fb = provider as FallbackProvider;
  assert.equal(fb.quorum, 1);
  // Primary + 2 fallbacks = 3 sub-providers, in resolution order.
  const urls = fb.providerConfigs.map(
    (c) => (c.provider as JsonRpcProvider)._getConnection().url,
  );
  assert.deepEqual(urls, [
    "https://rpc-b.example",
    "https://rpc-b2.example",
    "https://rpc-b3.example",
  ]);
});

test("retired testnet chain (16602) has no registry fallbacks — primary-only provider, cache is per-URL", () => {
  process.env.AXIOM_EVM_RPC = "https://rpc-c.example";
  delete process.env.AXIOM_EVM_RPC_FALLBACKS;
  const provider = getSharedProvider(16602);
  // Mainnet-only registry: no galileo fallback list remains, so no FallbackProvider is built.
  assert.ok(!(provider instanceof FallbackProvider));
  // Same URL must reuse the cached instance (no second construction).
  assert.equal(getSharedProvider(16602), provider);
});

test("sendRpcRaw passes raw JSON-RPC through on JsonRpcProvider", async () => {
  process.env.AXIOM_EVM_RPC = "https://rpc-d.example";
  delete process.env.AXIOM_EVM_RPC_FALLBACKS;
  const cid = String(++chainSeq);
  process.env.AXIOM_CHAIN_ID = cid;
  const provider = getSharedProvider(Number(cid));
  // JsonRpcProvider.send reaches the (nonexistent) endpoint; assert it attempts
  // the raw method by checking the failure is a network error, not an
  // "unsupported" throw from the helper itself.
  const err = await sendRpcRaw(provider, "eth_getLogs", [
    { fromBlock: "0x0", toBlock: "0x1" },
  ]).then(
    () => null,
    (e: unknown) => e as Error,
  );
  assert.ok(err instanceof Error);
  assert.ok(!/not supported on FallbackProvider/.test(err.message));
});

test("sendRpcRaw on FallbackProvider serves eth_getLogs via the Provider API", async () => {
  process.env.AXIOM_EVM_RPC = "https://rpc-e.example";
  process.env.AXIOM_EVM_RPC_FALLBACKS = "https://rpc-e2.example";
  const cid = String(++chainSeq);
  process.env.AXIOM_CHAIN_ID = cid;
  const provider = getSharedProvider(Number(cid));
  assert.ok(provider instanceof FallbackProvider);
  // All endpoints are bogus — FallbackProvider surfaces the last transport
  // error, which proves the call went through the fallback path (the raw
  // `.send()` branch is impossible on this class).
  const err = await sendRpcRaw(provider, "eth_getLogs", [
    { fromBlock: "0x0", toBlock: "0x1" },
  ]).then(
    () => null,
    (e: unknown) => e as Error,
  );
  assert.ok(err instanceof Error);
  // Non-getLogs raw methods are explicitly rejected on FallbackProvider.
  const rejected = await sendRpcRaw(provider, "eth_chainId", []).then(
    () => null,
    (e: unknown) => e as Error,
  );
  assert.match(rejected?.message ?? "", /not supported on FallbackProvider/);
});
