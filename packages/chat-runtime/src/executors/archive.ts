import { fetchJson } from "../http-json.js";
import type { ToolRuntime } from "../transport.js";
import type { ToolResult } from "../types.js";

const ARCHIVE_PROBE = "https://example.com";

type ArchiveIntent = "lookup" | "confirm" | "account";

async function archiveQuery(
  ctx: ToolRuntime,
  body: Record<string, unknown>,
): Promise<ToolResult> {
  const { ok: httpOk, data } = await fetchJson<Record<string, unknown>>(
    ctx.http,
    "/v1/archive/query",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!httpOk) return fail("archive query fail");
  return success(data);
}

export async function runArchiveTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolRuntime,
): Promise<ToolResult> {
  switch (name) {
    case "archive_lookup":
      return archiveLookup(args, ctx);
    case "archive_account_tweets":
      return archiveAccount(args, ctx);
    case "archive_confirm_deletion":
      return archiveConfirm(args, ctx);
    default:
      return fail(`Unknown archive tool: ${name}`);
  }
}

async function archiveLookup(
  args: Record<string, unknown>,
  ctx: ToolRuntime,
): Promise<ToolResult> {
  const url = String(args.url ?? ARCHIVE_PROBE);
  const fullList = Number(args.limit ?? 0) > 1;
  return archiveQuery(ctx, {
    intent: "lookup" satisfies ArchiveIntent,
    url,
    limit: Number(args.limit ?? (fullList ? 5 : 1)),
    fullList,
  });
}

async function archiveAccount(
  args: Record<string, unknown>,
  ctx: ToolRuntime,
): Promise<ToolResult> {
  const handle = String(args.handle ?? "0g_labs");
  const result = await archiveQuery(ctx, {
    intent: "account" satisfies ArchiveIntent,
    handle,
    limit: Number(args.limit ?? 10),
  });
  if (!result.ok) return result;
  try {
    const obj = JSON.parse(result.content) as Record<string, unknown>;
    return success({
      handle: obj.handle,
      archivedTweetCount: obj.count,
      tweets: obj.snapshots,
      cached: obj.cached,
    });
  } catch {
    return result;
  }
}

async function archiveConfirm(
  args: Record<string, unknown>,
  ctx: ToolRuntime,
): Promise<ToolResult> {
  const url = String(args.url ?? ARCHIVE_PROBE);
  const result = await archiveQuery(ctx, {
    intent: "confirm" satisfies ArchiveIntent,
    url,
  });
  if (!result.ok) return result;
  try {
    const obj = JSON.parse(result.content) as {
      archived?: boolean;
      snapshot?: { iso?: string; snapshotUrl?: string } | null;
      cached?: boolean;
    };
    const wasArchived = obj.archived === true;
    return success({
      url,
      wasArchived,
      snapshotUrl: obj.snapshot?.snapshotUrl ?? null,
      archivedAt: obj.snapshot?.iso ?? null,
      interpretation: wasArchived
        ? `Wayback captured this URL on ${obj.snapshot?.iso}.`
        : "No Wayback snapshot for this URL.",
      cached: obj.cached,
    });
  } catch {
    return result;
  }
}

function success(obj: Record<string, unknown>): ToolResult {
  return { ok: true, content: JSON.stringify(obj) };
}

function fail(message: string): ToolResult {
  return { ok: false, content: JSON.stringify({ error: message }) };
}