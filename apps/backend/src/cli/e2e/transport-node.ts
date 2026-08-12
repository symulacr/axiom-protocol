import { ethers, type Wallet } from "ethers";
import {
  createSession,
  runTool,
  type ToolRuntime,
  type ToolResult,
} from "@axiom/chat-runtime";
import { getSharedProvider } from "../../provider.js";
export type E2eToolDeps = {
  backendUrl: string;
  operatorAddress: string;
  tokenId: string;
  vault: string;
  agentNft: string;
  chainId: number;
  operatorSigner?: Wallet;
};

function createNodeTransport(
  deps: E2eToolDeps,
  args: Record<string, unknown> = {},
): ToolRuntime {
  const provider = getSharedProvider();
  const sign = args.sign === true;
  const mode = sign ? "sign" : "encode-only";

  const http: ToolRuntime["http"] = {
    fetch: async (path, init) => {
      const url = path.startsWith("http")
        ? path
        : `${deps.backendUrl}${path.startsWith("/") ? path : `/${path}`}`;
      const body =
        init?.body && typeof init.body === "object" && !(init.body instanceof Uint8Array)
          ? JSON.stringify(init.body)
          : init?.body;
      return fetch(url, { ...init, body } as RequestInit);
    },
  };

  const chain: NonNullable<ToolRuntime["chain"]> = {
    chainId: deps.chainId,
    readContract: async (req) => {
      const c = new ethers.Contract(
        req.address,
        req.abi as ethers.InterfaceAbi,
        provider,
      );
      return c.getFunction(req.functionName)(...(req.args ?? []));
    },
    multicall: async (args) => {
      const results = await Promise.all(
        args.contracts.map(async (req) => {
          try {
            const c = new ethers.Contract(
              req.address,
              req.abi as ethers.InterfaceAbi,
              provider,
            );
            const result = await c.getFunction(req.functionName)(...(req.args ?? []));
            return { result };
          } catch (error) {
            return { error: error instanceof Error ? error : new Error(String(error)) };
          }
        }),
      );
      return results as { result?: unknown; error?: Error }[];
    },
  } as NonNullable<ToolRuntime["chain"]>;

  const wallet = deps.operatorSigner
    ? {
        address: deps.operatorSigner.address as `0x${string}`,
        signAndSend: async (calldata: {
          to: `0x${string}`;
          data: `0x${string}`;
          value?: bigint;
        }) => {
          const tx = await deps.operatorSigner!.sendTransaction({
            to: calldata.to,
            data: calldata.data,
            value: calldata.value ?? 0n,
          });
          const receipt = await tx.wait();
          if (receipt?.status !== 1) throw new Error("tx reverted");
          return tx.hash as `0x${string}`;
        },
      }
    : {
        address: deps.operatorAddress as `0x${string}`,
      };

  return {
    http,
    chain,
    wallet,
    mode,
    session: createSession({
      chainId: deps.chainId,
      walletAddress: deps.operatorAddress.toLowerCase() as `0x${string}`,
      lastTokenId: deps.tokenId,
      backendUrl: deps.backendUrl,
      addresses: {
        vault: deps.vault as `0x${string}`,
        agentNft: deps.agentNft as `0x${string}`,
      },
    }),
  };
}

export async function executeE2eTool(
  name: string,
  args: Record<string, unknown>,
  deps: E2eToolDeps,
): Promise<{ ok: boolean; result: string }> {
  const result: ToolResult = await runTool(name, args, createNodeTransport(deps, args));
  let ok = result.ok;
  try {
    const parsed = JSON.parse(result.content) as { error?: string };
    if (parsed.error !== undefined) ok = false;
  } catch { /* ignore */ }
  return { ok, result: result.content };
}
