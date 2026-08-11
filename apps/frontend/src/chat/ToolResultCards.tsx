import { useState, type CSSProperties, type ReactElement } from "react";
import { COLORS } from "../components/ui.js";
import { formatEther } from "viem";
import { formatToolResult } from "@axiom/chat-runtime";

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

export function hasEncodePreview(content: string | null): boolean {
  return parseEncodePreview(content) !== null;
}

function formatNativeValue(weiStr: string): string {
  try {
    return `${formatEther(BigInt(weiStr))} 0G`;
  } catch {
    return `${weiStr} wei`;
  }
}

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
  const preview = parseEncodePreview(content);
  if (!preview) return null;
  const [signedHash, setSignedHash] = useState<string | null>(null);
  const handleSign = async () => {
    if (!onSign || !preview.to) return;
    try {
      const hash = await onSign({
        to: preview.to as `0x${string}`,
        data: (preview.data as `0x${string}`) ?? undefined,
        value: preview.value ? BigInt(preview.value) : undefined,
      });
      setSignedHash(hash);
    } catch {
      void 0;
    }
  };

  const amountLabel =
    toolName === "withdraw" || toolName === "deposit"
      ? `${preview.amount ?? "?"} 0G`
      : preview.amount
        ? `${preview.amount}${preview.amountUnit ? ` ${preview.amountUnit}` : ""}`
        : null;

  if (preview.txHash ?? signedHash) {
    return (
      <div
        style={{
          marginTop: "var(--space-xs)",
          padding: "var(--space-sm) var(--space-md)",
          borderRadius: "var(--radius-md)",
          border: `1px solid ${COLORS.bronzeBorder}`,
          background: COLORS.bronzeBg,
          fontSize: "var(--text-sm)",
        }}
      >
        <strong style={{ color: COLORS.bronzeLight }}>Signed</strong>
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
        marginTop: "var(--space-xs)",
        padding: "var(--space-sm) var(--space-md)",
        borderRadius: "var(--radius-md)",
        border: `1px solid ${COLORS.border}`,
        background: COLORS.bg,
        fontSize: "var(--text-xs)",
        color: COLORS.textMuted,
      }}
    >
      <div
        style={{
          fontWeight: "var(--fw-semibold)",
          color: COLORS.text,
          marginBottom: 6,
        }}
      >
        Sign this transaction
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
        </div>
      ) : null}
      {onSign && preview.to && !signedHash ? (
        <button
          className="btn btn-primary"
          style={{ marginTop: 8 }}
          onClick={handleSign}
        >
          Sign in wallet
        </button>
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

export function ArchiveResultCard({
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
