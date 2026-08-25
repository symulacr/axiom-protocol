import { test } from "bun:test";
import assert from "node:assert/strict";
import express, { type NextFunction, type Request, type Response } from "express";
import { ethers } from "ethers";
import { z } from "zod";
import { bigintReplacer } from "@axiom/config/constants";
import { PAYMENT_PROCESSOR_ABI } from "@axiom/config/abis";
import { registerPaymentRoutes } from "./payment.js";
import { PaymentProcessorClient } from "../payment/processor.js";
import type { ServerConfig } from "../config-types.js";

const PROCESSOR_ADDRESS = ("0x" + "ab".repeat(20)) as `0x${string}`;
const TOKEN_ADDRESS = ("0x" + "cd".repeat(20)) as `0x${string}`;

function buildApp() {
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:1");
  const signer = new ethers.Wallet(ethers.Wallet.createRandom().privateKey, provider);
  const client = new PaymentProcessorClient({
    address: PROCESSOR_ADDRESS,
    signer,
    provider,
    paymentTokenAddress: TOKEN_ADDRESS,
  });
  const config = {
    addresses: { paymentProcessor: PROCESSOR_ADDRESS, vault: ("0x" + "02".repeat(20)) as `0x${string}` },
  } as unknown as ServerConfig;
  const app = express();
  app.set("json replacer", bigintReplacer);
  app.use(express.json());
  registerPaymentRoutes(app, config, null, async () => client);
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR" });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  });
  return app;
}

test("POST /v1/payment/withdraw-earnings relays the withdrawAgentEarnings encoding", async () => {
  const app = buildApp();
  const server = app.listen(0);
  try {
    const addr = server.address() as { port: number };
    const res = await fetch(`http://127.0.0.1:${addr.port}/v1/payment/withdraw-earnings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    const iface = new ethers.Interface(PAYMENT_PROCESSOR_ABI);
    assert.equal(body.to, PROCESSOR_ADDRESS);
    assert.equal(body.data, iface.getFunction("withdrawAgentEarnings")!.selector);
    assert.equal(body.value, "0");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
