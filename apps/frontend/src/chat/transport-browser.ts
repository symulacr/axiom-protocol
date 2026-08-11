import { createSession, runTool } from "@axiom/chat-runtime";
import type { ToolChain, ToolRuntime } from "@axiom/chat-runtime";
import { parseAbi } from "viem";
import type { Abi } from "viem";
import { BACKEND_URL, ORACLE_URL } from "../config/env.js";
import { apiKeyHeader } from "../utils/apiFetch.js";
import {
  getAxiomAgentNftAddress,
  getAxiomStrategyVaultAddress,
} from "../abi/addresses.js";
import type { ToolContext } from "./tools.js";

// Hung skill/oracle fetches must not stall the agent loop forever; 60s ceiling per tool call.
const TOOL_FETCH_TIMEOUT_MS = 60_000;

export async function runBrowserTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const result = await runTool(name, args, buildBrowserRuntime(ctx));
  return result.content;
}

function toViemAbi(abi: readonly unknown[] | Abi): Abi {
  if (abi.length > 0 && typeof abi[0] === "string") {
    return parseAbi(abi as readonly string[]);
  }
  return abi as Abi;
}

function buildWallet(
  address: string | undefined,
  sendTransactionAsync:
    | ((args: {
        to: `0x${string}`;
        data?: `0x${string}`;
        value?: bigint;
      }) => Promise<`0x${string}`>)
    | undefined,
  writeContractAsync:
    | ((args: {
        address: `0x${string}`;
        abi: readonly unknown[];
        functionName: string;
        args: unknown[];
        value?: bigint;
      }) => Promise<`0x${string}`>)
    | undefined,
): NonNullable<ToolRuntime["wallet"]> | undefined {
  if (!address) return undefined;
  return {
    address: address.toLowerCase() as `0x${string}`,
    ...(sendTransactionAsync
      ? {
          signAndSend: async (calldata: {
            to: `0x${string}`;
            data?: `0x${string}`;
            value?: bigint;
          }) =>
            sendTransactionAsync({
              to: calldata.to,
              data: calldata.data,
              value: calldata.value,
            }),
        }
      : {}),
    ...(writeContractAsync
      ? {
          writeContract: async (args: {
            address: `0x${string}`;
            abi: readonly unknown[];
            functionName: string;
            args: unknown[];
            value?: bigint;
          }) =>
            writeContractAsync({
              address: args.address,
              abi: args.abi,
              functionName: args.functionName,
              args: [...args.args],
              value: args.value,
            }),
        }
      : {}),
  };
}

function buildBrowserRuntime(ctx: ToolContext): ToolRuntime {
  const publicClient = ctx.publicClient;
  const { address, sendTransactionAsync, writeContractAsync } = ctx;

  return {
    mode: "sign",
    oracleUrl: ORACLE_URL,
    http: {
      fetch: (path, init) => {
        let url = path;
        if (!path.startsWith("http")) {
          const suffix = path.startsWith("/") ? path : `/${path}`;
          url = `${BACKEND_URL}${suffix}`;
        }
        const body =
          init?.body &&
          typeof init.body === "object" &&
          !(init.body instanceof Uint8Array)
            ? JSON.stringify(init.body)
            : (init?.body as BodyInit | null | undefined);
        const timeoutSignal = AbortSignal.timeout(TOOL_FETCH_TIMEOUT_MS);
        return fetch(url, {
          method: init?.method,
          headers: {
            "content-type": "application/json",
            accept: "application/json",
            ...apiKeyHeader(),
            ...(init?.headers ?? {}),
          },
          body,
          signal: init?.signal
            ? AbortSignal.any([init.signal, timeoutSignal])
            : timeoutSignal,
        });
      },
    },
    chain: publicClient
      ? ({
          chainId: ctx.chainId,
          readContract: async (req) =>
            publicClient.readContract({
              address: req.address,
              abi: toViemAbi(req.abi),
              functionName: req.functionName as never,
              args: (req.args ?? []) as never,
            }),
          multicall: async (args) => {
            const results = await publicClient.multicall({
              contracts: args.contracts.map((c) => ({
                address: c.address,
                abi: toViemAbi(c.abi),
                functionName: c.functionName as never,
                args: (c.args ?? []) as never,
              })),
            });
            return results as { result?: unknown; error?: Error }[];
          },
        } as ToolChain)
      : undefined,
    wallet: buildWallet(address, sendTransactionAsync, writeContractAsync),
    session: createSession({
      chainId: ctx.chainId,
      walletAddress: ctx.address
        ? (ctx.address.toLowerCase() as `0x${string}` | undefined)
        : undefined,
      lastTokenId: ctx.lastTokenId,
      addresses: {
        vault: getAxiomStrategyVaultAddress(ctx.chainId),
        agentNft: getAxiomAgentNftAddress(ctx.chainId),
      },
    }),
  };
}
