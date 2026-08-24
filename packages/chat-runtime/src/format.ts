import { getChatToolSpec } from "@axiom/config/chat-tools";

function formatWei(wei: bigint): string {
  const s = wei.toString().padStart(19, "0");
  const whole = s.slice(0, -18) || "0";
  const frac = s.slice(-18).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

function formatObjectLines(
  obj: Record<string, unknown>,
  objectRender: (v: unknown) => string,
): string {
  return Object.entries(obj)
    .flatMap(([k, v]) => {
      if (k === "ok" || k === "encodeOnly") return [];
      if (Array.isArray(v)) {
        const head = v.slice(0, 5);
        return [
          `${k}: ${head.map((x) => (x && typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ")}${v.length > 5 ? `, +${v.length - 5} more` : ""}`,
        ];
      }
      if (v && typeof v === "object") return [`${k}: ${objectRender(v)}`];
      return [`${k}: ${String(v)}`];
    })
    .join("\n");
}

function formatTweetRow(t: unknown): string[] {
  if (typeof t === "string") return [`• ${t}`];
  if (!t || typeof t !== "object") return [];
  const row = t as Record<string, unknown>;
  const url = row.url ?? row.original ?? row.snapshotUrl;
  const ts = row.timestamp ?? row.iso;
  return [`• ${url ?? JSON.stringify(row)}${ts ? ` (${String(ts)})` : ""}`];
}

function formatSnapshotRow(s: unknown): string[] {
  if (!s || typeof s !== "object") return [];
  const row = s as Record<string, unknown>;
  return [
    `• ${row.snapshotUrl ?? row.url ?? "?"}${row.iso ? ` (${String(row.iso)})` : ""}`,
  ];
}

function formatArchiveResult(
  name: string,
  obj: Record<string, unknown>,
): string {
  if (name === "archive_confirm_deletion") {
    const archived = obj.wasArchived === true || obj.archived === true;
    const lines = [archived ? "Archived: yes" : "Archived: no"];
    if (archived) {
      lines.push(
        ...[
          obj.archivedAt ? `Captured: ${String(obj.archivedAt)}` : "",
          obj.snapshotUrl ? `Snapshot: ${String(obj.snapshotUrl)}` : "",
        ].filter(Boolean),
      );
    }
    if (obj.interpretation) lines.push(String(obj.interpretation));
    return lines.join("\n");
  }

  if (name === "archive_account_tweets") {
    const handle = obj.handle ?? "?";
    const count = obj.archivedTweetCount ?? obj.count ?? 0;
    const tweets = obj.tweets ?? obj.snapshots;
    const rows = Array.isArray(tweets)
      ? tweets.slice(0, 50).flatMap(formatTweetRow)
      : [];
    const more =
      Array.isArray(tweets) && tweets.length > 50
        ? [`… and ${tweets.length - 50} more`]
        : [];
    return [
      `@${String(handle)} — ${String(count)} archived tweet URL(s)`,
      ...rows,
      ...more,
    ].join("\n");
  }

  if (name === "archive_lookup") {
    const url = obj.url ?? obj.original;
    const snapshots = obj.snapshots;
    if (Array.isArray(snapshots)) {
      const more =
        snapshots.length > 30 ? [`… and ${snapshots.length - 30} more`] : [];
      return [
        `Snapshots for ${String(url ?? "URL")} (${snapshots.length})`,
        ...snapshots.slice(0, 30).flatMap(formatSnapshotRow),
        ...more,
      ].join("\n");
    }
    if (obj.snapshot && typeof obj.snapshot === "object") {
      const snap = obj.snapshot as Record<string, unknown>;
      return [
        `Closest snapshot for ${String(url ?? "")}`,
        snap.snapshotUrl ? String(snap.snapshotUrl) : "",
        snap.iso ? `Captured: ${String(snap.iso)}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
  }

  return "";
}

export function formatToolResult(name: string, result: unknown): string {
  let r: unknown = result;
  if (typeof r === "string") {
    try {
      r = JSON.parse(r);
    } catch {
      return String(r);
    }
  }
  if (typeof r !== "object" || r === null) return String(r);
  const obj = r as Record<string, unknown>;
  if (obj.error !== undefined) return `Error: ${String(obj.error)}`;

  if (obj.ask === true) {
    const q = typeof obj.question === "string" ? obj.question : "Question";
    const opts = Array.isArray(obj.options)
      ? obj.options.map(String).filter(Boolean)
      : [];
    const body = opts.length
      ? opts.map((o, i) => `${i + 1}. ${o}`).join("\n")
      : "";
    return `Ask user: ${q}${body ? `\n${body}` : ""}`;
  }

  if (obj.encodeOnly === true) {
    const lines = ["Calldata (encode-only):"];
    if (obj.to !== undefined) lines.push(`to: ${String(obj.to)}`);
    if (obj.data !== undefined) lines.push(`data: ${String(obj.data)}`);
    if (obj.value !== undefined) lines.push(`value: ${String(obj.value)}`);
    if (obj.amount !== undefined) lines.push(`amount: ${String(obj.amount)}`);
    return lines.join("\n");
  }

  if (obj.ok === true && obj.txHash !== undefined) {
    // Receipt fields come from signAndSendWithReceipt when the transport waits — surface status + block.
    const receipt =
      obj.receiptStatus !== undefined
        ? ` (${obj.receiptStatus}${obj.blockNumber !== undefined ? ` in block ${obj.blockNumber}` : ""})`
        : "";
    return `Transaction sent${receipt}: ${String(obj.txHash)}`;
  }

  if (name.startsWith("archive_")) {
    const archiveText = formatArchiveResult(name, obj);
    if (archiveText) return archiveText;
  }

  if (getChatToolSpec(name)?.class === "skill") {
    return formatObjectLines(obj, (v) => JSON.stringify(v));
  }

  if (obj.balance !== undefined) {
    const bal =
      typeof obj.balance === "string"
        ? BigInt(obj.balance)
        : BigInt(String(obj.balance));
    return `Balance: ${formatWei(bal)} 0G`;
  }
  if (obj.tokenId !== undefined && Object.keys(obj).length <= 2)
    return `Agent #${obj.tokenId}`;
  if (obj.agents !== undefined) {
    const agents = obj.agents as unknown[];
    if (agents.length === 0) return "No agents found.";
    return agents
      .map((a, i) => {
        const agent = a as Record<string, unknown>;
        return `${i + 1}. Agent #${agent.tokenId ?? "?"} — ${agent.dataDescription ?? agent.name ?? "Unnamed"}`;
      })
      .join("\n");
  }
  if (obj.events !== undefined) {
    const events = obj.events as unknown[];
    if (events.length === 0) return "No events found.";
    return events
      .map((e) => {
        const ev = e as Record<string, unknown>;
        return `• ${ev.event ?? ev.name ?? "Event"} (block ${ev.blockNumber ?? "?"})`;
      })
      .join("\n");
  }

  return formatObjectLines(obj, () => "[details]");
}
