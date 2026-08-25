import { test } from "bun:test";
import assert from "node:assert/strict";
import express, { type NextFunction, type Request, type Response } from "express";
import { ethers } from "ethers";
import { z } from "zod";
import { bigintReplacer } from "@axiom/config/constants";
import { registerVaultRoutes } from "./vault.js";
import { vaultSetStrategySchema } from "../route-schemas.js";
import type { ServerConfig } from "../config-types.js";

const VAULT_ADDRESS = ("0x" + "02".repeat(20)) as `0x${string}`;
const ROOT = "0x" + "11".repeat(32);

function buildApp() {
  const config = {
    addresses: { vault: VAULT_ADDRESS },
  } as unknown as ServerConfig;
  const app = express();
  app.set("json replacer", bigintReplacer);
  app.use(express.json());
  registerVaultRoutes(app, config);
  // Mirrors server.ts's terminal handler for the validation-rejection asserts.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR" });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  });
  return app;
}

async function postSetStrategy(body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const app = buildApp();
  const server = app.listen(0);
  try {
    const addr = server.address() as { port: number };
    const res = await fetch(`http://127.0.0.1:${addr.port}/v1/agents/7/set-strategy`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const IFACE = new ethers.Interface([
  "function setStrategy(uint256 tokenId, bytes32 root, uint256 dailyLimit, uint64 validUntilDay)",
]);

test("POST /v1/agents/:id/set-strategy encodes setStrategy(tokenId, root, limitWei, validUntilDay)", async () => {
  const { status, body } = await postSetStrategy({
    root: ROOT,
    dailyLimit: "1.5",
    validUntilDay: "12345",
  });
  assert.equal(status, 200);
  assert.equal(body.tokenId, "7");
  assert.equal(body.to, VAULT_ADDRESS);
  assert.equal(body.value, "0");
  assert.equal(body.amount, "1.5");
  assert.equal(
    body.data,
    IFACE.encodeFunctionData("setStrategy", [7n, ROOT, ethers.parseEther("1.5"), 12345n]),
  );
});

test("omitted root encodes ZeroHash (caller must send the live strategyOf root to refresh a limit)", async () => {
  const { status, body } = await postSetStrategy({
    dailyLimit: "2",
    validUntilDay: "0",
  });
  assert.equal(status, 200);
  assert.equal(
    body.data,
    IFACE.encodeFunctionData("setStrategy", [7n, ethers.ZeroHash, ethers.parseEther("2"), 0n]),
  );
});

test("rejects a non-32-byte root", async () => {
  const { status, body } = await postSetStrategy({
    root: "0x1234",
    dailyLimit: "1",
    validUntilDay: "0",
  });
  assert.equal(status, 400);
  assert.equal(body.code, "VALIDATION_ERROR");
});

test("rejects a negative dailyLimit", async () => {
  const { status, body } = await postSetStrategy({
    root: ROOT,
    dailyLimit: "-1",
    validUntilDay: "0",
  });
  assert.equal(status, 400);
  assert.equal(body.code, "VALIDATION_ERROR");
});

test("rejects a dailyLimit above the contract's uint128 LimitOverflow cap", async () => {
  // uint128 max wei ≈ 3.4e38 → 4e20 native OG exceeds it.
  const { status, body } = await postSetStrategy({
    root: ROOT,
    dailyLimit: "400000000000000000000",
    validUntilDay: "0",
  });
  assert.equal(status, 400);
  assert.equal(body.code, "VALIDATION_ERROR");
});

test("rejects a validUntilDay that overflows uint64", async () => {
  const { status, body } = await postSetStrategy({
    root: ROOT,
    dailyLimit: "1",
    validUntilDay: "18446744073709551616",
  });
  assert.equal(status, 400);
  assert.equal(body.code, "VALIDATION_ERROR");
});

test("schema accepts the boundary values (uint64-1 day, uint128-1 wei limit)", () => {
  const ok = vaultSetStrategySchema.safeParse({
    root: ROOT,
    dailyLimit: "340282366920938463463.374607431768211455",
    validUntilDay: "18446744073709551615",
  });
  assert.equal(ok.success, true);
});
