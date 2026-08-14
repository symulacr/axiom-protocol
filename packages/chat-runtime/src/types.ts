import type { ChatToolName } from "@axiom/config/chat-tools";

export interface OgChatParams {
  // enable_thinking:false suppresses reasoning tokens on GLM-5-class models; Router strips it before forwarding
  chat_template_kwargs?: { enable_thinking?: boolean };
}

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
    paymentProcessor?: `0x${string}`;
  };
}
