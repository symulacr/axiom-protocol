
import { extractErrorMessage } from "../utils/response.js";

export interface SnapshotSummary {
  url: string;
  timestamp: string;
  iso: string;
  snapshotUrl: string;
  digest?: string;
}

function waybackTimestampToIso(timestamp: string): string {
  return new Date(
    `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}T${timestamp.slice(8, 10)}:${timestamp.slice(10, 12)}:${timestamp.slice(12, 14)}Z`,
  ).toISOString();
}

async function fetchCdxRows(cdxUrl: string): Promise<string[][]> {
  const resp = await fetch(cdxUrl, { signal: AbortSignal.timeout(20_000) });
  if (!resp.ok) throw new Error(`CDX returned ${resp.status}`);
  const rows = (await resp.json()) as string[][];
  if (!Array.isArray(rows) || rows.length < 2) return [];
  return rows.slice(1);
}

function normalizeCdxRow(originalUrl: string, row: string[]): SnapshotSummary {
  const [timestamp, orig, , , digest] = row;
  return {
    url: orig ?? originalUrl,
    timestamp: timestamp ?? "",
    iso: timestamp ? waybackTimestampToIso(timestamp) : "",
    snapshotUrl: `https://web.archive.org/web/${timestamp}/${orig ?? originalUrl}`,
    digest,
  };
}

export async function lookupSnapshots(
  url: string,
  limit = 50,
): Promise<SnapshotSummary[]> {
  const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}&output=json&fl=timestamp,original,statuscode,mimetype,digest&collapse=urlkey&limit=${limit}`;
  try {
    const rows = await fetchCdxRows(cdxUrl);
    return rows.map((row) => normalizeCdxRow(url, row));
  } catch {
    const closest = await closestSnapshot(url);
    return closest ? [closest] : [];
  }
}

export async function lookupAccountTweets(
  handle: string,
  limit = 100,
): Promise<SnapshotSummary[]> {
  const cleanHandle = handle.replace(/^@/, "").trim();
  const baseUrl = `x.com/${cleanHandle}/status/`;
  const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(baseUrl)}&matchType=prefix&output=json&fl=timestamp,original,statuscode,mimetype,digest&collapse=urlkey&limit=${limit}`;
  try {
    const rows = await fetchCdxRows(cdxUrl);
    return rows.map((row) => normalizeCdxRow(baseUrl, row));
  } catch {
    return [];
  }
}

export async function confirmArchived(
  tweetUrl: string,
): Promise<{ archived: boolean; snapshot: SnapshotSummary | null }> {
  try {
    const snapshots = await lookupSnapshots(tweetUrl, 10);
    if (snapshots.length === 0) return { archived: false, snapshot: null };
    return { archived: true, snapshot: snapshots[0]! };
  } catch (err) {
    throw new Error(
      `Wayback confirm failed: ${extractErrorMessage(err)}`,
      { cause: err },
    );
  }
}

export async function closestSnapshot(
  url: string,
  timestamp?: string,
): Promise<SnapshotSummary | null> {
  const ts =
    timestamp ?? new Date().toISOString().replace(/[-:]/g, "").slice(0, 14);
  try {
    const apiUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}&timestamp=${ts}`;
    const resp = await fetch(apiUrl);
    const data = (await resp.json()) as {
      archived_snapshots?: { closest?: { url: string; timestamp: string } };
    };
    const closest = data.archived_snapshots?.closest;
    if (!closest) return null;
    return {
      url,
      timestamp: closest.timestamp,
      iso: waybackTimestampToIso(closest.timestamp),
      snapshotUrl: closest.url,
    };
  } catch {
    return null;
  }
}
