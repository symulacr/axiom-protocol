import type {
  ChatSessionContext,
  EncodeCalldata,
  ToolMode,
  ToolResult,
} from "./types.js";

interface ToolHttpInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array | Record<string, unknown> | null;
  timeout?: number;
  signal?: AbortSignal;
}

interface ToolHttpResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

interface ToolHttp {
  fetch(path: string, init?: ToolHttpInit): Promise<ToolHttpResponse>;
}

interface ToolChainRead {
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

interface ToolWallet {
  address?: `0x${string}`;
  signAndSend?(calldata: EncodeCalldata): Promise<`0x${string}`>;
  /** Optional receipt wait so the LLM can report "confirmed"; transports that cannot wait return null (txHash-only fallback). */
  waitForReceipt?(txHash: `0x${string}`): Promise<{
    status: "success" | "reverted";
    blockNumber: bigint;
  } | null>;
  writeContract?(args: {
    address: `0x${string}`;
    abi: readonly unknown[];
    functionName: string;
    args: readonly unknown[];
    value?: bigint;
  }): Promise<`0x${string}`>;
  /** Optional GasTank sponsor capability (V3 W5-B): signs the EIP-712
   *  ForwardRequest (domain AxiomGasTank/1) and returns the user signature for
   *  POST /v1/relayer/sponsor. Absent ⇒ encode tools fall back to the
   *  wallet-signing lane. */
  sponsor?(req: SponsorRequest): Promise<{ signature: `0x${string}` }>;
}

/** EIP-712 ForwardRequest payload the wallet signs (domain AxiomGasTank/1). */
export interface SponsorRequest {
  user: `0x${string}`;
  target: `0x${string}`;
  data: `0x${string}`;
  maxGasCost: bigint;
  nonce: bigint;
  deadline: bigint;
}

export interface SponsorSubmitResult {
  ok: boolean;
  id?: string;
  nonce?: string;
  status?: number;
  code?: string;
  error?: string;
}
export interface ToolRuntime {
  http: ToolHttp;
  chain?: ToolChain;
  wallet?: ToolWallet;
  session: ChatSessionContext;
  mode: ToolMode;
  oracleUrl?: string;
}

export async function fetchJson<T>(
  http: ToolHttp,
  path: string,
  init?: Parameters<ToolHttp["fetch"]>[1],
): Promise<{ ok: boolean; data: T; status: number }> {
  const res = await http.fetch(path, init);
  const text = await res.text();
  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    return { ok: false, data: { error: text } as T, status: res.status };
  }
  return { ok: res.ok, data, status: res.status };
}

/** Shared POST leg: JSON body + content-type header, parsed via fetchJson. */
export function postJson<T>(
  http: ToolHttp,
  path: string,
  body: unknown,
): Promise<{ ok: boolean; data: T; status: number }> {
  return fetchJson<T>(http, path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function toolFail(message: string): ToolResult {
  // shared envelope: every executor fails with ok:false + content {error: message}
  return { ok: false, content: JSON.stringify({ error: message }) };
}

/** Shared tokenId resolution: explicit args.tokenId wins, else the session's lastTokenId. */
export function resolveTokenId(
  args: Record<string, unknown>,
  ctx: ToolRuntime,
): string {
  const id = args.tokenId ?? ctx.session.lastTokenId;
  return id === undefined || id === null ? "" : String(id);
}
