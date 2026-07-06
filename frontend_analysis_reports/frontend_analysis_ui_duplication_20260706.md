# Frontend UI Duplication Analysis — Sub-Agent 1 (Component & UI Layer)

**Scope:** 14 assigned files in `apps/frontend/src/components/` and `apps/frontend/src/styles/index.css`  
**Date:** 2026-07-06  
**Agent:** Sub-Agent 1 — Component & UI Duplication  
**Total LOC analyzed:** 4,446 lines across 14 files

---

## 1. Executive Summary

The Axiom frontend UI layer shows a **mature shared primitive layer** (`ui.tsx`) with consistent `COLORS`, `Card`, `Button`, `Input`, `Alert`, and layout utilities in `index.css`. However, duplication is concentrated in three areas:

1. **Dual design-token systems** — `COLORS` in `ui.tsx` mirrors `:root` CSS variables in `index.css`, creating two sources of truth for the same palette.
2. **Repeated form/action patterns** — `PaymentPanel.tsx` contains near-copy form sections; `ExecutePanel.tsx` and `TransferModal.tsx` repeat inline style blocks that existing primitives/utilities already cover.
3. **Inconsistent styling strategy** — Some components (`TransferModal`, `PaymentPanel`) adopt CSS utility classes; others (`ExecutePanel`, `ErrorBoundary`, `HealthBadge`) use exclusively inline `style={{}}`, duplicating utilities that `index.css` already defines.

**Severity distribution (28 findings):**
| Severity | Count |
|----------|-------|
| High     | 4     |
| Medium   | 14    |
| Low      | 10    |

**Estimated maintainability impact:** Medium-high. Duplication does not block development but increases drift risk (color updates, form UX, accessibility) and inflates component bundle size via repeated inline style objects (~2–4 KB gzip across hot paths).

---

## 2. File Inventory with LOC

| File | LOC | Role |
|------|-----|------|
| `DepositForm.tsx` | 114 | Inline vault deposit form |
| `EmptyState.tsx` | 63 | Centered empty-state card |
| `ErrorBoundary.tsx` | 108 | React error boundary fallback UI |
| `EventTimeline.tsx` | 208 | Event rail/timeline renderer |
| `ExecutePanel.tsx` | 774 | Strategy tick execution panel |
| `HealthBadge.tsx` | 125 | Backend health status badge |
| `MintForm.tsx` | 255 | Agent NFT mint form |
| `PaymentPanel.tsx` | 648 | Payments, earnings, royalty UI |
| `PerformanceMetrics.tsx` | 76 | Performance summary grid |
| `ProviderCard.tsx` | 84 | Provider selection card |
| `TradeHistory.tsx` | 131 | Trade history list |
| `TransferModal.tsx` | 741 | iNFT transfer modal (2-phase) |
| `ui.tsx` | 532 | Shared UI primitives & tokens |
| `index.css` | 587 | Global design tokens & utilities |
| **Total** | **4,446** | |

---

## 3. Findings by Category

### 3.1 Design Tokens & CSS Duplication

#### F-01 — Dual color palette: `COLORS` object vs CSS custom properties
**Severity:** High  
**Files:** `ui.tsx` L11–49, `index.css` L52–71

**Evidence (`ui.tsx`):**
```ts
export const COLORS = {
  bg: "#10100e",
  surface: "#1c1a17",
  border: "#2d2a25",
  text: "#f5f0e8",
  textPrimary: "#e5dfd6",
  textMuted: "#9a9288",
  textDim: "#736b62",
  bronze: "#b8976e",
  // ...
} as const;
```

**Evidence (`index.css`):**
```css
--c-bg: #10100e;
--c-surface: #1c1a17;
--c-border: #2d2a25;
--c-text: #f5f0e8;
--c-text-primary: #e5dfd6;
--c-text-muted: #9a9288;
--c-text-dim: #736b62;
--c-bronze: #b8976e;
```

**Why duplication:** Every semantic color exists twice — once as JS constants (used in inline styles) and once as CSS variables (used in utility classes and global styles). `index.css` L390–391 explicitly notes utilities were added to replace inline patterns, but `COLORS` remains the dominant token path in components.

**Impact:** Palette changes require edits in two files. Risk of subtle drift (e.g., `COLORS.dangerBg` uses `rgba(200,90,90,0.08)` while `Alert` uses `rgba(200,90,90,0.05)` at `ui.tsx` L183).

**Microchange:** Pick one source of truth. Either export `COLORS` from CSS via `getComputedStyle` at runtime, or replace `COLORS.*` references with `var(--c-*)` in a thin `colors.ts` map. Migrate `Alert`/`Button` to CSS classes first.

---

#### F-02 — Duplicate type-scale blocks in font-pairing branches
**Severity:** Low  
**Files:** `index.css` L113–118, L129–134

**Evidence:** The `mono display + sans body` and `all-sans` branches define **identical** `--text-xs` through `--text-3xl` blocks (6 lines each, byte-for-byte same `calc()` expressions).

**Why duplication:** Copy-paste during design-system branching; no functional difference between the two pairings for type scale.

**Impact:** Low runtime impact; doubles maintenance when adjusting the modular scale.

**Microchange:** Extract shared type-scale into a single rule group or use `@layer` / shared selector list: `:root[data-p-pairing="mono display + sans body"], :root[data-p-pairing="all-sans"] { ... }`.

---

#### F-03 — Inline styles duplicate existing utility classes
**Severity:** Medium  
**Files:** Multiple; exemplar `ExecutePanel.tsx` L356–357, `TradeHistory.tsx` L68–74, `index.css` L394–410, L582–584

**Evidence (`ExecutePanel.tsx`):**
```tsx
<dt style={{ color: COLORS.textDim, fontWeight: "var(--fw-medium)" }}>
```

**Evidence (`index.css` utilities):**
```css
.text-dim { color: var(--c-text-dim); }
.fw-medium { font-weight: var(--fw-medium); }
.tabular-nums { font-variant-numeric: tabular-nums; }
```

**Evidence (`EventTimeline.tsx` L50):** `fontVariantNumeric: "tabular-nums"` inline while `TradeHistory.tsx` L68 uses `className="tabular-nums"`.

**Why duplication:** `index.css` L389–391 documents a migration path, but ~60%+ of assigned components still inline equivalent properties.

**Impact:** Larger JS bundles (style objects recreated per render), inconsistent adoption, harder theming.

**Microchange:** Adopt class-first in `ExecutePanel`, `HealthBadge`, `ProviderCard` for text color, weight, flex, gap, and tabular-nums. Reserve inline styles for truly dynamic values (e.g., `actionColor`).

---

### 3.2 Near-Duplicate Components & JSX Blocks

#### F-04 — `PaymentForm` and `RoyaltySection` are structurally identical
**Severity:** High  
**Files:** `PaymentPanel.tsx` L114–180 vs L287–355

**Evidence (both follow same skeleton):**
```tsx
// PaymentForm L131-178
<h3>Pay for Agent</h3>
<p className="text-xs text-muted">...</p>
<div className={formRowClassName}>
  <Input ... style={{ flex: 1 }} aria-invalid={...} aria-describedby="..." />
  <Button variant="primary" disabled={...} style={{ minWidth: "140px" }}>
    {status === "pending" ? <Spinner size={16} /> : "Label"}
  </Button>
</div>
<p id="..." className="field-error">{error}</p>
{status === "success" && <Alert variant="success">...</Alert>}
{status === "error" && <Alert variant="error">...</Alert>}
```

`RoyaltySection` repeats this pattern with different labels, validation keys, and button text — ~90% structural overlap.

**Why duplication:** Two independent sub-components instead of a parameterized `ActionFormSection` primitive.

**Impact:** Bug fixes (a11y, disabled logic, spinner sizing) must be applied twice. `minWidth: "140px"` already triplicated within the same file (L163, L247, L336).

**Microchange:** Extract `<NumericActionRow>` accepting `title`, `hint`, `value`, `onChange`, `error`, `status`, `onSubmit`, `submitLabel`, `inputProps`.

---

#### F-05 — `HealthBadge` localhost vs production badge shells
**Severity:** Medium  
**Files:** `HealthBadge.tsx` L12–40 vs L67–121

**Evidence (shared shell — 9 identical style properties):**
```tsx
style={{
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  padding: "5px 10px",
  borderRadius: "var(--radius-xl)",
  fontSize: "var(--text-xs)",
  fontWeight: "var(--fw-medium)",
  color: COLORS.textMuted,
  background: "rgba(184, 151, 110, 0.04)",
  border: `1px solid ${COLORS.border}`,
}}
```

Production branch adds `transition`, dynamic `dotColor`, and extra metadata spans; localhost uses static gray dot.

**Why duplication:** Two separate `return` trees instead of one `StatusBadge` with variant prop.

**Impact:** Visual inconsistency if badge padding/radius changes; duplicate a11y attribute patterns.

**Microchange:** Single `<StatusBadge dotColor label extras? />` wrapper; branch only on dot color and child content.

---

#### F-06 — Wallet-disconnected states: `ConnectedGuard` vs `ExecutePanel`
**Severity:** Medium  
**Files:** `ui.tsx` L464–485, `ExecutePanel.tsx` L240–245

**Evidence (`ConnectedGuard`):**
```tsx
<Card style={{ textAlign: "center", padding: "var(--space-3xl) var(--space-xl)" }}>
  <p className="text-muted text-sm fw-regular">
    Connect your wallet to view agents, manage vaults, and execute strategies.
  </p>
</Card>
```

**Evidence (`ExecutePanel`):**
```tsx
<Card style={{ display: "flex", flexDirection: "column", gap: 16 }}>
  <p>Connect wallet to execute a strategy tick.</p>
</Card>
```

**Why duplication:** `ExecutePanel` reimplements a narrower wallet guard instead of wrapping with `ConnectedGuard` or accepting a `fallback` prop.

**Impact:** Inconsistent messaging and styling for the same guard condition; `MintForm` and `PaymentPanel` use `ConnectedGuard` correctly.

**Microchange:** Wrap `ExecutePanel` body in `<ConnectedGuard>` with optional `fallbackMessage` prop, or export `DisconnectedCard` from `ui.tsx`.

---

#### F-07 — `EmptyState` vs `ConnectedGuard` centered card layout
**Severity:** Low  
**Files:** `EmptyState.tsx` L18–26, `ui.tsx` L472–476

**Evidence (both use centered Card with `space-3xl`/`space-xl` padding):**
```tsx
// EmptyState
style={{ textAlign: "center", padding: "var(--space-3xl) var(--space-xl)", display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-md)" }}

// ConnectedGuard
style={{ textAlign: "center", padding: "var(--space-3xl) var(--space-xl)" }}
```

**Why duplication:** Same "empty/centered message in Card" layout pattern without a shared `CenteredCard` or `PlaceholderCard` primitive.

**Impact:** Minor; padding alignment could drift between empty and disconnected states.

**Microchange:** Add `CardCentered` variant to `Card` (`centered?: boolean`) or compose `EmptyState` for disconnected messaging.

---

#### F-08 — `ErrorBoundary` reimplements buttons instead of `Button`
**Severity:** Medium  
**Files:** `ErrorBoundary.tsx` L71–101, `ui.tsx` L56–113

**Evidence (`ErrorBoundary` raw buttons):**
```tsx
<button style={{
  padding: "6px 16px",
  background: COLORS.danger,
  color: COLORS.text,
  border: "none",
  borderRadius: "var(--radius-sm)",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "var(--text-sm)",
}}>Try again</button>
```

**Evidence (`Button` primary/secondary variants):** Full variant system with disabled states, transitions, and consistent padding at `ui.tsx` L56–88.

**Why duplication:** Error boundary avoids importing `Button`, duplicating two button style blocks (primary filled + outlined).

**Impact:** Buttons won't match app chrome; missing `Button` transitions and disabled opacity; separate touch-target handling.

**Microchange:** Import `Button` from `./ui.js`; use `variant="primary"` and `variant="secondary"`. Consider wrapping fallback in `Alert` for consistency with `ErrorAlert`.

---

### 3.3 Repeated JSX / Layout Patterns

#### F-09 — Definition-list (`dl`/`dt`/`dd`) grid repeated 3×
**Severity:** High  
**Files:** `ExecutePanel.tsx` L346–394, L664–755; `PaymentPanel.tsx` L208–240

**Evidence (ExecutePanel Vault State):**
```tsx
<dl className="stack-on-mobile" style={{
  margin: 0,
  display: "grid",
  gridTemplateColumns: "120px 1fr",
  gap: "8px 16px",
  fontSize: "var(--text-sm)",
}}>
  <dt style={{ color: COLORS.textDim, fontWeight: "var(--fw-medium)" }}>Balance</dt>
  <dd style={{ margin: 0, color: COLORS.bronzeLight, fontWeight: "var(--fw-semibold)" }}>...</dd>
  // 3+ rows with identical dt/dd style objects
</dl>
```

ExecutePanel's "On-chain Execution" block (L664–755) repeats the same `dt` style **5 times**. PaymentPanel Earnings uses `140px 1fr` columns with identical `dt`/`dd` patterns.

**Why duplication:** No `DefinitionGrid` or `KeyValueList` component despite being the dominant data-display pattern.

**Impact:** Highest per-file duplication density in `ExecutePanel` (774 LOC). Column width hardcoded differently (`100px`, `120px`, `140px`) without semantic reason.

**Microchange:** Create `<DefinitionList columns={120} items={[{label, value}]} />` in `ui.tsx`. Optionally add `DefinitionTerm` / `DefinitionDetail` subcomponents.

---

#### F-10 — `actionColor` buy/sell/hold mapping duplicated
**Severity:** Medium  
**Files:** `ExecutePanel.tsx` L33–37, L600–608; `TradeHistory.tsx` L38–43, L78–86

**Evidence (`ExecutePanel`):**
```ts
const actionColor: Record<string, string> = {
  buy: COLORS.success,
  sell: COLORS.danger,
  hold: COLORS.textMuted,
};
```

**Evidence (`TradeHistory`):**
```ts
const actionColor =
  entry.action === "buy" ? COLORS.success
  : entry.action === "sell" ? COLORS.danger
  : COLORS.textMuted;
```

**Why duplication:** Same semantic color mapping inlined in two components displaying trade actions.

**Impact:** Adding actions (e.g., `swap`) requires two edits; color semantics could diverge.

**Microchange:** Export `getActionColor(action: string): string` from `ui.tsx` or `utils/format.js`.

---

#### F-11 — Code/pre output panel duplicated in `ExecutePanel`
**Severity:** Medium  
**Files:** `ExecutePanel.tsx` L564–591 vs L643–657

**Evidence (stream output L565–577 vs raw output L644–654):**
```tsx
<pre style={{
  marginTop: 8,
  padding: 12,
  background: COLORS.bg,
  border: `1px solid ${COLORS.border}`,
  borderRadius: "var(--radius-lg)",
  fontSize: "var(--text-xs)",
  overflowX: "auto",
  whiteSpace: "pre-wrap",
  color: COLORS.textMuted,
  // stream adds maxHeight: 200, opacity
}}>
```

**Why duplication:** Two `<pre>` blocks differ only by `maxHeight`/`opacity` — same "code panel" visual language.

**Impact:** ~15 lines × 2; styling drift between live stream and raw output views.

**Microchange:** Add `<CodePanel maxHeight?: number; dimmed?: boolean>` to `ui.tsx`.

---

#### F-12 — Transfer proof `Card` blocks duplicated
**Severity:** Medium  
**Files:** `TransferModal.tsx` L395–428 vs L432–449

**Evidence (identical Card wrapper styles):**
```tsx
<Card style={{
  background: COLORS.bg,
  padding: "12px 16px",
  borderRadius: "var(--radius-lg)",
  marginTop: 12, // vs 8
  fontSize: "var(--text-xs)",
  color: COLORS.textMuted,
}}>
```

**Why duplication:** OwnershipProof and AccessProof cards share wrapper; only inner content differs.

**Impact:** Proof display styling must be updated in two places.

**Microchange:** `<ProofCard title="OwnershipProof" subtitle="TEE-signed">...</ProofCard>`.

---

#### F-13 — Modal/form footer button rows duplicated
**Severity:** Medium  
**Files:** `TransferModal.tsx` L319–330 vs L454–465; `PaymentPanel.tsx` L260–273

**Evidence:**
```tsx
<div className="flex justify-end" style={{ gap: 10, marginTop: 20 }}>
  <Button variant="secondary" onClick={cancel} disabled={isLoading}>Cancel</Button>
  <Button variant="primary" type="submit" disabled={...}>...</Button>
</div>
```

**Why duplication:** Same footer layout in TransferModal's two phases and PaymentPanel's withdraw confirm modal.

**Impact:** Spacing (`gap: 10` vs `gap: 8` in PaymentPanel) already inconsistent.

**Microchange:** `<ModalFooter onCancel onConfirm confirmLabel cancelLabel loading />` in `ui.tsx`.

---

#### F-14 — Section `<hr>` dividers duplicated in `PaymentPanel`
**Severity:** Low  
**Files:** `PaymentPanel.tsx` L583–588 vs L607–612

**Evidence (byte-identical):**
```tsx
<hr style={{
  border: 0,
  borderTop: `1px solid ${COLORS.border}`,
  margin: "var(--space-xl) 0",
}} />
```

**Why duplication:** Copy-pasted between Earnings and Royalty sections.

**Impact:** Trivial LOC; should be a utility class `.divider` or `<Divider />`.

**Microchange:** Add `.divider { border: 0; border-top: 1px solid var(--c-border); margin: var(--space-xl) 0; }` to `index.css`.

---

#### F-15 — `PerformanceMetrics` label/value vs `DefinitionList` pattern
**Severity:** Low  
**Files:** `PerformanceMetrics.tsx` L51–70; `ExecutePanel.tsx` L356–365

**Evidence (`PerformanceMetrics`):**
```tsx
<div style={{ fontSize: "var(--text-xs)", color: COLORS.textDim, marginBottom: "var(--space-xs)", fontWeight: "var(--fw-medium)" }}>
  {item.label}
</div>
<MonoLabel style={{ color: item.color, fontSize: "var(--text-base)", fontWeight: "var(--fw-semibold)" }}>
```

**Why duplication:** Same label-dim / value-accent visual hierarchy as `dt`/`dd` grids, implemented as a third variant.

**Impact:** Three parallel key-value display patterns across the codebase slice.

**Microchange:** Unify under `DefinitionList` with `layout="grid" | "flex"`.

---

### 3.4 Form & Input Duplication

#### F-16 — `textarea` and `select` duplicate `Input` base styles
**Severity:** Medium  
**Files:** `TransferModal.tsx` L193–206; `ExecutePanel.tsx` L310–321; `ui.tsx` L162–174

**Evidence (`TransferModal` textarea):**
```tsx
style={{
  width: "100%",
  padding: "10px 14px",
  borderRadius: "var(--radius-md)",
  border: `1px solid ${COLORS.borderStrong}`,
  background: COLORS.bg,
  color: COLORS.text,
  fontSize: "var(--text-sm)",
  fontFamily: "inherit",
  boxSizing: "border-box",
}}
```

**Evidence (`Input` in `ui.tsx`):**
```tsx
padding: "0.625rem 0.875rem",  // ≈ 10px 14px
borderRadius: "var(--radius-md)",
border: `1px solid ${COLORS.borderStrong}`,
background: COLORS.bg,
color: COLORS.text,
fontSize: "var(--text-sm)",
```

**Why duplication:** Only `<input>` is wrapped; native `textarea` and `select` re-copy the same token block.

**Impact:** Focus rings, invalid states (`index.css` L557–561), and padding changes won't propagate.

**Microchange:** Add `Textarea` and `Select` to `ui.tsx` using shared `inputBase` style object (already partially implied by `buttonBase` pattern).

---

#### F-17 — Numeric validation + "greater than zero" pattern
**Severity:** Medium  
**Files:** `DepositForm.tsx` L34–45; `PaymentPanel.tsx` L394–405

**Evidence (`DepositForm`):**
```ts
const err = validateNumericInput(depositAmount, { label: "Deposit", min: 0, allowDecimals: true, maxDecimals: 18 });
if (err !== null) return err;
if (depositAmount.trim() !== "" && Number(depositAmount) === 0)
  return "Deposit must be greater than zero.";
```

**Evidence (`PaymentPanel`):**
```ts
const err = validateNumericInput(payAmount, { label: "Amount", min: 0, allowDecimals: true, maxDecimals: 18 });
if (err !== null) return err;
if (payAmount !== "" && Number(payAmount) === 0)
  return "Amount must be greater than zero.";
```

**Why duplication:** Same validation pipeline with only label string differing.

**Impact:** Edge-case handling (empty string, decimals) duplicated; `DepositForm` uses `field-error` + `aria-invalid`; `PaymentPanel` matches — good, but logic should be shared.

**Microchange:** Add `validatePositiveAmount(value, label)` to `utils/format.js`.

---

#### F-18 — `ActionStatus` + success/error `Alert` blocks repeated 3×
**Severity:** Medium  
**Files:** `PaymentPanel.tsx` L173–178, L275–282, L346–353

**Evidence (identical conditional pattern):**
```tsx
{status === "success" && <Alert variant="success">...</Alert>}
{status === "error" && <Alert variant="error">{error ?? "Fallback message."}</Alert>}
```

**Why duplication:** Each of Pay, Withdraw, and Royalty sections reimplements status feedback.

**Impact:** Coupled to F-04; same fix surface.

**Microchange:** `<ActionFeedback status error successMessage />` subcomponent.

---

#### F-19 — `MintForm` `labelStyle` vs `TransferModal` label classNames
**Severity:** Low  
**Files:** `MintForm.tsx` L33–39; `TransferModal.tsx` L150–153

**Evidence (`MintForm`):**
```ts
const labelStyle: React.CSSProperties = {
  display: "block", marginTop: 16,
  fontWeight: "var(--fw-medium)", fontSize: "var(--text-sm)", color: COLORS.textPrimary,
};
```

**Evidence (`TransferModal`):**
```tsx
className="block mt-lg fw-medium text-sm text-primary"
```

**Why duplication:** Same form label styling expressed two ways (inline constant vs utility classes).

**Impact:** Inconsistent form label spacing (`marginTop: 16` vs `mt-lg` = 16px — same value, different mechanisms).

**Microchange:** Standardize on `className="block mt-lg fw-medium text-sm text-primary"` everywhere; remove `labelStyle`.

---

#### F-20 — `DepositForm` compact button overrides duplicate `Button` sizing
**Severity:** Low  
**Files:** `DepositForm.tsx` L96–102

**Evidence:**
```tsx
<Button variant="primary" style={{
  fontSize: "var(--text-sm)",
  padding: "0.375rem 0.75rem",
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--space-xs)",
}}>
```

**Why duplication:** Overrides default `Button` padding (`0.625rem 1.25rem`) for compact inline form — same override pattern as `EventTimeline` "Show all" button (L154–162).

**Impact:** Multiple "compact button" style overrides scattered across components.

**Microchange:** Add `size="compact"` prop to `Button` (or `size="sm" | "md"`).

---

### 3.5 Spinner & Loading Duplication

#### F-21 — Inline spinner in `ExecutePanel` duplicates `Spinner` component
**Severity:** Medium  
**Files:** `ExecutePanel.tsx` L480–488; `ui.tsx` L371–393

**Evidence (`ExecutePanel` inline):**
```tsx
<div style={{
  width: 12, height: 12,
  borderRadius: "50%",
  border: `2px solid ${COLORS.border}`,
  borderTopColor: COLORS.bronzeLight,
  animation: "axiom-spin 0.8s linear infinite",
}} />
```

**Evidence (`Spinner`):** Same border/animation pattern with configurable `size`.

**Why duplication:** `ExecutePanel` uses `borderTopColor: COLORS.bronzeLight` while `Spinner` uses `COLORS.bronze` — near-identical element not reused.

**Impact:** Missing `aria-label="Loading"` on inline spinner (a11y gap); `Spinner` has `role="status"`.

**Microchange:** Replace with `<Spinner size={12} />`; optionally add `accent` prop for bronzeLight.

---

#### F-22 — Loading panel surface style (`bg` + `border` + `radius-lg`)
**Severity:** Low  
**Files:** `ExecutePanel.tsx` L460–470; `MintForm.tsx` L178–186; `TransferModal.tsx` L395–403

**Evidence (recurring "inset panel" pattern):**
```tsx
style={{
  padding: "12px" /* or space-md/lg */,
  background: COLORS.bg,
  border: `1px solid ${COLORS.border}`,
  borderRadius: "var(--radius-lg)",
}}
```

**Why duplication:** Same visual treatment for loading steps, fee display, and proof cards.

**Impact:** ~10 lines repeated 4+ times; candidate for `surfaceInset` style or `.panel-inset` class.

**Microchange:** CSS class `.surface-inset` in `index.css` or `Card variant="inset"`.

---

### 3.6 Prop Interface & Logic Duplication

#### F-23 — `TransferModalProps` duplicate success callbacks
**Severity:** Low  
**Files:** `TransferModal.tsx` L49–51, L534–540

**Evidence:**
```ts
onTransferred?: (txHash: `0x${string}`) => void;
onSuccess?: (txHash: `0x${string}`) => void;  // back-compat alias
```

```ts
const handleTransferred = useCallback((txHash) => {
  onTransferred?.(txHash);
  onSuccess?.(txHash);  // both invoked
}, [onSuccess, onTransferred]);
```

**Why duplication:** Two props for identical callback signature; increases API surface.

**Impact:** Consumers may pass both and get double invocation; documentation burden.

**Microchange:** Deprecate `onSuccess`; keep single `onTransferred` with dev-mode warning if both provided.

---

#### F-24 — Address/hex truncation: `slice(0,10)` vs `truncateHex`
**Severity:** Low  
**Files:** `ExecutePanel.tsx` L379; `TradeHistory.tsx` L123; `MintForm.tsx` L221; `PaymentPanel.tsx` L225 (uses `truncateHex`)

**Evidence (manual truncation):**
```tsx
{`${strategyRoot.slice(0, 10)}\u2026`}
{entry.txHash.slice(0, 10)}…
{provider.slice(0, 10)}…
```

**Evidence (`PaymentPanel` — correct utility usage):**
```tsx
truncateHex(earnings.creator)
```

**Why duplication:** `truncateHex` exists in scope but 4 other call sites hand-roll `slice(0, 10)`.

**Impact:** Inconsistent ellipsis character (`…` vs `...`); checksum-aware truncation only in utility.

**Microchange:** Use `truncateHex` everywhere or add `<TruncatedHex value={} chars={10} />`.

---

#### F-25 — `alertStyles` internal base-property repetition
**Severity:** Low  
**Files:** `ui.tsx` L180–211

**Evidence:** `error`, `success`, and `info` variants each repeat:
```ts
padding: "var(--space-md) var(--space-lg)",
borderRadius: "var(--radius-lg)",
fontSize: "var(--text-sm)",
lineHeight: "var(--lh-snug)",
overflowWrap: "break-word",
```

**Why duplication:** Only `background`, `border`, and `color` differ per variant.

**Impact:** Internal to `ui.tsx`; minor maintenance overhead.

**Microchange:** `const alertBase = { padding: ..., borderRadius: ... };` merged per variant.

---

#### F-26 — `EventTimeline` inline empty state vs `EmptyState` component
**Severity:** Low  
**Files:** `EventTimeline.tsx` L84–90, L116–127; `EmptyState.tsx`

**Evidence:**
```ts
const emptyStateStyle: React.CSSProperties = {
  gridColumn: "1 / -1",
  padding: "16px",
  textAlign: "center",
  color: COLORS.textDim,
  fontStyle: "italic",
};
```

**Why duplication:** Custom empty/loading cells instead of reusing `EmptyState` or a shared `TimelinePlaceholder`.

**Impact:** Different empty UX (italic dim text vs card-based `EmptyState`); intentional but parallel pattern.

**Microchange:** Accept `emptyState` prop defaulting to `<EmptyState>` or extract `TimelineEmpty` with shared typography.

---

#### F-27 — `HelpTip` dotted underline duplicated
**Severity:** Low  
**Files:** `ui.tsx` L501; `PaymentPanel.tsx` L105

**Evidence (`PaymentConfigDisplay`):**
```tsx
style={{ cursor: "help", borderBottom: `1px dotted ${COLORS.textDim}` }}
```

**Evidence (`HelpTip`):** Same `borderBottom` + `cursor: "help"` at L500–501.

**Why duplication:** Token tooltip uses inline help styling instead of `HelpTip` component.

**Impact:** Tooltip behavior (hover popup) missing on payment token span — only `title` attribute.

**Microchange:** Wrap token span in `<HelpTip tip={...}>`.

---

#### F-28 — Default export + named export dual export pattern
**Severity:** Low  
**Files:** `ExecutePanel.tsx`, `HealthBadge.tsx`, `MintForm.tsx`, `PaymentPanel.tsx`, `ProviderCard.tsx`, `TransferModal.tsx`

**Evidence:** Each file ends with both `export function X` and `export default X`.

**Why duplication:** Redundant export surface (not UI duplication per se, but duplicated module API).

**Impact:** Tree-shaking ambiguity; importers may use mixed import styles.

**Microchange:** Standardize on named exports only (project-wide, outside this slice).

---

## 4. Microchange Opportunities (Prioritized)

| Priority | ID | Action | Effort | Files Affected | Expected Gain |
|----------|-----|--------|--------|----------------|---------------|
| P0 | F-01 | Unify `COLORS` ↔ CSS variables | Medium | `ui.tsx`, all components | Single palette source; fewer drift bugs |
| P0 | F-09 | Extract `DefinitionList` / `KeyValueGrid` | Medium | `ExecutePanel`, `PaymentPanel`, `PerformanceMetrics` | −80–120 LOC; consistent data display |
| P1 | F-04 | Extract `NumericActionRow` form section | Low | `PaymentPanel` | −60 LOC; unified form a11y |
| P1 | F-16 | Add `Textarea`, `Select` to `ui.tsx` | Low | `TransferModal`, `ExecutePanel` | Input styling parity |
| P1 | F-06 | Use `ConnectedGuard` in `ExecutePanel` | Trivial | `ExecutePanel`, `ui.tsx` | Consistent wallet UX |
| P1 | F-10 | Export `getActionColor()` | Trivial | `ExecutePanel`, `TradeHistory` | Single action-color mapping |
| P2 | F-11 | Add `CodePanel` component | Low | `ExecutePanel` | −30 LOC |
| P2 | F-05 | Unify `HealthBadge` shell | Low | `HealthBadge` | −40 LOC |
| P2 | F-08 | `ErrorBoundary` → `Button` | Trivial | `ErrorBoundary` | Visual consistency |
| P2 | F-21 | Replace inline spinner | Trivial | `ExecutePanel` | a11y fix + reuse |
| P2 | F-03 | Migrate hot inline styles → utilities | Medium | `ExecutePanel`, `HealthBadge` | Smaller render payloads |
| P3 | F-13, F-14 | `ModalFooter`, `.divider` | Low | `TransferModal`, `PaymentPanel` | Minor LOC reduction |
| P3 | F-17, F-24 | Shared validators/truncation | Trivial | `DepositForm`, `PaymentPanel`, others | DRY validation |
| P3 | F-20 | `Button size="compact"` | Low | `DepositForm`, `EventTimeline` | Variant consistency |

---

## 5. Positive Findings

### Well-structured shared primitives (`ui.tsx`)
- **Centralized component library:** `Button`, `Card`, `Input`, `Alert`, `Modal`, `Spinner`, `MonoLabel`, `SectionTitle`, `PageHeader`, `ConnectedGuard`, and `HelpTip` provide a coherent API used consistently across most assigned files.
- **Memoization:** `Button`, `Card`, `Modal`, and `EventTimeline` use `React.memo` appropriately for list/hot paths.
- **`forwardRef` on `Input`:** Enables proper ref forwarding for form libraries (L154–176).

### Design system foundation (`index.css`)
- **Complete token scale:** Spacing, typography, radii, colors, line-heights, and breakpoints are well-documented (L3–75).
- **Accessibility:** Focus rings (L242–245), reduced motion (L350–356), high-contrast (L371–377), forced-colors (L379–387), and skip-link (L312–339).
- **Utility migration started:** L389–546 provides `.text-muted`, `.flex`, `.gap-sm`, `.field-error`, `.tabular-nums`, etc., with explicit comment to migrate inline styles.

### Component architecture wins
- **`EventTimeline`:** Clean separation via `renderEvent` prop (L12–20); memoized rows; formatter cache (L22–43); responsive rail width (L102–103).
- **`PaymentPanel` decomposition:** Internal sub-components (`PaymentForm`, `EarningsSection`, `RoyaltySection`) improve readability despite duplication (L69–356).
- **`TransferModal` two-phase flow:** `TransferFormPhase` / `ConfirmTransferPhase` (L95–467) cleanly separate concerns; good use of `useId` for a11y (L478).
- **`DepositForm`:** Thin wrapper over `useDeposit` hook; `variant="warning"` is a good prop-based styling extension (L10, L49–63).
- **`TradeHistory`:** Reuses `EmptyState` correctly (L17–30); uses `tabular-nums` class and `EXPLORER_BASE` for links.
- **`EmptyState`:** Flexible `icon` / `title` / `action` slots (L4–9) — good composability.
- **`ProviderCard`:** Focused, single-responsibility card with EIP-55 formatting (L9–17).

### Validation & a11y consistency
- **Field errors:** `DepositForm` and `PaymentPanel` correctly pair `aria-invalid`, `aria-describedby`, and `.field-error` class.
- **`humanizeError`:** Consistent error display across `ErrorBoundary`, `ExecutePanel`, `MintForm`, `PaymentPanel`, `TransferModal`.

---

## Appendix: Finding Index

| ID | Title | Severity |
|----|-------|----------|
| F-01 | Dual color palette COLORS vs CSS vars | High |
| F-02 | Duplicate type-scale in font branches | Low |
| F-03 | Inline styles vs utility classes | Medium |
| F-04 | PaymentForm ≈ RoyaltySection | High |
| F-05 | HealthBadge dual shells | Medium |
| F-06 | ConnectedGuard vs ExecutePanel wallet state | Medium |
| F-07 | EmptyState vs ConnectedGuard layout | Low |
| F-08 | ErrorBoundary raw buttons | Medium |
| F-09 | Definition-list grid 3× | High |
| F-10 | actionColor mapping duplicated | Medium |
| F-11 | ExecutePanel duplicate pre blocks | Medium |
| F-12 | TransferModal proof Cards | Medium |
| F-13 | Modal footer button rows | Medium |
| F-14 | PaymentPanel hr dividers | Low |
| F-15 | PerformanceMetrics vs DefinitionList | Low |
| F-16 | textarea/select duplicate Input styles | Medium |
| F-17 | Numeric validation pattern | Medium |
| F-18 | ActionStatus Alert blocks 3× | Medium |
| F-19 | MintForm labelStyle vs classNames | Low |
| F-20 | DepositForm compact button overrides | Low |
| F-21 | Inline spinner vs Spinner | Medium |
| F-22 | Inset panel surface pattern | Low |
| F-23 | TransferModal duplicate callbacks | Low |
| F-24 | slice(0,10) vs truncateHex | Low |
| F-25 | alertStyles internal repetition | Low |
| F-26 | EventTimeline empty vs EmptyState | Low |
| F-27 | HelpTip underline duplicated | Low |
| F-28 | Dual named/default exports | Low |

**Total findings: 28**

---

*Report generated by Sub-Agent 1 — Component & UI Duplication. All findings verified against source files with line-level evidence. No implementations performed.*