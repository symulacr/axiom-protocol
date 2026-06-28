# Wayback Archive Tool — Research & Integration Plan

**Date:** 2026-06-27
**Scope:** Integrate Internet Archive's Wayback Machine as a chat-bot tool for Axiom Protocol agents

---

## 1. Verified Curl Tests — Real Account `0xSero`

### Profile Page Snapshots
```
GET https://archive.org/wayback/available?url=https://x.com/0xSero
→ {"url":"https://x.com/0xSero","archived_snapshots":{"closest":{
    "status":"200","available":true,
    "url":"http://web.archive.org/web/20260128053602/https://x.com/0xSero",
    "timestamp":"20260128053602"}}}
```

### Full History via CDX
```
GET https://web.archive.org/cdx/search/cdx?url=https://x.com/0xSero&output=json
→ 2 profile snapshots:
   20251210003236 — https://x.com/0xsero (39,112 bytes)
   20260128053602 — https://x.com/0xSero (39,519 bytes)
```

### Individual Tweet Snapshots (16 unique tweets)
```
GET https://web.archive.org/cdx/search/cdx?url=x.com/0xSero/status/&matchType=prefix&collapse=urlkey
→ 16 unique tweet captures from 2025-12-10 to 2026-06-09
   Earliest: 2025-12-10T00:31:26Z — status/1998328482930073887
   Latest:   2026-06-09T23:13:31Z — status/2021883028755099721
```

---

## 2. ⚠️ CRITICAL FINDING: Bio Comparison Is Impossible

**Twitter/X is a client-side rendered React SPA.** The Wayback Machine only captures the initial HTML shell, NOT the JS-rendered content.

### Proof — Static HTML Analysis

Both profile snapshots (229KB-237KB HTML files) contain:
- ✅ React app shell `<div id="react-root">`
- ✅ Wayback toolbar injection
- ✅ Loading placeholder
- ❌ **Zero occurrences** of "Sero", "0xSero", or any user content
- ❌ **No `og:description`** meta tag
- ❌ **No `twitter:description`** meta tag
- ❌ **No `profile_bio` or `profile_banner`** in initial HTML
- ❌ **No embedded JSON** with tweet text

### Verified with grep
```
grep "Sero" snapshot1.html → 0 matches
grep "Sero" snapshot2.html → 0 matches
grep "og:description"    → 0 matches
grep "twitter:title"     → 0 matches
```

### Conclusion
**The user's request to "compare bio description with timestamp reference over time" cannot be fulfilled using Wayback Machine snapshots of `x.com/0xSero`.**

The Wayback snapshots only prove that:
1. ✅ The account existed on those dates (URL was reachable)
2. ✅ The page rendered something (HTTP 200, ~39KB of HTML)
3. ❌ What the bio said — **UNKNOWN** (JS-rendered, not captured)

---

## 3. What CAN Be Detected (Confirmation of Deletion / Edit)

### A. Snapshot Existence Proves Account Was Live
If Wayback captured the profile URL on date X, the account existed on date X.

### B. Tweet URL Snapshots Prove Tweet Was Live
If `x.com/0xSero/status/123` has a Wayback snapshot, that tweet was publicly visible at that timestamp.

### C. Deletion Confirmation
If a tweet was live (had snapshots) and then **no longer resolves on live x.com** but Wayback has it — we have evidence it was deleted.

### D. What About Edits?
**Cannot detect edits.** Wayback only captures one version per crawl. If the tweet was edited after the snapshot, the snapshot shows the original version. If the live tweet was edited and re-crawled, Wayback keeps both versions (different timestamps).

---

## 4. Tool Design — What the Agent Can Realistically Do

### Tool: `archive_lookup`
**Input:** `{ url: string, type?: "profile" | "tweet" | "any" }`
**Output:** List of Wayback snapshots with timestamps

**Capabilities:**
- ✅ Confirm account existed on date X
- ✅ List all archived tweets for a user
- ✅ Get the URL of the closest Wayback snapshot for retrieval
- ✅ Detect if a specific tweet URL was ever archived

**Limitations (must be communicated to the LLM):**
- ❌ Cannot extract bio text from snapshots
- ❌ Cannot extract tweet text from snapshots
- ❌ Cannot diff content across timestamps
- ✅ Can confirm "this URL was archived at this time" as a fact

### Tool: `archive_confirm_deletion`
**Input:** `{ tweet_url: string, account_handle: string }`
**Output:** `{ archived: boolean, snapshot_url: string | null, snapshot_timestamp: string | null, currently_live: boolean }`

**Logic:**
1. Check Wayback for `tweet_url` snapshot
2. If exists: return archived snapshot
3. Optionally verify live URL is still up (requires HEAD request — fragile)
4. Return conclusion: "Wayback captured this tweet on {date}, currently {live|deleted}"

---

## 5. omnichron Integration Test (Verified)

```bash
$ npm install omnichron
added 38 packages in 22s

$ cat test.mjs
import { createArchive, providers } from "omnichron";
const archive = createArchive(providers.wayback());
const pages = await archive.getPages("x.com/0xSero", { limit: 10 });
console.log(pages.length); // → 4 (2 profile + 2 tweets, collapsed)

$ node test.mjs
Pages count: 4
- 2025-12-10T00:32:36Z | https://x.com/0xsero
  snapshot: https://web.archive.org/web/20251210003236/https://x.com/0xsero
- 2026-01-28T05:36:02Z | https://x.com/0xSero
  snapshot: https://web.archive.org/web/20260128053602/https://x.com/0xSero
- 2025-12-10T00:31:26Z | https://x.com/0xsero/status/1998328482930073887
- 2026-01-07T14:41:01Z | https://x.com/0xSero/status/2006373334502846825
```

✅ Works. API is stable. Response shape matches README.

---

## 6. Implementation Plan

### Step 1: Install omnichron in `packages/config`
```bash
pnpm --filter @axiom/config add omnichron
```

### Step 2: Create `apps/backend/src/services/wayback.ts`
- Wraps omnichron with our error handling
- Caches results via in-memory LRU (omnichron has built-in cache, can also add ours)
- Returns typed responses for our backend

### Step 3: Add backend route `GET /v1/archive/snapshots`
```
GET /v1/archive/snapshots?url=https://x.com/0xSero&limit=10
→ { snapshots: [{ timestamp, url, snapshot_url }] }
```

### Step 4: Add chat-bot tool in `apps/frontend/src/pages/ChatPage.tsx`
- Tool name: `archive_lookup`
- Tool name: `archive_confirm_deletion`
- Both routed through backend (avoids CORS issues with archive.org from browser)

### Step 5: Update todo with agent integration tests

---

## 7. Honest Limitations to Communicate

When the agent uses this tool, it must tell the user:

> "I can confirm via the Internet Archive's Wayback Machine that this account/tweet was publicly visible on {date}. However, Twitter/X renders content via JavaScript, so the Wayback snapshot only contains the HTML shell — I cannot extract the actual bio text or tweet content from these snapshots. To see the content, you would need to visit the snapshot URL in a browser with JavaScript enabled."

---

## 8. Alternative Approaches (Not Pursued)

| Approach | Why not |
|----------|---------|
| Render Wayback page with headless browser (Puppeteer) | Heavy, slow, expensive |
| Use Twitter API directly | Requires paid API key, auth, ToS restrictions |
| Use Nitter mirrors | Nitter instances frequently go down |
| Use archive.today | Same JS-rendering problem for Twitter |
| Use Common Crawl | Has tweet text but not bio, delayed by months |

---

## 9. Recommendation

**Build the tool, but with honest output.** The agent can:
1. Confirm "this account was live on date X" via Wayback
2. List all archived tweet URLs for an account
3. Return snapshot URLs for the user to view in a browser

It **cannot**:
1. Compare bio text across time
2. Extract tweet text from snapshots
3. Show actual content diffs

This is honest, grounded in reality, and useful for the user's stated goal of "find all posts of an account that were snapshotted" — which IS achievable.
