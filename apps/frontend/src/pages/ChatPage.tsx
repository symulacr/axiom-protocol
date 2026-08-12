import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
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
import { useSearchParams } from "react-router-dom";
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
import { CHAT_TOOL_CATALOG, classOfTool } from "@axiom/config/chat-tools";
import {
  ArchiveResultCard,
  EncodePreviewCard,
  hasEncodePreview,
} from "../chat/ToolResultCards.js";
import {
  ChatSessionProvider,
  useChatSession,
} from "../chat/ChatSessionProvider.js";
const TransferModal = lazy(() =>
  import("../components/TransferModal.js").then((m) => ({
    default: m.TransferModal,
  })),
);
import {
  TOOLS,
  TOOL_LABELS,
  toolClass,
  toolHint,
  useToolHandlers,
  type ToolContext,
} from "../chat/tools.js";
import {
  CHAT_TOOL_CLASS_LABELS,
  AXIOM_ASSISTANT_NAME,
} from "@axiom/config/chat-tools";
import { CHAT_MODEL } from "../config/env.js";
import { aristotle } from "../config/wagmi.js";
import {
  COLORS,
  Button,
  Textarea,
  ErrorRef,
  Spinner,
  CopyButton,
} from "../components/ui.js";

type Message = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
  /** meta.error = UI-only error card (never sent to the model); usage = cost chip. */
  meta?: { error?: boolean; usage?: string };
  /** Optional citation chips rendered below assistant messages; href wraps the chip in a link. */
  sources?: Array<{ label: string; href?: string }>;
  /** Optional follow-up question shortcuts rendered below assistant messages. */
  followUps?: string[];
};

function createMessage(msg: Omit<Message, "id">): Message {
  return { ...msg, id: crypto.randomUUID() };
}

type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type ToolRunStatus = "running" | "success" | "error";

type ToolRun = {
  name: string;
  status: ToolRunStatus;
  startedAt: number;
  result?: string;
  error?: string;
  args?: Record<string, unknown>;
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
  /** Backend metadata frame ({type:"trace",trace}); mid-stream error frames may also arrive with code (STREAM_ERROR). */
  type?: string;
  trace?: Record<string, unknown>;
  error?: string;
  code?: string;
};

const SUPPORTED_CHAIN_IDS = new Set([aristotle.id]);
const CHAT_MESSAGES_KEY = "axiom:chat-messages";
const CHAT_THREADS_KEY = "axiom:chat-threads";

const chatMsgStyle: CSSProperties = {
  fontSize: "var(--text-sm)",
  color: COLORS.text,
  lineHeight: "var(--lh-normal)",
};

const dimXs: CSSProperties = {
  color: COLORS.textDim,
  fontSize: "var(--text-xs)",
};

const TOOL_GROUPS = (
  ["read", "encode", "orchestrate", "archive", "skill", "ask"] as const
)
  .map((cls) => ({
    cls,
    tools: CHAT_TOOL_CATALOG.filter((t) => t.class === cls),
  }))
  .filter((g) => g.tools.length > 0);

const insetCardStyle: CSSProperties = {
  background: COLORS.bg,
  border: `1px solid ${COLORS.border}`,
  borderRadius: "var(--radius-md)",
  padding: "var(--space-sm) var(--space-md)",
  marginTop: "var(--space-xs)",
};

type ChatThread = {
  id: string;
  title: string;
  updatedAt: number;
  messages: Message[];
};

function loadJsonArray<T>(storage: Storage, key: string): T[] {
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadThreads(): ChatThread[] {
  return loadJsonArray<ChatThread>(localStorage, CHAT_THREADS_KEY);
}

function saveThreads(threads: ChatThread[]): void {
  try {
    localStorage.setItem(
      CHAT_THREADS_KEY,
      JSON.stringify(threads.slice(0, 40)),
    );
  } catch {
    void 0;
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
    } catch {
      void 0;
    }
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

function StatusDot({
  color,
  children,
}: {
  color: string;
  children: ReactNode;
}): ReactElement {
  return (
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
          background: color,
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
        {children}
      </span>
    </div>
  );
}

function ChatBanner({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="chat-banner" role="status">
      {children}
    </div>
  );
}

function AskUserCard({
  content,
  onAnswer,
}: {
  content: string;
  onAnswer: (answer: string) => void;
}): ReactElement | null {
  const [selected, setSelected] = useState<string[]>([]);
  const [freeText, setFreeText] = useState("");
  let data: {
    ask?: boolean;
    question?: string;
    options?: string[];
    multiSelect?: boolean;
  } | null;
  try {
    data = JSON.parse(content);
  } catch {
    return null;
  }
  if (!data || data.ask !== true) return null;
  const question = data.question ?? "Question";
  const options = Array.isArray(data.options) ? data.options : [];
  const multiSelect = data.multiSelect === true;

  const submit = (answer: string): void => {
    setSelected([]);
    setFreeText("");
    onAnswer(answer);
  };

  return (
    <div style={insetCardStyle}>
      <p
        style={{
          margin: "0 0 8px",
          fontSize: "var(--text-sm)",
          color: COLORS.text,
        }}
      >
        {question}
      </p>
      {options.length > 0 ? (
        multiSelect ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              alignItems: "flex-start",
            }}
          >
            {options.map((o, i) => {
              const checked = selected.includes(o);
              return (
                <label
                  key={i}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: "var(--text-sm)",
                    color: COLORS.text,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setSelected((prev) =>
                        checked ? prev.filter((x) => x !== o) : [...prev, o],
                      )
                    }
                  />
                  {o}
                </label>
              );
            })}
            <Button
              variant="primary"
              disabled={selected.length === 0}
              onClick={() => submit(selected.join(", "))}
            >
              Submit
            </Button>
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {options.map((o, i) => (
              <Button key={i} variant="secondary" onClick={() => submit(o)}>
                {o}
              </Button>
            ))}
          </div>
        )
      ) : (
        <div style={{ display: "flex", gap: 8 }}>
          <Textarea
            aria-label="Answer"
            value={freeText}
            rows={1}
            onChange={(e) => setFreeText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && freeText.trim()) {
                e.preventDefault();
                submit(freeText.trim());
              }
            }}
            placeholder="Type your answer…"
            style={{ flex: 1 }}
          />
          <Button
            variant="primary"
            disabled={!freeText.trim()}
            onClick={() => submit(freeText.trim())}
          >
            Send
          </Button>
        </div>
      )}
    </div>
  );
}

function loadStoredMessages(): Message[] {
  return loadJsonArray<Message>(sessionStorage, CHAT_MESSAGES_KEY);
}

function renderMarkdown(src: string | null): string {
  return DOMPurify.sanitize(
    marked.parse(src ?? "", {
      async: false,
      gfm: true,
      breaks: false,
    }) as string,
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

// Per-tool-call ceiling: a hung skill/backend must not stall the agent loop forever.
const TOOL_TIMEOUT_MS = 60_000;

function withToolTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`tool timed out after ${Math.round(ms / 1000)}s`)),
      ms,
    );
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

function ChatPageInner(): ReactElement {
  const { address } = useAccount();
  const chainId = useChainId();
  const { session, recordToolResult } = useChatSession();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { data: walletClient } = useWalletClient();

  const [messages, setMessages] = useState(loadStoredMessages);
  const [contextWindow, setContextWindow] = useState<number>();
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [streamError, setStreamError] = useState<string | null>(null);
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
  const stickToBottomRef = useRef(true);
  const streamTextRef = useRef("");
  const streamErrorRef = useRef<string | null>(null);
  const lastStreamErrorRef = useRef<string | null>(null);
  const traceRef = useRef<Record<string, unknown> | null>(null);
  const streamThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const queueRef = useRef<string[]>([]);
  const [toolRuns, setToolRuns] = useState<Record<string, ToolRun>>({}); // callId -> ToolRun map powering the ToolCallCard live progress UI
  const toolRunsRef = useRef<Record<string, ToolRun>>({});
  const markToolRun = (id: string, patch: Partial<ToolRun>): void => {
    const cur = toolRunsRef.current[id];
    if (!cur) return;
    toolRunsRef.current[id] = { ...cur, ...patch };
  };
  const [expandedToolCalls, setExpandedToolCalls] = useState<Set<string>>(
    () => new Set(),
  );
  const isStreamingRef = useRef(false);
  const [threads, setThreads] = useState(loadThreads);
  const [threadId, setThreadId] = useState<string>(() => crypto.randomUUID());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [threadSearch, setThreadSearch] = useState("");
  const [computeHint, setComputeHint] = useState<string | null>(null);
  const [agentStep, setAgentStep] = useState(0);
  const [ttftMs, setTtftMs] = useState<number | null>(null);
  const [transferTokenId, setTransferTokenId] = useState<string | null>(null);
  const transferResolveRef = useRef<{
    resolve: (txHash: string) => void;
    reject: (err: Error) => void;
  } | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);

  // Live refs: state updates land only on the next render, so same-turn tools must see earlier-set values (mint tokenId -> deposit); synced each render here, within-turn writes in runAgent
  // AgentDetail's Chat button deep-links to /chat?agent=<tokenId>; seed the session default from the URL until a tool result overrides it.
  const [searchParams] = useSearchParams();
  const urlAgentParam = searchParams.get("agent");
  const urlAgentRef = useRef<string | undefined>(
    urlAgentParam && /^\d+$/.test(urlAgentParam) ? urlAgentParam : undefined,
  );
  const lastTokenIdRef = useRef<string | undefined>(
    urlAgentRef.current ?? session.lastTokenId,
  );
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

  // Opens the shared TransferModal (same flow as AgentDetail) and resolves when the user completes or cancels it.
  const openTransfer = useCallback((tokenId: string): Promise<string> => {
    const id = String(tokenId ?? "").trim();
    if (!/^\d+$/.test(id)) {
      return Promise.reject(new Error("invalid tokenId: " + tokenId));
    }
    return new Promise<string>((resolve, reject) => {
      transferResolveRef.current = { resolve, reject };
      setTransferTokenId(id);
    });
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
      openTransfer,
    }),
    [
      address,
      chainId,
      session.lastTokenId,
      writeContractAsync,
      walletClient,
      publicClient,
      openTransfer,
    ],
  );
  const handlers = useToolHandlers(toolCtx);
  const chainSupported = SUPPORTED_CHAIN_IDS.has(chainId);
  const tickRunning = Object.values(toolRuns).some(
    (r) => r.status === "running" && r.name === "execute_tick",
  );

  useEffect(() => {
    lastTokenIdRef.current = session.lastTokenId ?? urlAgentRef.current;
    liveAddressRef.current = address;
    liveChainIdRef.current = chainId;
    writeContractAsyncRef.current = writeContractAsync;
    walletClientRef.current = walletClient;
    publicClientRef.current = publicClient;
  }, [
    session.lastTokenId,
    address,
    chainId,
    writeContractAsync,
    walletClient,
    publicClient,
  ]);

  useEffect(() => {
    messagesRef.current = messages;
    try {
      if (messages.length === 0) {
        sessionStorage.removeItem(CHAT_MESSAGES_KEY);
      } else {
        sessionStorage.setItem(CHAT_MESSAGES_KEY, JSON.stringify(messages));
        localStorage.setItem(
          `axiom:thread:${threadId}`,
          JSON.stringify(messages),
        );
      }
    } catch {
      void 0;
    }
  }, [messages, threadId]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (stickToBottomRef.current) {
      // Auto-scroll only while stick-to-bottom holds true; never hijack reading-up mid-stream
      el.scrollTop = el.scrollHeight;
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
    apiFetch<{ contextWindow?: number }>("/v1/config") // attaches API key; /v1/config is auth-gated so no key -> 401, context stays unset
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
      isStreamingRef.current = true;
      setIsStreaming(true);
      streamErrorRef.current = null;
      setStreamError(null);
      traceRef.current = null;
      toolRunsRef.current = {};
      setToolRuns({});
      setAgentStep(0);
      setTtftMs(null);

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

      const runStartedAt = Date.now();
      let loopCount = 0;

      try {
        while (loopCount < MAX_TOOL_LOOPS) {
          loopCount++;
          setAgentStep(loopCount);

          const liveToolCtx: ToolContext = {
            // rebuilt from live refs each loop so same-turn tool values are visible without a React re-render
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

          let response: Response; // 429 Retry-After backoff: up to 2 retries, capped; apiFetchResponse throws HttpError with retryAfter on non-ok
          let attempt = 0;
          for (;;) {
            try {
              response = await apiFetchResponse("/v1/chat/completions", {
                method: "POST",
                body: JSON.stringify({
                  model: CHAT_MODEL,
                  messages: [
                    { role: "system", content: systemContent },
                    ...fitToContext(
                      currentMessages.filter((m) => !m.meta?.error),
                      {
                        model: CHAT_MODEL,
                        system: systemContent,
                        tools: TOOLS,
                        contextWindow,
                      },
                    ),
                  ],
                  tools: TOOLS,
                  stream: true,
                }),
                signal: controller.signal,
                timeout: STREAM_TIMEOUT,
              });
              break;
            } catch (err) {
              const retryAfter = (err as { retryAfter?: number })?.retryAfter;
              if (err instanceof DOMException && err.name === "AbortError") {
                throw err;
              }
              if (retryAfter === undefined || attempt >= 2) throw err;
              attempt++;
              await new Promise((r) =>
                setTimeout(r, Math.min(retryAfter, 10) * 1000),
              );
            }
          }

          const body = response.body;
          if (!body) throw new Error("No response body from chat service");
          const reader = body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let assistantContent = "";
          let firstTokenAt = 0;
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
              if (chunk.error || chunk.code) {
                streamErrorRef.current =
                  typeof chunk.error === "string"
                    ? chunk.error
                    : `Stream failed (${String(chunk.code ?? "STREAM_ERROR")})`;
                streamDone = true;
                break;
              }
              if (chunk.type === "trace") {
                traceRef.current = chunk.trace ?? traceRef.current;
                continue;
              }
              const delta = chunk.choices?.[0]?.delta;
              if (!delta) continue;

              if (delta.content) {
                if (!firstTokenAt) {
                  firstTokenAt = Date.now();
                  setTtftMs(firstTokenAt - runStartedAt);
                }
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
            if (streamErrorRef.current) {
              lastStreamErrorRef.current = streamErrorRef.current;
              setStreamError(streamErrorRef.current);
              flushAndClearStreamText();
              break;
            }
            if (!assistantContent) {
              lastStreamErrorRef.current = "No response — try again.";
              setStreamError(lastStreamErrorRef.current);
              flushAndClearStreamText();
              break;
            }
            const assistantMsg = createMessage({
              role: "assistant",
              content: assistantContent,
              meta: { usage: traceUsageLabel(traceRef.current) },
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
          for (const tc of toolCallList) {
            const id =
              tc.id ||
              `${tc.function.name}-${Math.random().toString(36).slice(2)}`;
            if (!tc.id) tc.id = id;
            let parsedArgs: Record<string, unknown> = {};
            try {
              parsedArgs = JSON.parse(tc.function.arguments?.trim() || "{}");
            } catch {
              void 0;
            }
            toolRunsRef.current[id] = {
              name: tc.function.name,
              status: "running",
              startedAt: Date.now(),
              args: parsedArgs,
            };
          }
          setToolRuns({ ...toolRunsRef.current });
          for (const batch of batches) {
            const batchResults = await Promise.all(
              batch.map(async (tc) => {
                const handler = handlers[tc.function.name];
                if (!handler) {
                  if (tc.id) {
                    markToolRun(tc.id, {
                      status: "error",
                      error: `Unknown tool: ${tc.function.name}`,
                    });
                  }
                  return {
                    tc,
                    result: JSON.stringify({
                      error: `Unknown tool: ${tc.function.name}`,
                    }),
                  };
                }
                try {
                  const args = JSON.parse(
                    tc.function.arguments?.trim() || "{}",
                  );
                  // transfer is user-paced (modal form + wallet prompts), not a backend call — no timeout
                  const result =
                    tc.function.name === "transfer"
                      ? await handler(args, liveToolCtx)
                      : await withToolTimeout(
                          handler(args, liveToolCtx),
                          TOOL_TIMEOUT_MS,
                        );
                  recordToolResult(tc.function.name, result);
                  try {
                    // capture produced tokenId so a later same-turn tool sees it (mirrors applyToolResult)
                    const parsed = JSON.parse(result) as {
                      tokenId?: unknown;
                      agents?: Array<{ tokenId?: unknown }>;
                    };
                    const tok = parsed.tokenId ?? parsed.agents?.[0]?.tokenId;
                    if (tok !== undefined) {
                      lastTokenIdRef.current = String(tok);
                    }
                  } catch {
                    void 0;
                  }
                  if (tc.id) {
                    markToolRun(tc.id, { status: "success", result });
                  }
                  return { tc, result };
                } catch (err) {
                  const toolErr =
                    err instanceof Error
                      ? err.message
                      : "could not parse tool arguments";
                  if (tc.id) {
                    markToolRun(tc.id, {
                      status: "error",
                      error: toolErr,
                    });
                  }
                  return {
                    tc,
                    result: JSON.stringify({ error: toolErr }),
                  };
                }
              }),
            );
            setToolRuns({ ...toolRunsRef.current });
            for (const { tc, result } of batchResults) {
              const isAsk = isAskUserResult({ ok: true, content: result });
              if (isAsk) sawAsk = true;
              currentMessages = [
                ...currentMessages,
                createMessage({
                  role: "tool",
                  tool_call_id: tc.id,
                  name: tc.function.name,
                  content: isAsk
                    ? result
                    : formatToolResult(tc.function.name, result),
                }),
              ];
            }
          }
          messagesRef.current = currentMessages;
          setMessages(currentMessages);
          if (sawAsk) break;
        }

        const { exhausted } = evaluateContinue(loopCount);
        if (exhausted) {
          currentMessages = [
            ...currentMessages,
            createMessage({
              role: "assistant",
              content: `Turn limit hit after ${MAX_TOOL_LOOPS} steps — send "continue" to keep going.`,
              meta: { error: true },
            }),
          ];
          messagesRef.current = currentMessages;
          setMessages(currentMessages);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // Stop pressed mid-loop: drop the assistant tool_calls message and any partial tool responses so no dangling calls persist into the next turn.
          const lastUser = currentMessages
            .map((m) => m.role)
            .lastIndexOf("user");
          if (lastUser >= 0) {
            const trimmed = currentMessages.slice(0, lastUser + 1);
            messagesRef.current = trimmed;
            setMessages(trimmed);
          }
        } else {
          const msg = humanizeError(err);
          const ref = err as { code?: string; requestId?: string } | null;
          const refDesc =
            ref && (ref.code !== undefined || ref.requestId !== undefined) ? (
              <ErrorRef code={ref.code} requestId={ref.requestId} />
            ) : undefined;
          if (
            msg.toLowerCase().includes("compute") ||
            msg.toLowerCase().includes("credits")
          ) {
            setComputeHint(msg);
          }
          if (msg.includes("429") || msg.toLowerCase().includes("rate limit")) {
            toast.error(
              "Rate limited — wait a moment and try again.",
              refDesc ? { description: refDesc } : undefined,
            );
          } else {
            toast.error(msg, refDesc ? { description: refDesc } : undefined);
          }
          const withError = [
            // meta.error card is UI-only — never sent to the model as context
            ...currentMessages,
            createMessage({
              role: "assistant",
              content: msg,
              meta: { error: true },
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
      setInput("");
      queueRef.current = [...queueRef.current, text];
      setQueue(queueRef.current);
      processQueue();
    },
    [processQueue],
  );

  // Follow-up suggestion click: drop the question into the composer for review.
  const handleFollowUp = useCallback((q: string) => {
    setInput(q);
  }, []);

  useEffect(() => {
    if (!isStreaming) processQueue();
  }, [isStreaming, processQueue]);

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
      const merged = [next, ...others].sort(
        (a, b) => b.updatedAt - a.updatedAt,
      );
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

  const deleteThread = useCallback(
    (id: string) => {
      setThreads((prev) => {
        const next = prev.filter((t) => t.id !== id);
        saveThreads(next);
        return next;
      });
      // deleting the ACTIVE thread must not leave it on screen — select the next one or clear to new-chat
      if (id === threadId) {
        const nextThread = threads.find((t) => t.id !== id);
        if (nextThread) openThread(nextThread);
        else startNewChat();
      }
    },
    [threadId, threads, openThread, startNewChat],
  );

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return (
    <div className={`chat-layout${sidebarOpen ? " is-sidebar-open" : ""}`}>
      <aside className="chat-sidebar" aria-label="Chat history">
        <div className="chat-sidebar__head">
          <h2 className="chat-sidebar__title">Chats</h2>
          <Button
            variant="ghost"
            onClick={startNewChat}
            style={{ fontSize: "var(--text-xs)" }}
          >
            New
          </Button>
        </div>
        <input
          aria-label="Search chats"
          value={threadSearch}
          onChange={(e) => setThreadSearch(e.target.value)}
          placeholder="Search chats…"
          style={{
            margin: "0 var(--space-sm) var(--space-sm)",
            padding: "4px 8px",
            fontSize: "var(--text-xs)",
            color: COLORS.text,
            background: "var(--c-bg)",
            border: `1px solid ${COLORS.border}`,
            borderRadius: "var(--radius-sm)",
            width: "calc(100% - var(--space-lg))",
          }}
        />
        <div className="chat-sidebar__list">
          {threads.length === 0 ? (
            <p className="chat-sidebar__empty">
              No history yet. Send a message.
            </p>
          ) : (
            threads
              .filter(
                (t) =>
                  !threadSearch ||
                  t.title.toLowerCase().includes(threadSearch.toLowerCase()),
              )
              .map((t) => (
                <div
                  key={t.id}
                  className={`chat-sidebar__item${t.id === threadId ? " is-active" : ""}`}
                  style={{ display: "flex", alignItems: "center" }}
                >
                  <button
                    type="button"
                    onClick={() => openThread(t)}
                    style={{
                      flex: 1,
                      border: "none",
                      background: "none",
                      color: "inherit",
                      cursor: "pointer",
                      font: "inherit",
                      fontSize: "var(--text-xs)",
                      textAlign: "left",
                      padding: "6px 4px",
                    }}
                    title={t.title}
                  >
                    {t.title}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete chat: ${t.title}`}
                    onClick={() => deleteThread(t.id)}
                    style={{
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      color: COLORS.textDim,
                      padding: "4px",
                      fontFamily: "inherit",
                      fontSize: "var(--text-xs)",
                    }}
                  >
                    ✕
                  </button>
                </div>
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
              {chainSupported
                ? "Mint · vault · tick tools"
                : `Switch to 0G (${chainId})`}
            </div>
          </div>
          <Button
            variant="ghost"
            onClick={startNewChat}
            style={{ fontSize: "var(--text-xs)" }}
          >
            New chat
          </Button>
        </div>

        {computeHint && <ChatBanner>{computeHint}</ChatBanner>}

        {!chainSupported && (
          <ChatBanner>Wrong network. Switch wallet to 0G Aristotle.</ChatBanner>
        )}

        <div
          className="chat-messages"
          ref={listRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stickToBottomRef.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
        >
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
                Agents · vaults · ticks. Wallet signs on-chain actions.
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
                    label: "My agents",
                    hint: "What you own",
                  },
                  {
                    label: "Mint agent",
                    hint: "Wallet signs",
                  },
                  {
                    label: "Vault balance",
                    hint: "0G holdings",
                  },
                  {
                    label: "Simulate tick",
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
              <div style={{ marginTop: "var(--space-md)", textAlign: "left" }}>
                <button
                  type="button"
                  className="prompt-card"
                  onClick={() => setToolsOpen((v) => !v)}
                  aria-expanded={toolsOpen}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                  }}
                >
                  <span
                    style={{
                      fontSize: "var(--text-sm)",
                      fontWeight: "var(--fw-semibold)",
                      color: "var(--c-text)",
                    }}
                  >
                    All {CHAT_TOOL_CATALOG.length} tools
                  </span>
                  <span
                    style={{
                      fontSize: "var(--text-xs)",
                      color: "var(--c-text-dim)",
                    }}
                  >
                    {toolsOpen ? "hide ▴" : "browse ▾"}
                  </span>
                </button>
                {toolsOpen && (
                  <div
                    style={{
                      marginTop: "var(--space-sm)",
                      maxHeight: 320,
                      overflowY: "auto",
                      paddingRight: 4,
                    }}
                  >
                    {TOOL_GROUPS.map((g) => (
                      <div
                        key={g.cls}
                        style={{ marginBottom: "var(--space-sm)" }}
                      >
                        <div
                          style={{
                            fontSize: "var(--text-xs)",
                            fontWeight: "var(--fw-semibold)",
                            color: COLORS.textDim,
                            textTransform: "uppercase",
                            letterSpacing: "0.02em",
                            marginBottom: 4,
                          }}
                        >
                          {CHAT_TOOL_CLASS_LABELS[g.cls]}
                        </div>
                        {g.tools.map((t) => {
                          const hint =
                            t.hint.length > 90
                              ? `${t.hint.slice(0, 90)}…`
                              : t.hint;
                          return (
                            <button
                              key={t.name}
                              type="button"
                              onClick={() => setInput(t.name)}
                              title={t.hint}
                              style={{
                                display: "block",
                                width: "100%",
                                textAlign: "left",
                                border: "none",
                                background: "none",
                                cursor: "pointer",
                                padding: "3px 0",
                                font: "inherit",
                                fontSize: "var(--text-xs)",
                                color: COLORS.text,
                              }}
                            >
                              <code
                                style={{
                                  fontFamily: "var(--font-mono)",
                                  color: COLORS.bronzeLight,
                                }}
                              >
                                {t.name}
                              </code>
                              <span style={{ color: COLORS.textMuted }}>
                                {" — "}
                                {hint}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
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
                background:
                  msg.role === "user"
                    ? "var(--c-bronze-bg)"
                    : msg.role === "tool"
                      ? "var(--c-bg)"
                      : "var(--c-surface)",
              }}
            >
              <StatusDot
                color={
                  msg.role === "user"
                    ? COLORS.bronzeLight
                    : msg.role === "tool"
                      ? COLORS.textDim
                      : COLORS.text
                }
              >
                {msg.role === "user"
                  ? "You"
                  : msg.role === "tool"
                    ? (TOOL_LABELS[msg.name ?? ""] ?? msg.name ?? "Tool")
                    : "Assistant"}
                {msg.role === "tool" && msg.name ? (
                  <ToolClassBadge name={msg.name} />
                ) : null}
                <span className="msg-actions" style={{ marginLeft: "auto" }}>
                  {msg.role === "user" ? (
                    <button
                      type="button"
                      className="msg-action"
                      title="Edit and resend"
                      onClick={() => {
                        const text = msg.content ?? "";
                        const idx = messagesRef.current.findIndex(
                          (m) => m.id === msg.id,
                        );
                        if (idx >= 0) {
                          if (idx < messagesRef.current.length - 1) {
                            const ok = window.confirm(
                              "Edit replaces the rest of this conversation after this message. Continue?",
                            );
                            if (!ok) return;
                          }
                          const trimmed = messagesRef.current.slice(0, idx);
                          messagesRef.current = trimmed;
                          setMessages(trimmed);
                        }
                        setInput(text);
                      }}
                    >
                      Edit
                    </button>
                  ) : null}
                  {msg.role === "assistant" &&
                  !msg.meta?.error &&
                  msg.id === messages[messages.length - 1]?.id ? (
                    <button
                      type="button"
                      className="msg-action"
                      title="Regenerate reply"
                      onClick={() => {
                        const idx = messagesRef.current.findIndex(
                          (m) => m.id === msg.id,
                        );
                        if (idx > 0) {
                          const trimmed = messagesRef.current.slice(0, idx);
                          const lastUser = [...trimmed]
                            .reverse()
                            .find((m) => m.role === "user");
                          messagesRef.current = trimmed;
                          setMessages(trimmed);
                          if (lastUser?.content)
                            void runAgent(lastUser.content);
                        }
                      }}
                    >
                      Regenerate
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="msg-action"
                    title="Copy message"
                    onClick={() => {
                      void navigator.clipboard?.writeText(msg.content ?? "");
                    }}
                  >
                    Copy
                  </button>
                </span>
              </StatusDot>
              {msg.role === "tool" ? (
                msg.name === "ask_user" ? (
                  <AskUserCard
                    content={msg.content ?? ""}
                    onAnswer={sendMessage}
                  />
                ) : (
                  <div
                    role="region"
                    aria-label={
                      toolHint(msg.name ?? "") ??
                      TOOL_LABELS[msg.name ?? ""] ??
                      "Tool result"
                    }
                    style={{
                      ...insetCardStyle,
                      fontSize: "var(--text-sm)",
                      color: COLORS.textMuted,
                    }}
                  >
                    <ToolResultBody
                      name={msg.name ?? ""}
                      content={msg.content}
                      sendTransactionAsync={toolCtx.sendTransactionAsync}
                    />
                  </div>
                )
              ) : msg.tool_calls ? (
                <div
                  style={{
                    fontSize: "var(--text-sm)",
                    color: COLORS.textMuted,
                  }}
                >
                  {dedupeToolCalls(msg.tool_calls).map((tc) => {
                    const run = tc.id ? toolRuns[tc.id] : undefined;
                    return (
                      <ToolCallCard
                        key={tc.id}
                        run={
                          run ?? {
                            name: tc.function.name,
                            status: "running",
                            startedAt: Date.now(),
                          }
                        }
                        expanded={expandedToolCalls.has(tc.id)}
                        onToggle={() =>
                          setExpandedToolCalls((prev) => {
                            const next = new Set(prev);
                            if (next.has(tc.id)) next.delete(tc.id);
                            else next.add(tc.id);
                            return next;
                          })
                        }
                      />
                    );
                  })}
                </div>
              ) : (
                <div>
                  <div
                    className="chat-md"
                    style={chatMsgStyle}
                    dangerouslySetInnerHTML={{
                      __html: renderMarkdown(msg.content),
                    }}
                  />
                  {msg.meta?.usage ? (
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: "var(--text-xs)",
                        color: COLORS.textDim,
                      }}
                    >
                      {msg.meta.usage}
                    </div>
                  ) : null}
                  {msg.role === "assistant" &&
                  msg.sources &&
                  msg.sources.length > 0 ? (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "var(--space-xs)",
                        marginTop: "var(--space-sm)",
                      }}
                    >
                      {msg.sources.length} sources
                      {msg.sources.map((s, i) => {
                        let domain = "";
                        try {
                          domain = s.href
                            ? new URL(s.href).hostname.replace(/^www\./, "")
                            : "";
                        } catch {
                          domain = "";
                        }
                        const chipStyle = {
                          border: "1px solid var(--c-border)",
                          borderRadius: "var(--radius-sm)",
                          padding: "2px 8px",
                          fontSize: "var(--text-xs)",
                          color: COLORS.textMuted,
                        };
                        return s.href ? (
                          <a
                            key={i}
                            href={s.href}
                            target="_blank"
                            rel="noreferrer"
                            style={{ ...chipStyle, textDecoration: "none" }}
                          >
                            {s.label}
                            {domain && ` · ${domain}`}
                          </a>
                        ) : (
                          <span key={i} style={chipStyle}>
                            {s.label}
                          </span>
                        );
                      })}
                    </div>
                  ) : null}
                  {msg.role === "assistant" &&
                  msg.followUps &&
                  msg.followUps.length > 0 ? (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        marginTop: "var(--space-sm)",
                      }}
                    >
                      {msg.followUps.map((q, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => handleFollowUp(q)}
                          style={{
                            border: "none",
                            background: "none",
                            padding: 0,
                            font: "inherit",
                            color: COLORS.bronzeLight,
                            fontSize: "var(--text-xs)",
                            marginRight: 8,
                            cursor: "pointer",
                          }}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {msg.role === "assistant" && !msg.meta?.error ? (
                    <div
                      style={{
                        display: "flex",
                        gap: "var(--space-sm)",
                        marginTop: "var(--space-sm)",
                      }}
                    >
                      <CopyButton text={msg.content ?? ""} />
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ))}

          {streamError !== null && (
            <div
              role="alert"
              className="fade-enter"
              style={{
                padding: "var(--space-md) var(--space-lg)",
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--c-danger-border)",
                background: "var(--c-danger-bg)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "var(--space-md)",
                }}
              >
                <span
                  style={{ fontSize: "var(--text-sm)", color: COLORS.text }}
                >
                  {streamError}
                </span>
                <span
                  style={{
                    display: "flex",
                    gap: "var(--space-sm)",
                    flexShrink: 0,
                  }}
                >
                  <Button
                    variant="primary"
                    onClick={() => {
                      const last = lastStreamErrorRef.current;
                      setStreamError(null);
                      if (last && messagesRef.current.length > 0) {
                        const lastUser = [...messagesRef.current]
                          .reverse()
                          .find((m) => m.role === "user");
                        if (lastUser?.content) {
                          void runAgent(lastUser.content);
                        }
                      }
                    }}
                  >
                    Retry
                  </Button>
                  <Button variant="ghost" onClick={() => setStreamError(null)}>
                    Dismiss
                  </Button>
                </span>
              </div>
            </div>
          )}

          {isStreaming && (
            <div
              className="fade-enter"
              role="status"
              aria-live="polite"
              aria-label="Assistant is responding"
              style={{
                padding: "var(--space-md) var(--space-lg)",
                borderRadius: "var(--radius-lg)",
                border: `1px solid ${COLORS.border}`,
                background: "var(--c-surface)",
              }}
            >
              <StatusDot color={COLORS.text}>Assistant</StatusDot>
              {streamText ? (
                <div style={{ ...chatMsgStyle, whiteSpace: "pre-wrap" }}>
                  <span className="stream-tail">{streamText}</span>
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
                  style={{ ...chatMsgStyle, margin: 0, whiteSpace: "pre-wrap" }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Spinner size={14} variant="churn" />
                    <span style={{ color: COLORS.bronzeLight }}>
                      {phaseLabel(elapsed, toolRuns, streamText)}
                    </span>
                    {tickRunning ? (
                      <span style={dimXs}>Tick in progress…</span>
                    ) : null}
                    {agentStep > 0 ? (
                      <span style={dimXs}>
                        step {agentStep}/{MAX_TOOL_LOOPS}
                      </span>
                    ) : null}
                    {ttftMs !== null && ttftMs >= 0 ? (
                      <span style={dimXs}>TTFT {ttftMs}ms</span>
                    ) : null}
                    <span style={dimXs}>{elapsed > 0 && `(${elapsed}s)`}</span>
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
            <span
              style={{
                fontSize: "var(--text-xs)",
                color: COLORS.textMuted,
                alignSelf: "center",
              }}
            >
              {queue.length} queued
            </span>
            {queue.map((q, i) => (
              <span
                key={`${i}-${q}`}
                title={q}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: "var(--text-xs)",
                  color: COLORS.textDim,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: "var(--radius-sm)",
                  padding: "2px 4px 2px 10px",
                }}
              >
                {q.length > 40 ? `${q.slice(0, 40)}…` : q}
                <button
                  type="button"
                  aria-label="Remove queued message"
                  onClick={() => {
                    const next = queueRef.current.filter((_, idx) => idx !== i);
                    queueRef.current = next;
                    setQueue(next);
                  }}
                  style={{
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    color: COLORS.textDim,
                    padding: 0,
                    fontFamily: "inherit",
                    fontSize: "var(--text-xs)",
                    lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="chat-composer">
          <div className="chat-composer__row">
            <Textarea
              aria-label="Chat input"
              value={input}
              rows={1}
              onChange={(e) => {
                setInput(e.target.value);
                const el = e.target;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 6 * 22)}px`;
              }}
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
              disabled={!input.trim()}
            >
              {isStreaming ? "Queue" : "Send"}
            </Button>
          </div>
        </div>
        {transferTokenId !== null && (
          <Suspense fallback={null}>
            <TransferModal
              open
              tokenId={BigInt(transferTokenId)}
              onClose={() => {
                setTransferTokenId(null);
                transferResolveRef.current?.reject(
                  new Error(
                    "Transfer cancelled — no transaction was submitted.",
                  ),
                );
                transferResolveRef.current = null;
              }}
              onSuccess={(txHash) => {
                setTransferTokenId(null);
                transferResolveRef.current?.resolve(txHash);
                transferResolveRef.current = null;
              }}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}

function phaseLabel(
  elapsedSec: number,
  runs: Record<string, ToolRun>,
  streamText: string,
): string {
  const running = Object.values(runs).filter((r) => r.status === "running");
  if (running.length > 0) {
    const names = running.map((r) => TOOL_LABELS[r.name] ?? r.name).join(", ");
    return `Running ${names}… (${elapsedSec}s)`;
  }
  if (streamText) return `Streaming response… (${elapsedSec}s)`;
  if (elapsedSec < 2) return "Thinking…";
  return `Waiting for model response… (${elapsedSec}s)`;
}

function traceUsageLabel(
  trace: Record<string, unknown> | null,
): string | undefined {
  if (!trace) return undefined;
  const parts: string[] = [];
  const usage = trace.usage as
    | {
        total_tokens?: number;
        prompt_tokens?: number;
        completion_tokens?: number;
      }
    | undefined;
  if (usage?.total_tokens)
    parts.push(`${usage.total_tokens.toLocaleString()} tokens`);
  const cost = trace.cost ?? trace.amount;
  if (typeof cost === "number" && cost > 0) parts.push(`≈$${cost.toFixed(4)}`);
  if (parts.length === 0) return "compute billed";
  return parts.join(" · ");
}

function ToolCallCard({
  run,
  expanded,
  onToggle,
}: {
  run: ToolRun;
  expanded: boolean;
  onToggle: () => void;
}): ReactElement {
  const label = TOOL_LABELS[run.name] ?? run.name;
  const elapsedSec = Math.max(
    0,
    Math.floor((Date.now() - run.startedAt) / 1000),
  );
  return (
    <div
      style={{
        border: "1px solid var(--c-border)",
        borderRadius: "var(--radius-md)",
        margin: "var(--space-xs) 0",
        background: "var(--c-surface)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-sm)",
          width: "100%",
          padding: "6px 10px",
          border: "none",
          background: "none",
          cursor: "pointer",
          color: COLORS.text,
          textAlign: "left",
          font: "inherit",
          fontSize: "var(--text-xs)",
        }}
        aria-expanded={expanded}
      >
        {run.status === "running" ? (
          <Spinner size={12} />
        ) : run.status === "success" ? (
          <span style={{ color: "var(--c-success)" }} aria-hidden="true">
            ✓
          </span>
        ) : (
          <span style={{ color: "var(--c-danger)" }} aria-hidden="true">
            ✕
          </span>
        )}
        <strong style={{ color: COLORS.bronzeLight }}>{label}</strong>
        <ToolClassBadge name={run.name} />
        <span
          style={{
            marginLeft: "auto",
            color: COLORS.textDim,
            fontSize: "var(--text-xs)",
            whiteSpace: "nowrap",
          }}
        >
          {run.status === "running"
            ? `${elapsedSec}s…`
            : run.status === "success"
              ? "done"
              : "failed"}
        </span>
      </button>
      {expanded && (
        <div
          style={{
            padding: "6px 10px",
            borderTop: "1px solid var(--c-border)",
            fontSize: "var(--text-xs)",
            color: COLORS.textMuted,
          }}
        >
          <div style={{ marginBottom: 6 }}>
            {run.status === "running"
              ? `running ${elapsedSec}s`
              : `ran in ${elapsedSec}s`}
          </div>
          {run.result && !hasEncodePreview(run.result) ? (
            <div
              style={{
                margin: "0 0 6px",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-xs)",
                color: COLORS.textMuted,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {run.result.length > 80
                ? `${run.result.slice(0, 80)}…`
                : run.result}
            </div>
          ) : null}
          {run.args && Object.keys(run.args).length > 0 && (
            <pre
              style={{
                margin: "0 0 6px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-xs)",
              }}
            >
              {JSON.stringify(run.args, null, 2)}
            </pre>
          )}
          {run.error ? (
            <span style={{ color: "var(--c-danger)" }}>{run.error}</span>
          ) : run.result ? (
            hasEncodePreview(run.result) ? (
              <span style={{ color: COLORS.textMuted }}>
                Encode preview rendered in the tool card above.
              </span>
            ) : (
              <ToolResultBody name={run.name} content={run.result} />
            )
          ) : null}
        </div>
      )}
    </div>
  );
}

function ToolResultBody({
  name,
  content,
  sendTransactionAsync,
}: {
  name: string;
  content: string | null;
  sendTransactionAsync?: (a: {
    to: `0x${string}`;
    data?: `0x${string}`;
    value?: bigint;
  }) => Promise<`0x${string}`>;
}): ReactElement | null {
  if (hasEncodePreview(content)) {
    return (
      <EncodePreviewCard
        content={content}
        toolName={name}
        onSign={sendTransactionAsync}
      />
    );
  }

  if (classOfTool(name) === "archive") {
    return <ArchiveResultCard name={name} content={content} />;
  }

  const text = formatToolResult(name, content);
  if (!text) return null;

  return (
    <pre
      style={{
        fontSize: "var(--text-xs)",
        margin: 0,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        lineHeight: "var(--lh-normal)",
        fontFamily: "inherit",
        color: COLORS.textMuted,
      }}
    >
      {text}
    </pre>
  );
}

export default function ChatPage(): ReactElement {
  return (
    <ChatSessionProvider>
      <ChatPageInner />
    </ChatSessionProvider>
  );
}
