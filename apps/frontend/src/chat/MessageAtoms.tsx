import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { formatToolResult } from "@axiom/chat-runtime";
import {
  CHAT_TOOL_CLASS_LABELS,
  classOfTool,
  getChatToolSpec,
} from "@axiom/config/chat-tools";
import { COLORS, Spinner, Textarea } from "../components/ui.js";
import { Button } from "../components/axiom/Controls.js";
import { Check, ShieldCheck, Wallet } from "../components/axiom/icons.js";
import { formatEther } from "viem";
import { getCopy } from "../lib/copy.js";
import { useUiStore } from "../lib/uiStore.js";
import { APP_CHAIN } from "../config/wagmi.js";
import { humanizeError } from "../utils/format.js";
import { TOOL_LABELS } from "./tools.js";
import type { Copy } from "../lib/copy.js";

export const insetCardStyle: CSSProperties = {
  background: COLORS.bg,
  border: `1px solid ${COLORS.border}`,
  borderRadius: "var(--radius-md)",
  padding: "var(--space-sm) var(--space-md)",
  marginTop: "var(--space-xs)",
};

export function ToolClassBadge({
  name,
}: {
  name: string;
}): ReactElement | null {
  const cls = classOfTool(name);
  if (!cls) return null;
  return (
    <span
      aria-label={`Tool class: ${CHAT_TOOL_CLASS_LABELS[cls]}`}
      title={getChatToolSpec(name)?.hint}
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

export function StatusDot({
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

export function ChatBanner({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return (
    <div className="chat-banner" role="status">
      {children}
    </div>
  );
}

export function AskUserCard({
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

/** Per-message copy action with the app-wide inline-confirm contract (04
 * ): the label swaps to "✓ Copied" for ~1.2s, matching the ui.tsx
 * CopyButton primitive used inside tool cards. */
export function MsgCopyAction({
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

export function MessageEditConfirm({
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

type ToolRunStatus = "running" | "success" | "error";

export type ToolRun = {
  name: string;
  status: ToolRunStatus;
  startedAt: number;
  result?: string;
  error?: string;
  args?: Record<string, unknown>;
};

/** Monospace detail text inside an expanded tool card. */
const monoXs: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--text-xs)",
};

/** Per-message telemetry, collapsed to a quiet one-line affordance: the full
 * TTFT/tok-s/cache/provider/cost dump only renders on explicit expand
 * (02-). Own state per message — no parent bookkeeping. */
export function InsightsDisclosure({
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

export function ToolCallCard({
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
                ...monoXs,
                margin: "0 0 6px",
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
                ...monoXs,
                margin: "0 0 6px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
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

export function ToolResultBody({
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

type EncodePreview = {
  encodeOnly?: boolean;
  to?: string;
  data?: string;
  value?: string;
  amount?: string;
  amountUnit?: string;
  txHash?: string;
};

function parseEncodePreview(content: string | null): EncodePreview | null {
  if (!content) return null;
  try {
    const obj = JSON.parse(content) as EncodePreview & { error?: string };
    if (obj.error !== undefined) return null;
    if (obj.encodeOnly || obj.txHash) return obj;
    return null;
  } catch {
    return null;
  }
}

function hasEncodePreview(content: string | null): boolean {
  return parseEncodePreview(content) !== null;
}

function formatNativeValue(weiStr: string): string {
  try {
    return `${formatEther(BigInt(weiStr))} ${APP_CHAIN.nativeCurrency.symbol}`;
  } catch {
    return `${weiStr} wei`;
  }
}

/* Chat path exception: EncodePreviewCard shows the RAW contract payload;
   the v2 review sheets are the parsed-facts surface. */
export function EncodePreviewCard({
  content,
  toolName,
  onSign,
}: {
  content: string | null;
  toolName?: string;
  onSign?: (a: {
    to: `0x${string}`;
    data?: `0x${string}`;
    value?: bigint;
  }) => Promise<`0x${string}`>;
}): ReactElement | null {
  const { state } = useUiStore();
  const chatCopy = getCopy(state.settings.locale).chat;
  const preview = parseEncodePreview(content);
  if (!preview) return null;
  const [signedHash, setSignedHash] = useState<string | null>(null);
  const [signError, setSignError] = useState<string | null>(null);
  const handleSign = async () => {
    if (!onSign || !preview.to) return;
    setSignError(null);
    try {
      const hash = await onSign({
        to: preview.to as `0x${string}`,
        data: (preview.data as `0x${string}`) ?? undefined,
        value: preview.value ? BigInt(preview.value) : undefined,
      });
      setSignedHash(hash);
    } catch (err) {
      // humanized like ToolCallCard — never a raw viem/wallet dump.
      setSignError(humanizeError(err));
    }
  };

  const amountLabel = ((): string | null => {
    if (toolName === "withdraw" || toolName === "deposit") {
      return `${preview.amount ?? "?"} ${APP_CHAIN.nativeCurrency.symbol}`;
    }
    if (preview.amount) {
      return `${preview.amount}${preview.amountUnit ? ` ${preview.amountUnit}` : ""}`;
    }
    return null;
  })();

  if (preview.txHash ?? signedHash) {
    return (
      <div
        style={{
          ...cardBaseStyle,
          border: `1px solid ${COLORS.bronzeBorder}`,
          background: COLORS.bronzeBg,
          fontSize: "var(--text-sm)",
        }}
      >
        <strong style={{ color: COLORS.bronzeLight }}>
          <Check size={13} /> {chatCopy.encodeSubmitted}
        </strong>
        <div
          style={{
            color: COLORS.textMuted,
            marginTop: 4,
            wordBreak: "break-all",
          }}
        >
          {preview.txHash ?? signedHash}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        ...cardBaseStyle,
        border: `1px solid ${COLORS.border}`,
        background: COLORS.bg,
        fontSize: "var(--text-xs)",
        color: COLORS.textMuted,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          fontWeight: "var(--fw-semibold)",
          color: COLORS.text,
          marginBottom: 6,
        }}
      >
        <ShieldCheck size={13} />
        {chatCopy.encodeTitle}
      </div>
      {preview.to ? <div>to: {preview.to}</div> : null}
      {preview.value && preview.value !== "0" ? (
        <div>value: {formatNativeValue(preview.value)}</div>
      ) : null}
      {amountLabel ? <div>amount: {amountLabel}</div> : null}
      {preview.data ? (
        <div style={{ wordBreak: "break-all", marginTop: 4 }}>
          data: {preview.data.slice(0, 66)}
          {preview.data.length > 66 ? "…" : ""}
          <div style={{ color: COLORS.textDim, marginTop: 2 }}>
            {chatCopy.encodeRawData}
          </div>
        </div>
      ) : null}
      {signError ? (
        <div
          style={{
            marginTop: 8,
            color: "var(--c-danger)",
            fontSize: "var(--text-xs)",
          }}
        >
          {signError}
        </div>
      ) : null}
      {onSign && preview.to && !signedHash ? (
        <div style={{ marginTop: 8 }}>
          <Button onClick={handleSign} icon={<Wallet size={14} />}>
            {chatCopy.encodeSign}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const preBlockStyle: CSSProperties = {
  fontSize: "var(--text-xs)",
  margin: 0,
  whiteSpace: "pre-wrap",
  fontFamily: "inherit",
};

// Shared shell for both encode-card states (submitted receipt vs raw preview).
const cardBaseStyle: CSSProperties = {
  marginTop: "var(--space-xs)",
  padding: "var(--space-sm) var(--space-md)",
  borderRadius: "var(--radius-md)",
};

function parseObj(content: string | null): Record<string, unknown> | null {
  if (!content) return null;
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function LinkLine({
  href,
  label,
}: {
  href: string;
  label: string;
}): ReactElement {
  return (
    <div className="archive-link-line">
      <a href={href} target="_blank" rel="noopener noreferrer">
        {label}
      </a>
    </div>
  );
}

function ArchiveResultCard({
  name,
  content,
}: {
  name: string;
  content: string | null;
}): ReactElement {
  const obj = parseObj(content);
  const fallback = formatToolResult(name, content);

  if (!obj) {
    return <pre style={preBlockStyle}>{fallback}</pre>;
  }

  if (name === "archive_confirm_deletion") {
    const archived = obj.wasArchived === true || obj.archived === true;
    const snapshotUrl =
      typeof obj.snapshotUrl === "string"
        ? obj.snapshotUrl
        : typeof obj.snapshot === "object" && obj.snapshot !== null
          ? String((obj.snapshot as Record<string, unknown>).snapshotUrl ?? "")
          : "";
    return (
      <div className="archive-result">
        <strong
          className={
            archived
              ? "archive-result strong--success"
              : "archive-result strong--muted"
          }
        >
          {archived ? "Was archived" : "Not archived"}
        </strong>
        {obj.archivedAt ? (
          <div className="archive-muted-top">{String(obj.archivedAt)}</div>
        ) : null}
        {snapshotUrl ? (
          <LinkLine href={snapshotUrl} label={snapshotUrl} />
        ) : null}
        {obj.interpretation ? (
          <div className="archive-muted-top-xs">
            {String(obj.interpretation)}
          </div>
        ) : null}
      </div>
    );
  }

  if (name === "archive_account_tweets") {
    const tweets = (obj.tweets ?? obj.snapshots) as unknown[] | undefined;
    return (
      <div className="archive-result">
        <div className="archive-heading">
          @{String(obj.handle ?? "?")} —{" "}
          {String(obj.archivedTweetCount ?? obj.count ?? 0)} tweet(s)
        </div>
        {Array.isArray(tweets)
          ? tweets.slice(0, 12).map((t, i) => {
              const url =
                typeof t === "string"
                  ? t
                  : String(
                      (t as Record<string, unknown>).url ??
                        (t as Record<string, unknown>).snapshotUrl ??
                        "",
                    );
              return url ? <LinkLine key={i} href={url} label={url} /> : null;
            })
          : null}
      </div>
    );
  }

  return <pre style={preBlockStyle}>{fallback}</pre>;
}
