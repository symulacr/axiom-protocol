import { test } from "bun:test";
import assert from "node:assert/strict";
import express from "express";
import { Interface, type JsonRpcProvider } from "ethers";
import { registerGovernanceRoutes } from "./governance.js";
import type { ServerConfig } from "../server.js";

// Router under test calls provider.call (via ethers Contract) against three
// contracts' timelock views; a scripted fake provider answers by matching
// (to, calldata selector) so both idle and pending shapes are mockable.

const NFT_ADDR = "0x" + "01".repeat(20);
const VERIFIER_ADDR = "0x" + "02".repeat(20);
const PROCESSOR_ADDR = "0x" + "03".repeat(20);

const PENDING_ADDR = "0xABaBaBaBABabABabAbAbABAbABabababaBaBABaB";
const ONE_DAY = 86_400n;

interface CallExpectation {
  to: string;
  selector: string;
  returns: string; // abi-encoded return payload
}

function selectorOf(signature: string): string {
  return Interface.from(["function " + signature]).getFunction(signature)!
    .selector;
}

function encodeUint(v: bigint): string {
  return Interface.from([
    "function f() view returns (uint256)",
  ]).encodeFunctionResult("f", [v]);
}

function encodeAddress(a: string): string {
  return Interface.from([
    "function f() view returns (address)",
  ]).encodeFunctionResult("f", [a]);
}

function makeFakeProvider(expectations: CallExpectation[]): JsonRpcProvider {
  return {
    call: async (tx: { to?: string; data?: string }) => {
      const to = tx.to?.toLowerCase();
      const selector = tx.data?.slice(0, 10).toLowerCase();
      const match = expectations.find(
        (e) => e.to.toLowerCase() === to && e.selector === selector,
      );
      if (!match) {
        throw new Error(
          `unexpected provider.call to ${tx.to} selector ${selector}`,
        );
      }
      return match.returns;
    },
  } as unknown as JsonRpcProvider;
}

function makeConfig(paymentProcessor?: `0x${string}`): ServerConfig {
  return {
    bind: "0.0.0.0",
    port: 0,
    evmRpc: "https://evmrpc.0g.ai",
    signer: {} as ServerConfig["signer"],
    addresses: {
      agentNft: NFT_ADDR as `0x${string}`,
      verifier: VERIFIER_ADDR as `0x${string}`,
      ...(paymentProcessor ? { paymentProcessor } : {}),
    },
  } as unknown as ServerConfig;
}

function buildApp(
  provider: JsonRpcProvider,
  config: ServerConfig,
): express.Express {
  const app = express();
  app.use(express.json());
  registerGovernanceRoutes(app, config, provider);
  return app;
}

async function getTimelock(
  app: express.Express,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const server = app.listen(0);
  try {
    const addr = server.address() as { port: number };
    const res = await fetch(
      `http://127.0.0.1:${addr.port}/v1/governance/timelock`,
    );
    return {
      status: res.status,
      body: (await res.json()) as Record<string, unknown>,
    };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("GET /v1/governance/timelock returns the idle shape for zero (unset) rotation views", async () => {
  // Every pending* view returns the zero address; idle short-circuits before
  // the *ExecutableAt read, so one zero address word per contract suffices.
  const zeroAddressWord = "0x" + "00".repeat(32);
  const idleExpectations: CallExpectation[] = [
    {
      to: NFT_ADDR,
      selector: selectorOf("pendingVerifier()"),
      returns: zeroAddressWord,
    },
    {
      to: VERIFIER_ADDR,
      selector: selectorOf("pendingSigner()"),
      returns: zeroAddressWord,
    },
    {
      to: PROCESSOR_ADDR,
      selector: selectorOf("pendingProtocolTreasury()"),
      returns: zeroAddressWord,
    },
  ];
  const { status, body } = await getTimelock(
    buildApp(
      makeFakeProvider(idleExpectations),
      makeConfig(PROCESSOR_ADDR as `0x${string}`),
    ),
  );
  assert.equal(status, 200);
  const entries = body.entries as Record<string, unknown>[];
  assert.equal(entries.length, 3, "all three rotation slots present");
  for (const e of entries) {
    assert.equal(e.pendingAddress, null, `${e.key} idle → pendingAddress null`);
    assert.equal(e.executableAt, null, `${e.key} idle → executableAt null`);
    assert.equal(e.status, "idle", `${e.key} idle → status idle`);
    assert.equal(e.executableIn, null, `${e.key} idle → executableIn null`);
    assert.equal(e.currentAddress, null);
  }
  assert.deepEqual(
    entries.map((e) => e.key),
    ["verifier", "teeSigner", "protocolTreasury"],
  );
});

test("GET /v1/governance/timelock returns the pending shape with executableAt + executableIn", async () => {
  const nowSec = 1_700_000_000;
  const execAt = BigInt(nowSec + 1000);
  const realNow = Date.now;
  Date.now = () => nowSec * 1000;
  try {
    const expectations: CallExpectation[] = [
      // verifier: pending (nonzero) + executableAt = now+1000s
      {
        to: NFT_ADDR,
        selector: selectorOf("pendingVerifier()"),
        returns: encodeAddress(PENDING_ADDR),
      },
      {
        to: NFT_ADDR,
        selector: selectorOf("pendingVerifierExecutableAt()"),
        returns: encodeUint(execAt),
      },
      // teeSigner: idle (no executableAt view exists on-chain)
      {
        to: VERIFIER_ADDR,
        selector: selectorOf("pendingSigner()"),
        returns: encodeAddress("0x" + "00".repeat(20)),
      },
      // protocolTreasury: pending + effectiveAt = now+86400s
      {
        to: PROCESSOR_ADDR,
        selector: selectorOf("pendingProtocolTreasury()"),
        returns: encodeAddress(PENDING_ADDR),
      },
      {
        to: PROCESSOR_ADDR,
        selector: selectorOf("pendingTreasuryEffectiveAt()"),
        returns: encodeUint(execAt + ONE_DAY),
      },
    ];
    const { status, body } = await getTimelock(
      buildApp(
        makeFakeProvider(expectations),
        makeConfig(PROCESSOR_ADDR as `0x${string}`),
      ),
    );
    assert.equal(status, 200);
    const entries = body.entries as Record<string, unknown>[];

    const verifier = entries.find((e) => e.key === "verifier")!;
    assert.equal(verifier.status, "pending");
    assert.equal(verifier.pendingAddress, PENDING_ADDR);
    assert.equal(verifier.executableAt, execAt.toString());
    assert.equal(verifier.executableIn, 1000);

    const signer = entries.find((e) => e.key === "teeSigner")!;
    assert.equal(signer.status, "idle");
    assert.equal(signer.executableAt, null);
    assert.equal(signer.executableIn, null);

    const treasury = entries.find((e) => e.key === "protocolTreasury")!;
    assert.equal(treasury.status, "pending");
    assert.equal(treasury.pendingAddress, PENDING_ADDR);
    assert.equal(treasury.executableAt, (execAt + ONE_DAY).toString());
    assert.equal(treasury.executableIn, 86_400 + 1000);
  } finally {
    Date.now = realNow;
  }
});

test("GET /v1/governance/timelock degrades a failing contract read to an idle entry instead of a 500", async () => {
  // NFT read throws → verifier entry falls back to idle; the other two slots
  // still read (their selectors must be present in the expectations).
  const failingProvider = {
    call: async () => {
      throw new Error("rpc down");
    },
  } as unknown as JsonRpcProvider;
  const { status, body } = await getTimelock(
    buildApp(failingProvider, makeConfig(PROCESSOR_ADDR as `0x${string}`)),
  );
  assert.equal(status, 200, "slot failure must not 500 the whole route");
  const entries = body.entries as Record<string, unknown>[];
  assert.equal(entries.length, 3);
  assert.ok(
    entries.every((e) => e.status === "idle"),
    "failing reads degrade to idle entries",
  );
});
