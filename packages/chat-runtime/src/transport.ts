
import type { ChatSessionContext, EncodeCalldata, ToolMode } from "./types.js";

export interface ToolHttpInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array | Record<string, unknown> | null;
  timeout?: number;
  signal?: AbortSignal;
}

export interface ToolHttpResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export interface ToolHttp {
  fetch(path: string, init?: ToolHttpInit): Promise<ToolHttpResponse>;
}

export interface ToolChainRead {
  address: `0x${string}`;
  abi: readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
}

export interface ToolChain {
  chainId: number;
  readContract?<T = unknown>(req: ToolChainRead): Promise<T>;
  multicall?<T extends readonly { result?: unknown; error?: Error }[]>(args: {
    contracts: readonly ToolChainRead[];
  }): Promise<T>;
}

export interface ToolWallet {
  address?: `0x${string}`;
  signAndSend?(calldata: EncodeCalldata): Promise<`0x${string}`>;
  writeContract?(args: {
    address: `0x${string}`;
    abi: readonly unknown[];
    functionName: string;
    args: readonly unknown[];
    value?: bigint;
  }): Promise<`0x${string}`>;
}

export interface ToolRuntime {
  http: ToolHttp;
  chain?: ToolChain;
  wallet?: ToolWallet;
  session: ChatSessionContext;
  mode: ToolMode;
}