import { createSession, runTool } from "@axiom/chat-runtime";
import type { ToolChain, ToolRuntime } from "@axiom/chat-runtime";
import {
  GAS_TANK_FORWARD_REQUEST_TYPES,
  GAS_TANK_DOMAIN_NAME,
  GAS_TANK_DOMAIN_VERSION,
} from "@axiom/config/eip712";
import { BACKEND_URL, ORACLE_URL } from "../config/env.js";
import { apiKeyHeader } from "../utils/apiFetch.js";
import {
  getAxiomAgentNftAddress,
  getAxiomGasTankAddress,
  getAxiomPaymentProcessorAddress,
  getAxiomStrategyVaultAddress,
  toViemAbi,
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
  waitForReceipt?:
    | ((txHash: `0x${string}`) => Promise<{
        status: "success" | "reverted";
        blockNumber: bigint;
      } | null>)
    | undefined,
  signTypedDataAsync?:
    | ((args: {
        domain: unknown;
        types: unknown;
        primaryType: string;
        message: unknown;
      }) => Promise<`0x${string}`>)
    | undefined,
  chainId?: number,
): NonNullable<ToolRuntime["wallet"]> | undefined {
  if (!address) return undefined;
  const gasTank = getAxiomGasTankAddress(chainId);
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
    ...(waitForReceipt ? { waitForReceipt } : {}),
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
              abi: toViemAbi(args.abi),
              functionName: args.functionName,
              args: [...args.args],
              value: args.value,
            }),
        }
      : {}),
    // Sponsor capability (V3 W5-B): sign the EIP-712 ForwardRequest with the
    // connected wallet — never a backend key. The executor submits the
    // signature to POST /v1/relayer/sponsor; the relayer key broadcasts.
    ...(gasTank && signTypedDataAsync
      ? {
          sponsor: async (req) => {
            const signature = await signTypedDataAsync({
              domain: {
                name: GAS_TANK_DOMAIN_NAME,
                version: GAS_TANK_DOMAIN_VERSION,
                chainId,
                verifyingContract: gasTank,
              },
              types: GAS_TANK_FORWARD_REQUEST_TYPES,
              primaryType: "ForwardRequest",
              message: {
                user: req.user,
                target: req.target,
                data: req.data,
                maxGasCost: req.maxGasCost,
                nonce: req.nonce,
                deadline: req.deadline,
              },
            });
            return { signature };
          },
        }
      : {}),
  };
}

/** viem receipt wait for chat-signed tool txs: ~60s ceiling, null on timeout/unavailable. */
export function buildWaitForReceipt(
  publicClient: ToolContext["publicClient"],
): ToolContext["waitForReceipt"] {
  if (!publicClient) return undefined;
  return async (txHash) => {
    try {
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 60_000,
      });
      return { status: receipt.status, blockNumber: receipt.blockNumber };
    } catch {
      return null;
    }
  };
}

function buildBrowserRuntime(ctx: ToolContext): ToolRuntime {
  const publicClient = ctx.publicClient;
  const {
    address,
    sendTransactionAsync,
    writeContractAsync,
    signTypedDataAsync,
  } = ctx;

  return {
    mode: "sign",
    oracleUrl: ORACLE_URL,
    http: {
      fetch: (path, init) => {
        let url = path;
        if (!path.startsWith("http") && !path.startsWith("/oracle")) {
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
    wallet: buildWallet(
      address,
      sendTransactionAsync,
      writeContractAsync,
      buildWaitForReceipt(publicClient),
      signTypedDataAsync,
      ctx.chainId,
    ),
    session: createSession({
      chainId: ctx.chainId,
      walletAddress: ctx.address
        ? (ctx.address.toLowerCase() as `0x${string}` | undefined)
        : undefined,
      lastTokenId: ctx.lastTokenId,
      addresses: {
        vault: getAxiomStrategyVaultAddress(ctx.chainId),
        agentNft: getAxiomAgentNftAddress(ctx.chainId),
        paymentProcessor: getAxiomPaymentProcessorAddress(ctx.chainId),
        gasTank: getAxiomGasTankAddress(ctx.chainId),
      },
    }),
  };
}
