import type { ChatToolName } from "@axiom/config/chat-tools";

/** 0G Router chat-completions request extension (official, docs.0g.ai router/features/chat-completions).
 *  `chat_template_kwargs: {"enable_thinking": false}` suppresses reasoning tokens for
 *  GLM-5-class thinking models; the Router strips it before forwarding to the provider. */
export interface OgChatParams {
	chat_template_kwargs?: { enable_thinking?: boolean };
}

/** 0G Router `x_0g_trace` payload — always present on Router chat responses
 *  (docs.0g.ai router/features/chat-completions). Billing costs are exact neuron amounts. */
export interface OgTrace {
	request_id: string;
	provider: string;
	billing?: {
		input_cost?: string;
		output_cost?: string;
		total_cost?: string;
	};
	tee_verified?: boolean;
}

/** SSE event the backend relay emits alongside OpenAI chunks to forward 0G billing metadata. */
export interface ChatTraceEvent {
	type: "trace";
	trace: OgTrace;
}

export type ToolMode = "encode-only" | "sign";

export interface EncodeCalldata {
	to: `0x${string}`;
	data: `0x${string}`;
	value?: bigint;
}

export interface ToolResult {
	ok: boolean;
	content: string;
	error?: string;
}

export interface ChatSessionContext {
	chainId: number;
	walletAddress?: `0x${string}`;
	lastTokenId?: string;
	lastToolName?: ChatToolName;
	backendUrl?: string;
	addresses?: {
		vault: `0x${string}`;
		agentNft: `0x${string}`;
	};
}
