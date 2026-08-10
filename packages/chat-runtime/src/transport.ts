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

/** Error envelope shared by every tool executor: `{ ok: false, content: {"error": msg} }`. */
export function toolFail(message: string): ToolResult {
	return { ok: false, content: JSON.stringify({ error: message }) };
}
