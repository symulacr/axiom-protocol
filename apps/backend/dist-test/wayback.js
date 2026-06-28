/**
 * Wayback Machine service — wraps omnichron to query Internet Archive snapshots.
 *
 * Capabilities:
 *  - List all snapshots for a URL (profile pages, tweet URLs, etc.)
 *  - Confirm whether a tweet URL was ever archived
 *  - Detect deletion: snapshot exists but live URL no longer resolves
 *
 * LIMITATIONS (must be communicated to callers):
 *  - Twitter/X is JS-rendered; Wayback captures only the HTML shell.
 *  - Bio text and tweet text are NOT extractable from snapshot HTML.
 *  - To view actual content, open the snapshot URL in a browser.
 */
import { createArchive, providers } from "omnichron";
const archive = createArchive(providers.wayback());
function normalize(page) {
    return {
        url: page.url,
        timestamp: page.timestamp,
        iso: new Date(page.timestamp).toISOString(),
        snapshotUrl: page.snapshot,
        digest: page._meta?.digest,
    };
}
/**
 * Look up all Wayback snapshots for a URL.
 * Returns profile snapshots, tweet snapshots, or any URL pattern.
 */
export async function lookupSnapshots(url, limit = 50) {
    try {
        const pages = await archive.getPages(url, { limit });
        return pages.map(normalize);
    }
    catch (err) {
        throw new Error(`Wayback lookup failed: ${err instanceof Error ? err.message : String(err)}`);
    }
}
/**
 * Find archived snapshots for all tweets of an X/Twitter account.
 * Uses CDX prefix query: x.com/{handle}/status/*
 */
export async function lookupAccountTweets(handle, limit = 100) {
    const cleanHandle = handle.replace(/^@/, "").trim();
    // Use lowercase URL form — CDX is case-insensitive on prefix but we'll try both
    try {
        const pages = await archive.getPages(`x.com/${cleanHandle}/status/`, { limit });
        return pages.map(normalize);
    }
    catch (err) {
        throw new Error(`Wayback account lookup failed: ${err instanceof Error ? err.message : String(err)}`);
    }
}
/**
 * Confirm whether a specific tweet URL was ever archived.
 * Returns the most recent snapshot if any.
 */
export async function confirmArchived(tweetUrl) {
    try {
        const pages = await archive.getPages(tweetUrl, { limit: 1 });
        if (pages.length === 0)
            return { archived: false, snapshot: null };
        return { archived: true, snapshot: normalize(pages[0]) };
    }
    catch (err) {
        throw new Error(`Wayback confirm failed: ${err instanceof Error ? err.message : String(err)}`);
    }
}
/**
 * Get the closest snapshot to a given timestamp (for time-travel queries).
 */
export async function closestSnapshot(url, timestamp) {
    const ts = timestamp ?? new Date().toISOString().replace(/[-:]/g, "").slice(0, 14);
    try {
        const apiUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}&timestamp=${ts}`;
        const resp = await fetch(apiUrl);
        const data = await resp.json();
        const closest = data.archived_snapshots?.closest;
        if (!closest)
            return null;
        return {
            url,
            timestamp: closest.timestamp,
            iso: new Date(`${closest.timestamp.slice(0, 4)}-${closest.timestamp.slice(4, 6)}-${closest.timestamp.slice(6, 8)}T${closest.timestamp.slice(8, 10)}:${closest.timestamp.slice(10, 12)}:${closest.timestamp.slice(12, 14)}Z`).toISOString(),
            snapshotUrl: closest.url,
        };
    }
    catch {
        return null;
    }
}
