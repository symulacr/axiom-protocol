import { postJson, toolFail } from "../transport.js";
import type { ToolRuntime } from "../transport.js";
import type { ToolResult } from "../types.js";

type ArchiveIntent = "lookup" | "confirm" | "account";

async function archiveQuery(
  ctx: ToolRuntime,
  body: Record<string, unknown>,
): Promise<ToolResult> {
  const { ok: httpOk, data } = await postJson<Record<string, unknown>>(
    ctx.http,
    "/v1/archive/query",
    body,
  );
  if (!httpOk) return toolFail("archive query fail");
  return { ok: true as const, content: JSON.stringify(data) };
}

function clampLimit(n: unknown, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(Math.max(Math.trunc(v), 1), 200);
}

function requireUrl(args: Record<string, unknown>): string | ToolResult {
  const url = String(args.url ?? "");
  if (!url) return toolFail("url required");
  return url;
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
      return toolFail(`Unknown archive tool: ${name}`);
  }
}

function archiveLookup(
  args: Record<string, unknown>,
  ctx: ToolRuntime,
): Promise<ToolResult> | ToolResult {
  const url = requireUrl(args);
  if (typeof url !== "string") return url;
  const limit = clampLimit(args.limit, 50);
  return archiveQuery(ctx, {
    intent: "lookup" satisfies ArchiveIntent,
    url,
    limit,
    fullList: limit > 1,
  });
}

async function archiveAccount(
  args: Record<string, unknown>,
  ctx: ToolRuntime,
): Promise<ToolResult> {
  const handle = String(args.handle ?? "");
  if (!handle) return toolFail("handle required");
  const result = await archiveQuery(ctx, {
    intent: "account" satisfies ArchiveIntent,
    handle,
    limit: clampLimit(args.limit, 100),
  });
  if (!result.ok) return result;
  try {
    const obj = JSON.parse(result.content) as Record<string, unknown>;
    return {
      ok: true as const,
      content: JSON.stringify({
        handle: obj.handle,
        archivedTweetCount: obj.count,
        tweets: obj.snapshots,
        cached: obj.cached,
      }),
    };
  } catch {
    return result;
  }
}

async function archiveConfirm(
  args: Record<string, unknown>,
  ctx: ToolRuntime,
): Promise<ToolResult> {
  const url = requireUrl(args);
  if (typeof url !== "string") return url;
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
    return {
      ok: true as const,
      content: JSON.stringify({
        url,
        wasArchived,
        snapshotUrl: obj.snapshot?.snapshotUrl ?? null,
        archivedAt: obj.snapshot?.iso ?? null,
        interpretation: wasArchived
          ? `Wayback captured this URL on ${obj.snapshot?.iso}.`
          : "No Wayback snapshot for this URL.",
        cached: obj.cached,
      }),
    };
  } catch {
    return result;
  }
}
