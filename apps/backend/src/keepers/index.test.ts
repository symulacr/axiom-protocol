import { test, describe, beforeEach } from "bun:test";
import assert from "node:assert/strict";
import { Contract } from "ethers";
import {
  startKeeper,
  parseKeeperNonces,
  fetchProofUsedNonces,
} from "./index.js";
import { TEE_VERIFIER_ABI } from "@axiom/config/abis";
import type { BackendEnv } from "../env-schema.js";

type BackendEnvPatch = Partial<Record<keyof BackendEnv, unknown>>;

function fakeEnv(patch: BackendEnvPatch = {}): BackendEnv {
  return {
    AXIOM_KEEPER_MODE: "off",
    AXIOM_TEE_VERIFIER_ADDRESS: "0x0000000000000000000000000000000000000001",
    ...patch,
  } as unknown as BackendEnv;
}

/** Minimal provider stub: getFeeData (gas-cap path) + getBlockNumber (log-scan window). */
function fakeProvider(gasPriceGwei: number | null) {
  return {
    getFeeData: async () => ({
      gasPrice:
        gasPriceGwei === null ? null : BigInt(Math.round(gasPriceGwei * 1e9)),
    }),
    getBlockNumber: async () => 1_000_000,
  } as unknown as import("ethers").JsonRpcProvider;
}

const walletStub = {
  address: "0x0000000000000000000000000000000000000abc",
} as unknown as import("ethers").Wallet;

function recorder(calls: string[][]) {
  return {
    contract: {
      cleanExpiredProofs: async (nonces: string[]) => {
        calls.push(nonces);
      },
    },
  };
}

describe("startKeeper", () => {
  let calls: string[][];

  beforeEach(() => {
    calls = [];
  });

  test("mode OFF (default) starts nothing", () => {
    const handle = startKeeper({
      env: fakeEnv({ AXIOM_KEEPER_MODE: "off" }),
      verifier: recorder(calls),
    });
    assert.equal(handle, null);
    assert.equal(calls.length, 0);
  });

  test("unset mode behaves like OFF", () => {
    const env = {} as unknown as BackendEnv;
    assert.equal(startKeeper({ env, verifier: recorder(calls) }), null);
    assert.equal(calls.length, 0);
  });

  test("indexer mode sweeps on the interval (fake timers)", async () => {
    const realSetInterval = globalThis.setInterval;
    const realClearInterval = globalThis.clearInterval;
    let fired = 0;
    let fireCb: (() => void) | null = null;
    (globalThis as { setInterval: unknown }).setInterval = (
      cb: () => void,
      _ms: number,
    ) => {
      fireCb = cb;
      fired++;
      return {
        unref: () => {},
      } as unknown as ReturnType<typeof setInterval>;
    };
    (globalThis as { clearInterval: unknown }).clearInterval = () => {};
    try {
      const handle = startKeeper({
        env: fakeEnv({
          AXIOM_KEEPER_MODE: "indexer",
          AXIOM_KEEPER_NONCES: "0x01",
        }),
        provider: fakeProvider(null),
        signer: walletStub,
        verifier: recorder(calls),
      });
      assert.ok(handle, "indexer mode must return a handle");
      assert.equal(fired, 1, "exactly one interval armed");
      assert.equal(calls.length, 0, "no sweep before the first tick");
      fireCb!();
      await new Promise((r) => setTimeout(r, 0));
      assert.equal(calls.length, 1, "tick triggered exactly one sweep");
      assert.deepEqual(calls[0], [`0x${"01".padStart(64, "0")}`]);
      handle.stop();
    } finally {
      globalThis.setInterval = realSetInterval;
      globalThis.clearInterval = realClearInterval;
    }
  });

  test("gas cap: sweep skipped when gasPrice exceeds cap", async () => {
    const handle = startKeeper({
      env: fakeEnv({
        AXIOM_KEEPER_MODE: "indexer",
        AXIOM_KEEPER_GAS_CAP_GWEI: 5,
        AXIOM_KEEPER_NONCES: "0x01",
      }),
      provider: fakeProvider(50),
      signer: walletStub,
      verifier: recorder(calls),
    });
    assert.equal(await handle!.sweepOnce(), 0);
    assert.equal(calls.length, 0, "no tx when above the gas cap");
  });

  test("gas cap: RPC fee-data failure treated as within cap", async () => {
    const failingProvider = {
      getFeeData: async () => {
        throw new Error("rpc down");
      },
    } as unknown as import("ethers").JsonRpcProvider;
    const handle = startKeeper({
      env: fakeEnv({
        AXIOM_KEEPER_MODE: "indexer",
        AXIOM_KEEPER_GAS_CAP_GWEI: 5,
        AXIOM_KEEPER_NONCES: "0x01",
      }),
      provider: failingProvider,
      signer: walletStub,
      verifier: recorder(calls),
    });
    assert.equal(await handle!.sweepOnce(), 1);
  });

  test("gas cap: sweep proceeds within cap and clamps batch to 256", async () => {
    const nonces = Array.from(
      { length: 300 },
      (_, i) => `0x${i.toString(16).padStart(64, "0")}`,
    );
    const handle = startKeeper({
      env: fakeEnv({
        AXIOM_KEEPER_MODE: "indexer",
        AXIOM_KEEPER_GAS_CAP_GWEI: 100,
        AXIOM_KEEPER_NONCES: nonces.join(","),
      }),
      provider: fakeProvider(10),
      signer: walletStub,
      verifier: recorder(calls),
    });
    assert.equal(
      await handle!.sweepOnce(),
      256,
      "batch clamped to the on-chain ceiling",
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.length, 256);
  });

  test("error tolerance: a failed sweep resolves 0 instead of throwing", async () => {
    const handle = startKeeper({
      env: fakeEnv({
        AXIOM_KEEPER_MODE: "indexer",
        AXIOM_KEEPER_NONCES: "0x02",
      }),
      provider: fakeProvider(null),
      signer: walletStub,
      verifier: {
        contract: {
          cleanExpiredProofs: async () => {
            throw new Error("execution reverted: gas hog");
          },
        },
      },
    });
    assert.equal(
      await handle!.sweepOnce(),
      0,
      "chain error must not propagate",
    );
    // The interval would keep firing: sweepOnce is still callable.
    assert.equal(await handle!.sweepOnce(), 0);
  });

  test("empty candidate list skips the tx entirely", async () => {
    const handle = startKeeper({
      env: fakeEnv({ AXIOM_KEEPER_MODE: "indexer" }),
      provider: fakeProvider(null),
      signer: walletStub,
      verifier: recorder(calls),
    });
    assert.equal(await handle!.sweepOnce(), 0);
    assert.equal(calls.length, 0);
  });

  test("missing verifier address refuses to start", () => {
    const handle = startKeeper({
      env: fakeEnv({
        AXIOM_KEEPER_MODE: "indexer",
        AXIOM_TEE_VERIFIER_ADDRESS: undefined,
      }),
      provider: fakeProvider(null),
      signer: walletStub,
      verifier: recorder(calls),
    });
    assert.equal(handle, null);
  });

  test("stub modes run passive: no interval, sweepOnce is manual-trigger only", async () => {
    for (const mode of ["chainlink", "gelato"] as const) {
      calls = [];
      const handle = startKeeper({
        env: fakeEnv({ AXIOM_KEEPER_MODE: mode, AXIOM_KEEPER_NONCES: "0x03" }),
        provider: fakeProvider(null),
        signer: walletStub,
        verifier: recorder(calls),
      });
      assert.ok(handle, `${mode} returns a passive handle`);
      assert.equal(await handle.sweepOnce(), 1);
      assert.equal(calls.length, 1);
      handle.stop(); // no-op, must not throw
    }
  });
});

describe("parseKeeperNonces", () => {
  test("normalizes minimal hex to 32-byte canonical form and filters garbage", () => {
    const out = parseKeeperNonces("0x01, ,, 0x2");
    assert.equal(out.length, 2);
    assert.equal(out[0], `0x${"01".padStart(64, "0")}`);
    assert.equal(out[1], `0x${"2".padStart(64, "0")}`);
  });

  test("empty input yields empty batch", () => {
    assert.deepEqual(parseKeeperNonces(undefined), []);
    assert.deepEqual(parseKeeperNonces(""), []);
  });
});

/** Raw ethers Contract stub whose queryFilter replays canned ProofUsed logs. */
function rawContractWithLogs(nonces: string[], opts: { fail?: boolean } = {}) {
  const iface = new Contract(
    "0x0000000000000000000000000000000000000001",
    TEE_VERIFIER_ABI,
  ).interface;
  return {
    interface: iface,
    queryFilter: async () => {
      if (opts.fail) throw new Error("rpc log scan down");
      return nonces.map((n) => ({ args: [n, 123456n] })) as never[];
    },
  } as unknown as Contract;
}

const pad = (n: string) => `0x${n.replace(/^0x/, "").padStart(64, "0")}`;

describe("ProofUsed log discovery (wave 1B)", () => {
  let calls: string[][];

  beforeEach(() => {
    calls = [];
  });

  test("log-derived candidates drive the sweep when logs exist", async () => {
    const handle = startKeeper({
      env: fakeEnv({
        AXIOM_KEEPER_MODE: "indexer",
        AXIOM_KEEPER_NONCES: "0xdeadbeef",
      }),
      provider: fakeProvider(null),
      signer: walletStub,
      verifier: recorder(calls),
      verifierRaw: rawContractWithLogs([pad("0xa1"), pad("0xa2")]),
    });
    assert.equal(await handle!.sweepOnce(), 2);
    assert.deepEqual(calls[0], [pad("0xa1"), pad("0xa2")]);
  });

  test("log candidates dedupe and clamp to the 256 batch ceiling", async () => {
    const nonces = Array.from({ length: 300 }, (_, i) => pad(i.toString(16)));
    // 300 unique + 5 duplicate tails → 300 unique total after dedupe.
    nonces.push(...nonces.slice(0, 5));
    const handle = startKeeper({
      env: fakeEnv({ AXIOM_KEEPER_MODE: "indexer" }),
      provider: fakeProvider(null),
      signer: walletStub,
      verifier: recorder(calls),
      verifierRaw: rawContractWithLogs(nonces),
    });
    assert.equal(await handle!.sweepOnce(), 256);
    assert.equal(calls[0]!.length, 256);
  });

  test("empty log stream falls back to AXIOM_KEEPER_NONCES", async () => {
    const handle = startKeeper({
      env: fakeEnv({
        AXIOM_KEEPER_MODE: "indexer",
        AXIOM_KEEPER_NONCES: "0x02",
      }),
      provider: fakeProvider(null),
      signer: walletStub,
      verifier: recorder(calls),
      verifierRaw: rawContractWithLogs([]),
    });
    assert.equal(await handle!.sweepOnce(), 1);
    assert.deepEqual(calls[0], [pad("0x02")]);
  });

  test("failed log scan falls back to AXIOM_KEEPER_NONCES", async () => {
    const handle = startKeeper({
      env: fakeEnv({
        AXIOM_KEEPER_MODE: "indexer",
        AXIOM_KEEPER_NONCES: "0x03",
      }),
      provider: fakeProvider(null),
      signer: walletStub,
      verifier: recorder(calls),
      verifierRaw: rawContractWithLogs([], { fail: true }),
    });
    assert.equal(await handle!.sweepOnce(), 1);
    assert.deepEqual(calls[0], [pad("0x03")]);
  });

  test("stub verifier without verifierRaw keeps the env fallback path", async () => {
    const handle = startKeeper({
      env: fakeEnv({
        AXIOM_KEEPER_MODE: "indexer",
        AXIOM_KEEPER_NONCES: "0x04",
      }),
      provider: fakeProvider(null),
      signer: walletStub,
      verifier: recorder(calls),
    });
    assert.equal(await handle!.sweepOnce(), 1);
    assert.deepEqual(calls[0], [pad("0x04")]);
  });
});

describe("fetchProofUsedNonces", () => {
  test("dedupes repeated nonce logs and canonicalizes hex", async () => {
    const raw = rawContractWithLogs([
      pad("0x1"),
      pad("0x2"),
      pad("0x1"),
      pad("0x03"),
    ]);
    const out = await fetchProofUsedNonces(raw, 0, 100);
    assert.deepEqual(out, [pad("0x1"), pad("0x2"), pad("0x03")]);
  });
});
