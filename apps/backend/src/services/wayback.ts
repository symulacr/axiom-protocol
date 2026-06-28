/**
 * Wayback Machine service — queries Internet Archive's Wayback Machine for
 * archived snapshots of URLs (profile pages, tweet URLs, any web page).
 *
 * Capabilities:
 *  - List all snapshots for a URL via CDX API
 *  - Confirm whether a tweet URL was ever archived
 *  - Find the closest snapshot to a given timestamp
 *
 * LIMITATIONS (must be communicated to callers):
 *  - Twitter/X is JS-rendered; Wayback captures only the HTML shell.
 *  - Bio text and tweet text are NOT extractable from snapshot HTML.
 *  - To view actual content, open the snapshot URL in a browser.
 */

export interface SnapshotSummary {
  url: string;
  timestamp: string;
  iso: string;
  snapshotUrl: string;
  digest?: string;
}

function normalizeCdxRow(originalUrl: string, row: string[]): SnapshotSummary {
  const [timestamp, orig, , , digest] = row;
  return {
    url: orig ?? originalUrl,
    timestamp: timestamp ?? "",
    iso: timestamp
      ? new Date(
          `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}T${timestamp.slice(8, 10)}:${timestamp.slice(10, 12)}:${timestamp.slice(12, 14)}Z`,
        ).toISOString()
      : "",
    snapshotUrl: `https://web.archive.org/web/${timestamp}/${orig ?? originalUrl}`,
    digest,
  };
}

/**
 * Look up all Wayback snapshots for a URL.
 * Uses direct CDX API for predictable performance.
 */
export async function lookupSnapshots(url: string, limit = 50): Promise<SnapshotSummary[]> {
  const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}&output=json&fl=timestamp,original,statuscode,mimetype,digest&collapse=urlkey&limit=${limit}`;
  try {
    const resp = await fetch(cdxUrl, { signal: AbortSignal.timeout(20_000) });
    if (!resp.ok) throw new Error(`CDX returned ${resp.status}`);
    const rows = await resp.json() as string[][];
    if (!Array.isArray(rows) || rows.length < 2) return [];
    return rows.slice(1).map(row => normalizeCdxRow(url, row));
  } catch (err) {
    throw new Error(`Wayback lookup failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Find archived snapshots for all tweets of an X/Twitter account.
 * Uses CDX prefix query: x.com/{handle}/status/
 */
export async function lookupAccountTweets(handle: string, limit = 100): Promise<SnapshotSummary[]> {
  const cleanHandle = handle.replace(/^@/, "").trim();
  const baseUrl = `x.com/${cleanHandle}/status/`;
  const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(baseUrl)}&matchType=prefix&output=json&fl=timestamp,original,statuscode,mimetype,digest&collapse=urlkey&limit=${limit}`;
  try {
    const resp = await fetch(cdxUrl, { signal: AbortSignal.timeout(20_000) });
    if (!resp.ok) throw new Error(`CDX returned ${resp.status}`);
    const rows = await resp.json() as string[][];
    if (!Array.isArray(rows) || rows.length < 2) return [];
    return rows.slice(1).map(row => normalizeCdxRow(baseUrl, row));
  } catch (err) {
    throw new Error(`Wayback account lookup failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Confirm whether a specific tweet URL was ever archived.
 */
export async function confirmArchived(tweetUrl: string): Promise<{ archived: boolean; snapshot: SnapshotSummary | null }> {
  try {
    const snapshots = await lookupSnapshots(tweetUrl, 10);
    if (snapshots.length === 0) return { archived: false, snapshot: null };
    return { archived: true, snapshot: snapshots[0]! };
  } catch (err) {
    throw new Error(`Wayback confirm failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Get the closest snapshot to a given timestamp (for time-travel queries).
 */
export async function closestSnapshot(url: string, timestamp?: string): Promise<SnapshotSummary | null> {
  const ts = timestamp ?? new Date().toISOString().replace(/[-:]/g, "").slice(0, 14);
  try {
    const apiUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}&timestamp=${ts}`;
    const resp = await fetch(apiUrl);
    const data = await resp.json() as { archived_snapshots?: { closest?: { url: string; timestamp: string } } };
    const closest = data.archived_snapshots?.closest;
    if (!closest) return null;
    return {
      url,
      timestamp: closest.timestamp,
      iso: new Date(
        `${closest.timestamp.slice(0, 4)}-${closest.timestamp.slice(4, 6)}-${closest.timestamp.slice(6, 8)}T${closest.timestamp.slice(8, 10)}:${closest.timestamp.slice(10, 12)}:${closest.timestamp.slice(12, 14)}Z`,
      ).toISOString(),
      snapshotUrl: closest.url,
    };
  } catch {
    return null;
  }
}
