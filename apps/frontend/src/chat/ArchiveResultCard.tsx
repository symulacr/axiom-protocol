import type { ReactElement } from "react";
import { formatToolResult } from "@axiom/chat-runtime";
import { COLORS } from "../components/ui.js";

function parseObj(content: string | null): Record<string, unknown> | null {
  if (!content) return null;
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function LinkLine({ href, label }: { href: string; label: string }): ReactElement {
  return (
    <div style={{ marginTop: 4 }}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: COLORS.bronzeLight, wordBreak: "break-all" }}
      >
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
    return (
      <pre
        style={{
          fontSize: "var(--text-xs)",
          margin: 0,
          whiteSpace: "pre-wrap",
          fontFamily: "inherit",
        }}
      >
        {fallback}
      </pre>
    );
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
      <div style={{ fontSize: "var(--text-sm)" }}>
        <strong style={{ color: archived ? COLORS.success : COLORS.textMuted }}>
          {archived ? "Was archived" : "Not archived"}
        </strong>
        {obj.archivedAt ? (
          <div style={{ color: COLORS.textMuted, marginTop: 4 }}>
            {String(obj.archivedAt)}
          </div>
        ) : null}
        {snapshotUrl ? <LinkLine href={snapshotUrl} label={snapshotUrl} /> : null}
        {obj.interpretation ? (
          <div style={{ color: COLORS.textMuted, marginTop: 6, fontSize: "var(--text-xs)" }}>
            {String(obj.interpretation)}
          </div>
        ) : null}
      </div>
    );
  }

  if (name === "archive_account_tweets") {
    const tweets = (obj.tweets ?? obj.snapshots) as unknown[] | undefined;
    return (
      <div style={{ fontSize: "var(--text-sm)" }}>
        <div style={{ color: COLORS.text, marginBottom: 6 }}>
          @{String(obj.handle ?? "?")} — {String(obj.archivedTweetCount ?? obj.count ?? 0)}{" "}
          tweet(s)
        </div>
        {Array.isArray(tweets)
          ? tweets.slice(0, 12).map((t, i) => {
              const url =
                typeof t === "string"
                  ? t
                  : String((t as Record<string, unknown>).url ?? (t as Record<string, unknown>).snapshotUrl ?? "");
              return url ? <LinkLine key={i} href={url} label={url} /> : null;
            })
          : null}
      </div>
    );
  }

  return (
    <pre
      style={{
        fontSize: "var(--text-xs)",
        margin: 0,
        whiteSpace: "pre-wrap",
        fontFamily: "inherit",
      }}
    >
      {fallback}
    </pre>
  );
}