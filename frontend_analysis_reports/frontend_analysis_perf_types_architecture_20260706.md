# Frontend Analysis — Performance, Types & Architecture

**Agent:** Sub-Agent 3 — Performance, Types & Architecture  
**Scope:** App shell, routing, pages only (excludes `hooks/` and `components/`)  
**Date:** 2026-07-06  
**Files analyzed:** 9

| File | Lines |
|------|------:|
| `App.tsx` | 522 |
| `main.tsx` | 86 |
| `vite-env.d.ts` | 12 |
| `AgentDetail.tsx` | 541 |
| `AgentsBrowser.tsx` | 380 |
| `ChatPage.tsx` | 1178 |
| `MarketPage.tsx` | 376 |
| `MintAgentPage.tsx` | 20 |
| `NotFound.tsx` | 66 |

---

## Executive Summary

The frontend shell is **well-structured at the routing layer**: all pages are lazy-loaded behind `Suspense`, the app uses an error boundary, and several pages apply `useMemo` for derived data. Accessibility basics (skip link, `aria-label` on primary nav, `aria-live` on chat log) are present.

The dominant risks are **concentrated in `ChatPage.tsx`** (1,178 lines) and **`AgentDetail.tsx` tab architecture**:

1. **Chat streaming triggers a React state update on every SSE token**, causing continuous re-renders of the full message list and input chrome during long responses.
2. **`ChatPage` is a monolith** coupling tool definitions, wagmi contract I/O, SSE parsing, and UI — inflating the lazy chunk and hindering memoization.
3. **`AgentDetail` eagerly runs four data hooks on mount** regardless of which tab is active, issuing RPC/API work the user may never view.

Type safety is **generally good** (no `any` in scope), but event payloads and tool results rely heavily on `Record<string, unknown>` casts rather than shared discriminated unions from `@axiom/config`.

**Finding count: 34** (Critical: 2 · High: 6 · Medium: 11 · Low: 10 · Cosmetic: 5)

---

## Architecture Overview

```
main.tsx
  └── StrictMode
        └── WagmiProvider
              └── QueryClientProvider (default config)
                    └── RainbowKitProvider
                          └── BrowserRouter
                                ├── App (shell: header, nav, footer, shortcuts)
                                │     └── Suspense + Routes (lazy pages)
                                └── Toaster

Pages pattern:
  PageHeader + ConnectedGuard + inline styles + hook-driven data
  AgentDetail: client-side tab state (hash) + nested lazy panels
  ChatPage: self-contained LLM proxy + tool loop (no extraction)
  MintAgentPage: thin adapter → MintForm component
```

### Routing & code splitting (`App.tsx`)

- All six routes use `React.lazy()` — good initial bundle isolation.
- `AgentDetail` adds a **second lazy layer** for panels (`ExecutePanel`, `PaymentPanel`, etc.) — good incremental loading within the page chunk.
- `ChatPage` lazy chunk still pulls **wagmi, viem, full tool registry, and archive API handlers** even for users who only browse agents.

### State & data flow

| Page | Pattern | Note |
|------|---------|------|
| AgentsBrowser | `useAgents` + batch vault/perf maps | Debounced client filter |
| AgentDetail | Tab state + unconditional hooks | Hooks not gated by `activeSection` |
| MarketPage | Dual `usePolledApi` (30s) | Leaderboard derived in `useMemo` |
| ChatPage | Local `messages` state + SSE loop | No persistence beyond `hasUsedChat` flag |
| MintAgentPage | URL `provider` param → props | Minimal, correct |

### Styling & composition

- **Universal inline styles** via `style={{}}` and `COLORS` tokens — consistent but prevents CSS-level optimization and increases JSX verbosity.
- **`ConnectedGuard`** wraps wallet-gated pages at page level (not route level) — repeated per page rather than route config.

---

## Findings by Severity

### Critical

#### C1 — ChatPage SSE streaming causes per-token re-renders
**File:** `ChatPage.tsx` · **Lines:** 736–738, 940–1047

Every SSE `delta.content` calls `setStreamText(assistantContent)`, scheduling a full `ChatPage` re-render for each token. During long assistant responses, this re-renders the entire message history, tool result blocks, and input bar on every chunk.

```736:738:apps/frontend/src/pages/ChatPage.tsx
              if (delta.content) {
                assistantContent += delta.content;
                setStreamText(assistantContent);
```

**Impact:** UI jank, main-thread pressure, poor experience on mobile/low-end devices.  
**Fix:** Batch updates via `requestAnimationFrame`, throttle (~50–100ms), or append streaming text in a ref and only commit to state on interval/end.

---

#### C2 — AgentDetail fetches all tab data unconditionally
**File:** `AgentDetail.tsx` · **Lines:** 65–70

`useAgentMetadata`, `useAgentEvents`, `usePerformance`, and `useHealth` run on every mount regardless of `activeSection`. A user landing on Overview still triggers events, performance history, and health polling.

```65:70:apps/frontend/src/pages/AgentDetail.tsx
  const metadata = useAgentMetadata(tokenId ?? 0n);
  const { data, isLoading: metaLoading, error: metaError } = metadata;

  const { events: agentEvents } = useAgentEvents(tokenId);
  const { metrics, history: perfHistory } = usePerformance(tokenId);
  const health = useHealth();
```

**Impact:** Unnecessary RPC/API load, slower time-to-interactive on agent detail.  
**Fix:** Pass `enabled: activeSection === '…'` into hooks (hook-layer change) or split tabs into nested routes (`/agents/:id/execute`).

---

### High

#### H1 — ChatPage is a 1,178-line monolith
**File:** `ChatPage.tsx`

Single file contains: tool JSON schemas (11 tools), wagmi handlers, SSE parser, formatting, streaming loop, and UI. No separation of concerns.

**Impact:** Large lazy chunk, difficult testing, prevents targeted memoization, merge-conflict hotspot.  
**Fix:** Extract `chat/tools.ts`, `chat/useChatStream.ts`, `chat/MessageList.tsx`, `chat/formatToolResult.ts`.

---

#### H2 — Message list uses array index as React key
**File:** `ChatPage.tsx` · **Line:** 942

```940:942:apps/frontend/src/pages/ChatPage.tsx
          {messages.map((msg, i) => (
            <div
              key={i}
```

**Impact:** Incorrect reconciliation if messages are inserted, removed, or reordered mid-stream; state bleed risk if message rows gain local state.  
**Fix:** Assign stable `id` (UUID) per message at creation time.

---

#### H3 — AgentDetail tab UI lacks ARIA tab pattern
**File:** `AgentDetail.tsx` · **Lines:** 118–168

Section nav uses plain `<button>` elements without `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`, or associated `role="tabpanel"` regions.

**Impact:** Screen-reader users cannot discover tab semantics or which panel is active.  
**Fix:** Implement WAI-ARIA tabs pattern or use a headless tab primitive.

---

#### H4 — ShortcutHelp dialog missing focus trap and `aria-modal`
**File:** `App.tsx` · **Lines:** 39–141

Dialog has `role="dialog"` and `aria-label` but:
- No `aria-modal="true"`
- No initial focus move into dialog
- No focus trap (Tab escapes to background)
- No focus restore on close

**Impact:** Keyboard and screen-reader users can interact with obscured content behind overlay.  
**Fix:** Use focus-trap library or implement trap + `useRef` focus restore.

---

#### H5 — `sendMessage` closes over `messages` array
**File:** `ChatPage.tsx` · **Lines:** 666–838

`sendMessage` is recreated whenever `messages` changes (every send/receive). Prompt chip buttons and child closures get new function references each turn.

```838:838:apps/frontend/src/pages/ChatPage.tsx
    [messages, isStreaming, handlers, toolCtx, hasUsedChat],
```

**Impact:** Prevents stable memoization of child components; minor but compounds with C1 re-render volume.  
**Fix:** Use functional updates `setMessages(prev => …)` and read from ref for the tool loop accumulator.

---

#### H6 — ChatPage chunk bundles heavy chain dependencies
**File:** `ChatPage.tsx` · **Lines:** 9–20, 331–581

Imports `useWriteContract`, `usePublicClient`, contract ABIs, and `parseEther` directly in the page module.

**Impact:** Users visiting `/chat` download vault/NFT ABI + wagmi write paths even before first message.  
**Fix:** Dynamic `import()` inside tool handlers for write paths; keep read-only tools lean.

---

### Medium

#### M1 — SSE parser re-processes entire buffer each read
**File:** `ChatPage.tsx` · **Lines:** 584–596, 729–730

`parseSSEChunks(buffer)` splits and JSON-parses the full accumulated buffer on every `reader.read()` iteration. Complexity grows O(n²) with response length.

**Fix:** Track parsed offset; only parse new lines since last index.

---

#### M2 — Loose payload typing via `Record<string, unknown>` casts
**Files:** `ChatPage.tsx` (50, 68, 78), `AgentDetail.tsx` (421), `MarketPage.tsx` (90, 94)

Event and tool payloads are cast at consumption sites instead of using shared typed guards from `@axiom/config`.

**Impact:** Runtime shape mismatches fail silently (`String(undefined)` → `"undefined"`).  
**Fix:** Import `TickPayload`, `TransferPayload` types; add narrow type guards.

---

#### M3 — AgentsBrowser list has no virtualization
**File:** `AgentsBrowser.tsx` · **Lines:** 273–372

All filtered agents render as DOM nodes. Wallets with hundreds of agents will produce a large layout tree.

**Fix:** `@tanstack/react-virtual` or windowed list when `filteredAgents.length > 50`.

---

#### M4 — ChatPage message history has no virtualization
**File:** `ChatPage.tsx` · **Lines:** 926–1134

Long conversations render every message row. Combined with C1, cost scales multiplicatively.

**Fix:** Virtualize message list; cap persisted history client-side.

---

#### M5 — MarketPage “Show all” renders full transfer list
**File:** `MarketPage.tsx` · **Lines:** 222, 264–281

`showAllTransfers` maps the entire `transfers` array with no cap or virtualization.

**Fix:** Paginate or virtualize; keep aria-live region stable.

---

#### M6 — AgentDetail hash navigation not synced with browser history
**File:** `AgentDetail.tsx` · **Lines:** 73–83, 159–161

Initial `activeSection` reads `window.location.hash` once. `hashchange` / `popstate` are not listened to, so back/forward and deep links after mount are ignored.

**Fix:** `useEffect` on `hashchange` or migrate tabs to URL segments.

---

#### M7 — Inline `renderEvent` callback recreated every render
**File:** `AgentDetail.tsx` · **Lines:** 419–460

Anonymous `renderEvent` passed to `EventTimeline` on every parent render defeats child memoization.

**Fix:** Extract `renderAgentEvent` with `useCallback` or move to stable module scope.

---

#### M8 — Chat suggestion chips missing `type="button"`
**File:** `ChatPage.tsx` · **Lines:** 903–919

```903:905:apps/frontend/src/pages/ChatPage.tsx
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
```

**Impact:** If nested inside a form in future, implicit `type="submit"` behavior.  
**Fix:** Add `type="button"`.

---

#### M9 — QueryClient uses default configuration
**File:** `main.tsx` · **Line:** 15

```15:15:apps/frontend/src/main.tsx
const queryClient = new QueryClient();
```

No `staleTime`, `gcTime`, or `refetchOnWindowFocus` tuning. Combined with `usePolledApi` on MarketPage (30s), may cause redundant refetches on tab focus.

**Fix:** Set sensible defaults: `staleTime: 30_000`, `refetchOnWindowFocus: false` for polled queries.

---

#### M10 — Unreachable dead code in AgentsBrowser
**File:** `AgentsBrowser.tsx` · **Lines:** 252–261

After early return when `count === 0` (line 147), the main render path always has `agents.length > 0`. The branch `agents.length === 0` at line 252 is unreachable.

**Fix:** Remove dead branch; simplifies mental model.

---

#### M11 — MarketPage unused imports
**File:** `MarketPage.tsx` · **Lines:** 3, 17

`useCallback` and `apiFetch` are imported but never used — indicates incomplete refactor or copy-paste.

**Fix:** Remove unused imports (lint should catch).

---

### Low

#### L1 — Mobile nav menu lacks full focus trap on open
**File:** `App.tsx` · **Lines:** 313–367

Partial Tab wrap exists but menu doesn't auto-focus first link on open, and background remains tabbable.

---

#### L2 — Global keyboard shortcuts don't close mobile menu
**File:** `App.tsx` · **Lines:** 149–187

Pressing `G`/`M`/`C` navigates while `menuOpen` may still be `true`, leaving stale overlay state until next toggle.

---

#### L3 — AgentsBrowser error retry uses full page reload
**File:** `AgentsBrowser.tsx` · **Line:** 128

`window.location.reload()` discards SPA state and re-downloads assets. Prefer hook `refetch`.

---

#### L4 — `AgentCardStatus` not memoized
**File:** `AgentsBrowser.tsx` · **Lines:** 36–70, 331–334

Re-renders for every agent card when parent re-renders even if that agent's vault/perf data unchanged.

---

#### L5 — Double `parseFloat(balance)` in AgentCardStatus
**File:** `AgentsBrowser.tsx` · **Lines:** 39, 58

Minor redundant computation per card per render.

---

#### L6 — Unused `address` destructure in AgentDetail
**File:** `AgentDetail.tsx` · **Line:** 63

`const { address, isConnected } = useAccount()` — `address` is never used.

---

#### L7 — `process.on` handlers in browser entry
**File:** `main.tsx` · **Lines:** 54–85

`process.on('unhandledRejection')` is Node-centric; in browser builds this try/catch silently no-ops or behaves unpredictably depending on bundler shims.

---

#### L8 — Inconsistent import path extensions
**File:** `main.tsx` · **Lines:** 10–12

`App` and `wagmi` imported without `.js` suffix while other files use `.js` — inconsistent ESM style.

---

#### L9 — MintAgentPage has no page chrome
**File:** `MintAgentPage.tsx`

Delegates entirely to `MintForm` with no `PageHeader` or document title — minor UX/SEO gap.

---

#### L10 — ChatPage uses raw `fetch` while other pages use `apiFetch`
**File:** `ChatPage.tsx` · **Line:** 695 vs tool handlers using `apiFetch`

Inconsistent timeout, error normalization, and auth header handling.

---

### Cosmetic

#### X1 — Repeated identical Suspense fallbacks in AgentDetail
**File:** `AgentDetail.tsx` · **Lines:** 194–523

Five copies of `<Skeleton height={200} />` wrapper — extract `<TabSkeleton />`.

---

#### X2 — NotFound CTA is a styled `Link`, not `Button`
**File:** `NotFound.tsx` · **Lines:** 44–59

Visually a button, semantically a link (acceptable) but inconsistent with design system `Button` usage elsewhere.

---

#### X3 — `handleSearchChange` not wrapped in `useCallback`
**File:** `AgentsBrowser.tsx` · **Lines:** 95–102

Minor; only passed to `Input` which likely isn't memoized.

---

#### X4 — `vite-env.d.ts` declares only three env vars
**File:** `vite-env.d.ts`

`VITE_API_KEY` used in ChatPage but optional (`?`) — no compile-time enforcement when missing.

---

#### X5 — NotFound `<h1>` content is "404" only
**File:** `NotFound.tsx` · **Line:** 31

Screen readers get number without context; consider "Page not found" as visible h1 with styled 404 as decoration.

---

## Bundle / Render Hotspots

| Hotspot | Location | Mechanism | Severity |
|---------|----------|-----------|----------|
| SSE token render storm | `ChatPage` `setStreamText` | O(tokens × messages) re-renders | **Critical** |
| Eager agent detail hooks | `AgentDetail` mount | 4 parallel data sources always | **Critical** |
| Chat lazy chunk size | `ChatPage` module | TOOLS + ABIs + wagmi write | **High** |
| Leaderboard aggregation | `MarketPage` `useMemo` | O(events) per poll — acceptable now | Medium |
| Batch maps in AgentsBrowser | `useVaultDataBatch` + `usePerformanceBatch` | O(agents) map lookups per render | Low |
| `contain: layout style` on `<main>` | `App.tsx:376` | Positive — limits layout thrashing | ✅ |

### Lazy-load map (route chunks)

| Route | Module | Nested lazy |
|-------|--------|-------------|
| `/agents` | `AgentsBrowser` | — |
| `/agents/:id` | `AgentDetail` | 7 panels |
| `/agents/new` | `MintAgentPage` → `MintForm` | — |
| `/market` | `MarketPage` | — |
| `/chat` | `ChatPage` (largest) | — |

---

## A11y Audit

| Area | Status | Gaps |
|------|--------|------|
| Skip link | ✅ `App.tsx:191` | — |
| Primary nav label | ✅ `aria-label="Primary"` | Mobile menu not `role="navigation"` duplicate |
| Agent search | ✅ `aria-label` + ⌘K shortcut | No `aria-describedby` for shortcut hint |
| Chat log | ✅ `role="log"` + `aria-live="polite"` | No `aria-busy` during stream |
| Transfer list | ✅ `aria-label` on `<ul>` | — |
| Shortcut overlay | ⚠️ Partial | Missing focus trap, `aria-modal` (H4) |
| Agent tabs | ❌ | Missing tab semantics (H3) |
| Mobile menu button | ✅ `aria-expanded`, `aria-controls` | Focus management incomplete (L1) |
| External links | ✅ `rel="noreferrer noopener"` | — |
| Form inputs | ✅ Chat input `aria-label` | Suggestion chips missing `type="button"` (M8) |
| NotFound | ⚠️ | `<h1>404</h1>` low context (X5) |
| Keyboard shortcuts | ✅ G/M/C/N/? | No SR announcement on navigate |

---

## Microchange Opportunities

Quick wins (&lt;30 min each) with disproportionate benefit:

1. **Throttle `setStreamText`** to 50ms during SSE (addresses C1 immediately).
2. **Add `type="button"`** to chat prompt chips (M8).
3. **Remove dead branch** in AgentsBrowser (M10) and unused MarketPage imports (M11).
4. **Add `aria-selected` + `role="tab"`** to AgentDetail section buttons (partial H3).
5. **Memoize `AgentCardStatus`** with `React.memo` (L4).
6. **Switch AgentsBrowser retry** from `reload()` to hook refetch (L3).
7. **Add stable message IDs** when pushing to `messages` array (H2).
8. **Set QueryClient `staleTime: 30_000`** in `main.tsx` (M9).

---

## Positive Findings

1. **Route-level code splitting** — All pages lazy-loaded in `App.tsx` with shared `Suspense` fallback spinner.
2. **Nested lazy loading in AgentDetail** — Heavy panels (`ExecutePanel`, `PaymentPanel`, etc.) defer loading until tab activation (component-level; hook eager loading remains an issue).
3. **Batch data fetching in AgentsBrowser** — `useVaultDataBatch` + `usePerformanceBatch` avoid N+1 per-agent requests.
4. **Debounced search** — 200ms debounce on agent filter reduces filter thrashing.
5. **No `any` types** — Zero occurrences across all 9 scoped files.
6. **Typed URL params** — `MintAgentPage` validates `provider` with `isAddress` / `getAddress`.
7. **Error boundaries** — `ErrorBoundary` wraps routed content in `App.tsx`.
8. **CSS containment on main** — `contain: layout style` reduces layout recalculation scope.
9. **Chat abort support** — `AbortController` wired to Stop button; cleans up on cancel.
10. **Semantic lists** — Market transfers use `<ul>`/`<li>` with descriptive `aria-label`.
11. **ConnectedGuard pattern** — Consistent wallet-gating UX across gated pages.
12. **Invalid token guard** — `AgentDetail` early-returns with clear error for bad `tokenId`.

---

## Summary Table

| Severity | Count |
|----------|------:|
| Critical | 2 |
| High | 6 |
| Medium | 11 |
| Low | 10 |
| Cosmetic | 5 |
| **Total** | **34** |

### Top 3 Issues

1. **C1 — ChatPage per-token `setStreamText` render storm** during SSE streaming  
2. **H1 — ChatPage 1,178-line monolith** coupling tools, chain I/O, streaming, and UI into one lazy chunk  
3. **C2 — AgentDetail unconditional hook execution** fetching metadata, events, performance, and health regardless of active tab

---

*Report generated by Sub-Agent 3. Out of scope: `hooks/`, `components/`, build config, test files.*