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
  useWalletClient,
} from "wagmi";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { BRAND } from "../brand/assets.js";
import { toast } from "sonner";
import {
  apiFetch,
  apiFetchResponse,
  STREAM_TIMEOUT,
} from "../utils/apiFetch.js";
import { humanizeError } from "../utils/format.js";
import {
  buildSystemPrompt,
  formatToolResult,
  groupParallelTools,
  fitToContext,
  compactHistory,
  MAX_TOOL_LOOPS,
  summarizeConversation,
  evaluateContinue,
  isAskUserResult,
  type ChatSessionContext,
} from "@axiom/chat-runtime";
import { ChatSessionProvider, useChatSession } from "../chat/ChatSessionProvider.js";
import { ToolResultBody } from "../chat/ToolResultBody.js";
import { waitingMessageForElapsed } from "../chat/waitingMessages.js";
import {
  TOOLS,
  TOOL_LABELS,
  CHAT_TOOL_CLASS_LABELS,
  toolClass,
  toolHint,
  useToolHandlers,
  type ToolContext,
} from "../chat/tools.js";
import { CHAT_MODEL } from "../config/env.js";
import { aristotle } from "../config/wagmi.js";
import { AXIOM_ASSISTANT_NAME } from "@axiom/config/models";
import {
  COLORS,
  Button,
  Input,
  ErrorRef,
  Spinner,
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

const SUPPORTED_CHAIN_IDS = new Set([aristotle.id]);
const CHAT_MESSAGES_KEY = "axiom:chat-messages";
const CHAT_THREADS_KEY = "axiom:chat-threads";

type ChatThread = {
  id: string;
  title: string;
  updatedAt: number;
  messages: Message[];
};

function loadThreads(): ChatThread[] {
  try {
    const raw = localStorage.getItem(CHAT_THREADS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatThread[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveThreads(threads: ChatThread[]): void {
  try {
    localStorage.setItem(CHAT_THREADS_KEY, JSON.stringify(threads.slice(0, 40)));
  } catch {
    /* ignore */
  }
}

function titleFromMessages(msgs: Message[]): string {
  const first = msgs.find((m) => m.role === "user" && m.content);
  const t = (first?.content ?? "New chat").trim().replace(/\s+/g, " ");
  return t.length > 42 ? `${t.slice(0, 42)}…` : t || "New chat";
}

function consumeSseLines(buffer: string): {
  chunks: SSEChunk[];
  rest: string;
  done: boolean;
} {
  const chunks: SSEChunk[] = [];
  let done = false;
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    const payload = line.slice(6).trim();
    if (payload === "[DONE]") {
      done = true;
      break;
    }
    try {
      chunks.push(JSON.parse(payload) as SSEChunk);
    } catch { /* malformed SSE chunk — skip */ }
  }
  return { chunks, rest, done };
}

function ToolClassBadge({ name }: { name: string }): ReactElement | null {
  const cls = toolClass(name);
  if (!cls) return null;
  return (
    <span
      aria-label={`Tool class: ${CHAT_TOOL_CLASS_LABELS[cls]}`}
      title={toolHint(name)}
      style={{
        marginLeft: 6,
        fontSize: "var(--text-xs)",
        fontWeight: "var(--fw-medium)",
        color: COLORS.textDim,
        textTransform: "lowercase",
        letterSpacing: "0.02em",
      }}
    >
      ({CHAT_TOOL_CLASS_LABELS[cls]})
    </span>
  );
}

function AskUserCard({
  content,
  onAnswer,
}: {
  content: string;
  onAnswer: (answer: string) => void;
}): ReactElement | null {
  let data: { ask?: boolean; question?: string; options?: string[] } | null;
  try {
    data = JSON.parse(content);
  } catch {
    return null;
  }
  if (!data || data.ask !== true) return null;
  const question = data.question ?? "Question";
  const options = Array.isArray(data.options) ? data.options : [];
  if (options.length === 0) return null;
  return (
    <div
      style={{
        background: COLORS.bg,
        border: `1px solid ${COLORS.border}`,
        borderRadius: "var(--radius-md)",
        padding: "var(--space-sm) var(--space-md)",
        marginTop: "var(--space-xs)",
      }}
    >
      <p style={{ margin: "0 0 8px", fontSize: "var(--text-sm)", color: COLORS.text }}>
        {question}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {options.map((o, i) => (
          <Button key={i} variant="secondary" onClick={() => onAnswer(o)}>
            {o}
          </Button>
        ))}
      </div>
    </div>
  );
}

function loadStoredMessages(): Message[] {
  try {
    const raw = sessionStorage.getItem(CHAT_MESSAGES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Message[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function renderMarkdown(src: string | null): string {
  return DOMPurify.sanitize(
    marked.parse(src ?? "", { gfm: true, breaks: true }) as string,
    { FORBID_TAGS: ["style", "iframe"] },
  );
}

const dedupeToolCalls = (calls: ToolCall[]): ToolCall[] =>
  calls.filter(
    (c, i) =>
      calls.findIndex(
        (x) =>
          x.function.name === c.function.name &&
          x.function.arguments === c.function.arguments,
      ) === i,
  );

function ChatPageInner(): ReactElement {
  const { address } = useAccount();
  const chainId = useChainId();
  const { session, recordToolResult } = useChatSession();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { data: walletClient } = useWalletClient();

  const [messages, setMessages] = useState<Message[]>(loadStoredMessages);
  const [contextWindow, setContextWindow] = useState<number | undefined>(undefined);
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
  const messagesRef = useRef<Message[]>(messages);
  const listRef = useRef<HTMLDivElement>(null);
  const streamTextRef = useRef("");
  const streamThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const queueRef = useRef<string[]>([]);
  const isStreamingRef = useRef(false);
  const [threads, setThreads] = useState<ChatThread[]>(loadThreads);
  const [threadId, setThreadId] = useState<string>(() => crypto.randomUUID());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [computeHint, setComputeHint] = useState<string | null>(null);

  // Live refs keep turn-local values (tokenId, address, chainId, and the
  // wallet accessors) current WITHIN a single agent turn. React state
  // updates (e.g. setLastTokenId) only propagate on the next render, but the
  // in-flight runAgent closure would otherwise keep a stale snapshot, so a
  // tool later in the same turn (deposit/withdraw/unbroker_*) would not see
  // a tokenId produced by an earlier tool (mint) in that turn.
  const lastTokenIdRef = useRef<string | undefined>(session.lastTokenId);
  const liveAddressRef = useRef<string | undefined>(address);
  const liveChainIdRef = useRef<number>(chainId);
  const writeContractAsyncRef = useRef(writeContractAsync);
  const walletClientRef = useRef(walletClient);
  const publicClientRef = useRef(publicClient);

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
      address: address?.toLowerCase(),
      chainId,
      lastTokenId: session.lastTokenId,
      writeContractAsync: (writeContractAsync ??
        (async () => {
          throw new Error("Wallet not connected");
        })) as ToolContext["writeContractAsync"],
      sendTransactionAsync: walletClient
        ? async ({ to, data, value }) =>
            walletClient.sendTransaction({ to, data, value })
        : undefined,
      publicClient,
    }),
    [address, chainId, session.lastTokenId, writeContractAsync, walletClient, publicClient],
  );
  const handlers = useToolHandlers(toolCtx);
  const chainSupported = SUPPORTED_CHAIN_IDS.has(chainId);

  // Keep the live refs in sync with the latest props/state. This covers
  // cross-turn refreshes (e.g. once React re-renders after setLastTokenId)
  // and keeps the wallet address/chainId live. Within-turn propagation is
  // handled by updating lastTokenIdRef directly as each tool result is
  // recorded (see runAgent).
  useEffect(() => {
    lastTokenIdRef.current = session.lastTokenId;
    liveAddressRef.current = address;
    liveChainIdRef.current = chainId;
    writeContractAsyncRef.current = writeContractAsync;
    walletClientRef.current = walletClient;
    publicClientRef.current = publicClient;
  }, [session.lastTokenId, address, chainId, writeContractAsync, walletClient, publicClient]);

  useEffect(() => {
    messagesRef.current = messages;
    try {
      if (messages.length === 0) {
        sessionStorage.removeItem(CHAT_MESSAGES_KEY);
      } else {
        sessionStorage.setItem(CHAT_MESSAGES_KEY, JSON.stringify(messages));
      }
    } catch { /* sessionStorage may be unavailable */ }
  }, [messages]);

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
    let cancelled = false;
    // Use apiFetch (not a bare fetch) so the API key is attached; /v1/config
    // is auth-gated, so an unauthenticated call 401s and the context
    // window is never set.
    apiFetch<{ contextWindow?: number }>("/v1/config")
      .then((d) => {
        if (!cancelled) setContextWindow(d?.contextWindow);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (streamStartTime === null) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - streamStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [streamStartTime]);

  const runAgent = useCallback(
    async (userText: string) => {
      if (!userText.trim()) return;
      if (!chainSupported) return;
      isStreamingRef.current = true;
      setIsStreaming(true);

      const userMsg = createMessage({ role: "user", content: userText });
      let currentMessages = [...messagesRef.current, userMsg];
      const summary = summarizeConversation(messagesRef.current);
      currentMessages = compactHistory(currentMessages, summary);
      messagesRef.current = currentMessages;
      setMessages(currentMessages);
      setIsStreaming(true);
      flushAndClearStreamText();
      if (!hasUsedChat) {
        setHasUsedChat(true);
        try {
          localStorage.setItem("axiom:hasUsedChat", "true");
        } catch {
          void 0;
        }
      }

      const controller = new AbortController();
      abortRef.current = controller;

      let loopCount = 0;

      try {
        while (loopCount < MAX_TOOL_LOOPS) {
          loopCount++;

          // Rebuild the tool context and session from LIVE refs on every
          // iteration so values produced earlier in this same turn (e.g. a
          // tokenId from a mint) are visible to later tools
          // (deposit/withdraw/unbroker_*) without waiting for a React
          // re-render.
          const liveToolCtx: ToolContext = {
            address: liveAddressRef.current?.toLowerCase(),
            chainId: liveChainIdRef.current,
            lastTokenId: lastTokenIdRef.current,
            writeContractAsync: (writeContractAsyncRef.current ??
              (async () => {
                throw new Error("Wallet not connected");
              })) as ToolContext["writeContractAsync"],
            sendTransactionAsync: walletClientRef.current
              ? async ({ to, data, value }) =>
                  walletClientRef.current!.sendTransaction({ to, data, value })
              : undefined,
            publicClient: publicClientRef.current,
          };
          const liveSession: ChatSessionContext = {
            ...session,
            chainId: liveChainIdRef.current,
            walletAddress: (liveAddressRef.current?.toLowerCase() ??
              session.walletAddress) as `0x${string}` | undefined,
            lastTokenId: lastTokenIdRef.current,
          };
          const systemContent = buildSystemPrompt(liveSession);

          const response = await apiFetchResponse("/v1/chat/completions", {
            method: "POST",
            body: JSON.stringify({
              model: CHAT_MODEL,
              messages: [
                { role: "system", content: systemContent },
                ...fitToContext(currentMessages, {
                  model: CHAT_MODEL,
                  system: systemContent,
                  tools: TOOLS,
                  contextWindow,
                }),
              ],
              tools: TOOLS,
              stream: true,
            }),
            signal: controller.signal,
            timeout: STREAM_TIMEOUT,
          });

          const body = response.body;
          if (!body) throw new Error("No response body from chat service");
          const reader = body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let assistantContent = "";
          const pendingToolCalls: ToolCall[] = [];
          let streamDone = false;

          while (!streamDone) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const parsed = consumeSseLines(buffer);
            buffer = parsed.rest;
            streamDone = parsed.done;

            for (const chunk of parsed.chunks) {
              const delta = chunk.choices?.[0]?.delta;
              if (!delta) continue;

              if (delta.content) {
                assistantContent += delta.content;
                streamTextRef.current = assistantContent;
                scheduleStreamTextUpdate();
              }

              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const call =
                    pendingToolCalls[tc.index] ??
                    (pendingToolCalls[tc.index] = {
                      id: "",
                      type: "function",
                      function: { name: "", arguments: "" },
                    });
                  if (tc.id) call.id = tc.id;
                  call.function.name += tc.function?.name ?? "";
                  call.function.arguments += tc.function?.arguments ?? "";
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
            const assistantMsg = createMessage({
              role: "assistant",
              content: assistantContent,
            });
            currentMessages = [...currentMessages, assistantMsg];
            messagesRef.current = currentMessages;
            setMessages(currentMessages);
            flushAndClearStreamText();
            break;
          }

          const assistantMsg = createMessage({
            role: "assistant",
            content: assistantContent || null,
            tool_calls: toolCallList,
          });
          currentMessages = [...currentMessages, assistantMsg];
          messagesRef.current = currentMessages;
          setMessages(currentMessages);
          flushAndClearStreamText();

          let sawAsk = false;
          const batches = groupParallelTools(toolCallList);
          for (const batch of batches) {
            const batchResults = await Promise.all(
              batch.map(async (tc) => {
                const handler = handlers[tc.function.name];
                if (!handler) {
                  return {
                    tc,
                    result: JSON.stringify({
                      error: `Unknown tool: ${tc.function.name}`,
                    }),
                  };
                }
                try {
                  const args = JSON.parse(tc.function.arguments?.trim() || "{}");
                  const result = await handler(args, liveToolCtx);
                  recordToolResult(tc.function.name, result);
                  // Capture any tokenId this tool produced so a later tool in
                  // the SAME turn sees it immediately (mirrors applyToolResult).
                  try {
                    const parsed = JSON.parse(result) as {
                      tokenId?: unknown;
                      agents?: Array<{ tokenId?: unknown }>;
                    };
                    const tok = parsed.tokenId ?? parsed.agents?.[0]?.tokenId;
                    if (tok !== undefined) {
                      lastTokenIdRef.current = String(tok);
                    }
                  } catch {
                    /* result not JSON — nothing to capture */
                  }
                  return { tc, result };
                } catch {
                  return {
                    tc,
                    result: JSON.stringify({ error: "could not parse tool arguments" }),
                  };
                }
              }),
            );
            for (const { tc, result } of batchResults) {
              const isAsk = isAskUserResult({ ok: true, content: result });
              if (isAsk) sawAsk = true;
              currentMessages = [
                ...currentMessages,
                createMessage({
                  role: "tool",
                  tool_call_id: tc.id,
                  name: tc.function.name,
                  content: isAsk ? result : formatToolResult(tc.function.name, result),
                }),
              ];
            }
          }
          messagesRef.current = currentMessages;
          setMessages(currentMessages);
          if (sawAsk) break;
        }

        const { exhausted, signal } = evaluateContinue(loopCount);
        if (exhausted) {
          currentMessages = [
            ...currentMessages,
            createMessage({
              role: "assistant",
              content: JSON.stringify({
                continue: true,
                reason: signal?.reason,
                message:
                  "This request needed more tool steps than allowed in one turn. Send a follow-up message to continue.",
              }),
            }),
          ];
          messagesRef.current = currentMessages;
          setMessages(currentMessages);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") { /* aborted — ignore */ } else {
          const msg = humanizeError(err);
          const ref = err as { code?: string; requestId?: string } | null;
          const refDesc =
            ref && (ref.code !== undefined || ref.requestId !== undefined)
              ? <ErrorRef code={ref.code} requestId={ref.requestId} />
              : undefined;
          if (
            msg.toLowerCase().includes("compute") ||
            msg.toLowerCase().includes("credits")
          ) {
            setComputeHint(msg);
          }
          if (msg.includes("429") || msg.toLowerCase().includes("rate limit")) {
            toast.error("Rate limited — wait a moment and try again.", refDesc ? { description: refDesc } : undefined);
          } else {
            toast.error(msg, refDesc ? { description: refDesc } : undefined);
          }
          const withError = [
            ...currentMessages,
            createMessage({
              role: "assistant",
              content: msg,
            }),
          ];
          messagesRef.current = withError;
          setMessages(withError);
        }
      } finally {
        isStreamingRef.current = false;
        setIsStreaming(false);
        flushAndClearStreamText();
        abortRef.current = null;
      }
    },
    [
      handlers,
      toolCtx,
      session,
      recordToolResult,
      hasUsedChat,
      flushAndClearStreamText,
      scheduleStreamTextUpdate,
      cancelStreamThrottle,
      chainSupported,
    ],
  );

  const processQueue = useCallback(() => {
    if (isStreamingRef.current) return;
    const next = queueRef.current.shift();
    if (next === undefined) return;
    setQueue([...queueRef.current]);
    void runAgent(next);
  }, [runAgent]);

  const sendMessage = useCallback(
    (userText: string) => {
      const text = userText.trim();
      if (!text) return;
      if (!chainSupported) return;
      setInput("");
      queueRef.current = [...queueRef.current, text];
      setQueue(queueRef.current);
      processQueue();
    },
    [processQueue],
  );

  useEffect(() => {
    if (!isStreaming) processQueue();
  }, [isStreaming, processQueue]);

  // Persist active thread + thread list (history sidebar)
  useEffect(() => {
    if (messages.length === 0) return;
    const next: ChatThread = {
      id: threadId,
      title: titleFromMessages(messages),
      updatedAt: Date.now(),
      messages,
    };
    setThreads((prev) => {
      const others = prev.filter((t) => t.id !== threadId);
      const merged = [next, ...others].sort((a, b) => b.updatedAt - a.updatedAt);
      saveThreads(merged);
      return merged;
    });
  }, [messages, threadId]);

  const startNewChat = useCallback(() => {
    setMessages([]);
    messagesRef.current = [];
    setQueue([]);
    queueRef.current = [];
    setThreadId(crypto.randomUUID());
    setComputeHint(null);
    setSidebarOpen(false);
    try {
      sessionStorage.removeItem(CHAT_MESSAGES_KEY);
    } catch {
      void 0;
    }
  }, []);

  const openThread = useCallback((t: ChatThread) => {
    setThreadId(t.id);
    setMessages(t.messages);
    messagesRef.current = t.messages;
    setComputeHint(null);
    setSidebarOpen(false);
  }, []);

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return (
    <div className={`chat-layout${sidebarOpen ? " is-sidebar-open" : ""}`}>
      <aside className="chat-sidebar" aria-label="Chat history">
        <div className="chat-sidebar__head">
          <h2 className="chat-sidebar__title">Chats</h2>
          <Button variant="ghost" onClick={startNewChat} style={{ fontSize: "var(--text-xs)" }}>
            New
          </Button>
        </div>
        <div className="chat-sidebar__list">
          {threads.length === 0 ? (
            <p className="chat-sidebar__empty">No history yet. Send a message.</p>
          ) : (
            threads.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`chat-sidebar__item${t.id === threadId ? " is-active" : ""}`}
                onClick={() => openThread(t)}
              >
                {t.title}
              </button>
            ))
          )}
        </div>
      </aside>

      <div className="chat-main">
        <div className="chat-topbar">
          <button
            type="button"
            className="shell-icon-btn chat-sidebar-toggle"
            aria-label="History"
            onClick={() => setSidebarOpen((v) => !v)}
          >
            ☰
          </button>
          <img
            src={BRAND.chatAvatar}
            alt=""
            width={32}
            height={32}
            className="chat-topbar__mark"
          />
          <div className="chat-topbar__meta">
            <div className="chat-topbar__name">{AXIOM_ASSISTANT_NAME}</div>
            <div className="chat-topbar__status">
              {chainSupported ? "Mint · vault · tick tools" : `Switch to 0G (${chainId})`}
            </div>
          </div>
          <Button variant="ghost" onClick={startNewChat} style={{ fontSize: "var(--text-xs)" }}>
            New chat
          </Button>
        </div>

        {computeHint && (
          <div className="chat-banner" role="status">
            {computeHint}
          </div>
        )}

        {!chainSupported && (
          <div className="chat-banner" role="status">
            Wrong network. Switch wallet to 0G Aristotle.
          </div>
        )}

        <div className="chat-messages" ref={listRef}>
        {messages.length === 0 && !isStreaming && (
          <div
            className="fade-enter"
            style={{
              margin: "auto",
              padding: "var(--space-2xl)",
              textAlign: "center",
              maxWidth: 520,
            }}
          >
            <h2
              style={{
                fontSize: "var(--text-xl)",
                color: "var(--c-text-primary)",
                marginBottom: "var(--space-sm)",
                fontFamily: "var(--font-display)",
              }}
            >
              {AXIOM_ASSISTANT_NAME}
            </h2>
            <p
              style={{
                color: "var(--c-text-muted)",
                fontSize: "var(--text-sm)",
                margin: "0 auto var(--space-lg)",
              }}
            >
              Mint, list agents, vault, ticks. Wallet signs when needed.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: "var(--space-sm)",
              }}
            >
              {[
                {
                  label: "List my agents",
                  hint: "What you own",
                },
                {
                  label: "Mint agent named Scout",
                  hint: "Wallet signs",
                },
                {
                  label: "Vault balance?",
                  hint: "0G holdings",
                },
                {
                  label: "Simulate a strategy tick",
                  hint: "Safe dry-run first",
                },
              ].map((p) => (
                <button
                  key={p.label}
                  className="prompt-card"
                  onClick={() => sendMessage(p.label)}
                >
                  <div
                    style={{
                      fontSize: "var(--text-sm)",
                      fontWeight: "var(--fw-semibold)",
                      color: "var(--c-text)",
                      marginBottom: 2,
                    }}
                  >
                    {p.label}
                  </div>
                  <div
                    style={{
                      fontSize: "var(--text-xs)",
                      color: "var(--c-text-dim)",
                    }}
                  >
                    {p.hint}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className="fade-enter"
              style={{
                padding: "var(--space-md) var(--space-lg)",
                borderRadius: "var(--radius-lg)",
                border: `1px solid ${msg.role === "user" ? "var(--c-bronze-border)" : COLORS.border}`,
                background: msg.role === "user" ? "var(--c-bronze-bg)" : msg.role === "tool" ? "var(--c-bg)" : "var(--c-surface)",
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
                  {msg.role === "tool" && msg.name ? (
                    <ToolClassBadge name={msg.name} />
                  ) : null}
                </span>
              </div>
              {msg.role === "tool" ? (
                msg.name === "ask_user" ? (
                  <AskUserCard content={msg.content ?? ""} onAnswer={sendMessage} />
                ) : (
                <div
                  role="region"
                  aria-label={
                    toolHint(msg.name ?? "") ??
                    TOOL_LABELS[msg.name ?? ""] ??
                    "Tool result"
                  }
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
                  <ToolResultBody name={msg.name ?? ""} content={msg.content} sendTransactionAsync={toolCtx.sendTransactionAsync} />
                </div>
                )
              ) : msg.tool_calls ? (
                <div
                  style={{
                    fontSize: "var(--text-sm)",
                    color: COLORS.textMuted,
                  }}
                >
                  {dedupeToolCalls(msg.tool_calls).map((tc) => (
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
                      <ToolClassBadge name={tc.function.name} />
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  className="chat-md"
                  style={{
                    fontSize: "var(--text-sm)",
                    color: COLORS.text,
                    lineHeight: "var(--lh-normal)",
                  }}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                />
              )}
            </div>
          ))}

          {/* Streaming in-progress indicator */}
          {isStreaming && (
            <div
              className="fade-enter"
              style={{
                padding: "var(--space-md) var(--space-lg)",
                borderRadius: "var(--radius-lg)",
                border: `1px solid ${COLORS.border}`,
                background: "var(--c-surface)",
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
              {streamText ? (
                <div
                  style={{ fontSize: "var(--text-sm)", color: COLORS.text, lineHeight: "var(--lh-normal)" }}
                >
                  <span
                    className="chat-md"
                    style={{ display: "inline" }}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(streamText) }}
                  />
                  <span
                    className="caret-blink"
                    aria-hidden="true"
                    style={{
                      display: "inline-block",
                      width: 2,
                      height: "1em",
                      background: "var(--c-phosphor)",
                      marginLeft: 2,
                      verticalAlign: "text-bottom",
                    }}
                  />
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
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Spinner size={14} />
                    <span style={{ color: COLORS.bronzeLight }}>
                      {waitingMessageForElapsed(elapsed)}
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
                </p>
              )}
            </div>
          )}
        </div>

        {queue.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--space-xs)",
              padding: "0 var(--space-lg) var(--space-sm)",
            }}
          >
            {queue.map((q, i) => (
              <span
                key={i}
                title={q}
                style={{
                  fontSize: "var(--text-xs)",
                  color: COLORS.textDim,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: "var(--radius-sm)",
                  padding: "2px 10px",
                }}
              >
                {q.length > 40 ? `${q.slice(0, 40)}…` : q}
              </span>
            ))}
          </div>
        )}

        <div className="chat-composer">
          <div className="chat-composer__row">
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
                  ? "Queue a follow-up…"
                  : `Message ${AXIOM_ASSISTANT_NAME}…`
              }
              maxLength={4000}
            />
            {isStreaming && (
              <Button variant="secondary" onClick={cancelStream}>
                Stop
              </Button>
            )}
            <Button
              variant={isStreaming ? "secondary" : "primary"}
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || !chainSupported}
            >
              {isStreaming ? "Queue" : "Send"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ChatPage(): ReactElement {
  return (
    <ChatSessionProvider>
      <ChatPageInner />
    </ChatSessionProvider>
  );
}
