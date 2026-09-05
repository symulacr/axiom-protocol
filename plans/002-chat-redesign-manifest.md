# 002 — /chat redesign manifest (Claude-web parity, zero regression)

Stamped at commit `2063358` (2026-09-05). Status: PLAN — not executed.
Companion mock: [002-chat-redesign-mock.html](002-chat-redesign-mock.html)
(open in a browser; toggle Before / After, light / dark, and each state).

Scope: `apps/frontend/src/pages/ChatPage.tsx` (2503 lines),
`apps/frontend/src/chat/MessageAtoms.tsx`, the chat blocks of
`apps/frontend/src/styles/index.css` (≈ lines 2440–3160, 4270–4440),
`apps/frontend/src/lib/copy.ts` (`chat` section, both locales).
Everything else (AppShell, wagmi hooks, chat-runtime, transport) is out of
scope and must not change.

---

## 0. How to read this document

* §1 is the critique — the observed defects, each with the exact code
  location, so the reader agrees on *what* is wrong before touching anything.
* §2 is the design contract — layout, tokens, component grammar and the full
  state matrix. Build to this; the mock is its visual rendering.
* §3 is the ordered execution plan — phases, file-by-file edits, class
  contract, copy changes.
* §4 is the regression ledger — every behavior that exists today and must
  survive, plus the acceptance checks an agent runs before declaring done.
* Hard rules are in §5. Read them first if you only read one section.

Baseline captures (2026-09-05, light theme, 1440×900):
`.design-audit/chat-before-empty.png`, `.design-audit/chat-before-thread.png`,
`.design-audit/chat-before-thread-top.png`.

---

## 1. Critique — current state vs. Claude web chat

Reference standard: claude.ai conversation view. What makes it low-load:
one reading column; the *assistant's words are the page* (no card, no border,
no header); the user's turn is a quiet tinted bubble; tool/thinking work is
collapsed into one line per step that you *can* open but never must; every
per-message action is hidden until hover/focus; there is exactly one way to
start a new chat; the composer is a single soft panel whose only strong
colour is the send button; the empty state puts the composer *at* the
greeting so the first action is one keystroke away.

Findings, ordered by severity. Codes: **F-n**.

| # | Sev | Where | Finding |
|---|---|---|---|
| F-1 | HIGH | `ChatPage.tsx` ~1894 `ToolCallCard` fallback `status:"error"` | A restored thread (reload, history open) marks **every** past tool call "✕ failed" in red because the live `toolRuns` map is empty. The comment calls it honest; the user reads it as "my agent failed". The paired `tool` message *proves* the call completed — status must be derived from it. |
| F-2 | HIGH | `ChatPage.tsx` 1761–1777 + 1886 | Assistant messages render **two Copy controls**: `MsgCopyAction` in the header and `CopyButton` under the body. |
| F-3 | HIGH | `ChatPage.tsx` 1757–1777, CSS `.chat-bubble .msg-actions` | Header actions on the last assistant message overlap ("Regenerate" ⟂ "Copy" render as "RegeCopyte"; see `chat-before-thread.png`). The header row is over-populated (dot, avatar, role, time, N actions) and the flex row cannot fit them. |
| F-4 | HIGH | `ChatPage.tsx` 1663–1907 | Every role — user, assistant, tool — is a bordered card. Tool *call* and tool *result* are two stacked cards. A 3-turn exchange with one tool renders 6 boxes; there is no visual hierarchy between "what the assistant said" and "plumbing". |
| F-5 | HIGH | `ChatPage.tsx` 1591–1636 + rail `ChatHistorySection` + shell topbar | **Three** stacked bars above the transcript (shell topbar, chat topbar, rail head) and **three** "new chat" affordances (topbar `New chat`, rail `+`, rail dashed `New`). The chat topbar's toggle button renders with a persistent copper ring (see capture) — reads as a stuck focus state. |
| F-6 | MED | Empty state `EmptyState()` 232–376 | Greeting + 4 cards + "All 39 tools" sit in the vertical centre; the composer is 250 px lower at the viewport bottom. First action is a mouse trip. Claude puts the composer under the greeting and suggestions under the composer. |
| F-7 | MED | Composer 2077–2216, CSS `.chat-composer__row` | Routing chip, textarea, hidden Stop, Send all on **one row**; the chip is clipped at the panel's left edge (see capture "⚡ Auto" cut). Send is an outlined `↵` box — the page's primary action is the least emphasized control in it. Stop is a separate hidden button instead of the send button changing state. |
| F-8 | MED | Rail items `.chat-history__item` + `.chat-history__open` | Thread title renders as a bordered box inside a bordered, left-accented row (double frame); always-visible `×`; `0G` badge as text. |
| F-9 | MED | `StatusDot`/`MsgAvatar`/`MsgTimestamp` on every message | Per-message avatar initial + role label + timestamp is 3 items of metadata the user never asked for, on every turn. Claude shows none inline (time on hover only). |
| F-10 | MED | `chat-topbar__status` "Online, 0G Mainnet" | Permanent status line in the header. Only the *abnormal* state (wrong network) is information; the normal state is noise. |
| F-11 | LOW | Streaming bubble 1988–2033 | Streaming answer has header + orbs + phase text + tick label; fine content, but wrapped in the same heavy card. Caret is a `--phosphor` green bar in an otherwise copper system. |
| F-12 | LOW | Queue strip 2037–2075 | Queue chips render *between* transcript and composer as an unrelated strip; belongs inside the composer panel above the textarea. |
| F-13 | LOW | Stream error 1943–1986 | Retry/Dismiss error is a full danger card in the transcript; should be an inline notice attached to the failed turn with quiet actions. |
| F-14 | CODE | `ChatPage.tsx` overall | 2503 lines, ~60 inline `style={{}}` objects, `EmptyState`, `ChatHistorySection`, composer, transcript, routing popover all in one file. Not a UI defect per se, but the reason F-2/F-3 slipped through. Splitting is a prerequisite for the redesign, not an extra. |

What is **good** and must be kept: the light/dark copper token system and its
audited contrast; the 880 px shared measure idea (we tighten it); the
edit-with-confirm/regenerate/retry semantics and their guard tests; the
routing popover functionality; queue-while-streaming; stable Stop slot
principle (we keep the *principle*: no layout shift when streaming starts);
the `ask_user` card; insights disclosure; `TankStrip` / wrong-network banners;
localStorage resume; the localized copy layer.

---

## 2. Design contract

### 2.1 Layout

```
┌ shell topbar (unchanged) ────────────────────────────────────────────┐
├──────────────────────────────────────────────┬───────────────────────┤
│ .chat-main                                   │ .chat-thread-rail     │
│  ┌ .chat-notices (only when abnormal) ────┐  │  Chats      [+ New]   │
│  │ wrong network / tank / compute hint    │  │  ⌕ Search             │
│  └────────────────────────────────────────┘  │  ─ Today ─            │
│  .chat-scroll  (flex:1, overflow-y)          │  Thread title  ····×  │
│    .chat-thread  (max-width: 760px, centered)│  Thread title         │
│      .turn.turn--user   (right, tinted)      │  ─ Earlier ─          │
│      .turn.turn--assistant (plain text)      │  Thread title         │
│        .steps (collapsed tool group)         │                       │
│        .turn__actions (hover/focus reveal)   │  Restore from 0G …    │
│  .chat-dock (sticky bottom, same 760 measure)│                       │
│    .queue (only when >0)                     │                       │
│    .composer                                 │                       │
│      textarea                                │                       │
│      .composer__bar: [routing chip] …[send]  │                       │
│    .chat-foot  (one dim line: net · model)   │                       │
└──────────────────────────────────────────────┴───────────────────────┘
```

* The **chat topbar is removed on ≥701 px**. Its three jobs move: sidebar
  toggle → mobile-only floating button top-left of `.chat-main`; brand mark +
  name → the empty-state greeting; status → `.chat-foot` (dim, one line) and
  the wrong-network banner. `h1.visually-hidden` stays.
* Measure: `--chat-measure: 760px` (was 880). Transcript, dock, and empty
  state share it. On <701 px the measure is `100%` with 16 px side padding.
* The rail keeps its slot and behavior (portal into `#sidebar-threads-slot`,
  `threads-open` mobile drawer). Only its internals change (§2.4).
* No layout shift between empty → first turn: the dock is *always* at the
  bottom; the empty state fills the scroll area and vertically centers its
  own content. (Claude's "composer in the middle" is *not* copied literally
  because it forces a layout jump on first send; we get the same 1-keystroke
  proximity by autofocusing the composer and keeping suggestions adjacent to
  it — see mock "Empty".)

### 2.2 Tokens (add to `:root` in `index.css`, both themes inherit)

```css
--chat-measure: 760px;
--chat-user-bg: color-mix(in srgb, var(--copper) 10%, var(--panel));
--chat-user-fg: var(--text);
--chat-step-bg: color-mix(in srgb, var(--panel-2) 70%, transparent);
--chat-step-line: var(--line-soft);
--chat-composer-bg: var(--panel);
--chat-composer-line: var(--line);
--chat-composer-line-focus: var(--copper);
--chat-send-bg: var(--copper);
--chat-send-fg: #fff;           /* verify ≥4.5:1 on both copper values */
--chat-caret: var(--copper-bright);   /* replaces --phosphor in the caret */
--turn-gap: 28px;               /* between turns */
--turn-gap-inner: 10px;         /* between blocks inside one assistant turn */
```

No new font faces. Assistant body: `calc(var(--fs-body) + 1px)` / 1.65
(already the audited reading size). User bubble: `var(--fs-body)` / 1.5.
Step rows, meta, foot: `var(--fs-small)`.

### 2.3 Component grammar

**Turn (user)** — `.turn.turn--user`
Right-aligned, `max-width: min(100%, 60ch)`, `background: var(--chat-user-bg)`,
`border-radius: 16px 16px 4px 16px`, `padding: 10px 14px`, **no border, no
header**. Hover/focus-within reveals `.turn__actions` *below-right*: `Edit`,
`Copy`. Edit-confirm (`MessageEditConfirm`) replaces the action row in place.

**Turn (assistant)** — `.turn.turn--assistant`
Full measure, plain `.chat-md` text on the page background, **no border, no
card, no header**. First assistant turn *of a thread* only shows a 20 px
brand mark inline at the top-left (`.turn__mark`) so the voice is identified
once. Actions reveal below-left on hover/focus-within: `Copy`,
`Regenerate` (last assistant turn only, not while streaming), the
`InsightsDisclosure` toggle (when metrics exist). Timestamp moves into the
action row as a dim `title`-carrying text, not into the body.

**Steps** — `.steps` (replaces `ToolCallCard` + separate tool bubble)
One assistant turn's consecutive `tool_calls` + their `tool` results merge
into one collapsible block rendered *above* the assistant's text:

```
▸ Worked for 3s · 2 steps                     (collapsed summary row)
▾ Worked for 3s · 2 steps
   ✓ Listed agents               read   2 results      ▸
   ✓ Encoded transfer            encode  sponsored     ▸
      ┌ expanded step: args <pre>, result (ToolResultBody), error + Retry ┐
```

* Status per step is **derived**: `toolRuns[id]` if live, else
  `tool` message exists → `success` unless `isFailurePayload(content)` →
  `error`; no tool message and not live → `pending` (shown as "no result",
  neutral, never red). This fixes F-1.
* Icons: `Spinner` (running), check (success), `×` (error) using existing
  `tool-card__ok/__fail` colours. Class badge (`ToolClassBadge`) stays.
* `ask_user` results render **not** as a step but as the existing
  `AskUserCard`, inline in the assistant turn (unchanged component).
* Encode previews (`EncodePreviewCard`) render inside the expanded step;
  their sign button stays exactly as today.
* While streaming, the group is open and the running step is the last row;
  when the turn finishes the group **auto-collapses** unless a step failed.
* Retry stays on the failed step row (`onRetry` → `retryToolRun`).

**Composer** — `.composer`
One panel: `border:1px solid var(--chat-composer-line)`, radius 16 px,
`box-shadow: 0 1px 2px rgb(0 0 0 / .04)`; `:focus-within` → copper border.
Row 1: textarea (auto-grow to 8 lines, `resize:none`, 16 px on touch).
Row 2 `.composer__bar`: left = routing chip (existing popover, unchanged
logic; the chip becomes a quiet ghost pill `⚡ Auto ▾`, `is-nondefault` →
copper text), center = counter (only when ≤10 % budget), right = **one**
`.send` button, 36×36 circle:
* idle+empty → disabled (dim outline, arrow icon)
* idle+text → filled copper, arrow-up icon, label "Send"
* streaming+empty → filled copper **square-stop icon**, label "Stop"
  (this replaces the separate Stop button; same DOM node, so L1-L10 "no
  DOM position change" is preserved *more* strictly than today)
* streaming+text → filled copper arrow, label "Queue"; Stop moves to a
  ghost pill immediately left of send while text is present.
Enter sends / Shift+Enter newline (unchanged). Autofocus on mount and after
`startNewChat`/`openThread`.

**Queue** — `.queue` inside the dock, above the composer: dim "Queued 2" +
chips with `×` (existing `queue-chip`, restyled to pill).

**Streaming turn** — same `.turn--assistant`. Before first token: a single
line `[orbs] Thinking…` / phase label (existing `phaseLabel`) in `--muted`.
After first token: the text, caret in `--chat-caret`. `role="status"`
`aria-live="polite"` unchanged. Breathe animation dropped (text opacity
pulses were flagged as motion on reading surface); orbs keep theirs.

**Stream error** — `.turn__notice.is-danger` attached under the last
assistant turn: danger text + `Retry` (primary ghost) + `Dismiss`. Not a
card; a left-rule notice, 1 line.

**Notices** — `.chat-notices` at the top of `.chat-main`, only rendered
when at least one of `computeHint`, `TankStrip`, wrong-network is active.
`ChatBanner` markup unchanged; only the wrapper spacing changes.

**Empty state** — `.chat-empty` centered in the scroll area:
brand mark 40 px, `Axiom` (display font, `--fs-title` ×1.2), tagline,
then 4 suggestion **pills** in one wrapping row (label only; hint in
`title`), then a text link "Browse all 39 tools" that opens the existing
tool browser as a **popover anchored to the composer bar** (not an inline
320 px list). On mobile the pills wrap 2×2.

**Foot** — `.chat-foot`: one dim centered line under the composer:
`0G Mainnet · Qwen 3 · Shift+Enter for newline`. Wrong network → this line
becomes the danger text and the banner also shows (banner is the actionable
one).

### 2.4 Rail (`ChatHistorySection`)

```
Chats                                   [ + ]
[ ⌕ Search chats                          ]
Today
  List my agents and their vault…      ×
Earlier
  Mint agent walkthrough
─────────────────────────────────────
Restore from 0G storage  →   (only when serverRestore)
```

* Title "Chats" is the h2, left, `--fs-small` semibold (no uppercase mono).
* One `+` icon button (copper outline, existing `.chat-history__new` recipe)
  — the *only* new-chat gesture on desktop. The dashed "New" empty CTA and
  the topbar "New chat" are removed. Mobile keeps a "New" in the drawer head.
* Search is always a full-width input (drop the 32 px collapse trick; it is
  a discoverability cost, not a saving).
* Items: single line, ellipsis, `padding: 8px 10px`, radius 8, hover
  `--copper-06`, active `--copper` 12 % + inset rule (unchanged). Title text
  is plain (no inner border). `×` appears on hover/focus/active only.
  The `0G` badge becomes a 6 px dot with `title="Stored on 0G"`.
* Group headers Today / Yesterday / Earlier (derived from thread
  `updatedAt`; if the store lacks it, single group, no header — do not
  add store fields in this plan).

### 2.5 State matrix (every state must be visited in the mock and in the app)

| State | Visual | a11y |
|---|---|---|
| Empty, wallet not connected | greeting + pills + composer enabled (chat works without wallet today — keep) ; foot shows network | textarea autofocus |
| Empty, wrong network | banner in `.chat-notices`; foot danger | banner `role=status` |
| Thread, idle | turns, steps collapsed, actions hidden | actions focusable (they are `visibility:visible` for `:focus-within`) |
| Thread, hover assistant | action row fades in 120 ms | — |
| Thread, hover user | Edit/Copy fade in | — |
| Edit confirm | inline confirm replaces actions | focus moves to confirm's first button |
| Streaming, pre-token | orbs + phase | `role=status` |
| Streaming, tokens | text + caret; send = Stop | Stop labelled |
| Streaming + queued text | Stop ghost + Send(Queue) | both labelled |
| Queue > 0 | chips above composer | remove buttons labelled |
| Tool running | steps open, spinner row | live region hidden counts (T5) |
| Tool failed | steps stay open, red row, Retry | `role=region` label kept |
| Tool history (restored) | ✓ rows from tool messages, **never red unless failure payload** | — |
| ask_user | AskUserCard inline | unchanged |
| Stream error | notice + Retry/Dismiss | `role=alert` |
| Near limit | counter in composer bar (warning) | `aria-live=polite` |
| Tank low / compute hint | notices | unchanged |
| Mobile <701 | rail drawer, floating toggle, pills 2×2, 16 px textarea | toggle `aria-expanded` |
| Reduced motion | no reveal fade, no orbs animation, no caret blink | — |
| Dark theme | all of the above via tokens | contrast test passes |

---

## 3. Execution plan

Do the phases in order; each phase leaves `bun run typecheck && bun test`
green and the app usable. Commit per phase.

### Phase 0 — Split the file (no visual change)

Create under `apps/frontend/src/chat/`:
* `ChatEmptyState.tsx` — move `EmptyState` + `TOOL_GROUPS`.
* `ChatComposer.tsx` — move composer JSX (2077–2216) + routing popover +
  `routingSummary/isNonDefaultRouting/routingStatusLine/pinLabel`. Props:
  `{ input, setInput, isStreaming, onSend, onStop, queue, onRemoveQueued,
  providerPref, prefKey, pinCandidates, hasPrivateProvider,
  applyProviderPref, toggleTrustMode, copy, a11y, maxLength }`.
* `ChatThread.tsx` — move transcript map (1648–2035) as `<ChatThread …/>`
  with props for `messages, toolRuns, expandedToolCalls, streaming…` and the
  callbacks it calls (`idxOfMsg, applyHistoryRewrite, rerunLastUser,
  retryToolRun, sendMessage, setInput, setEditConfirmId`).
* `ChatHistoryRail.tsx` — move `ChatHistorySection`.
`ChatPageInner` keeps all state/effects/refs; only JSX moves. Update
`ChatPage.guard.test.ts` source reads if it greps this file (it reads the
page source for `runEpochRef`/guards — those stay in `ChatPage.tsx`, so it
should pass unchanged; verify).

### Phase 1 — Tokens + CSS foundation

In `index.css`, inside the existing "Chat surface" block: add §2.2 tokens;
add new classes `.chat-scroll, .chat-thread, .chat-dock, .chat-foot,
.chat-notices, .turn, .turn--user, .turn--assistant, .turn__mark,
.turn__actions, .turn__notice, .steps, .steps__summary, .step, .step__head,
.step__body, .composer, .composer__bar, .send, .send--stop, .queue,
.chat-empty, .chat-empty__pills, .pill`. Keep the old classes until Phase 5.
Reduced-motion: extend the existing `prefers-reduced-motion` block.

### Phase 2 — Transcript

In `ChatThread.tsx`:
1. Group messages into **turns**: iterate; a user message opens a user
   turn; an assistant message with `tool_calls` plus following `tool`
   messages plus the next assistant text message form **one** assistant
   turn (`{ steps: [{call, result?}], text?: Message, error? }`). Existing
   `dedupeToolCalls` still applies to calls.
2. Render user turn per §2.3; move Edit/Copy into `.turn__actions`. Remove
   `StatusDot`, `MsgAvatar`, `MsgTimestamp` from bubbles (keep the exports;
   `MsgTimestamp` is reused inside the action row).
3. Render assistant turn: `<Steps>` then `.chat-md` text then
   `.turn__actions` (Copy, Regenerate, Insights). **Delete the second
   `CopyButton` at 1886** (F-2).
4. `Steps` component (new, in `MessageAtoms.tsx`): derive status per §2.3;
   reuse `ToolResultBody`, `EncodePreviewCard`, `ToolClassBadge`, `Spinner`,
   `humanizeError`. Keep `expandedToolCalls` set semantics for per-step
   expansion; add one `expandedGroups` set keyed by the first call id, with
   the auto-collapse rule.
5. Streaming turn and stream error per §2.3.
6. Keep `onClick` SPA-link delegation and the `stickToBottomRef` scroll
   logic on `.chat-scroll`.

### Phase 3 — Composer + dock

In `ChatComposer.tsx`: two-row panel per §2.3; single `.send` button with
the four states; Stop ghost appears only in streaming+text. Preserve
`cancelStream`, `sendMessage`, `maxLength`, counter, iOS 16 px rule,
`autoFocus`. Queue moves inside the dock. Routing popover: keep markup,
restyle chip; add `transform-origin: bottom left` + the 180 ms rise already
used by `.filters-popover` (plan 001).

### Phase 4 — Chrome: topbar removal, rail, empty state, foot

* `ChatPage.tsx`: remove `.chat-topbar` on desktop; render
  `.chat-sidebar-toggle` as a floating icon button (mobile only via CSS);
  render `.chat-notices` wrapper; add `.chat-foot`.
* `ChatHistoryRail.tsx` per §2.4; remove the dashed empty CTA and the
  topbar `New chat` button (the `copy.newChat` string stays for mobile).
* `ChatEmptyState.tsx` per §2.3; tool browser becomes a popover triggered
  from the empty-state link **and** from a `⋯` ghost button in the composer
  bar so it remains reachable mid-thread (today it is empty-state only —
  this is the single additive feature and it is required for parity).

### Phase 5 — Cleanup

Delete dead classes (`.chat-bubble*`, `.chat-topbar*`, `.msg-statusdot*`,
`.tool-card*` if fully replaced, `.chat-history__search` collapse rules,
`.chat-stop--hidden`). Grep `apps/frontend/src` for each before deleting.
Update `iconButton.recipe.test.ts`/`contrast.test.ts` expectations only if
they enumerate removed selectors — never loosen a threshold.

### Copy changes (`copy.ts`, both `en` and the second locale)

Add: `stepsSummary(count, seconds)` → "Worked for {s}s · {n} steps" /
1 step variant; `stepNoResult` "No result recorded"; `browseTools` "Browse
all {n} tools"; `footHint` "Shift+Enter for a new line"; `groupToday`,
`groupYesterday`, `groupEarlier`; `storedOn0G` "Stored on 0G".
Remove nothing until Phase 5; then remove `toolsBrowse/toolsHide` if unused.

---

## 4. Regression ledger and acceptance

### 4.1 Must-keep behaviors (verify each by hand in the preview)

1. Enter sends, Shift+Enter newline, 4000-char cap, 90 % counter.
2. Sending while streaming queues; queue drains in order; chips removable.
3. Stop aborts stream; partial text is kept as a message (today's behavior).
4. Edit on a non-last user message asks to confirm and truncates history;
   edit on the last one just refills the composer. Run epoch bumps + abort.
5. Regenerate only on last assistant, disabled during streaming.
6. Tool retry with same args on failed run; `ask_user` answers send a turn.
7. Encode preview sign button triggers wallet; transfer tool opens
   `TransferModal`.
8. Routing: auto / cheapest / pin, verified + private toggles, status line.
9. Thread resume from localStorage on reload; thread list open/delete/undo
   toast; server history restore gated on wallet signature request.
10. Wrong-network banner, tank strip, compute hint.
11. Mobile drawer open/close, focus return to toggle.
12. Locale switch re-renders every string (no hard-coded English in JSX).
13. Light and dark themes; `contrast.test.ts` and `aw-contrast.test.ts` pass.

### 4.2 Automated

```
cd apps/frontend && bun run typecheck && bun run lint && bun test
```
All existing guard tests must pass unmodified, in particular
`ChatPage.guard.test.ts` ("tool-card fallback run is never a synthetic
running state") — the new derived-status code must still contain no
`status: "running"` fallback.

Add one test `src/chat/steps.derive.test.ts`: given a call with a tool
message and no live run → `success`; with failure payload → `error`; with
no tool message → `pending`; never `running` without a live run.

### 4.3 Visual acceptance (agent screenshots, both themes, 1440 and 390 px)

Compare against the mock's After panels: Empty, Thread idle, Thread hover,
Streaming, Tool running, Tool failed, Error, Queue, Mobile. Any panel that
does not match the mock in structure (not pixel) is a blocker.
Deliver before/after screenshots in the PR `## Verification`.

---

## 5. Hard rules

1. **No new dependencies.** React 19, existing icon set, existing tokens.
2. **No red for history.** A tool status is red only when a failure payload
   or a live error exists.
3. **One control per action.** One Copy per turn, one new-chat gesture per
   viewport, one send/stop button.
4. **Nothing always-visible that is only sometimes useful.** Actions,
   timestamps, delete buttons, status text appear on hover/focus or when
   abnormal.
5. **Assistant text is never inside a border.**
6. **No layout shift on state change**: streaming start, queue add, counter
   appear, error notice — all reserve or push, never reflow the composer
   horizontally.
7. **Keep every existing guard/contrast test green; do not weaken any.**
8. **Inline `style={{}}` only for per-render dynamic values** (dot colours,
   measured heights). Everything else is a class.
9. Follow plan 001's motion ladder: 120–180 ms, `--motion-ease`,
   transform/opacity only, reduced-motion off.
