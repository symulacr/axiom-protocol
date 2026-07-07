function formatWei(wei: bigint): string {
  const s = wei.toString().padStart(19, "0");
  const whole = s.slice(0, -18) || "0";
  const frac = s.slice(-18).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

function formatArchiveResult(name: string, obj: Record<string, unknown>): string {
  if (name === "archive_confirm_deletion") {
    const lines: string[] = [];
    if (obj.wasArchived === true || obj.archived === true) {
      lines.push("Archived: yes");
      if (obj.archivedAt) lines.push(`Captured: ${String(obj.archivedAt)}`);
      if (obj.snapshotUrl) lines.push(`Snapshot: ${String(obj.snapshotUrl)}`);
      if (obj.interpretation) lines.push(String(obj.interpretation));
    } else {
      lines.push("Archived: no");
      if (obj.interpretation) lines.push(String(obj.interpretation));
    }
    return lines.join("\n");
  }

  if (name === "archive_account_tweets") {
    const handle = obj.handle ?? "?";
    const count = obj.archivedTweetCount ?? obj.count ?? 0;
    const tweets = obj.tweets ?? obj.snapshots;
    const lines = [`@${String(handle)} — ${String(count)} archived tweet URL(s)`];
    if (Array.isArray(tweets)) {
      for (const t of tweets.slice(0, 20)) {
        if (typeof t === "string") lines.push(`• ${t}`);
        else if (t && typeof t === "object") {
          const row = t as Record<string, unknown>;
          const url = row.url ?? row.original ?? row.snapshotUrl;
          const ts = row.timestamp ?? row.iso;
          lines.push(`• ${url ?? JSON.stringify(row)}${ts ? ` (${String(ts)})` : ""}`);
        }
      }
      if (tweets.length > 20) lines.push(`… and ${tweets.length - 20} more`);
    }
    return lines.join("\n");
  }

  if (name === "archive_lookup") {
    const url = obj.url ?? obj.original;
    const snapshots = obj.snapshots;
    if (Array.isArray(snapshots)) {
      const lines = [`Snapshots for ${String(url ?? "URL")} (${snapshots.length})`];
      for (const s of snapshots.slice(0, 15)) {
        if (s && typeof s === "object") {
          const row = s as Record<string, unknown>;
          lines.push(
            `• ${row.snapshotUrl ?? row.url ?? "?"}${row.iso ? ` (${String(row.iso)})` : ""}`,
          );
        }
      }
      if (snapshots.length > 15) lines.push(`… and ${snapshots.length - 15} more`);
      return lines.join("\n");
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

  if (obj.encodeOnly === true) return "";

  if (obj.ok === true && obj.txHash !== undefined) {
    const keys = Object.keys(obj).filter((k) => k !== "ok" && k !== "txHash");
    if (keys.length === 0 || (keys.length === 1 && keys[0] === "amount")) {
      return "";
    }
    return `Transaction sent: ${String(obj.txHash)}`;
  }

  if (name.startsWith("archive_")) {
    const archiveText = formatArchiveResult(name, obj);
    if (archiveText) return archiveText;
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
  if (obj.wasArchived !== undefined || obj.archived !== undefined) {
    const archiveText = formatArchiveResult("archive_confirm_deletion", obj);
    if (archiveText) return archiveText;
  }
  if (obj.archivedTweetCount !== undefined || (obj.handle && obj.tweets)) {
    const archiveText = formatArchiveResult("archive_account_tweets", obj);
    if (archiveText) return archiveText;
  }

  const lines = Object.entries(obj)
    .filter(([k]) => k !== "ok" && k !== "encodeOnly")
    .map(([k, v]) => {
      if (Array.isArray(v)) return `${k}: (${v.length} items)`;
      if (v && typeof v === "object") return `${k}: [details]`;
      return `${k}: ${String(v)}`;
    });
  return lines.join("\n");
}