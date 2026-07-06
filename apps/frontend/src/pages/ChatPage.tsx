import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWriteContract,
} from "wagmi";
import { toast } from "sonner";
import {
  apiFetchResponse,
  STREAM_TIMEOUT,
} from "../utils/apiFetch.js";
import { humanizeError } from "../utils/format.js";
import {
  TOOLS,
  TOOL_LABELS,
  formatToolResult,
  useToolHandlers,
  type ToolContext,
} from "../chat/tools.js";
import {
  COLORS,
  Card,
  Button,
  Input,
  PageHeader,
} from "../components/ui.js";

type Message = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
};

function createMessage(msg: Omit<Message, "id">): Message {
  return { ...msg, id: crypto.randomUUID() };
}

type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type SSEChunk = {
  choices?: Array<{
    delta: {
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: "function";
        function?: { name?: string; arguments?: string };
      }>;
      role?: string;
    };
    finish_reason?: string | null;
  }>;
};

function parseSSEChunks(raw: string): SSEChunk[] {
  const chunks: SSEChunk[] = [];
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const payload = line.slice(6).trim();
    if (payload === "[DONE]") break;
    try {
      chunks.push(JSON.parse(payload) as SSEChunk);
    } catch {
      // skip malformed lines
    }
  }
  return chunks;
}

const CHAT_WAITING_MESSAGES = [
  "Securing enclave channel via 0G Compute...",
  "Retrieving encrypted strategy root from 0G Storage...",
  "Attesting hardware execution signature (Intel SGX)...",
  "Evaluating pool metrics via TEE-attested LLM...",
  "Generating EIP-712 AccessProof challenge...",
  "Running Monte Carlo risk checks in secure enclave...",
  "Syncing computational state on 0G Storage...",
];

export function ChatPage(): ReactElement {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [hasUsedChat, setHasUsedChat] = useState(() => {
    try {
      return localStorage.getItem("axiom:hasUsedChat") === "true";
    } catch {
      return false;
    }
  });
  const [streamStartTime, setStreamStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const streamTextRef = useRef("");
  const streamThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelStreamThrottle = useCallback(() => {
    if (streamThrottleRef.current !== null) {
      clearTimeout(streamThrottleRef.current);
      streamThrottleRef.current = null;
    }
  }, []);

  const scheduleStreamTextUpdate = useCallback(() => {
    if (streamThrottleRef.current !== null) return;
    streamThrottleRef.current = setTimeout(() => {
      streamThrottleRef.current = null;
      setStreamText(streamTextRef.current);
    }, 50);
  }, []);

  const flushAndClearStreamText = useCallback(() => {
    cancelStreamThrottle();
    streamTextRef.current = "";
    setStreamText("");
  }, [cancelStreamThrottle]);

  useEffect(() => {
    return () => {
      cancelStreamThrottle();
    };
  }, [cancelStreamThrottle]);

  const toolCtx: ToolContext = useMemo(
    () => ({
      address,
      chainId,
      writeContractAsync: (writeContractAsync ??
        (async () => {
          throw new Error("Wallet not connected");
        })) as ToolContext["writeContractAsync"],
      publicClient,
    }),
    [address, chainId, writeContractAsync, publicClient],
  );
  const handlers = useToolHandlers(toolCtx);

  // Auto-scroll to bottom
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, streamText]);
  useEffect(() => {
    if (isStreaming && streamStartTime === null) {
      setStreamStartTime(Date.now());
    } else if (!isStreaming && streamStartTime !== null) {
      setStreamStartTime(null);
      setElapsed(0);
    }
  }, [isStreaming, streamStartTime]);

  useEffect(() => {
    if (streamStartTime === null) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - streamStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [streamStartTime]);

  const sendMessage = useCallback(
    async (userText: string) => {
      if (!userText.trim() || isStreaming) return;
      setInput("");

      const userMsg = createMessage({ role: "user", content: userText });
      let currentMessages = [...messages, userMsg];
      setMessages(currentMessages);
      setIsStreaming(true);
      flushAndClearStreamText();
      if (!hasUsedChat) {
        setHasUsedChat(true);
        try {
          localStorage.setItem("axiom:hasUsedChat", "true");
        } catch {}
      }

      const controller = new AbortController();
      abortRef.current = controller;

      // Multi-turn tool loop
      let loopCount = 0;
      const MAX_TOOL_LOOPS = 5;

      try {
        while (loopCount < MAX_TOOL_LOOPS) {
          loopCount++;

          const response = await apiFetchResponse("/v1/chat/completions", {
            method: "POST",
            body: JSON.stringify({
              model: "qwen/qwen2.5-omni-7b",
              messages: currentMessages.map(({ id: _id, ...msg }) => msg),
              tools: TOOLS,
              stream: true,
            }),
            signal: controller.signal,
            timeout: STREAM_TIMEOUT,
          });

          // Read SSE stream
          const body = response.body;
          if (!body) throw new Error("No response body from chat service");
          const reader = body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let assistantContent = "";
          const pendingToolCalls: ToolCall[] = [];

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const chunks = parseSSEChunks(buffer);

            for (const chunk of chunks) {
              const delta = chunk.choices?.[0]?.delta;
              if (!delta) continue;

              if (delta.content) {
                assistantContent += delta.content;
                streamTextRef.current = assistantContent;
                scheduleStreamTextUpdate();
              }

              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const existing = pendingToolCalls[tc.index];
                  if (!existing) {
                    pendingToolCalls[tc.index] = {
                      id: tc.id ?? "",
                      type: "function",
                      function: { name: "", arguments: "" },
                    };
                  }
                  const entry = pendingToolCalls[tc.index];
                  if (entry) {
                    if (tc.id) entry.id = tc.id;
                    if (tc.function?.name)
                      entry.function.name += tc.function.name;
                    if (tc.function?.arguments)
                      entry.function.arguments += tc.function.arguments;
                  }
                }
              }
            }
          }

          cancelStreamThrottle();
          setStreamText(streamTextRef.current);

          const toolCallList = pendingToolCalls.filter(
            (tc) => tc.function.name,
          );

          if (toolCallList.length === 0) {
            // No tool calls — assistant response is final
            const assistantMsg = createMessage({
              role: "assistant",
              content: assistantContent,
            });
            currentMessages = [...currentMessages, assistantMsg];
            setMessages(currentMessages);
            flushAndClearStreamText();
            break;
          }

          // Add assistant message with tool calls
          const assistantMsg = createMessage({
            role: "assistant",
            content: assistantContent || null,
            tool_calls: toolCallList,
          });
          currentMessages = [...currentMessages, assistantMsg];
          setMessages(currentMessages);
          flushAndClearStreamText();

          // Execute each tool call
          for (const tc of toolCallList) {
            const handler = handlers[tc.function.name];
            let result: string;
            if (!handler) {
              result = JSON.stringify({
                error: `Unknown tool: ${tc.function.name}`,
              });
            } else {
              try {
                const args = JSON.parse(tc.function.arguments);
                result = await handler(args, toolCtx);
              } catch (err: unknown) {
                result = JSON.stringify({
                  error:
                    err instanceof Error
                      ? err.message
                      : "Tool execution failed",
                });
              }
            }
            const toolMsg = createMessage({
              role: "tool",
              tool_call_id: tc.id,
              name: tc.function.name,
              content: result,
            });
            currentMessages = [...currentMessages, toolMsg];
          }
          setMessages(currentMessages);
          // Loop continues to next LLM call with tool results appended
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // User cancelled
        } else {
          toast.error(humanizeError(err));
          setMessages([
            ...currentMessages,
            createMessage({
              role: "assistant",
              content: `Error: ${humanizeError(err)}`,
            }),
          ]);
        }
      } finally {
        setIsStreaming(false);
        flushAndClearStreamText();
        abortRef.current = null;
      }
    },
    [
      messages,
      isStreaming,
      handlers,
      toolCtx,
      hasUsedChat,
      flushAndClearStreamText,
      scheduleStreamTextUpdate,
      cancelStreamThrottle,
    ],
  );

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // ── Render ──
  return (
    <div>
        <PageHeader
          title="AI Chat"
          subtitle="Ask about your agents, vaults, or the protocol"
          action={
            messages.length > 0 ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setMessages([]);
                  setHasUsedChat(false);
                }}
                style={{ fontSize: "var(--text-sm)" }}
              >
                New chat
              </Button>
            ) : undefined
          }
        />

        {/* Welcome / empty state — always show chips when no messages */}
        {messages.length === 0 && !isStreaming && (
          <Card
            style={{
              marginBottom: "var(--space-lg)",
              padding: "var(--space-2xl)",
              textAlign: "center",
            }}
          >
            <p
              style={{
                color: COLORS.textMuted,
                fontSize: "var(--text-sm)",
                lineHeight: "var(--lh-normal)",
                margin: "0 0 var(--space-md)",
              }}
            >
              {hasUsedChat
                ? "Start a new conversation."
                : "Ask me anything about your agents, vaults, or the protocol."}
            </p>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "var(--space-sm)",
                justifyContent: "center",
                margin: "var(--space-lg) 0",
              }}
            >
              {[
                "List my agents",
                "What's my vault balance?",
                "Execute a strategy",
              ].map((prompt) => (
                <button
                  type="button"
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  style={{
                    background: COLORS.bronzeBg,
                    border: `1px solid ${COLORS.bronzeBorder}`,
                    borderRadius: "var(--radius-lg)",
                    padding: "0.5rem 1rem",
                    color: COLORS.bronzeLight,
                    fontSize: "var(--text-sm)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "all 0.15s ease",
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </Card>
        )}

        {/* Message list */}
        <div
          ref={listRef}
          role="log"
          aria-live="polite"
          style={{
            maxHeight: "calc(100vh - 22rem)",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-sm)",
            marginBottom: "var(--space-md)",
            paddingRight: "var(--space-sm)",
          }}
        >
          {messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                padding: "var(--space-md) var(--space-lg)",
                borderBottom: `1px solid ${COLORS.border}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: "var(--space-xs)",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background:
                      msg.role === "user"
                        ? COLORS.bronzeLight
                        : msg.role === "tool"
                          ? COLORS.textDim
                          : COLORS.text,
                  }}
                />
                <span
                  style={{
                    fontWeight: "var(--fw-semibold)",
                    fontSize: "var(--text-xs)",
                    color: COLORS.textDim,
                    textTransform: "uppercase",
                  }}
                >
                  {msg.role === "user"
                    ? "You"
                    : msg.role === "tool"
                      ? (TOOL_LABELS[msg.name ?? ""] ?? msg.name ?? "Tool")
                      : "Assistant"}
                </span>
              </div>
              {msg.role === "tool" ? (
                <div
                  style={{
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: "var(--radius-md)",
                    padding: "var(--space-sm) var(--space-md)",
                    fontSize: "var(--text-sm)",
                    color: COLORS.textMuted,
                    marginTop: "var(--space-xs)",
                  }}
                >
                  <pre
                    style={{
                      fontSize: "var(--text-xs)",
                      margin: 0,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      lineHeight: "var(--lh-normal)",
                      fontFamily: "inherit",
                    }}
                  >
                    {formatToolResult(msg.name ?? "", msg.content)}
                  </pre>
                </div>
              ) : msg.tool_calls ? (
                <div
                  style={{
                    fontSize: "var(--text-sm)",
                    color: COLORS.textMuted,
                  }}
                >
                  {msg.tool_calls.map((tc) => (
                    <div key={tc.id}>
                      <span
                        style={{
                          fontSize: "var(--text-xs)",
                          color: COLORS.textMuted,
                        }}
                      >
                        Calling:
                      </span>{" "}
                      <strong style={{ color: COLORS.bronzeLight }}>
                        {TOOL_LABELS[tc.function.name] ?? tc.function.name}
                      </strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p
                  style={{
                    fontSize: "var(--text-sm)",
                    color: COLORS.text,
                    margin: 0,
                    lineHeight: "var(--lh-normal)",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {msg.content}
                </p>
              )}
            </div>
          ))}

          {/* Streaming in-progress indicator */}
          {isStreaming && (
            <div
              style={{
                padding: "var(--space-md) var(--space-lg)",
                borderBottom: `1px solid ${COLORS.border}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: "var(--space-xs)",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: COLORS.text,
                  }}
                />
                <span
                  style={{
                    fontWeight: "var(--fw-semibold)",
                    fontSize: "var(--text-xs)",
                    color: COLORS.textDim,
                    textTransform: "uppercase",
                  }}
                >
                  Assistant
                </span>
              </div>
              <p
                style={{
                  fontSize: "var(--text-sm)",
                  color: COLORS.text,
                  margin: 0,
                  lineHeight: "var(--lh-normal)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {streamText || (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        border: `2px solid ${COLORS.border}`,
                        borderTopColor: COLORS.bronze,
                        animation: "axiom-spin 0.8s linear infinite",
                      }}
                    />
                    <span style={{ color: COLORS.bronzeLight }}>
                      {CHAT_WAITING_MESSAGES[
                        Math.min(
                          Math.floor(elapsed / 3),
                          CHAT_WAITING_MESSAGES.length - 1,
                        )
                      ] ?? "Thinking..."}
                    </span>
                    <span
                      style={{
                        color: COLORS.textDim,
                        fontSize: "var(--text-xs)",
                      }}
                    >
                      {elapsed > 0 && `(${elapsed}s)`}
                    </span>
                  </span>
                )}
              </p>
            </div>
          )}
        </div>

        {/* Input bar */}
        <div style={{ display: "flex", gap: "var(--space-sm)" }}>
          <Input
            aria-label="Chat input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            placeholder={
              isStreaming
                ? "Waiting for response..."
                : "Ask about your agents, vaults, or strategies..."
            }
            disabled={isStreaming}
            maxLength={4000}
            style={{
              flex: 1,
            }}
          />
          {isStreaming ? (
            <Button variant="secondary" onClick={cancelStream}>
              Stop
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => sendMessage(input)}
              disabled={!input.trim()}
            >
              Send
            </Button>
          )}
        </div>
    </div>
  );
}

export default ChatPage;
