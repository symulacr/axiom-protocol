/**
 * Chat runtime types — shared between browser/node transports and class executors.
 * Tool taxonomy lives in @axiom/config/chat-tools; these types cover execution I/O.
 */

import type { ChatToolName } from "@axiom/config/chat-tools";

/** Bench returns calldata; browser signs and broadcasts on-chain. */
export type ToolMode = "encode-only" | "sign";

/** Encoded tx payload from backend encode routes (deposit, withdraw, mint). */
export interface EncodeCalldata {
  to: `0x${string}`;
  data: `0x${string}`;
  /** Wei sent with the tx; defaults to 0 when omitted. */
  value?: bigint;
}

/**
 * Tool output for the LLM tool loop.
 * `content` is always a JSON string — mirrors OpenAI tool message shape.
 */
export interface ToolResult {
  ok: boolean;
  content: string;
}

/**
 * Session hints carried across tool calls in one chat thread.
 * Updated by applyToolResult (CRT-028) after each successful tool run.
 */
export interface ChatSessionContext {
  chainId: number;
  /** Connected wallet — required for tools with requiresWallet. */
  walletAddress?: `0x${string}`;
  /** Default token ID for tools with requiresTokenId. */
  lastTokenId?: string;
  /** Last tool invoked — helps prompt compression and UX replay. */
  lastToolName?: ChatToolName;
  /** Backend origin; node bench uses full URL, browser uses relative paths. */
  backendUrl?: string;
  /** Deployed contract addresses for the active chain. */
  addresses?: {
    vault: `0x${string}`;
    agentNft: `0x${string}`;
  };
}