import { useState, type ReactElement } from "react";
import { formatToolResult } from "@axiom/chat-runtime";
import { classOfTool } from "@axiom/config/chat-tools";
import { COLORS, Spinner } from "../components/ui.js";
import { humanizeError } from "../utils/format.js";
import {
  ArchiveResultCard,
  EncodePreviewCard,
  hasEncodePreview,
} from "./ToolResultCards.js";
import { TOOL_LABELS } from "./tools.js";
import { ToolClassBadge } from "./MessageAtoms.js";

export type ToolRunStatus = "running" | "success" | "error";

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
