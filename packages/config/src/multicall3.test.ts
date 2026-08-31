import assert from "node:assert/strict";
import { describe, test } from "bun:test";
import {
  encodeFunctionData,
  decodeFunctionResult,
  encodeFunctionResult,
  parseAbi,
} from "viem";
import {
  MULTICALL3_ADDRESS,
  MULTICALL3_ABI,
  aggregateReads,
  type AggregateCall,
} from "./multicall3.js";

const ERC20_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

const TOKEN = "0x1111111111111111111111111111111111111111" as const;
const SPENDER = "0x2222222222222222222222222222222222222222" as const;
const PAYER = "0x3333333333333333333333333333333333333333" as const;

/** Mock viem-client slice that SERVES pre-baked responses the same way a real
 *  Multicall3 would: decodes the aggregate3 calldata, evaluates each inner call
 *  against a lookup, re-encodes (success, returnData) tuples. Exercises the real
 *  encode/decode round-trip of our helper against viem's aggregate3 ABI shape. */
function mockMulticallClient(
  lookup: (
    target: string,
    functionName: string,
    args: readonly unknown[],
  ) => unknown,
) {
  return {
    readContract: async ({ args }: { args: readonly unknown[] }) => {
      const calls = (
        args as [
          { target: string; allowFailure: boolean; callData: `0x${string}` }[],
        ]
      )[0];
      return calls.map((c) => {
        try {
          const decoded = decodeFunctionResult;
          void decoded;
          // Decode the inner call from its calldata using the erc20 test abi when applicable.
          const fn = innerSelector(c.callData);
          const value = lookup(c.target.toLowerCase(), fn.name, fn.args);
          const ret = encodeFunctionResultData(value);
          return { success: true, returnData: ret };
        } catch (err) {
          return { success: false, returnData: "0x" };
        }
      });
    },
  };
}

const BALANCE_OF_SELECTOR = "0x70a08231";
const ALLOWANCE_SELECTOR = "0xdd62ed3e";

function innerSelector(data: `0x${string}`): {
  name: string;
  args: readonly unknown[];
} {
  const sel = data.slice(0, 10);
  if (sel === BALANCE_OF_SELECTOR) {
    return { name: "balanceOf", args: ["0x" + data.slice(10 + 24)] };
  }
  if (sel === ALLOWANCE_SELECTOR) {
    return { name: "allowance", args: ["owner", "spender"] };
  }
  throw new Error("unknown selector " + sel);
}

function encodeFunctionResultData(value: unknown): `0x${string}` {
  return encodeFunctionResult({
    abi: ERC20_ABI,
    functionName: "balanceOf",
    result: value,
  });
}

describe("MULTICALL3_ADDRESS", () => {
  test("is the canonical CREATE2 deployment, lowercase-comparable", () => {
    assert.equal(
      MULTICALL3_ADDRESS.toLowerCase(),
      "0xca11bde05977b3631167028862be2a173976ca11",
    );
  });

  test("aggregate3 ABI slice is the documented read-batching signature", () => {
    assert.match(MULTICALL3_ABI[0], /^function aggregate3\(/);
    assert.match(MULTICALL3_ABI[0]!, /allowFailure/);
  });
});

describe("aggregateReads", () => {
  test("returns [] for zero calls without touching the client", async () => {
    let touched = false;
    const results = await aggregateReads(
      { readContract: async () => void (touched = true) },
      [],
    );
    assert.equal(results.length, 0);
    assert.equal(touched, false);
  });

  test("decodes batched reads: 2 erc20 calls → 1 RPC (aggregation win)", async () => {
    const client = mockMulticallClient((_target, name) => {
      if (name === "balanceOf") return 1000n;
      if (name === "allowance") return 42n;
      throw new Error("unexpected");
    });
    const calls: AggregateCall[] = [
      {
        address: TOKEN,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [PAYER],
      },
      {
        address: TOKEN,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [PAYER, SPENDER],
      },
    ];
    const results = await aggregateReads(client, calls);
    assert.equal(results.length, 2);
    assert.deepEqual(results[0], { success: true, result: 1000n });
    assert.deepEqual(results[1], { success: true, result: 42n });
  });

  test("a reverting call is a per-item failure, not a batch exception", async () => {
    const client = {
      readContract: async ({ args }: { args: readonly unknown[] }) => {
        const calls = (
          args as [
            {
              target: string;
              allowFailure: boolean;
              callData: `0x${string}`;
            }[],
          ]
        )[0];
        return calls.map((c, i) =>
          i === 1
            ? { success: false, returnData: "0x" }
            : { success: true, returnData: encodeFunctionResultData(7n) },
        );
      },
    };
    const results = await aggregateReads(client, [
      {
        address: TOKEN,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [PAYER],
      },
      {
        address: TOKEN,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [PAYER, SPENDER],
      },
    ]);
    assert.deepEqual(results[0], { success: true, result: 7n });
    assert.equal(results[1]!.success, false);
    assert.match(results[1]!.error!.message, /allowance/);
  });

  test("throws when the batch itself fails (client error propagates semantics)", async () => {
    const client = {
      readContract: async () => {
        throw new Error("rpc down");
      },
    };
    await assert.rejects(
      aggregateReads(client, [
        {
          address: TOKEN,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [PAYER],
        },
      ]),
      /rpc down/,
    );
  });
});
