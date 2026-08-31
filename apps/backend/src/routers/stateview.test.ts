import { test, describe, beforeEach } from "bun:test";
import assert from "node:assert/strict";
import express from "express";
import { Interface, type JsonRpcProvider } from "ethers";
import { registerStateViewRoutes } from "./stateview.js";
import type { ServerConfig } from "../config-types.js";

// The route reads the PaymentProcessor's statefold views (paymentSnapshot +
// vaultHealthOf, ex-AxiomStateView) via an ethers Contract; a scripted fake
// provider answers by matching (to, selector) so all four combinations
// (ok/partial/fail) are mockable without a chain.

const PROCESSOR_ADDR = "0x" + "09".repeat(20);

const processorIface = Interface.from([
  "function paymentSnapshot(address payer, uint256 tokenId) view returns (uint256 maxPayCap, uint256 computeRatioMax, uint256 agentBalance, uint256 payerAllowance, address paymentToken)",
  "function vaultHealthOf(uint256 tokenId) view returns (uint256 balance, bytes32 strategyRoot, uint128 dailyLimit, uint128 dailySpent, uint64 resetDay, uint64 validUntilDay, bool expired)",
]);

const PAYMENT_TOKEN = "0x" + "ee".repeat(20);

function encodeSnapshot(): string {
  return processorIface.encodeFunctionResult("paymentSnapshot", [
    1_000n, // maxPayCap
    25_000n, // computeRatioMax
    5_000n, // agentBalance
    900n, // payerAllowance
    PAYMENT_TOKEN,
  ]);
}

function encodeHealth(): string {
  return processorIface.encodeFunctionResult("vaultHealthOf", [
    77_000n, // balance
    "0x" + "aa".repeat(32), // strategyRoot
    1_000n, // dailyLimit (uint128)
    250n, // dailySpent (uint128)
    20_000n, // resetDay (uint64)
    0n, // validUntilDay (uint64) — 0 = no expiry
    false, // expired
  ]);
}

interface CallExpectation {
  selector: string;
  returns: string | Error;
}

function selectorOf(signature: string): string {
  return processorIface.getFunction(signature)!.selector;
}

function makeFakeProvider(expectations: CallExpectation[]): JsonRpcProvider {
  return {
    call: async (tx: { to?: string; data?: string }) => {
      const selector = tx.data?.slice(0, 10).toLowerCase();
      const match = expectations.find((e) => e.selector === selector);
      if (!match) {
        throw new Error(
          `unexpected provider.call to ${tx.to} selector ${selector}`,
        );
      }
      if (match.returns instanceof Error) throw match.returns;
      return match.returns;
    },
  } as unknown as JsonRpcProvider;
}

function makeConfig(withProcessor = true): ServerConfig {
  return {
    bind: "0.0.0.0",
    port: 0,
    evmRpc: "https://evmrpc.0g.ai",
    signer: {} as ServerConfig["signer"],
    addresses: {
      agentNft: "0x" + "01".repeat(20),
      vault: "0x" + "02".repeat(20),
      verifier: "0x" + "03".repeat(20),
      ...(withProcessor ? { paymentProcessor: PROCESSOR_ADDR } : {}),
    },
  } as unknown as ServerConfig;
}

function buildApp(
  provider: JsonRpcProvider,
  config: ServerConfig,
): express.Express {
  const app = express();
  app.use(express.json());
  registerStateViewRoutes(app, config, provider);
  return app;
}

async function getState(
  app: express.Express,
  path = "/v1/agents/42/state",
): Promise<{ status: number; body: Record<string, unknown> }> {
  const server = app.listen(0);
  try {
    const addr = server.address() as { port: number };
    const res = await fetch(`http://127.0.0.1:${addr.port}${path}`);
    return {
      status: res.status,
      body: (await res.json()) as Record<string, unknown>,
    };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const snapshotSel = selectorOf("paymentSnapshot(address,uint256)");
const healthSel = selectorOf("vaultHealthOf(uint256)");

describe("GET /v1/agents/:id/state (PaymentProcessor statefold pre-flight)", () => {
  let expectations: CallExpectation[];

  beforeEach(() => {
    expectations = [
      { selector: snapshotSel, returns: encodeSnapshot() },
      { selector: healthSel, returns: encodeHealth() },
    ];
  });

  test("both reads ok → combined snapshot + health, bigints as strings", async () => {
    const app = buildApp(makeFakeProvider(expectations), makeConfig());
    const { status, body } = await getState(app);
    assert.equal(status, 200);
    assert.equal(body.tokenId, "42");
    const payer = body.payer as Record<string, string>;
    assert.equal(payer.maxPayCap, "1000");
    assert.equal(payer.computeRatioMax, "25000");
    assert.equal(payer.agentBalance, "5000");
    assert.equal(payer.payerAllowance, "900");
    assert.equal(payer.paymentToken.toLowerCase(), PAYMENT_TOKEN);
    const health = body.vaultHealth as Record<string, unknown>;
    assert.equal(health.balance, "77000");
    assert.equal(health.strategyRoot, "0x" + "aa".repeat(32));
    assert.equal(health.dailyLimit, "1000");
    assert.equal(health.dailySpent, "250");
    assert.equal(health.expired, false);
    assert.equal(body.errors, undefined);
  });

  test("payer query param scopes paymentSnapshot", async () => {
    const seenData: string[] = [];
    const provider = {
      call: async (tx: { to?: string; data?: string }) => {
        const data = tx.data ?? "";
        seenData.push(data);
        const selector = data.slice(0, 10).toLowerCase();
        if (selector === snapshotSel) return encodeSnapshot();
        if (selector === healthSel) return encodeHealth();
        throw new Error(`unexpected selector ${selector}`);
      },
    } as unknown as JsonRpcProvider;
    const app = buildApp(provider, makeConfig());
    const payer = "0x" + "dd".repeat(20);
    const { status, body } = await getState(
      app,
      `/v1/agents/42/state?payer=${payer}`,
    );
    assert.equal(status, 200);
    assert.ok(body.payer, "snapshot must be present");
    // payer is call arg 1 of the paymentSnapshot calldata (selector + payer word + tokenId word).
    const snapshotCalldata = seenData.find((d) =>
      d.slice(0, 10).toLowerCase().startsWith(snapshotSel.slice(0, 10)),
    );
    assert.ok(snapshotCalldata, "paymentSnapshot call must have been made");
    assert.equal(
      snapshotCalldata.slice(10, 74),
      "000000000000000000000000" + payer.slice(2),
      "payer must be forwarded to paymentSnapshot",
    );
  });

  test("one read failing → 200 with partial data + errors entry", async () => {
    const partial: CallExpectation[] = [
      { selector: snapshotSel, returns: encodeSnapshot() },
      {
        selector: healthSel,
        returns: new Error("execution reverted"),
      },
    ];
    const app = buildApp(makeFakeProvider(partial), makeConfig());
    const { status, body } = await getState(app);
    assert.equal(status, 200);
    assert.ok(body.payer, "snapshot still returned");
    assert.equal(body.vaultHealth, undefined);
    const errors = body.errors as Record<string, string>;
    assert.ok(errors);
    assert.match(errors.vaultHealthOf!, /revert/);
  });

  test("both reads failing → 502", async () => {
    const failing: CallExpectation[] = [
      {
        selector: snapshotSel,
        returns: new Error("execution reverted"),
      },
      { selector: healthSel, returns: new Error("execution reverted") },
    ];
    const app = buildApp(makeFakeProvider(failing), makeConfig());
    const { status } = await getState(app);
    assert.equal(status, 502);
  });

  test("unset paymentProcessor address → 503 ADDRESS_NOT_CONFIGURED", async () => {
    const app = buildApp(makeFakeProvider(expectations), makeConfig(false));
    const { status, body } = await getState(app);
    assert.equal(status, 503);
    assert.equal(body.code, "ADDRESS_NOT_CONFIGURED");
  });

  test("non-numeric id → 400", async () => {
    const app = buildApp(makeFakeProvider(expectations), makeConfig());
    const { status } = await getState(app, "/v1/agents/abc/state");
    assert.equal(status, 400);
  });
});
