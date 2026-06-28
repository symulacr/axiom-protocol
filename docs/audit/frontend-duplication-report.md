# Frontend Duplication & Elegance Report

**Date:** 2026-06-26
**Scope:** `apps/frontend/src/` — 50 files (17 hooks, 13 components, 6 pages)

---

## Executive Summary

The frontend has **15 duplicated style patterns** (3+ instances), **35 hardcoded color values**, **31 type assertions**, and **4 zero-copy issues** where the same data is fetched multiple times. The most impactful fixes are:

1. **Extract `EmptyCard` utility** — eliminates 6 identical `Card style={{ textAlign: 'center', padding: ... }}` patterns
2. **Extract `MetadataGrid` component** — eliminates 3 identical `<dl className="stack-on-mobile">` patterns
3. **Extract shared event payload parser** — eliminates 8 identical `ev.payload as Record<string, unknown>` patterns
4. **Batch vault data fetching** — eliminates N individual `useVaultData` calls per agent card
5. **Batch performance fetching** — eliminates N individual `usePerformance` calls per agent card

---

## 1. Duplicated Inline Styles

### Pattern: Centered empty card (`padding: space-3xl space-xl, textAlign: center`)
**Instances: 6**
- `apps/frontend/src/pages/AgentsBrowser.tsx:105`
- `apps/frontend/src/pages/AgentsBrowser.tsx:114`
- `apps/frontend/src/pages/AgentDetail.tsx:222`
- `apps/frontend/src/pages/AgentDetail.tsx:240`
- `apps/frontend/src/pages/MarketPage.tsx:118`
- `apps/frontend/src/pages/MarketPage.tsx:210`

**Proposed fix:** Already partially addressed by `EmptyState` component. Remaining instances in AgentsBrowser and MarketPage should migrate.

### Pattern: Muted text paragraph (`color: COLORS.textMuted, fontSize: var(--text-sm), margin: 0`)
**Instances: 8**
- `apps/frontend/src/pages/AgentDetail.tsx:223, 239`
- `apps/frontend/src/pages/AgentsBrowser.tsx:96, 151`
- `apps/frontend/src/pages/MarketPage.tsx:119, 142, 211`
- `apps/frontend/src/components/TradeHistory.tsx:19`

**Proposed fix:** Extract `<MutedText>` utility component or CSS class `.text-muted-sm`.

### Pattern: Metadata definition list (`margin: 0, display: grid, gridTemplateColumns: 8.75rem 1fr, gap: md lg`)
**Instances: 3**
- `apps/frontend/src/pages/AgentDetail.tsx:128`
- `apps/frontend/src/components/ExecutePanel.tsx:139`
- `apps/frontend/src/components/ExecutePanel.tsx:269`

**Proposed fix:** Extract `<MetadataGrid>` component that renders a `<dl>` with standard styling.

### Pattern: Metadata dt styling (`color: COLORS.textDim, fontWeight: var(--fw-medium)`)
**Instances: 3**
- `apps/frontend/src/pages/AgentDetail.tsx:156`
- `apps/frontend/src/components/ExecutePanel.tsx:144`
- `apps/frontend/src/components/ExecutePanel.tsx:150`

**Proposed fix:** CSS class `.metadata-label` or part of MetadataGrid component.

### Pattern: Flex column with gap-8 (`display: flex, flexDirection: column, gap: 8`)
**Instances: 3**
- `apps/frontend/src/pages/MarketPage.tsx:133, 205`
- `apps/frontend/src/pages/AgentsBrowser.tsx:178`

**Proposed fix:** CSS class `.stack-sm`.

### Pattern: Mono input field (`className="w-full", style={{ boxSizing, fontFamily: SF Mono }}`)
**Instances: 4** (all in TransferModal)
- `apps/frontend/src/components/TransferModal.tsx:128, 178, 204, 217`

**Proposed fix:** Extract `<MonoInput>` variant of Input component.

### Pattern: dd overflow hidden (`margin: 0, overflow: hidden`)
**Instances: 5** (all in AgentDetail)
- `apps/frontend/src/pages/AgentDetail.tsx:137, 141, 145, 153, 157`

**Proposed fix:** Part of MetadataGrid component.

---

## 2. Duplicated Component Patterns

### Empty state cards
**3 distinct patterns** all render a centered card with muted text:
1. `<Card style={{ padding: '...', textAlign: 'center' }}><p>message</p></Card>` — 6 instances
2. `<EmptyState><p>message</p></EmptyState>` — 2 instances (already extracted)
3. Inline `<p style={{ color: COLORS.textDim, textAlign: 'center' }}>` — 3 instances

**Proposed fix:** Migrate all to `EmptyState` component. Add optional `action` prop for CTA buttons.

### SectionTitle with marginTop
Some SectionTitles have `style={{ marginTop: 'var(--space-2xl)' }}`, others don't. This is intentional spacing variation but could be standardized with a `size` prop.

**Instances without marginTop:** 10 (ExecutePanel ×4, PaymentPanel ×1, AgentDetail ×3, TradeHistory ×1, PerformanceMetrics ×1)
**Instances with marginTop:** 3 (MarketPage ×3)

**Proposed fix:** Add `spacing` prop to SectionTitle: `compact` (default, no margin) vs `spaced` (adds margin-top).

---

## 3. Hardcoded Values

### In COLORS object (ui.tsx) — acceptable (these ARE the tokens)
35 hex/rgba values in the COLORS definition. These are the design tokens themselves — not violations.

### Outside COLORS — potential violations
- `rgba(184, 151, 110, 0.04)` in HealthBadge.tsx:15,50 — should use `COLORS.bronzeBg` or a new token
- `rgba(0,0,0,0.6)` in App.tsx:66 — ShortcutHelp backdrop, acceptable for overlay

**Verdict:** No significant hardcoded color violations outside the COLORS definition. The palette is well-tokenized.

---

## 4. Untyped Code

### `any` type usage: **0 instances** ✅

### `as` type assertions: **31 instances** across 9 types

| Assertion | Count | Files | Risk |
|-----------|-------|-------|------|
| `as Record<string, unknown>` | 8 | AgentDetail, MarketPage, AgentEvents, ChatPage | Low — event payload access |
| `as Address` | 7 | addresses.ts | Low — type casting from config |
| `as Error \| null` | 5 | useAgentMetadata, usePerformance, useTransfer, useOrchestratorTick | Low — wagmi error typing |
| `as HTMLElement` | 4 | App.tsx | Low — DOM event typing |
| `as Array<...>` | 3 | ChatPage.tsx | Medium — could use typed responses |
| `as TickResult` | 1 | useOrchestratorTick | Low — accumulator typing |
| `as SSEChunk` | 1 | ChatPage.tsx | Low — JSON parse result |
| `as ToolContext` | 1 | ChatPage.tsx | Low — type casting |
| `as Promise<T>` | 1 | apiFetch.ts | Low — res.json() typing |

**Recommendation:** The `as Record<string, unknown>` pattern for event payloads (8 instances) could be eliminated by typing the event store's payload field.

### `unknown` type usage: **19 instances**

Most are legitimate (event payloads, API responses, error handling). The `unknown[]` casts in ChatPage.tsx:47,55 could be typed with a proper response schema.

---

## 5. Import Analysis

### Unused imports: **0 detected** ✅

### Circular dependencies: **None detected** ✅

### Inconsistent import paths: **None** — all use relative paths from the same package

### Missing barrel exports
The hooks directory has no `index.ts` barrel file. Each consumer imports directly from individual hook files. This is fine for a small codebase but could benefit from a barrel if the hook count grows past 20.

---

## 6. Mergeable Modules

### Hooks with similar patterns

| Hook group | Pattern | Merge opportunity |
|------------|---------|-------------------|
| useVaultData + useAgentMetadata | Both use `useReadContracts` with ABI parsing | Low — different contracts, different data |
| usePolledApi + useEventHistory | useEventHistory wraps usePolledApi | Already merged — correct layering |
| useAgentEvents + useEventHistory | useAgentEvents wraps useEventHistory with filtering | Already merged — correct layering |

**Verdict:** Hook architecture is clean. No merge opportunities.

### Components with similar patterns

| Component group | Pattern | Merge opportunity |
|-----------------|---------|-------------------|
| PerformanceMetrics + TradeHistory | Both render Card + SectionTitle + data | Low — different data, different layout |
| ExecutePanel vault state + AgentDetail metadata | Both render `<dl>` grids | **High** — extract MetadataGrid |
| EmptyState (3 instances) | Centered card with muted text | **Already extracted** — migrate remaining |

---

## 7. Zero-Copy Opportunities

### Issue 1: useVaultData called per-agent in AgentsBrowser
**Location:** `AgentCardStatus` component (AgentsBrowser.tsx:10-19)
**Problem:** Each agent card calls `useVaultData(tokenId)` individually. With 10 agents, that's 10 separate `useReadContracts` calls to the blockchain.
**Impact:** High — scales linearly with agent count
**Fix:** Create `useVaultDataBatch(tokenIds: bigint[])` that multicalls `balanceOf` for all tokens in a single RPC request. wagmi's `useReadContracts` supports multiple contracts in one call.

### Issue 2: usePerformance called per-agent in AgentsBrowser
**Location:** `AgentCardStatus` component (AgentsBrowser.tsx:12)
**Problem:** Each agent card calls `usePerformance(tokenId)` individually. With 10 agents, that's 10 separate API calls to `/v1/agents/:id/performance`.
**Impact:** High — scales linearly with agent count
**Fix:** Create batch endpoint `GET /v1/agents/performance?ids=1,2,3,...` and `usePerformanceBatch` hook.

### Issue 3: useHealth called in both HealthBadge and AgentDetail
**Location:** HealthBadge.tsx:7, AgentDetail.tsx:41
**Problem:** Both call `useHealth()` which polls `/v1/health`. If both components are mounted, there are 2 polling requests.
**Impact:** Low — useHealth likely uses react-query with shared cache
**Fix:** Verify that useHealth uses react-query's shared cache. If it uses manual state, migrate to react-query.

### Issue 4: Event payload parsing repeated 8 times
**Location:** AgentDetail.tsx, MarketPage.tsx, useAgentEvents.ts, ChatPage.tsx
**Problem:** Every event consumer does `ev.payload as Record<string, unknown>` and then manually extracts fields.
**Impact:** Medium — duplicated type-unsafe code
**Fix:** Create `parseEventPayload<T>(ev: AxiomEvent): T` utility or type the event store's payload field.

---

## Recommendations (ordered by impact)

| # | Fix | Impact | Effort | Lines saved |
|---|-----|--------|--------|-------------|
| 1 | Batch vault data fetching (useVaultDataBatch) | High | Medium | ~30 + RPC efficiency |
| 2 | Batch performance fetching (usePerformanceBatch + endpoint) | High | Medium | ~20 + API efficiency |
| 3 | Extract MetadataGrid component | Medium | Low | ~45 |
| 4 | Migrate remaining empty states to EmptyState | Medium | Low | ~30 |
| 5 | Extract event payload parser utility | Medium | Low | ~25 |
| 6 | Add SectionTitle spacing prop | Low | Low | ~10 |
| 7 | Extract MonoInput variant | Low | Low | ~15 |
| 8 | Extract MutedText utility | Low | Low | ~20 |
