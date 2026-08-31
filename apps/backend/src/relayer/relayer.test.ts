import { test, describe } from "bun:test";
import assert from "node:assert/strict";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { Wallet, verifyTypedData } from "ethers";
import {
  GAS_TANK_FORWARD_REQUEST_TYPES,
  GAS_TANK_DOMAIN_NAME,
  GAS_TANK_DOMAIN_VERSION,
} from "@axiom/config/eip712";
import { createRelayerQueue, getQueueStats } from "./queue.js";
import { SponsorGate } from "./sponsor.js";
import { registerRelayerRoutes, tankResponse } from "../routers/relayer.js";
import type { ServerConfig } from "../config-types.js";
import type { RelaySubmitter } from "./queue.js";

const CHAIN_ID = 16602;
const GAS_TANK_ADDRESS = ("0x" + "ee".repeat(20)) as `0x${string}`;

function makeConfig(gasTank: `0x${string}` | undefined): ServerConfig {
  return {
    bind: "127.0.0.1",
    port: 0,
    evmRpc: "http://127.0.0.1:1",
    signer: new Wallet("0x" + "44".repeat(32)),
    addresses: {
      agentNft: ("0x" + "01".repeat(20)) as `0x${string}`,
      vault: ("0x" + "02".repeat(20)) as `0x${string}`,
      verifier: ("0x" + "03".repeat(20)) as `0x${string}`,
      ...(gasTank ? { gasTank } : {}),
    },
    env: { AXIOM_CHAIN_ID: CHAIN_ID } as ServerConfig["env"],
  };
}

/** Build a signed sponsor body with an EIP-712 ForwardRequest (domain AxiomGasTank/1). */
async function signedBody(opts?: {
  userPk?: string;
  maxGasCost?: string;
  nonce?: string;
  deadline?: number;
  target?: string;
  mismatchUser?: boolean;
}) {
  const userWallet = new Wallet(opts?.userPk ?? "0x" + "11".repeat(32));
  const request = {
    user: (opts?.mismatchUser
      ? "0x" + "99".repeat(20)
      : userWallet.address) as `0x${string}`,
    target: (opts?.target ?? "0x" + "ab".repeat(20)) as `0x${string}`,
    data: "0xdeadbeef",
    maxGasCost: BigInt(opts?.maxGasCost ?? "500000000000000"),
    nonce: BigInt(opts?.nonce ?? "0"),
    deadline: BigInt(opts?.deadline ?? Math.floor(Date.now() / 1000) + 300),
  };
  const signature = await userWallet.signTypedData(
    {
      name: GAS_TANK_DOMAIN_NAME,
      version: GAS_TANK_DOMAIN_VERSION,
      chainId: CHAIN_ID,
      verifyingContract: GAS_TANK_ADDRESS,
    },
    GAS_TANK_FORWARD_REQUEST_TYPES,
    request,
  );
  return {
    body: {
      user: request.user,
      target: request.target,
      data: request.data,
      maxGasCost: request.maxGasCost.toString(),
      nonce: request.nonce.toString(),
      deadline: request.deadline.toString(),
      signature,
    },
    request,
    signature,
    userAddress: userWallet.address.toLowerCase(),
  };
}

// Recovery parity guard: ethers must recover the signer we signed with.
test("EIP-712 recovery parity: verifyTypedData recovers the signing wallet", async () => {
  const { request, signature, userAddress } = await signedBody();
  const recovered = verifyTypedData(
    {
      name: GAS_TANK_DOMAIN_NAME,
      version: GAS_TANK_DOMAIN_VERSION,
      chainId: CHAIN_ID,
      verifyingContract: GAS_TANK_ADDRESS,
    },
    GAS_TANK_FORWARD_REQUEST_TYPES,
    request,
    signature,
  );
  assert.equal(recovered.toLowerCase(), userAddress);
});

interface Harness {
  port: number;
  close: () => Promise<void>;
  queue: ReturnType<typeof createRelayerQueue>;
  gate: SponsorGate;
  submitted: string[];
  submitError: string | null;
  simulateError: string | null;
}

/** Stand up the relayer routes with mocked simulate/submit legs (no RPC). */
async function buildApp(gasTank: `0x${string}` | undefined): Promise<Harness> {
  const h: Harness = {
    port: 0,
    close: async () => {},
    queue: createRelayerQueue(),
    gate: new SponsorGate(),
    submitted: [],
    submitError: null,
    simulateError: null,
  };
  const app = express();
  app.use(express.json());
  registerRelayerRoutes(
    app,
    makeConfig(gasTank),
    {} as never,
    // deps omitted entirely when the GasTank is unset: mirrors a mode=off boot
    // (routes still mount and must 503, not 500).
    gasTank
      ? {
          queue: h.queue,
          gate: h.gate,
          reconcile: {} as never,
          gasTankAddress: gasTank,
          relayerAddress: "0x" + "dd".repeat(20),
          simulate: async () => {
            if (h.simulateError) throw new Error(h.simulateError);
          },
          submit: (async (record) => {
            if (h.submitError) throw new Error(h.submitError);
            h.submitted.push(record.id);
            return ("0x" + "aa".repeat(32)) as `0x${string}`;
          }) as RelaySubmitter,
        }
      : undefined,
  );
  // Mirror server.ts's terminal error mapping: ZodError → 400 VALIDATION_ERROR.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError) {
      res
        .status(400)
        .json({ error: "Validation failed", code: "VALIDATION_ERROR" });
      return;
    }
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : "internal" });
  });
  const server = app.listen(0);
  h.port = (server.address() as { port: number }).port;
  h.close = () => new Promise((resolve) => server.close(() => resolve()));
  return h;
}

async function post(
  port: number,
  path: string,
  body: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    status: res.status,
    json: (await res.json()) as Record<string, unknown>,
  };
}

async function get(
  port: number,
  path: string,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  return {
    status: res.status,
    json: (await res.json()) as Record<string, unknown>,
  };
}

describe("POST /v1/relayer/sponsor", () => {
  test("202s a valid signed request and queues it", async () => {
    const h = await buildApp(GAS_TANK_ADDRESS);
    try {
      const { body } = await signedBody();
      const { status, json } = await post(h.port, "/v1/relayer/sponsor", body);
      assert.equal(status, 202);
      assert.equal(json.ok, true);
      assert.equal(json.sponsored, true);
      assert.equal(json.nonce, "0");
      assert.ok(typeof json.id === "string");
      assert.equal(h.queue.all().length, 1);
      assert.equal(h.queue.all()[0]?.status, "queued");
    } finally {
      await h.close();
    }
  });

  test("rejects a signature that does not recover to the declared user", async () => {
    const h = await buildApp(GAS_TANK_ADDRESS);
    try {
      const { body } = await signedBody({ mismatchUser: true });
      const { status, json } = await post(h.port, "/v1/relayer/sponsor", body);
      assert.equal(status, 400);
      assert.equal(json.code, "INVALID_SIGNER");
    } finally {
      await h.close();
    }
  });

  test("rejects an expired deadline before queueing", async () => {
    const h = await buildApp(GAS_TANK_ADDRESS);
    try {
      const { body } = await signedBody({
        deadline: Math.floor(Date.now() / 1000) - 10,
      });
      const { status, json } = await post(h.port, "/v1/relayer/sponsor", body);
      assert.equal(status, 400);
      assert.equal(json.code, "DEADLINE_PASSED");
    } finally {
      await h.close();
    }
  });

  test("TankExhausted simulation revert → 402 TANK_EXHAUSTED (typed response)", async () => {
    const h = await buildApp(GAS_TANK_ADDRESS);
    try {
      h.simulateError = "execution reverted: custom error 0xTankExhausted()";
      const { body } = await signedBody();
      const { status, json } = await post(h.port, "/v1/relayer/sponsor", body);
      assert.equal(status, 402);
      assert.equal(json.code, "TANK_EXHAUSTED");
    } finally {
      await h.close();
    }
  });

  test("ReserveExhausted simulation revert → 503 RESERVE_EXHAUSTED (lane A error name)", async () => {
    const h = await buildApp(GAS_TANK_ADDRESS);
    try {
      h.simulateError = "execution reverted: custom error 0xReserveExhausted()";
      const { body } = await signedBody();
      const { status, json } = await post(h.port, "/v1/relayer/sponsor", body);
      assert.equal(status, 503);
      assert.equal(json.code, "RESERVE_EXHAUSTED");
    } finally {
      await h.close();
    }
  });

  test("maxGasCost above the sponsor ceiling → 402 MAX_GAS_COST_EXCEEDED", async () => {
    const h = await buildApp(GAS_TANK_ADDRESS);
    try {
      const { body } = await signedBody({ maxGasCost: "2000000000000000" });
      const { status, json } = await post(h.port, "/v1/relayer/sponsor", body);
      assert.equal(status, 402);
      assert.equal(json.code, "MAX_GAS_COST_EXCEEDED");
    } finally {
      await h.close();
    }
  });

  test("per-user token bucket: burst beyond the rate limit → 429 SPONSOR_RATE_LIMITED", async () => {
    const h = await buildApp(GAS_TANK_ADDRESS);
    try {
      const pk = "0x" + "22".repeat(32);
      let limited = 0;
      for (let i = 0; i < 8; i++) {
        const { body } = await signedBody({ userPk: pk, nonce: String(i) });
        const { status, json } = await post(
          h.port,
          "/v1/relayer/sponsor",
          body,
        );
        if (status === 429 && json.code === "SPONSOR_RATE_LIMITED")
          limited += 1;
        else {
          assert.equal(status, 202);
          // Confirm inflight records so the inflight cap doesn't pre-empt the bucket test.
          const rec = h.queue.all().find((r) => r.request.nonce === BigInt(i));
          if (rec) h.queue.markConfirmed(rec.id);
        }
      }
      assert.ok(limited > 0, "expected the bucket to throttle the burst");
    } finally {
      await h.close();
    }
  });

  test("per-user inflight cap → 429 SPONSOR_INFLIGHT_LIMIT", async () => {
    const h = await buildApp(GAS_TANK_ADDRESS);
    try {
      const pk = "0x" + "33".repeat(32);
      const bodies: Array<Awaited<ReturnType<typeof signedBody>>["body"]> = [];
      for (let i = 0; i < 3; i++) {
        bodies.push((await signedBody({ userPk: pk, nonce: String(i) })).body);
      }
      const first = await post(h.port, "/v1/relayer/sponsor", bodies[0]);
      assert.equal(first.status, 202);
      const second = await post(h.port, "/v1/relayer/sponsor", bodies[1]);
      assert.equal(second.status, 202);
      const third = await post(h.port, "/v1/relayer/sponsor", bodies[2]);
      assert.equal(third.status, 429);
      assert.equal(third.json.code, "SPONSOR_INFLIGHT_LIMIT");
    } finally {
      await h.close();
    }
  });

  test("schema validation: malformed body → 400 VALIDATION_ERROR", async () => {
    const h = await buildApp(GAS_TANK_ADDRESS);
    try {
      const res = await fetch(`http://127.0.0.1:${h.port}/v1/relayer/sponsor`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user: "not-an-address" }),
      });
      assert.equal(res.status, 400);
      const json = (await res.json()) as Record<string, unknown>;
      assert.equal(json.error, "Validation failed");
      assert.equal(json.code, "VALIDATION_ERROR");
    } finally {
      await h.close();
    }
  });

  test("broadcast failure dead-letters the record", async () => {
    const h = await buildApp(GAS_TANK_ADDRESS);
    try {
      h.submitError = "insufficient funds for gas";
      const { body } = await signedBody();
      const { status } = await post(h.port, "/v1/relayer/sponsor", body);
      assert.equal(status, 202);
      await new Promise((r) => setTimeout(r, 20));
      const record = h.queue.all()[0];
      assert.equal(record?.status, "dead-lettered");
      assert.match(record?.lastError ?? "", /insufficient funds/);
    } finally {
      await h.close();
    }
  });
});

describe("GET /v1/relayer/tank/:id", () => {
  test("503s ADDRESS_NOT_CONFIGURED when the GasTank address is unset", async () => {
    const h = await buildApp(undefined);
    try {
      const { status, json } = await get(
        h.port,
        `/v1/relayer/tank/${"0x" + "12".repeat(20)}`,
      );
      assert.equal(status, 503);
      assert.equal(json.code, "ADDRESS_NOT_CONFIGURED");
    } finally {
      await h.close();
    }
  });
});

describe("GET /v1/relayer/status", () => {
  test("reports mode off + empty queue when relayer is unset", async () => {
    const app = express();
    app.use(express.json());
    registerRelayerRoutes(app, makeConfig(undefined), {} as never, undefined);
    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;
    try {
      const { status, json } = await get(port, "/v1/relayer/status");
      assert.equal(status, 200);
      assert.equal(json.mode, "off");
      assert.equal(json.address, null);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  test("reports mode on + live queue counts when wired", async () => {
    const h = await buildApp(GAS_TANK_ADDRESS);
    try {
      const { body } = await signedBody();
      await post(h.port, "/v1/relayer/sponsor", body);
      const { status, json } = await get(h.port, "/v1/relayer/status");
      assert.equal(status, 200);
      assert.equal(json.mode, "on");
      assert.equal(json.address, GAS_TANK_ADDRESS);
      const queue = json.queue as Record<string, number>;
      assert.equal(queue.queued, 1);
    } finally {
      await h.close();
    }
  });
});

describe("relayer queue", () => {
  test("enqueue rejects beyond the inflight cap and returns null", () => {
    const queue = createRelayerQueue();
    const mk = (nonce: bigint) => ({
      request: {
        user: ("0x" + "aa".repeat(20)) as `0x${string}`,
        target: ("0x" + "bb".repeat(20)) as `0x${string}`,
        data: "0xdeadbeef" as `0x${string}`,
        maxGasCost: 1n,
        nonce,
        deadline: 9999999999n,
      },
      userSig: "0x00" as `0x${string}`,
      user: "0x" + "aa".repeat(20),
    });
    assert.ok(queue.enqueue(mk(0n)));
    assert.ok(queue.enqueue(mk(1n)));
    assert.equal(queue.enqueue(mk(2n)), null);
  });

  test("reservedWei sums unconfirmed maxGasCost per user (risk §5 admission accounting)", () => {
    const queue = createRelayerQueue();
    const mk = (nonce: bigint, max: bigint) => ({
      request: {
        user: ("0x" + "aa".repeat(20)) as `0x${string}`,
        target: ("0x" + "bb".repeat(20)) as `0x${string}`,
        data: "0xdeadbeef" as `0x${string}`,
        maxGasCost: max,
        nonce,
        deadline: 9999999999n,
      },
      userSig: "0x00" as `0x${string}`,
      user: "0x" + "aa".repeat(20),
    });
    queue.enqueue(mk(0n, 100n));
    queue.enqueue(mk(1n, 250n));
    assert.equal(queue.reservedWei("0x" + "aa".repeat(20)), 350n);
    const [r0, r1] = queue.all();
    queue.markConfirmed(r0!.id);
    assert.equal(queue.reservedWei("0x" + "aa".repeat(20)), 250n);
    queue.markFailed(r1!.id, "boom");
    assert.equal(queue.reservedWei("0x" + "aa".repeat(20)), 0n);
    const stats = getQueueStats(queue);
    assert.equal(stats.confirmed, 1);
    assert.equal(stats.deadLettered, 1);
  });

  test("takeBatch drains queued FIFO and marks submitted", () => {
    const queue = createRelayerQueue();
    const mk = (nonce: bigint) => ({
      request: {
        user: ("0x" + "aa".repeat(20)) as `0x${string}`,
        target: ("0x" + "bb".repeat(20)) as `0x${string}`,
        data: "0xdeadbeef" as `0x${string}`,
        maxGasCost: 1n,
        nonce,
        deadline: 9999999999n,
      },
      userSig: "0x00" as `0x${string}`,
      user: "0x" + "aa".repeat(20),
    });
    // Two enqueued (the per-user inflight cap admits exactly 2).
    assert.ok(queue.enqueue(mk(0n)));
    assert.ok(queue.enqueue(mk(1n)));
    const batch = queue.takeBatch(2);
    assert.equal(batch.length, 2);
    assert.equal(batch[0]?.request.nonce, 0n);
    assert.equal(batch[1]?.request.nonce, 1n);
    assert.equal(batch[0]?.status, "submitted");
    assert.equal(queue.all().filter((r) => r.status === "queued").length, 0);

    // Distinct users bypass the per-user cap; takeBatch(1) drains FIFO one at a time.
    const q2 = createRelayerQueue();
    const other = (nonce: bigint) => ({
      ...mk(nonce),
      user: "0x" + "bb".repeat(20),
    });
    q2.enqueue(mk(0n));
    q2.enqueue(mk(1n));
    q2.enqueue(other(2n));
    const first = q2.takeBatch(1);
    assert.equal(first.length, 1);
    assert.equal(first[0]?.request.nonce, 0n);
    assert.equal(q2.all().filter((r) => r.status === "queued").length, 2);
  });
});

describe("SponsorGate", () => {
  test("maxGasCost ceiling rejects above the configured wei cap", () => {
    const gate = new SponsorGate();
    assert.ok(gate.allowsMaxGasCost(500_000_000_000_000n));
    assert.ok(!gate.allowsMaxGasCost(2_000_000_000_000_000n));
  });

  test("inflight cap check", () => {
    const gate = new SponsorGate();
    assert.ok(gate.allowsInflight(0));
    assert.ok(gate.allowsInflight(1));
    assert.ok(!gate.allowsInflight(2));
  });
});

describe("tankResponse shape", () => {
  test("derives grantsLeft + opsLeft from live reads (never hardcoded grant)", () => {
    const out = tankResponse("0xabc", {
      balance: 0.02e18,
      grants: 1n,
      grantsCap: 3n,
      gasGrant: 0.01e18,
      reserve: 1e18,
    });
    assert.equal(out.balance, "20000000000000000");
    assert.equal(out.grantsLeft, "2");
    assert.equal(out.opsLeft, 2);
    assert.equal(out.gasGrant, "10000000000000000");
  });
});
