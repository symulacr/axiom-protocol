import {
  createSession,
  humanAbi,
  runTool,
  type ToolChain,
  type ToolRuntime,
} from "@axiom/chat-runtime";
import type { Abi } from "viem";
import { API_KEY, BACKEND_URL } from "../config/env.js";
import {
  getAxiomAgentNftAddress,
  getAxiomStrategyVaultAddress,
} from "../abi/addresses.js";
import type { ToolContext } from "./tools.js";

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
    return humanAbi(abi as readonly string[]);
  }
  return abi as Abi;
}

function buildBrowserRuntime(ctx: ToolContext): ToolRuntime {
  const publicClient = ctx.publicClient;

  return {
    mode: "sign",
    http: {
      fetch: async (path, init) => {
        const url = path.startsWith("http")
          ? path
          : `${BACKEND_URL}${path.startsWith("/") ? path : `/${path}`}`;
        const body =
          init?.body && typeof init.body === "object" && !(init.body instanceof Uint8Array)
            ? JSON.stringify(init.body)
            : (init?.body as BodyInit | null | undefined);
        return fetch(url, {
          method: init?.method,
          headers: {
            "content-type": "application/json",
            accept: "application/json",
            ...(API_KEY ? { "x-api-key": API_KEY } : {}),
            ...(init?.headers ?? {}),
          },
          body,
          signal: init?.signal,
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
    wallet: ctx.address
      ? {
          address: ctx.address ? (ctx.address.toLowerCase() as `0x${string}`) : undefined,
          signAndSend: ctx.sendTransactionAsync
            ? async (calldata) =>
                ctx.sendTransactionAsync!({
                  to: calldata.to,
                  data: calldata.data,
                  value: calldata.value,
                })
            : undefined,
          writeContract: ctx.writeContractAsync
            ? async (w) =>
                ctx.writeContractAsync({
                  address: w.address,
                  abi: w.abi,
                  functionName: w.functionName,
                  args: [...w.args],
                  value: w.value,
                })
            : undefined,
        }
      : undefined,
    session: createSession({
      chainId: ctx.chainId,
      walletAddress: ctx.address ? (ctx.address.toLowerCase() as `0x${string}` | undefined) : undefined,
      lastTokenId: ctx.lastTokenId,
      addresses: {
        vault: getAxiomStrategyVaultAddress(ctx.chainId),
        agentNft: getAxiomAgentNftAddress(ctx.chainId),
      },
    }),
  };
}