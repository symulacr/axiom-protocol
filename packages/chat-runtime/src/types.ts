import type { ChatToolName } from "@axiom/config/chat-tools";

export interface OgChatParams {
  // enable_thinking:false suppresses reasoning tokens on GLM-5-class models; Router strips it before forwarding
  chat_template_kwargs?: { enable_thinking?: boolean };
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
  /** Remaining tool names of the plan the assistant presented and the user approved (continuity for "next"). */
  lastPlan?: string[];
  backendUrl?: string;
  addresses?: {
    vault: `0x${string}`;
    agentNft: `0x${string}`;
    paymentProcessor?: `0x${string}`;
    /** axmUSDC (paymentToken) address — W9 swap/pool tools resolve pool symbols against it. */
    paymentToken?: `0x${string}`;
    /** GasTank (V3 W5-B) — optional until deployed; gas_tank_status + sponsor lane gate on it. */
    gasTank?: `0x${string}`;
  };
}
