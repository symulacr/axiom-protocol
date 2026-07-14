
import type { ChatToolName } from "@axiom/config/chat-tools";

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