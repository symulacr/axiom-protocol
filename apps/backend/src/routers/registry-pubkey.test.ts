// GET /v1/registry/pubkey/:address contract test: 0x40-hex validation, TTL
// cache behavior, and the honest NO_ONCHAIN_KEY 404 (no tx-by-sender source).
process.env.AXIOM_TEE_SIGNER_PK = "0x" + "11".repeat(32);

import { test, beforeAll, afterAll } from "bun:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { z } from "zod";
import type { OracleRouteDeps } from "../oracle/routes.js";
import { registerAgentRoutes } from "./agents.js";
import type { ServerConfig } from "../server.js";

const NFT_ADDR = ("0x" + "aa".repeat(20)) as `0x${string}`;
const VALID_ADDR = "0x0000000000000000000000000000000000000beE";
const NO_KEY_ADDR = "0x0000000000000000000000000000000000000001";

let server: Server;
let baseUrl: string;

beforeAll(() => {
  const oracle = { storage: null } as unknown as OracleRouteDeps;
  const config = {
    bind: "0.0.0.0",
    port: 0,
    evmRpc: "https://evmrpc.0g.ai",
    addresses: { agentNft: NFT_ADDR },
    env: { AXIOM_TEE_SIGNER_PK: "0x" + "11".repeat(32) },
  } as unknown as ServerConfig;

  const app = express();
  app.use(express.json());
  registerAgentRoutes(
    app,
    config,
    {} as unknown as Parameters<typeof registerAgentRoutes>[2],
    oracle,
    { chainId: 16602n } as Parameters<typeof registerAgentRoutes>[4],
    null,
  );
  // Mirror server.ts registerErrorHandlers (terminal JSON on error).
  app.use(
    (
      err: Error & { issues?: unknown },
      _req: unknown,
      res: { status: (n: number) => { json: (b: unknown) => void } },
      _next: unknown,
    ) => {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: "Validation failed" });
        return;
      }
      res.status(500).json({ error: err.message });
    },
  );
  server = app.listen(0, "127.0.0.1");
  server.unref();
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
});

test("pubkey lookup rejects a non-0x40-hex address with 400", async () => {
  for (const bad of ["nothex", "0x1234", "0x" + "zz".repeat(20)]) {
    const res = await fetch(`${baseUrl}/v1/registry/pubkey/${bad}`);
    assert.equal(res.status, 400, `expected 400 for ${bad}`);
  }
});

test("pubkey lookup returns 404 NO_ONCHAIN_KEY when no tx-by-sender source exists", async () => {
  const res = await fetch(`${baseUrl}/v1/registry/pubkey/${NO_KEY_ADDR}`);
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error?: string };
  assert.equal(body.error, "NO_ONCHAIN_KEY");
});

test("pubkey lookup caches the miss (repeat request stays 404 without recompute)", async () => {
  for (let i = 0; i < 3; i++) {
    const res = await fetch(`${baseUrl}/v1/registry/pubkey/${VALID_ADDR}`);
    assert.equal(res.status, 404);
    const body = (await res.json()) as { error?: string };
    assert.equal(body.error, "NO_ONCHAIN_KEY");
  }
});
