import {
  encodeFunctionData,
  decodeFunctionResult,
  isAddress,
  parseAbi,
} from "viem";

/** Canonical Multicall3 deployment (https://github.com/mds1/multicall#deployment):
 *  identical CREATE2 address on 590+ chains, including 0G Galileo testnet (16602) and
 *  Aristotle mainnet (16661). Multicall3 is stateless and holds no funds — security
 *  posture per the canonical README: never approve it to spend tokens, and it should
 *  never custody anything after a transaction ends. Read aggregation only. */
export const MULTICALL3_ADDRESS =
  "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

/** Human-readable aggregate3 ABI slice (constant-function batching).
 *  allowFailure=true per call → per-item success flags instead of a whole-batch revert. */
export const MULTICALL3_ABI = [
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)",
] as const;

const MULTICALL3_ABI_PARSED = parseAbi(MULTICALL3_ABI);

export interface AggregateCall {
  address: `0x${string}`;
  abi: readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
}

export interface AggregateResult {
  /** true when the call succeeded and decoded cleanly */
  success: boolean;
  /** decoded return value on success; undefined on failure/revert */
  result?: unknown;
  error?: Error;
}

function isHex(v: unknown): v is `0x${string}` {
  return typeof v === "string" && /^0x[0-9a-fA-F]*$/.test(v);
}

function toViemAbi(abi: readonly unknown[]): readonly unknown[] {
  // Human-readable string ABIs must be parsed before viem accepts them — same
  // normalization rule as apps/frontend/src/abi/addresses.ts `toViemAbi`.
  return abi.length > 0 && typeof abi[0] === "string"
    ? parseAbi(abi as readonly string[])
    : abi;
}

/** Minimal structural slice of viem's PublicClient — only readContract is needed, so
 *  callers can pass a PublicClient/WalletClient view or a mock in tests. */
export interface ReadClient {
  readContract: (args: {
    address: `0x${string}`;
    abi: readonly unknown[];
    functionName: string;
    args: readonly unknown[];
  }) => Promise<unknown>;
}

/** Batch read-only contract calls through the canonical Multicall3 aggregate3 —
 *  N reads collapse into ONE RPC round-trip. The client must be bound to a chain
 *  where Multicall3 is deployed (see MULTICALL3_ADDRESS note). Per-call
 *  allowFailure=true: an individual revert surfaces as `{success:false, error}` and
 *  never poisons the rest of the batch — matching wagmi useReadContracts semantics.
 *  Failures are data, not exceptions, so callers keep their fallback/default values. */
export async function aggregateReads(
  client: ReadClient,
  calls: readonly AggregateCall[],
): Promise<AggregateResult[]> {
  if (calls.length === 0) return [];
  if (!isAddress(MULTICALL3_ADDRESS)) {
    throw new Error("MULTICALL3_ADDRESS is not a valid address");
  }

  const results = (await client.readContract({
    address: MULTICALL3_ADDRESS,
    abi: MULTICALL3_ABI_PARSED,
    functionName: "aggregate3",
    args: [
      calls.map((call) => ({
        target: call.address,
        allowFailure: true,
        callData: encodeFunctionData({
          abi: toViemAbi(call.abi),
          functionName: call.functionName,
          args: call.args ?? [],
        }),
      })),
    ],
  })) as unknown;

  if (!Array.isArray(results) || results.length !== calls.length) {
    throw new Error("Multicall3 aggregate3 returned malformed results");
  }
  return results.map((entry, i): AggregateResult => {
    const call = calls[i]!;
    if (
      !entry ||
      typeof entry !== "object" ||
      !("success" in entry) ||
      !("returnData" in entry)
    ) {
      return { success: false, error: new Error("malformed multicall result") };
    }
    const { success, returnData } = entry as {
      success: unknown;
      returnData: unknown;
    };
    if (success !== true) {
      return {
        success: false,
        error: new Error(`call reverted: ${call.functionName}`),
      };
    }
    if (!isHex(returnData) || returnData === "0x") {
      return { success: true, result: undefined };
    }
    try {
      return {
        success: true,
        result: decodeFunctionResult({
          abi: toViemAbi(call.abi),
          functionName: call.functionName,
          data: returnData,
        } as Parameters<typeof decodeFunctionResult>[0]),
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err : new Error("decode failed"),
      };
    }
  });
}
