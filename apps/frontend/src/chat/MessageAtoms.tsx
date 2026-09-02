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
  AXIOM_ASSISTANT_NAME,
  CHAT_TOOL_CLASS_LABELS,
  classOfTool,
  getChatToolSpec,
} from "@axiom/config/chat-tools";
import { Spinner, Textarea } from "../components/ui.js";
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
  background: "var(--bg-2)",
  border: "1px solid var(--line)",
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
      className="tool-card__class"
      aria-label={CHAT_TOOL_CLASS_LABELS[cls]}
      title={getChatToolSpec(name)?.hint}
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
    <div className="msg-statusdot">
      <span className="msg-statusdot__dot" style={{ background: color }} />
      <span className="fw-semibold text-xs text-dim uppercase">{children}</span>
    </div>
  );
}

/** Wave 6A (browser-3 #5: "no avatars — exactly 1 img on the page"): a
 * deterministic glyph chip per turn — no network assets, no per-message
 * state. User turns get the first letter of their own message (fallback
 * "Y"); assistant turns the agent's initial. Tool rows stay avatar-less:
 * the tool label IS the provenance. `aria-hidden` — the StatusDot role
 * label already names the speaker, so the chip is decoration and stays
 * out of the a11y tree. */
export function MsgAvatar({
  role,
  content,
}: {
  role: "user" | "assistant" | "tool";
  content?: string | null;
}): ReactElement | null {
  if (role === "tool") return null;
  const first = (content ?? "").trim().match(/\p{L}/u)?.[0];
  const glyph = role === "user" ? (first ?? "Y") : (AXIOM_ASSISTANT_NAME.charAt(0) || "A");
  return (
    <span className="msg-avatar" aria-hidden="true">
      {glyph.toUpperCase()}
    </span>
  );
}

/** Wave 6A (browser-3 #5: "no timestamps — zero \d:\d matches in the
 * transcript"): renders the turn's wall-clock time beside the role label.
 * The store keeps no per-message clock (and W6-A must not restructure it),
 * so the time is captured at first render and memoized per message id —
 * stable across re-renders/streaming, never ticks. Caveat, documented:
 * threads restored from persistence re-capture at load, so their times
 * reflect the restore, not the original send. Full detail rides the
 * `title` tooltip; display is 12px dim, tabular, non-uppercase. */
const msgTimeMemo = new Map<string, number>();
const MSG_TIME_MEMO_MAX = 500; // one entry per rendered message; bounded

export function MsgTimestamp({ id }: { id: string }): ReactElement {
  let ms = msgTimeMemo.get(id);
  if (ms === undefined) {
    if (msgTimeMemo.size >= MSG_TIME_MEMO_MAX) msgTimeMemo.clear();
    ms = Date.now();
    msgTimeMemo.set(id, ms);
  }
  const d = new Date(ms);
  return (
    <time
      className="msg-time"
      dateTime={d.toISOString()}
      title={d.toLocaleString()}
    >
      {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
    </time>
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
          margin: "0 0 var(--space-2)",
          fontSize: "var(--fs-body)",
          color: "var(--text)",
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
              gap: "var(--space-1)",
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
                    gap: "var(--space-1)",
                    fontSize: "var(--fs-body)",
                    color: "var(--text)",
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
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
            {options.map((o, i) => (
              <Button key={i} variant="secondary" onClick={() => submit(o)}>
                {o}
              </Button>
            ))}
          </div>
        )
      ) : (
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
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
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      if (timerRef.current !== undefined) clearTimeout(timerRef.current);
    },
    [],
  );
  return (
    <button
      type="button"
      className="icon-button icon-button--sm icon-button--ghost msg-action"
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
        className="icon-button icon-button--sm icon-button--ghost msg-action msg-action--danger"
        title={copy.discardEditTitle}
        aria-label={copy.discardEditTitle}
        onClick={onConfirm}
      >
        {copy.edit}
      </button>
      <button
        type="button"
        className="icon-button icon-button--sm icon-button--ghost msg-action"
        title={copy.keepConversationTitle}
        aria-label={copy.keepConversationTitle}
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

/** Wave 6B: ONE expandable card per tool call — collapsed it is the status
 * row, expanded it carries the full result details. This is the merge-ready
 * surface for the re-audit MAJOR "tool output doubled" finding (status chip
 * row + second card rendering the same header): ChatPage renders only this
 * card per tool call and overlays `result`/`error` from the paired tool-role
 * message, instead of emitting the StatusDot header + inset result card
 * pair. */
export function ToolCallCard({
  run,
  expanded,
  onToggle,
  onRetry,
  retryLabel,
  result,
  error,
}: {
  run: ToolRun;
  expanded: boolean;
  onToggle: () => void;
  /** 04: retry-with-same-args affordance on failed tool runs. */
  onRetry?: () => void;
  retryLabel?: string;
  /** Overlay from the paired tool-role message content (merge wiring);
   * defaults to the live run's own payload. */
  result?: string | null;
  error?: string;
}): ReactElement {
  const label = TOOL_LABELS[run.name] ?? run.name;
  const resultBody = result !== undefined ? result : run.result;
  const errorBody = error !== undefined ? error : run.error;
  const failed = run.status === "error";
  // Sponsored badge (V3 W5-B): the sponsor-lane result envelope carries
  // sponsored:true + relayerNonce — parse it out of the run result JSON.
  const sponsored =
    run.status === "success" &&
    parseObj(resultBody ?? null)?.sponsored === true;
  const elapsedSec = Math.max(
    0,
    Math.floor((Date.now() - run.startedAt) / 1000),
  );
  return (
    <div className={failed ? "tool-card tool-card--error" : "tool-card"}>
      <button
        type="button"
        className="tool-card__head"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        {run.status === "running" ? (
          <Spinner size={12} />
        ) : run.status === "success" ? (
          <span className="tool-card__ok" aria-hidden="true">
            ✓
          </span>
        ) : (
          <span className="tool-card__fail" aria-hidden="true">
            ✕
          </span>
        )}
        <strong className="copper tool-card__label">{label}</strong>
        <ToolClassBadge name={run.name} />
        {sponsored ? (
          <span className="tool-card__sponsored" aria-label="sponsored relay"
            title="Executed gas-free via the protocol GasTank">
            sponsored
          </span>
        ) : null}
        {/* T5 a11y: the ticking seconds re-announce every second on the
            live tool-card status; hide the running count — the honest
            "done"/"failed" terminal text below stays announced. */}
        <span
          className="tool-card__state"
          aria-hidden={run.status === "running" || undefined}
        >
          {run.status === "running"
            ? `${elapsedSec}s…`
            : run.status === "success"
              ? "done"
              : "failed"}
        </span>
      </button>
      {expanded && (
        <div className="tool-card__body">
          <div className="tool-card__meta">
            <span aria-hidden={run.status === "running" || undefined}>
              {run.status === "running"
                ? `running ${elapsedSec}s`
                : `ran in ${elapsedSec}s`}
            </span>
            {run.status !== "running" ? (
              <span className="visually-hidden">
                {run.status === "success" ? "done" : "failed"}
              </span>
            ) : null}
          </div>
          {run.args && Object.keys(run.args).length > 0 && (
            <pre className="tool-card__args">
              {JSON.stringify(run.args, null, 2)}
            </pre>
          )}
          {errorBody ? (
            <div className="tool-card__err">
              <span>
                {/* 04: humanized — never a raw viem/backend dump. */}
                {humanizeError(errorBody)}
              </span>
              {onRetry && retryLabel ? (
                <button
                  type="button"
                  className="icon-button icon-button--sm icon-button--ghost msg-action"
                  onClick={onRetry}
                >
                  {retryLabel}
                </button>
              ) : null}
            </div>
          ) : resultBody ? (
            <ToolResultBody name={run.name} content={resultBody} />
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

  // L1-L9: array-of-objects results read as tabular data, not JSON — render
  // a mini-table (reuses .chat-md table styling); everything else keeps the
  // monospace body.
  const rows = parseObjectRows(content);
  if (rows) {
    return <MiniTable rows={rows} />;
  }

  const text = formatToolResult(name, content);
  if (!text) return null;

  // Wave 6B: a tool failure must never render in the same dim gray as
  // helper text (browser-3 finding #6) — even when the live run map is
  // gone (e.g. after reload), the payload itself marks the danger tone.
  const failed = isFailurePayload(content);
  return (
    <pre
      className={failed ? "tool-result tool-result--danger" : "tool-result"}
      style={{
        ...preBlockStyle,
        wordBreak: "break-word",
        lineHeight: "var(--lh-normal)",
        color: failed ? "var(--danger)" : "var(--muted)",
      }}
    >
      {text}
    </pre>
  );
}

/** Wave 6B: tool failures arrive either as an `{error}` JSON envelope or a
 * bare "Error: …" string; both mark the danger tone. */
function isFailurePayload(content: string | null): boolean {
  if (!content) return false;
  const obj = parseObj(content);
  if (obj) return obj.error !== undefined;
  return /^error\b/i.test(content.trim());
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
  const obj = parseObj(content);
  if (!obj || obj.error !== undefined) return null;
  return obj.encodeOnly || obj.txHash ? (obj as EncodePreview) : null;
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
          border: `1px solid ${"color-mix(in srgb, var(--copper) 40%, transparent)"}`,
          background: "color-mix(in srgb, var(--copper) 12%, transparent)",
          fontSize: "var(--fs-body)",
        }}
      >
        <strong style={{ color: "var(--copper-bright)" }}>
          <Check size={14} /> {chatCopy.encodeSubmitted}
        </strong>
        <div
          className="num"
          style={{
            color: "var(--muted)",
            marginTop: "var(--space-1)",
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
        border: "1px solid var(--line)",
        background: "var(--bg-2)",
        fontSize: "var(--fs-small)",
        color: "var(--muted)",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "var(--space-1)",
          alignItems: "center",
          fontWeight: "var(--fw-semibold)",
          color: "var(--text)",
          marginBottom: "var(--space-2)",
        }}
      >
        <ShieldCheck size={14} />
        {chatCopy.encodeTitle}
      </div>
      {preview.to ? <div>to: {preview.to}</div> : null}
      {preview.value && preview.value !== "0" ? (
        <div className="num">value: {formatNativeValue(preview.value)}</div>
      ) : null}
      {amountLabel ? (
        <div className="num">amount: {amountLabel}</div>
      ) : null}
      {preview.data ? (
        <div style={{ wordBreak: "break-all", marginTop: "var(--space-1)" }}>
          data: {preview.data.slice(0, 66)}
          {preview.data.length > 66 ? "…" : ""}
          <div style={{ color: "var(--dim)", marginTop: "var(--space-1)" }}>
            {chatCopy.encodeRawData}
          </div>
        </div>
      ) : null}
      {signError ? (
        <div
          style={{
            marginTop: "var(--space-2)",
            color: "var(--danger)",
            fontSize: "var(--fs-small)",
          }}
        >
          {signError}
        </div>
      ) : null}
      {onSign && preview.to && !signedHash ? (
        <div style={{ marginTop: "var(--space-2)" }}>
          <Button onClick={handleSign} icon={<Wallet size={14} />}>
            {chatCopy.encodeSign}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const preBlockStyle: CSSProperties = {
  fontSize: "var(--fs-small)",
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

/** L1-L9: array-of-objects tool results become a mini-table. */
type MiniTableRow = Record<string, unknown>;

function parseObjectRows(content: string | null): MiniTableRow[] | null {
  if (!content) return null;
  try {
    const parsed: unknown = JSON.parse(content);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const rows = parsed.filter(
      (item): item is MiniTableRow =>
        typeof item === "object" &&
        item !== null &&
        !Array.isArray(item) &&
        Object.keys(item).length > 0,
    );
    // A table needs uniform columns and more than one row to beat the
    // single-object card view; guard both.
    if (rows.length < 2) return null;
    const columns = Object.keys(rows[0] ?? {});
    if (columns.length === 0 || columns.length > 6) return null;
    return rows.every(
      (row) =>
        Object.keys(row).length === columns.length &&
        columns.every((col) => col in row),
    )
      ? rows
      : null;
  } catch {
    return null;
  }
}

function MiniTable({ rows }: { rows: MiniTableRow[] }): ReactElement {
  const columns = Object.keys(rows[0] ?? {});
  return (
    <div className="chat-md">
      <table>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col} scope="col">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((col) => (
                <td key={col}>{miniCellText(row[col])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function miniCellText(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
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
