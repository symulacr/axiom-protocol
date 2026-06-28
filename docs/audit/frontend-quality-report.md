# Frontend Quality Report

**Date:** 2026-06-26
**Scope:** `apps/frontend/src/` — 56 files (19 hooks, 16 components, 6 pages, 5 utils)

---

## 1. Hardcoded Values

### Colors outside COLORS object

**main.tsx** — 4 hardcoded hex values for RainbowKit theme and toast:
- Line 26: `'#b8976e'` (accentColor)
- Line 27: `'#10100e'` (accentColorForeground)
- Line 38: `'#1c1a17'` (toast background)
- Line 39: `'#f5f0e8'` (toast color)

**Fix:** Import COLORS and reference `COLORS.bronze`, `COLORS.bg`, `COLORS.surface`, `COLORS.text`.

**ui.tsx** — 20 hex values in the COLORS definition (acceptable — these ARE the tokens) + 1 inline hex at line 72 (`'#10100e'` in button primary). Should reference `COLORS.bg`.

### Hardcoded font-family (8 instances)

| File | Line | Value | Fix |
|------|------|-------|-----|
| MonoInput.tsx | 15 | `"'SF Mono', monospace"` | Use `var(--font-mono)` |
| MintForm.tsx | 141 | `"'SF Mono', monospace"` | Use `var(--font-mono)` |
| ProviderCard.tsx | 37 | `"'SF Mono', monospace"` | Use `var(--font-mono)` |
| TransferModal.tsx | 128, 151, 178, 204, 217 | `"'SF Mono', monospace"` | Use MonoInput component or `var(--font-mono)` |

**Fix:** Replace all with `var(--font-mono)` or use the MonoInput component.

### Hardcoded z-index (6 instances)

| File | Line | Value | Risk |
|------|------|-------|------|
| App.tsx | 65 | `zIndex: 1000` | ShortcutHelp overlay — acceptable |
| App.tsx | 136 | `zIndex: 100` | Sticky header — acceptable |
| App.tsx | 220 | `zIndex: 99` | Mobile menu — acceptable |
| ui.tsx | 465 | `zIndex: 100` | Modal — acceptable |
| index.css | 218 | `z-index: 9999` | **Skip-link — should be 1000** |
| index.css | 221 | `z-index: 1000` | Tooltip — acceptable |

**Fix:** Change skip-link z-index from 9999 to 1000.

---

## 2. Untyped Code

### `any` type usage: **0 instances** ✅

### `as` type assertions: **35 instances** across 10 types

| Assertion | Count | Files | Risk |
|-----------|-------|-------|------|
| `as Record<string, unknown>` | 10 | AgentEvents, MarketPage, ChatPage | Medium — event payload access |
| `as Address` | 7 | addresses.ts | Low — config type casting |
| `as Error \| null` | 7 | useAgentMetadata, usePerformanceBatch, useVaultDataBatch | Low — wagmi error typing |
| `as HTMLElement` | 4 | App.tsx | Low — DOM event typing |
| `as Array<...>` | 3 | ChatPage.tsx | Medium — could use typed responses |
| Other (TickResult, SSEChunk, ToolContext, Promise) | 4 | Various | Low |

**Recommendation:** The `as Record<string, unknown>` pattern (10 instances) could be eliminated by using the typed event payload helpers from `utils/events.ts`.

### `unknown` type usage: **19 instances**

Most are legitimate (event payloads, API responses, error handling).

---

## 3. ESLint Diagnostics

**13 diagnostics in 9 files** (13 errors, 0 warnings):

| File | Line | Rule | Issue |
|------|------|------|-------|
| AgentsBrowser.tsx | 10 | no-unused-vars | `Alert` imported but unused |
| AgentsBrowser.tsx | 33 | no-unused-vars | `address` assigned but unused |
| AgentsBrowser.tsx | 150 | no-unused-vars | `countLabel` assigned but unused |
| ChatPage.tsx | 15 | no-unused-vars | `SectionTitle` imported but unused |
| ChatPage.tsx | 18 | no-unused-vars | `Skeleton` imported but unused |
| ChatPage.tsx | 19 | no-unused-vars | `Alert` imported but unused |
| EmptyState.tsx | 2 | no-unused-vars | `COLORS` imported but unused |
| HealthBadge.tsx | 7 | no-unused-vars | `isError` assigned but unused |
| PaymentPanel.tsx | 276 | no-unused-vars | `isEarningsLoading` assigned but unused |
| TradeHistory.tsx | 3 | no-unused-vars | `MonoLabel` imported but unused |
| usePerformance.ts | 19 | no-unused-vars | `NULL_METRICS` assigned but unused |
| useVaultData.ts | 2 | no-unused-vars | `Address` imported but unused |
| format.ts | 15 | no-unused-vars | `err` in catch block unused |

**All 13 are unused imports/variables.** No type errors, no logic issues.

---

## 4. Import Analysis

### Unused imports (confirmed by ESLint)

| File | Unused Import |
|------|---------------|
| AgentsBrowser.tsx | `Alert` |
| ChatPage.tsx | `SectionTitle`, `Skeleton`, `Alert` |
| EmptyState.tsx | `COLORS` |
| TradeHistory.tsx | `MonoLabel` |
| useVaultData.ts | `Address` |

### Unused variables (confirmed by ESLint)

| File | Unused Variable |
|------|-----------------|
| AgentsBrowser.tsx | `address`, `countLabel` |
| HealthBadge.tsx | `isError` |
| PaymentPanel.tsx | `isEarningsLoading` |
| usePerformance.ts | `NULL_METRICS` |
| format.ts | `err` (catch block) |

### Circular dependencies: **None detected** ✅

### Missing barrel exports: None critical. Hooks directory has no `index.ts` but direct imports work fine at current scale.

---

## 5. Duplicated Patterns

### Pattern: Muted text paragraph
`color: COLORS.textMuted, fontSize: 'var(--text-sm)', margin: 0` — **8 instances** across 5 files.
**Fix:** Use `MutedText` component (already created but not yet migrated everywhere).

### Pattern: Metadata definition list
`margin: 0, display: grid, gridTemplateColumns: 8.75rem 1fr, gap` — **3 instances**.
**Fix:** Use `MetadataGrid` component (already created but not yet migrated everywhere).

### Pattern: Centered empty card
`padding: var(--space-3xl) var(--space-xl), textAlign: center` — **3 instances**.
**Fix:** Use `EmptyState` component (already created but not yet migrated everywhere).

### Pattern: MonoInput style
`fontFamily: "'SF Mono', monospace"` — **8 instances** across 4 files.
**Fix:** Use `MonoInput` component or `var(--font-mono)`.

---

## 6. Recommendations (ordered by impact)

| # | Fix | Impact | Effort |
|---|-----|--------|--------|
| 1 | Remove 13 unused imports/variables (ESLint errors) | Medium | Low |
| 2 | Replace 8 hardcoded font-family with `var(--font-mono)` | Medium | Low |
| 3 | Replace 4 hardcoded colors in main.tsx with COLORS refs | Medium | Low |
| 4 | Migrate remaining instances to EmptyState/MetadataGrid/MutedText | Medium | Low |
| 5 | Fix skip-link z-index 9999 → 1000 | Low | Low |
| 6 | Replace `as Record<string, unknown>` with typed event helpers | Medium | Medium |
| 7 | Remove unused `NULL_METRICS` in usePerformance.ts | Low | Low |
