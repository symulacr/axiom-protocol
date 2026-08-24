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
import { createPortal } from "react-dom";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWriteContract,
  useWalletClient,
} from "wagmi";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BRAND } from "../brand/assets.js";
import { toast } from "sonner";
import {
  apiFetch,
  postStreamingWithRetry,
  STREAM_TIMEOUT,
} from "../utils/apiFetch.js";
import {
  deleteThread as deleteThreadFromStore,
  upsertThread,
  useThreads,
  type ChatThread as StoredThread,
} from "../hooks/useThreads.js";
import { useChatHistory } from "../hooks/useChatHistory.js";
import { useChatTxStream } from "../hooks/useChatTxStream.js";
import { useThrottledStreamText } from "../hooks/useThrottledStreamText.js";
import { useShellSidebar } from "../hooks/useShellSidebar.js";
import {
  normalizeProviders,
  useProviders,
  type ComputeProvider,
} from "../hooks/useProviders.js";
import { ChatHistorySection } from "../components/ChatHistorySection.js";
import {
  humanizeError,
  truncateHex,
  explorerTxUrl,
  truncateAddress,
} from "../utils/format.js";
import {
  createMessage,
  parseToolArguments,
  toMessages,
  loadJsonArray,
  titleFromMessages,
  consumeSseLines,
  renderMarkdown,
  dedupeToolCalls,
  humanizeToolMessage,
  captureTurnMetrics,
  formatInsightsLine,
  type Message,
  type SSEChunk,
  type TurnMetric,
  type ToolCall,
} from "../chat/lib.js";
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
import { classOfTool, resolveContextWindow } from "@axiom/config/chat-tools";
import {
  ArchiveResultCard,
  EncodePreviewCard,
  hasEncodePreview,
} from "../chat/ToolResultCards.js";
import {
  ChatSessionProvider,
  useChatSession,
  DEFAULT_PROVIDER_PREF,
  type ProviderPref,
} from "../chat/ChatSessionProvider.js";
const TransferModal = lazy(() =>
  import("../components/TransferModal.js").then((m) => ({
    default: m.TransferModal,
  })),
);
import {
  TOOLS,
  TOOL_LABELS,
  CLIENT_TOOL_CATALOG,
  toolClass,
  toolHint,
  useToolHandlers,
  type ToolContext,
} from "../chat/tools.js";
import { buildWaitForReceipt } from "../chat/transport-browser.js";
import {
  CHAT_TOOL_CLASS_LABELS,
  AXIOM_ASSISTANT_NAME,
} from "@axiom/config/chat-tools";
import { CHAT_MODEL } from "../config/env.js";
import { APP_CHAIN, APP_CHAIN_ID } from "../config/wagmi.js";
import { getCopy, interpolate, type Copy } from "../lib/copy.js";
import { useUiStore } from "../lib/uiStore.js";
import {
  COLORS,
  Textarea,
  ErrorRef,
  Spinner,
  CopyButton,
  SectionTitle,
  MonoLabel,
} from "../components/ui.js";
import { Button } from "../components/axiom/Controls.js";
import { MessageSquare, Network } from "../components/axiom/icons.js";

type ToolRunStatus = "running" | "success" | "error";

type ToolRun = {
  name: string;
  status: ToolRunStatus;
  startedAt: number;
  result?: string;
  error?: string;
  args?: Record<string, unknown>;
};

/** One LLM turn (one tool-loop iteration) — client timings + router usage/trace. */
const SUPPORTED_CHAIN_IDS = new Set([APP_CHAIN_ID]);
const CHAT_MESSAGES_KEY = "axiom:chat-messages";
/** Active threadId (sessionStorage): lets a page reload resume the SAME
 * thread instead of generating a fresh id (which duplicated threads and
 * detached the in-progress conversation from its history). */
const CHAT_THREAD_KEY = "axiom:chat-thread";

const chatMsgStyle: CSSProperties = {
  fontSize: "var(--fs-body)" /* chat baseline rides the one body step */,
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
    tools: CLIENT_TOOL_CATALOG.filter((t) => t.class === cls),
  }))
  .filter((g) => g.tools.length > 0);

const insetCardStyle: CSSProperties = {
  background: COLORS.bg,
  border: `1px solid ${COLORS.border}`,
  borderRadius: "var(--radius-md)",
  padding: "var(--space-sm) var(--space-md)",
  marginTop: "var(--space-xs)",
};

/** Store threads carry `unknown[]` at the storage boundary; ChatPage casts
 * them to Message[] when opening a thread (they were written by this page).
 * Server transcripts (GET /v1/chat/history) were persisted through
 * toChatApiMessages, which strips `id` — re-assign ids so React keys and
 * message actions keep working. */

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
      <span className="fw-semibold text-xs text-dim uppercase">{children}</span>
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
  copy,
}: {
  content: string;
  onAnswer: (answer: string) => void;
  copy: Copy["chat"];
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
  const question = data.question ?? copy.questionFallback;
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
              {copy.send}
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
            aria-label={copy.answerPlaceholder}
            value={freeText}
            rows={1}
            onChange={(e) => setFreeText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && freeText.trim()) {
                e.preventDefault();
                submit(freeText.trim());
              }
            }}
            placeholder={copy.answerPlaceholder}
            style={{ flex: 1 }}
          />
          <Button
            variant="primary"
            disabled={!freeText.trim()}
            onClick={() => submit(freeText.trim())}
          >
            {copy.send}
          </Button>
        </div>
      )}
    </div>
  );
}

function loadStoredMessages(): Message[] {
  // The synthetic `[Earlier conversation summary]` lead is recomputed per run
  // (cached per thread) — never persist it. Strip defensively so legacy
  // stored transcripts can't re-inject another thread's summary at mount.
  return stripSummaryLead(
    loadJsonArray<Message>(sessionStorage, CHAT_MESSAGES_KEY),
  );
}

function loadStoredThreadId(): string | null {
  try {
    const raw = sessionStorage.getItem(CHAT_THREAD_KEY);
    return typeof raw === "string" && raw ? raw : null;
  } catch {
    return null;
  }
}

/** 05: console references in assistant answers become links —
 * `Agent #N` → the agent page (internal, SPA-routed via the click
 * interceptor on the message list), 64-hex hashes → the block explorer. */

/** Per-message copy action with the app-wide inline-confirm contract (04
 * ): the label swaps to "✓ Copied" for ~1.2s, matching the ui.tsx
 * CopyButton primitive used inside tool cards. */
function MsgCopyAction({
  text,
  copy,
}: {
  text: string;
  copy: Copy["chat"];
}): ReactElement {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(
    () => () => {
      if (timerRef.current !== undefined) clearTimeout(timerRef.current);
    },
    [],
  );
  return (
    <button
      type="button"
      className="msg-action"
      title={copied ? copy.copiedMessage : copy.copyMessage}
      onClick={() => {
        void navigator.clipboard?.writeText(text);
        setCopied(true);
        if (timerRef.current !== undefined) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? `✓ ${copy.copiedMessage}` : copy.copyShort}
    </button>
  );
}

function MessageEditConfirm({
  onConfirm,
  onCancel,
  copy,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  copy: Copy["chat"];
}): ReactElement {
  return (
    <span className="msg-confirm">
      <span className="msg-confirm__text">{copy.editDiscards}</span>
      <button
        type="button"
        className="msg-action msg-action--danger"
        title={copy.discardEditTitle}
        onClick={onConfirm}
      >
        {copy.edit}
      </button>
      <button
        type="button"
        className="msg-action"
        title={copy.keepConversationTitle}
        onClick={onCancel}
      >
        {copy.cancel}
      </button>
    </span>
  );
}

function ChatPageInner(): ReactElement {
  const { address } = useAccount();
  const chainId = useChainId();
  // every rendered chat string routes through copy.chat (the old dead
  // section described the old chat; these keys describe the live one).
  const { state: uiState } = useUiStore();
  const chatCopy = getCopy(uiState.settings.locale).chat;
  const a11y = getCopy(uiState.settings.locale).a11y;
  // network name and native token unit come from chain config.
  const chainVars = { chainName: APP_CHAIN.name, chainId: APP_CHAIN_ID };
  const nativeSymbol = APP_CHAIN.nativeCurrency.symbol;
  const { session, recordToolResult, providerPref, setProviderPref } =
    useChatSession();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { data: walletClient } = useWalletClient();

  const [messages, setMessages] = useState(loadStoredMessages);
  const [contextWindow, setContextWindow] = useState<number>();
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  // Stream text + its 50ms render throttle live in one hook; the local aliases
  // below keep the run/stream call sites reading exactly as before.
  const {
    streamText,
    textRef: streamTextRef,
    schedule: scheduleStreamTextUpdate,
    flush: flushStreamText,
    reset: flushAndClearStreamText,
  } = useThrottledStreamText();
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
  const streamErrorRef = useRef<string | null>(null);
  const lastStreamErrorRef = useRef<string | null>(null);
  /** Run-scoped LLM-turn metrics + tool-step counter, aggregated into the final
   * message's insights line. Reuses the existing TTFT computation. */
  const turnMetricsRef = useRef<TurnMetric[]>([]);
  const currentTurnRef = useRef<TurnMetric>({ wallMs: 0 });
  const stepsRef = useRef(0);
  /** Cached compaction summary, keyed by threadId: the inserted
   * `[Earlier conversation summary]` lead is byte-identical every run within
   * a thread (prefix-cache stable anchor), a fresh thread NEVER inherits
   * another thread's summary, and switching back reuses the cached lead.
   * A thread's entry is deleted when its history is rewritten
   * (edit/regenerate/delete). */
  const summaryCacheRef = useRef<Map<string, string | null>>(new Map());
  /** Monotonic run generation. Bumped on new-chat/thread-switch so an
   * in-flight runAgent can detect staleness and never commit its (old
   * thread's) messages — including the old summary lead — into a fresh
   * thread. This is the summary-bleed guard. */
  const runEpochRef = useRef(0);
  /** Per-thread user-turn counter driving the cache warm-up hint. */
  const turnCountRef = useRef(0);
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
  const threads = useThreads();
  // Server-persisted transcripts for the connected wallet (merged in the
  // sidebar list). GATED: the fetch needs a wallet signature, so it only
  // runs after an explicit user gesture (rail "Restore server history" row,
  // or opening the rail on mobile) — never on page load.
  const [historyRequested, setHistoryRequested] = useState(false);
  const { serverThreads: serverHistory, isLoading: historyLoading } =
    useChatHistory(address, historyRequested);
  // Live on-chain confirmations surfaced as "⛓ tx mined" rows under the thread
  const { rows: txRows } = useChatTxStream(!!address);
  // Resume the active thread across page reloads (same threadId, same
  // summary); a fresh UUID only when nothing was in flight.
  const [threadId, setThreadId] = useState<string>(
    () => loadStoredThreadId() ?? crypto.randomUUID(),
  );
  const threadIdRef = useRef<string>(threadId);
  const [computeHint, setComputeHint] = useState<string | null>(null);
  const [agentStep, setAgentStep] = useState(0);
  const [ttftMs, setTtftMs] = useState<number | null>(null);
  const [transferTokenId, setTransferTokenId] = useState<string | null>(null);
  const transferResolveRef = useRef<{
    resolve: (txHash: string) => void;
    reject: (err: Error) => void;
  } | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [editConfirmId, setEditConfirmId] = useState<string | null>(null);
  // Provider routing popover: the routing console lives at depth 1 —
  // depth 0 carries only the summary chip that opens it.
  const [routingOpen, setRoutingOpen] = useState(false);

  // Live refs: state updates land only on the next render, so same-turn tools must see earlier-set values (mint tokenId -> deposit); synced each render here, within-turn writes in runAgent
  // AgentDetail's Chat button deep-links to /chat?agent=<tokenId>; seed the session default from the URL until a tool result overrides it.
  const [searchParams] = useSearchParams();
  // 05: internal links rendered inside assistant markdown
  // (Agent #N → /agents/N) route through the SPA, never a full reload.
  const navigate = useNavigate();
  const explorerTx = useCallback(
    (hash: string) => explorerTxUrl(chainId, hash),
    [chainId],
  );
  const urlAgentParam = searchParams.get("agent");
  const urlAgentRef = useRef<string | undefined>(
    urlAgentParam && /^\d+$/.test(urlAgentParam) ? urlAgentParam : undefined,
  );
  const lastTokenIdRef = useRef<string | undefined>(
    urlAgentRef.current ?? session.lastTokenId,
  );
  const liveAddressRef = useRef<string | undefined>(address);
  const liveChainIdRef = useRef<number>(chainId);
  const providerPrefRef = useRef<ProviderPref | undefined>(undefined);
  const writeContractAsyncRef = useRef(writeContractAsync);
  const walletClientRef = useRef(walletClient);
  const publicClientRef = useRef(publicClient);

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
      waitForReceipt: buildWaitForReceipt(publicClient),
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
  // Rebuilt from live refs so tool execution never waits on a React render —
  // used by the send loop and by tool-card Retry.: the
  // transfer tool opens the TransferModal via openTransfer.
  const buildLiveToolCtx = useCallback(
    (): ToolContext => ({
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
      waitForReceipt: buildWaitForReceipt(publicClientRef.current),
      publicClient: publicClientRef.current,
      openTransfer,
    }),
    [openTransfer],
  );
  /** Retry-with-same-args on a failed tool card: re-invokes
   * the handler (wallet tools re-prompt the wallet) and updates the run. */
  const retryToolRun = useCallback(
    async (id: string) => {
      const run = toolRunsRef.current[id];
      if (!run || run.status === "running" || isStreamingRef.current) return;
      const handler = handlers[run.name];
      if (!handler) return;
      markToolRun(id, {
        status: "running",
        error: undefined,
        result: undefined,
        startedAt: Date.now(),
      });
      setToolRuns({ ...toolRunsRef.current });
      try {
        const result = await handler(run.args ?? {}, buildLiveToolCtx());
        recordToolResult(run.name, result);
        let resultError: string | undefined;
        try {
          const parsed = JSON.parse(result) as { error?: unknown };
          if (typeof parsed.error === "string" && parsed.error) {
            resultError = parsed.error;
          }
        } catch {
          void 0;
        }
        markToolRun(
          id,
          resultError !== undefined
            ? { status: "error", error: resultError, result }
            : { status: "success", result },
        );
      } catch (err) {
        markToolRun(id, {
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
      setToolRuns({ ...toolRunsRef.current });
    },
    [handlers, recordToolResult, buildLiveToolCtx],
  );
  const chainSupported = SUPPORTED_CHAIN_IDS.has(chainId);
  const tickRunning = Object.values(toolRuns).some(
    (r) => r.status === "running" && r.name === "execute_tick",
  );

  // Provider selector: real router providers for CHAT_MODEL (latency/pricing/
  // trust) via the backend ?model= passthrough; legacy pseudo-addresses are
  // filtered out — pinning one would 400 provider_model_mismatch.
  const { data: providersData } = useProviders(CHAT_MODEL);
  const providerOptions = useMemo(
    () => normalizeProviders(providersData?.services),
    [providersData],
  );
  const pinCandidates = useMemo(
    () =>
      providerOptions.filter(
        (p) => p.trustMode !== undefined || p.pricingUsd !== undefined,
      ),
    [providerOptions],
  );
  const hasPrivateProvider = pinCandidates.some(
    (p) => p.trustMode === "private",
  );
  const prefKey = providerPref?.address
    ? `pin:${providerPref.address}`
    : providerPref?.sort === "price"
      ? "cheapest"
      : "auto";
  const applyProviderPref = useCallback(
    (key: string) => {
      if (key === "auto") {
        // "Auto (latency)": latency-sort sticks to one provider so prompt
        // caching works by default (no hardcoded address — sort follows the
        // live catalog).
        setProviderPref({ ...DEFAULT_PROVIDER_PREF });
      } else if (key === "cheapest") {
        setProviderPref({ sort: "price" });
      } else if (key.startsWith("pin:")) {
        setProviderPref({ address: key.slice(4), allowFallbacks: false });
      }
    },
    [setProviderPref],
  );
  const toggleTrustMode = useCallback(
    (mode: "verified" | "private", on: boolean) => {
      if (!on) {
        setProviderPref(
          providerPrefBody({ ...providerPref, trustMode: undefined }),
        );
      } else {
        setProviderPref({ ...providerPref, trustMode: mode });
      }
    },
    [providerPref, setProviderPref],
  );

  // Routing popover dismiss contract: Esc closes (backdrop click is handled
  // by the.routing-backdrop element; both mirror the shell modal trio).
  useEffect(() => {
    if (!routingOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRoutingOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [routingOpen]);

  useEffect(() => {
    lastTokenIdRef.current = session.lastTokenId ?? urlAgentRef.current;
    liveAddressRef.current = address;
    liveChainIdRef.current = chainId;
    writeContractAsyncRef.current = writeContractAsync;
    walletClientRef.current = walletClient;
    publicClientRef.current = publicClient;
    providerPrefRef.current = providerPref;
  }, [
    session.lastTokenId,
    address,
    chainId,
    writeContractAsync,
    walletClient,
    publicClient,
    providerPref,
  ]);

  useEffect(() => {
    messagesRef.current = messages;
    threadIdRef.current = threadId;
    try {
      // Never persist the synthetic summary lead — it is recomputed per run
      // from the per-thread cache. Storing it let another session re-inject
      // the old summary and polluted thread titles.
      const stored = stripSummaryLead(messages);
      if (stored.length === 0) {
        sessionStorage.removeItem(CHAT_MESSAGES_KEY);
        sessionStorage.removeItem(CHAT_THREAD_KEY);
      } else {
        sessionStorage.setItem(CHAT_MESSAGES_KEY, JSON.stringify(stored));
        localStorage.setItem(
          `axiom:thread:${threadId}`,
          JSON.stringify(stored),
        );
        sessionStorage.setItem(CHAT_THREAD_KEY, threadId);
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
      // One run at a time: Regenerate/Retry bypass the send queue, so an
      // in-flight stream must make re-entry a silent no-op.
      if (isStreamingRef.current) return;
      isStreamingRef.current = true;
      setIsStreaming(true);
      streamErrorRef.current = null;
      setStreamError(null);
      toolRunsRef.current = {};
      setToolRuns({});
      setAgentStep(0);
      setTtftMs(null);
      turnMetricsRef.current = [];
      currentTurnRef.current = { wallMs: 0 };
      stepsRef.current = 0;

      const userMsg = createMessage({ role: "user", content: userText });
      let currentMessages = [...messagesRef.current, userMsg];
      // Run-generation guard: startNewChat/openThread bump runEpochRef, so an
      // in-flight run can detect staleness and never commit old-thread
      // messages (with the old summary lead) into a fresh thread.
      const epoch = runEpochRef.current;
      const isStale = (): boolean => epoch !== runEpochRef.current;
      const commitMessages = (msgs: Message[]): void => {
        if (isStale()) return;
        messagesRef.current = msgs;
        setMessages(msgs);
      };
      turnCountRef.current += 1;
      // Compaction runs once per RUN (never mid-loop), and the summary is
      // cached per threadId — the inserted lead message is byte-identical
      // every run of this thread, and a fresh thread never inherits another
      // thread's summary. Never summarize a previously inserted lead.
      const threadKey = threadIdRef.current;
      let summary = summaryCacheRef.current.get(threadKey);
      if (summary === undefined) {
        summary =
          summarizeConversation(stripSummaryLead(messagesRef.current)) || null;
        summaryCacheRef.current.set(threadKey, summary);
      }
      currentMessages = compactHistory(currentMessages, summary);
      commitMessages(currentMessages);
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

      // Byte-stable system prompt (no wallet/tokenId/timestamp) + the model's
      // own context window (server /v1/config reports the BACKEND default
      // model's window, e.g. 131072, while CHAT_MODEL may be 32768 — clamp so
      // fitToContext truncates at the real boundary instead of 4x too late).
      const systemContent = buildSystemPrompt();
      const effectiveContextWindow =
        contextWindow !== undefined
          ? Math.min(contextWindow, resolveContextWindow(CHAT_MODEL))
          : resolveContextWindow(CHAT_MODEL);
      const prefBody = providerPrefBody(providerPrefRef.current);

      try {
        while (loopCount < MAX_TOOL_LOOPS) {
          loopCount++;
          if (isStale()) break;
          setAgentStep(loopCount);
          const turnStartAt = Date.now();
          currentTurnRef.current = { wallMs: 0 };

          const liveToolCtx: ToolContext = buildLiveToolCtx();
          const liveSession: ChatSessionContext = {
            ...session,
            chainId: liveChainIdRef.current,
            walletAddress: (liveAddressRef.current?.toLowerCase() ??
              session.walletAddress) as `0x${string}` | undefined,
            lastTokenId: lastTokenIdRef.current,
          };

          // postStreamingWithRetry: 429 Retry-After backoff, up to 2 retries
          // capped at 10s; AbortError propagates so a cancel is never retried.
          const response = await postStreamingWithRetry(
            "/v1/chat/completions",
            {
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
                      contextWindow: effectiveContextWindow,
                    },
                  ),
                ],
                tools: TOOLS,
                stream: true,
                // Wallet-keyed session: the backend persists the transcript under a stable
                // per-wallet threadId and exposes it via GET /v1/chat/history?wallet=…
                wallet: liveSession.walletAddress,
                // Per-session provider routing pref (backend maps to X-0G-Provider-* headers).
                ...(prefBody ? { provider: prefBody } : {}),
              }),
              signal: controller.signal,
              timeout: STREAM_TIMEOUT,
            },
          );

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
            if (isStale()) {
              // New-chat/thread-switch during a stream: stop consuming and
              // never surface this run's output in the fresh thread.
              controller.abort();
              break;
            }
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const parsed = consumeSseLines(buffer);
            buffer = parsed.rest;
            streamDone = parsed.done;

            for (const chunk of parsed.chunks) {
              if (chunk.error || chunk.code) {
                if (isStale()) break;
                streamErrorRef.current =
                  typeof chunk.error === "string"
                    ? chunk.error
                    : `Stream failed (${String(chunk.code ?? "STREAM_ERROR")})`;
                streamDone = true;
                break;
              }
              // Backend trace frame (type:"trace") carries usage + x_0g_trace
              // on the terminal chunk; raw router chunks may carry them too.
              if (chunk.type === "trace") {
                captureTurnMetrics(
                  currentTurnRef.current,
                  (chunk.trace?.usage as SSEChunk["usage"] | undefined) ??
                    undefined,
                  chunk.trace,
                );
                continue;
              }
              if (chunk.usage || chunk.x_0g_trace) {
                captureTurnMetrics(
                  currentTurnRef.current,
                  chunk.usage,
                  chunk.x_0g_trace,
                );
              }
              const delta = chunk.choices?.[0]?.delta;
              if (!delta) continue;

              if (delta.content) {
                if (!firstTokenAt) {
                  firstTokenAt = Date.now();
                  setTtftMs(firstTokenAt - runStartedAt);
                  // Reuse the same TTFT computation for the per-turn metrics.
                  currentTurnRef.current.ttftMs = firstTokenAt - runStartedAt;
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

          flushStreamText();
          currentTurnRef.current.wallMs = Date.now() - turnStartAt;
          turnMetricsRef.current.push(currentTurnRef.current);

          const toolCallList = pendingToolCalls.filter(
            (tc) => tc.function.name,
          );

          if (toolCallList.length === 0) {
            if (streamErrorRef.current) {
              if (!isStale()) {
                lastStreamErrorRef.current = streamErrorRef.current;
                setStreamError(streamErrorRef.current);
              }
              flushAndClearStreamText();
              break;
            }
            if (!assistantContent) {
              if (!isStale()) {
                lastStreamErrorRef.current = "No response — try again.";
                setStreamError(lastStreamErrorRef.current);
              }
              flushAndClearStreamText();
              break;
            }
            const assistantMsg = createMessage({
              role: "assistant",
              content: assistantContent,
              meta: {
                usage: formatInsightsLine(
                  turnMetricsRef.current,
                  loopCount,
                  stepsRef.current,
                  nativeSymbol,
                ),
              },
            });
            currentMessages = [...currentMessages, assistantMsg];
            commitMessages(currentMessages);
            flushAndClearStreamText();
            break;
          }

          const assistantMsg = createMessage({
            role: "assistant",
            content: assistantContent || null,
            tool_calls: toolCallList,
          });
          currentMessages = [...currentMessages, assistantMsg];
          commitMessages(currentMessages);
          flushAndClearStreamText();

          let sawAsk = false;
          const batches = groupParallelTools(toolCallList);
          for (const tc of toolCallList) {
            const id =
              tc.id ||
              `${tc.function.name}-${Math.random().toString(36).slice(2)}`;
            if (!tc.id) tc.id = id;
            const parsedArgs = parseToolArguments(tc.function.arguments);
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
                  const args = parseToolArguments(tc.function.arguments);
                  // transfer is user-paced (modal form + wallet prompts), not a backend call — no timeout
                  const result = await handler(args, liveToolCtx);
                  recordToolResult(tc.function.name, result);
                  let resultError: string | undefined;
                  try {
                    // capture produced tokenId so a later same-turn tool sees it (mirrors applyToolResult)
                    const parsed = JSON.parse(result) as {
                      tokenId?: unknown;
                      agents?: Array<{ tokenId?: unknown }>;
                      error?: unknown;
                    };
                    const tok = parsed.tokenId ?? parsed.agents?.[0]?.tokenId;
                    if (tok !== undefined) {
                      lastTokenIdRef.current = String(tok);
                    }
                    // 04: a tool can fail SEMANTICALLY (error
                    // payload, handler returned normally) — the run must read
                    // failed so the card gets the humanized error + Retry.
                    if (typeof parsed.error === "string" && parsed.error) {
                      resultError = parsed.error;
                    }
                  } catch {
                    void 0;
                  }
                  if (tc.id) {
                    markToolRun(
                      tc.id,
                      resultError !== undefined
                        ? { status: "error", error: resultError, result }
                        : { status: "success", result },
                    );
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
            if (isStale()) break;
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
                    : humanizeToolMessage(
                        formatToolResult(tc.function.name, result),
                      ),
                }),
              ];
            }
            stepsRef.current += batchResults.length;
          }
          commitMessages(currentMessages);
          if (sawAsk) break;
        }

        const { exhausted } = evaluateContinue(loopCount);
        if (exhausted && !isStale()) {
          currentMessages = [
            ...currentMessages,
            createMessage({
              role: "assistant",
              content: `Turn limit hit after ${MAX_TOOL_LOOPS} steps — send "continue" to keep going.`,
              meta: { error: true },
            }),
          ];
          commitMessages(currentMessages);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // Stop pressed mid-loop: drop the assistant tool_calls message and any partial tool responses so no dangling calls persist into the next turn.
          const lastUser = currentMessages
            .map((m) => m.role)
            .lastIndexOf("user");
          if (lastUser >= 0) {
            const trimmed = currentMessages.slice(0, lastUser + 1);
            commitMessages(trimmed);
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
          commitMessages(withError);
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
      chainSupported,
      buildLiveToolCtx,
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

  useEffect(() => {
    if (!isStreaming) processQueue();
  }, [isStreaming, processQueue]);

  useEffect(() => {
    if (messages.length === 0) return;
    const stored = stripSummaryLead(messages);
    upsertThread({
      id: threadId,
      title: titleFromMessages(stored, chatCopy.untitledThread),
      updatedAt: Date.now(),
      messages: stored,
    } as StoredThread);
    // hooks: untitled label follows the locale
  }, [messages, threadId, chatCopy.untitledThread]);

  const startNewChat = useCallback(() => {
    // Invalidate any in-flight run so its stream/tool-loop can never commit
    // the old thread's messages (incl. its summary lead) into the fresh
    // thread — the summary-bleed guard.
    runEpochRef.current += 1;
    abortRef.current?.abort();
    setMessages([]);
    messagesRef.current = [];
    setQueue([]);
    queueRef.current = [];
    setThreadId(crypto.randomUUID());
    setComputeHint(null);
    turnCountRef.current = 0;
    try {
      sessionStorage.removeItem(CHAT_MESSAGES_KEY);
      sessionStorage.removeItem(CHAT_THREAD_KEY);
    } catch {
      void 0;
    }
  }, []);

  const openThread = useCallback((t: StoredThread) => {
    // Same guard as startNewChat: switching threads mid-run must not let the
    // old run's output land in the newly opened thread.
    runEpochRef.current += 1;
    abortRef.current?.abort();
    const loaded = stripSummaryLead(toMessages(t.messages));
    setThreadId(t.id);
    setMessages(loaded);
    messagesRef.current = loaded;
    setComputeHint(null);
    turnCountRef.current = 0;
    // The per-thread summary cache entry (if any) is kept: switching back
    // reuses the byte-identical lead (cache anchor).
  }, []);

  const deleteThread = useCallback(
    (id: string) => {
      const removed = deleteThreadFromStore(id);
      summaryCacheRef.current.delete(id);
      // deleting the ACTIVE thread must not leave it on screen — select the next one or clear to new-chat
      if (id === threadId) {
        const nextThread = threads.find((t) => t.id !== id);
        if (nextThread) openThread(nextThread);
        else startNewChat();
      }
      // Recoverable: deleting a chat is not irreversible, so offer undo.
      if (removed) {
        toast(chatCopy.deletedToast, {
          action: {
            label: chatCopy.undo,
            onClick: () => {
              upsertThread(removed);
            },
          },
        });
      }
    },
    [threadId, threads, openThread, startNewChat, chatCopy],
  );

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // Drawer: Esc closes, body scroll locks while open, focus returns to the toggle.
  const sidebarToggleRef = useRef<HTMLButtonElement | null>(null);
  const { open: sidebarOpen, setOpen: setSidebarOpen } = useShellSidebar();
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [sidebarOpen, setSidebarOpen]);
  useEffect(() => {
    if (!sidebarOpen) {
      sidebarToggleRef.current?.focus();
    }
  }, [sidebarOpen]);

  // Thread list lives in the shell sidebar on chat routes; portal it in.
  const threadsSlot =
    typeof document !== "undefined"
      ? document.getElementById("sidebar-threads-slot")
      : null;

  return (
    <div className="chat-layout">
      {threadsSlot &&
        createPortal(
          <ChatHistorySection
            activeThreadId={threadId}
            onOpen={openThread}
            onNew={startNewChat}
            onDelete={deleteThread}
            serverThreads={serverHistory}
            serverLoading={historyLoading}
            serverRestore={!!address && !historyRequested}
            onRequestServerHistory={() => setHistoryRequested(true)}
            copy={chatCopy}
          />,
          threadsSlot,
        )}
      <div className="chat-main">
        {/* Shell grammar: one h1 per page. /chat is a fixed-viewport
            surface, so the head is visually hidden — the compact topbar below
            stays the surface chrome (audit-sanctioned exception). */}
        <h1 className="visually-hidden">{chatCopy.pageTitle}</h1>
        <div className="chat-topbar">
          <button
            type="button"
            className="shell-icon-btn chat-sidebar-toggle"
            aria-label={chatCopy.historyToggle}
            aria-expanded={sidebarOpen}
            ref={sidebarToggleRef}
            onClick={() => {
              const opening = !sidebarOpen;
              setSidebarOpen(opening);
              // Opening the rail is the mobile gesture that needs history —
              // only now may the wallet-proof signature fire.
              if (opening) setHistoryRequested(true);
            }}
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
                ? interpolate(chatCopy.statusOnline, chainVars)
                : interpolate(chatCopy.statusWrongNetwork, chainVars)}
            </div>
          </div>
          <Button
            variant="ghost"
            onClick={startNewChat}
            icon={<MessageSquare size={13} />}
          >
            {chatCopy.newChat}
          </Button>
        </div>

        {computeHint && <ChatBanner>{computeHint}</ChatBanner>}

        {!chainSupported && (
          <ChatBanner>
            {interpolate(chatCopy.wrongNetworkBanner, chainVars)}
          </ChatBanner>
        )}

        <div
          className="chat-messages"
          ref={listRef}
          onClick={(e) => {
            // SPA-route internal links produced by linkifyConsoleRefs.
            const anchor = (e.target as HTMLElement).closest?.(
              "a[href^='/']",
            ) as HTMLAnchorElement | null;
            if (anchor) {
              e.preventDefault();
              navigate(anchor.getAttribute("href") ?? "/");
            }
          }}
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
                {chatCopy.emptyTagline}
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
                    label: chatCopy.promptAgents,
                    hint: chatCopy.promptAgentsHint,
                  },
                  {
                    label: chatCopy.promptMint,
                    hint: chatCopy.promptMintHint,
                  },
                  {
                    label: chatCopy.promptVault,
                    hint: interpolate(chatCopy.promptVaultHint, {
                      nativeSymbol,
                    }),
                  },
                  {
                    label: chatCopy.promptTick,
                    hint: chatCopy.promptTickHint,
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
                    {chatCopy.toolsToggle(CLIENT_TOOL_CATALOG.length)}
                  </span>
                  <span
                    style={{
                      fontSize: "var(--text-xs)",
                      color: "var(--c-text-dim)",
                    }}
                  >
                    {toolsOpen ? chatCopy.toolsHide : chatCopy.toolsBrowse}
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
                        <SectionTitle style={{ marginBottom: 4 }}>
                          {CHAT_TOOL_CLASS_LABELS[g.cls]}
                        </SectionTitle>
                        {g.tools.map((t) => {
                          // 02: the friendly label leads, the raw
                          // function name is a mono sublabel, and the hint
                          // drops model-facing unit notes ("(in wei)").
                          const hint = t.hint.replace(/\s*\(in wei\)/i, "");
                          const trimmedHint =
                            hint.length > 90 ? `${hint.slice(0, 90)}…` : hint;
                          const label = TOOL_LABELS[t.name] ?? t.name;
                          return (
                            <button
                              key={t.name}
                              type="button"
                              className="chat-tool-row"
                              onClick={() =>
                                setInput(chatCopy.toolPrompts[t.name] ?? label)
                              }
                              title={t.hint}
                            >
                              <span style={{ color: COLORS.text }}>
                                {label}
                              </span>
                              <MonoLabel
                                style={{ padding: "0.125rem 0.35rem" }}
                              >
                                {t.name}
                              </MonoLabel>
                              <span style={{ color: COLORS.textMuted }}>
                                {trimmedHint}
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
                  ? chatCopy.roleYou
                  : msg.role === "tool"
                    ? (TOOL_LABELS[msg.name ?? ""] ??
                      msg.name ??
                      chatCopy.roleTool)
                    : chatCopy.roleAssistant}
                {msg.role === "tool" && msg.name ? (
                  <ToolClassBadge name={msg.name} />
                ) : null}
                <span className="msg-actions" style={{ marginLeft: "auto" }}>
                  {msg.role === "user" && editConfirmId === msg.id ? (
                    <MessageEditConfirm
                      copy={chatCopy}
                      onConfirm={() => {
                        const text = msg.content ?? "";
                        const idx = messagesRef.current.findIndex(
                          (m) => m.id === msg.id,
                        );
                        if (idx >= 0) {
                          const trimmed = stripSummaryLead(
                            messagesRef.current.slice(0, idx),
                          );
                          // Stale run must never commit into edited history
                          // (same pattern as openThread/startNewChat).
                          runEpochRef.current += 1;
                          abortRef.current?.abort();
                          messagesRef.current = trimmed;
                          setMessages(trimmed);
                          summaryCacheRef.current.delete(threadIdRef.current);
                        }
                        setEditConfirmId(null);
                        setInput(text);
                      }}
                      onCancel={() => setEditConfirmId(null)}
                    />
                  ) : msg.role === "user" ? (
                    <button
                      type="button"
                      className="msg-action"
                      title={chatCopy.editResend}
                      onClick={() => {
                        const idx = messagesRef.current.findIndex(
                          (m) => m.id === msg.id,
                        );
                        if (idx >= 0 && idx < messagesRef.current.length - 1) {
                          setEditConfirmId(msg.id);
                        } else {
                          setInput(msg.content ?? "");
                        }
                      }}
                    >
                      {chatCopy.edit}
                    </button>
                  ) : null}
                  {msg.role === "assistant" &&
                  !msg.meta?.error &&
                  msg.id === messages[messages.length - 1]?.id ? (
                    <button
                      type="button"
                      className="msg-action"
                      title={chatCopy.regenerate}
                      onClick={() => {
                        if (isStreamingRef.current) return;
                        const idx = messagesRef.current.findIndex(
                          (m) => m.id === msg.id,
                        );
                        if (idx > 0) {
                          const trimmed = stripSummaryLead(
                            messagesRef.current.slice(0, idx),
                          );
                          const lastUser = [...trimmed]
                            .reverse()
                            .find((m) => m.role === "user");
                          messagesRef.current = trimmed;
                          setMessages(trimmed);
                          summaryCacheRef.current.delete(threadIdRef.current);
                          if (lastUser?.content)
                            void runAgent(lastUser.content);
                        }
                      }}
                    >
                      {chatCopy.regenerateShort}
                    </button>
                  ) : null}
                  <MsgCopyAction text={msg.content ?? ""} copy={chatCopy} />
                </span>
              </StatusDot>
              {msg.role === "tool" ? (
                msg.name === "ask_user" ? (
                  <AskUserCard
                    content={msg.content ?? ""}
                    onAnswer={sendMessage}
                    copy={chatCopy}
                  />
                ) : (
                  (() => {
                    // 04: a semantically-failed tool (error
                    // payload) renders danger-styled with a Retry affordance
                    // keyed to its run — never as neutral body text.
                    const failedRun = msg.tool_call_id
                      ? toolRuns[msg.tool_call_id]?.status === "error"
                      : false;
                    return (
                      <div
                        role="region"
                        aria-label={
                          toolHint(msg.name ?? "") ??
                          TOOL_LABELS[msg.name ?? ""] ??
                          chatCopy.toolResultFallback
                        }
                        style={{
                          ...insetCardStyle,
                          fontSize: "var(--text-sm)",
                          color: failedRun
                            ? "var(--c-danger)"
                            : COLORS.textMuted,
                        }}
                      >
                        <ToolResultBody
                          name={msg.name ?? ""}
                          content={msg.content}
                          sendTransactionAsync={toolCtx.sendTransactionAsync}
                        />
                        {failedRun && msg.tool_call_id ? (
                          <button
                            type="button"
                            className="msg-action"
                            style={{ marginTop: 6 }}
                            onClick={() =>
                              void retryToolRun(msg.tool_call_id as string)
                            }
                          >
                            {chatCopy.retry}
                          </button>
                        ) : null}
                      </div>
                    );
                  })()
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
                        onRetry={
                          run?.status === "error"
                            ? () => void retryToolRun(tc.id)
                            : undefined
                        }
                        retryLabel={chatCopy.retry}
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
                      __html: renderMarkdown(msg.content, explorerTx),
                    }}
                  />
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
                  {msg.meta?.usage ? (
                    <InsightsDisclosure
                      text={msg.meta.usage}
                      showLabel={chatCopy.metricsShow}
                      hideLabel={chatCopy.metricsHide}
                    />
                  ) : null}
                </div>
              )}
            </div>
          ))}

          {txRows.length > 0 && (
            <div
              className="fade-enter"
              role="status"
              aria-label={a11y.txConfirmations}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                padding: "0 var(--space-lg)",
                marginTop: "var(--space-sm)",
              }}
            >
              {txRows.map((row) => (
                <div
                  key={row.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    flexWrap: "wrap",
                    fontSize: "var(--text-xs)",
                    color: COLORS.textDim,
                  }}
                >
                  {/* one localized string instead of
                      glyph-joined label spans ("⛓ tx mined" · "agent #N" · …). */}
                  <span>
                    {chatCopy.txMined(
                      row.tokenId ?? null,
                      row.eventName ?? null,
                      row.blockNumber ?? null,
                    )}
                  </span>
                  {row.txHash ? (
                    <a
                      href={explorerTxUrl(chainId, row.txHash)}
                      target="_blank"
                      rel="noreferrer noopener"
                      style={{ color: COLORS.bronzeLight }}
                    >
                      {truncateHex(row.txHash)}
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          )}

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
                      if (isStreamingRef.current) return;
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
                    {chatCopy.retry}
                  </Button>
                  <Button variant="ghost" onClick={() => setStreamError(null)}>
                    {chatCopy.dismiss}
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
              aria-label={chatCopy.assistantResponding}
              style={{
                padding: "var(--space-md) var(--space-lg)",
                borderRadius: "var(--radius-lg)",
                border: `1px solid ${COLORS.border}`,
                background: "var(--c-surface)",
              }}
            >
              <StatusDot color={COLORS.text}>
                {chatCopy.roleAssistant}
              </StatusDot>
              {streamText ? (
                <div
                  style={{
                    ...chatMsgStyle,
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                  }}
                >
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
                  style={{
                    ...chatMsgStyle,
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                  }}
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
                      {phaseLabel(elapsed, toolRuns, streamText, chatCopy)}
                    </span>
                    {tickRunning ? (
                      <span style={dimXs}>{chatCopy.tickInProgress}</span>
                    ) : null}
                    {agentStep > 0 ? (
                      <span style={dimXs}>
                        step {agentStep}/{MAX_TOOL_LOOPS}
                      </span>
                    ) : null}
                    {ttftMs !== null && ttftMs >= 0 ? (
                      <span style={dimXs}>TTFT {ttftMs}ms</span>
                    ) : null}
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
              {chatCopy.queuedCount(queue.length)}
            </span>
            {queue.map((q, i) => (
              <span
                key={`${i}-${q}`}
                title={q}
                className="queue-chip"
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
                  aria-label={chatCopy.removeQueued}
                  className="chat-queue-remove"
                  onClick={() => {
                    const next = queueRef.current.filter((_, idx) => idx !== i);
                    queueRef.current = next;
                    setQueue(next);
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
            <div className="routing-anchor">
              {routingOpen && (
                <>
                  <div
                    className="routing-backdrop"
                    onClick={() => setRoutingOpen(false)}
                  />
                  <div
                    className="routing-popover"
                    role="dialog"
                    aria-label={chatCopy.routing}
                  >
                    <div className="routing-popover__head">
                      <strong>{chatCopy.routing}</strong>
                      <span className="routing-popover__hint">
                        {chatCopy.routingHint}
                      </span>
                    </div>
                    <select
                      aria-label={chatCopy.routing}
                      value={prefKey}
                      onChange={(e) => applyProviderPref(e.target.value)}
                      className="chat-inline-select routing-popover__select"
                    >
                      <option value="auto">{chatCopy.routingAuto}</option>
                      <option value="cheapest">
                        {chatCopy.routingCheapest}
                      </option>
                      {pinCandidates.map((p) => (
                        <option key={p.address} value={`pin:${p.address}`}>
                          {pinLabel(p)}
                        </option>
                      ))}
                    </select>
                    <label className="routing-popover__check">
                      <input
                        type="checkbox"
                        checked={providerPref?.trustMode === "verified"}
                        onChange={(e) =>
                          toggleTrustMode("verified", e.target.checked)
                        }
                      />
                      {chatCopy.routingVerified}
                    </label>
                    <label
                      className={`routing-popover__check${hasPrivateProvider ? "" : " is-disabled"}`}
                      title={
                        hasPrivateProvider
                          ? chatCopy.routingPrivateHintOn
                          : chatCopy.routingPrivateHintOff
                      }
                    >
                      <input
                        type="checkbox"
                        disabled={!hasPrivateProvider}
                        checked={providerPref?.trustMode === "private"}
                        onChange={(e) =>
                          toggleTrustMode("private", e.target.checked)
                        }
                      />
                      {chatCopy.routingPrivate}
                    </label>
                    <p className="routing-popover__status">
                      {routingStatusLine(providerPref, chatCopy)}
                    </p>
                  </div>
                </>
              )}
              <button
                type="button"
                className={`routing-chip${isNonDefaultRouting(providerPref) ? " is-nondefault" : ""}`}
                aria-expanded={routingOpen}
                aria-haspopup="dialog"
                onClick={() => setRoutingOpen((v) => !v)}
                title={chatCopy.routingChipTitle}
              >
                <Network size={12} />
                {routingSummary(providerPref, chatCopy)}
              </button>
            </div>
            <Textarea
              aria-label={a11y.chatInput}
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
                  ? chatCopy.placeholderStreaming
                  : chatCopy.placeholder(AXIOM_ASSISTANT_NAME)
              }
              maxLength={4000}
            />
            {isStreaming && (
              <Button variant="ghost" onClick={cancelStream}>
                {chatCopy.stop}
              </Button>
            )}
            <Button
              variant="primary"
              onClick={() => sendMessage(input)}
              disabled={!input.trim()}
            >
              {isStreaming ? chatCopy.queue : chatCopy.send}
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
  copy: Copy["chat"],
): string {
  const running = Object.values(runs).filter((r) => r.status === "running");
  if (running.length > 0) {
    const names = running.map((r) => TOOL_LABELS[r.name] ?? r.name).join(", ");
    return copy.phaseRunning(names, elapsedSec);
  }
  if (streamText) return copy.phaseStreaming(elapsedSec);
  if (elapsedSec < 2) return copy.phaseThinking;
  return copy.phaseWaiting(elapsedSec);
}

/** Capture router usage/trace (terminal chunk or backend trace frame) into a
 * per-turn metric record. Reuses the exact fields the router emits. */

/** Compact provider-selector option label: name · latency · price per 1M. */
function pinLabel(p: ComputeProvider): string {
  const name = p.providerName ?? truncateAddress(p.address);
  const lat =
    p.latencyMs != null ? `${(p.latencyMs / 1000).toFixed(1)}s` : "no latency";
  const price = p.pricingUsd?.prompt
    ? `$${(Number(p.pricingUsd.prompt) * 1e6).toPrecision(2)}/M`
    : "";
  return `${name} · ${lat}${price ? ` · ${price}` : ""}`;
}

/** One-line routing state for the composer's depth-0 summary chip
 * ("Auto", "Lowest cost", "0xa48f…7836", plus a TEE/sealed suffix —
 * the trust-mode tokens are protocol names and stay as-is). */
function routingSummary(
  pref: ProviderPref | undefined,
  copy: Copy["chat"],
): string {
  const parts: string[] = [];
  if (pref?.address) parts.push(truncateAddress(pref.address));
  else if (pref?.sort === "price") parts.push(copy.routingSummaryCheapest);
  else parts.push(copy.routingSummaryAuto);
  if (pref?.trustMode === "verified") parts.push("TEE");
  else if (pref?.trustMode === "private") parts.push("sealed");
  return parts.join(" · ");
}

/** Non-default routing gets a copper-tinted chip so an explicit choice is
 * always acknowledged at depth 0 (including price sort, which the old
 * trailing status silently dropped). Default = latency-sorted, no pin,
 * no trust filter (DEFAULT_PROVIDER_PREF). */
function isNonDefaultRouting(pref: ProviderPref | undefined): boolean {
  return (
    !!pref && (!!pref.address || pref.sort === "price" || !!pref.trustMode)
  );
}

/** Single status sentence inside the Routing popover — replaces the old
 * depth-0 trailing chip ("latency-sorted · cache on"); "cache on" dropped
 * (implementation guarantee, not user state). */
function routingStatusLine(
  pref: ProviderPref | undefined,
  copy: Copy["chat"],
): string {
  if (pref?.address) {
    return copy.routingStatusPinned(truncateAddress(pref.address));
  }
  if (pref?.sort === "price") {
    return copy.routingStatusCheapest;
  }
  return copy.routingStatusAuto;
}

/** ProviderPref → request-body `provider` field; undefined when nothing is set
 * (backend then applies its own default routing). */
function providerPrefBody(
  pref: ProviderPref | undefined,
): ProviderPref | undefined {
  if (!pref) return undefined;
  const body: ProviderPref = {};
  if (pref.sort) body.sort = pref.sort;
  if (pref.address) body.address = pref.address;
  if (pref.allowFallbacks !== undefined)
    body.allowFallbacks = pref.allowFallbacks;
  if (pref.trustMode) body.trustMode = pref.trustMode;
  return Object.keys(body).length > 0 ? body : undefined;
}

/** Drop a previously-inserted `[Earlier conversation summary]` lead so a
 * re-derivation after edit/regenerate/open doesn't wrap the old summary. */
function stripSummaryLead<T extends { role: string; content: string | null }>(
  msgs: T[],
): T[] {
  return msgs[0]?.role === "user" &&
    typeof msgs[0].content === "string" &&
    msgs[0].content.startsWith("[Earlier conversation summary]")
    ? msgs.slice(1)
    : msgs;
}

/** Per-message telemetry, collapsed to a quiet one-line affordance: the full
 * TTFT/tok-s/cache/provider/cost dump only renders on explicit expand
 * (02-). Own state per message — no parent bookkeeping. */
function InsightsDisclosure({
  text,
  showLabel,
  hideLabel,
}: {
  text: string;
  showLabel: string;
  hideLabel: string;
}): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <div className="msg-insights">
      <button
        type="button"
        className="msg-insights__toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? hideLabel : showLabel}
      </button>
      {open ? <div className="msg-insights__detail">{text}</div> : null}
    </div>
  );
}

function ToolCallCard({
  run,
  expanded,
  onToggle,
  onRetry,
  retryLabel,
}: {
  run: ToolRun;
  expanded: boolean;
  onToggle: () => void;
  /** 04: retry-with-same-args affordance on failed tool runs. */
  onRetry?: () => void;
  retryLabel?: string;
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
            <span style={{ color: "var(--c-danger)" }}>
              {/* 04: humanized — never a raw viem/backend dump. */}
              {humanizeError(run.error)}
              {onRetry && retryLabel ? (
                <button
                  type="button"
                  className="msg-action"
                  style={{ marginLeft: 8 }}
                  onClick={onRetry}
                >
                  {retryLabel}
                </button>
              ) : null}
            </span>
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
