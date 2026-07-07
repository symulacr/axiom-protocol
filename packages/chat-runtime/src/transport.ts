/**
 * ToolRuntime transport — environment-agnostic facade for class executors.
 * Browser (wagmi + apiFetch) and node (ethers + fetchJson) adapters implement this.
 */

import type { ChatSessionContext, EncodeCalldata, ToolMode } from "./types.js";

/** Optional init for http.fetch — JSON bodies are serialized by transport adapters. */
export interface ToolHttpInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array | Record<string, unknown> | null;
  timeout?: number;
  signal?: AbortSignal;
}

/** Minimal fetch response shape — compatible with browser and Node 22 fetch. */
export interface ToolHttpResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

/** Backend HTTP lane — mirrors apiFetch / fetchJson over the Fetch API. */
export interface ToolHttp {
  fetch(path: string, init?: ToolHttpInit): Promise<ToolHttpResponse>;
}

/** On-chain read request — viem/ethers adapters map to their native readContract. */
export interface ToolChainRead {
  address: `0x${string}`;
  abi: readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
}

/** On-chain read lane — optional when running archive-only or offline bench. */
export interface ToolChain {
  chainId: number;
  readContract?<T = unknown>(req: ToolChainRead): Promise<T>;
  multicall?<T extends readonly { result?: unknown; error?: Error }[]>(args: {
    contracts: readonly ToolChainRead[];
  }): Promise<T>;
}

/** Wallet write lane — optional in encode-only bench mode. */
export interface ToolWallet {
  address?: `0x${string}`;
  /** Submit backend-encoded calldata (deposit / withdraw lane). */
  signAndSend?(calldata: EncodeCalldata): Promise<`0x${string}`>;
  /** Direct contract write (mint_agent lane). */
  writeContract?(args: {
    address: `0x${string}`;
    abi: readonly unknown[];
    functionName: string;
    args: readonly unknown[];
    value?: bigint;
  }): Promise<`0x${string}`>;
}

/**
 * Runtime context passed to runTool() and class executors.
 * Transports supply http always; chain and wallet are optional by mode/class.
 */
export interface ToolRuntime {
  http: ToolHttp;
  chain?: ToolChain;
  wallet?: ToolWallet;
  session: ChatSessionContext;
  mode: ToolMode;
}