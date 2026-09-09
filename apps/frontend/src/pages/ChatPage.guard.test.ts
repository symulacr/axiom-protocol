import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deriveStepStatus } from "../chat/lib.js";

// Structural regression guards for the ChatPage concurrency fixes (W1-4/W1-5):
// Regenerate/Retry bypass the send queue, so runAgent itself must refuse
// concurrent entry, and edit-resend must invalidate any in-flight run.
// Convention: useTransfer.dataHash.test.ts (regex on source).
const src = readFileSync(join(import.meta.dir, "ChatPage.tsx"), "utf8");

test("runAgent refuses concurrent entry", () => {
  const guard = src.indexOf("if (isStreamingRef.current) return;");
  const set = src.indexOf("isStreamingRef.current = true;");
  assert.ok(guard >= 0, "entry guard present");
  assert.ok(set >= 0, "streaming flag assignment present");
  assert.ok(guard < set, "guard must precede the streaming-flag assignment");
});

test("regenerate and retry call sites guard on streaming ref", () => {
  const regenerate = src.indexOf("title={chatCopy.regenerate}");
  const retry = src.indexOf("const last = lastStreamErrorRef.current;");
  assert.ok(regenerate >= 0 && retry >= 0);
  // Three call-site guards total: runAgent entry + Regenerate + Retry.
  const guards = src.match(/if \(isStreamingRef\.current\) return;/g) ?? [];
  assert.ok(guards.length >= 3, `expected ≥3 guards, found ${guards.length}`);
});

test("edit-confirm bumps run epoch and aborts in-flight run", () => {
  const bumps = src.match(/runEpochRef\.current \+= 1;/g) ?? [];
  assert.ok(
    bumps.length >= 3,
    `expected epoch bump in startNewChat, openThread AND editConfirm; found ${bumps.length}`,
  );
  assert.match(
    src,
    /runEpochRef\.current \+= 1;\s*\n\s*abortRef\.current\?\.abort\(\);/,
  );
});

// R1-8: a tool call with no live toolRun (post-run reset, restored thread or
// never-marked id) must not synthesize a `running` run — that renders a
// spinner + "0s…" forever. Plan 002 F-1: it must not synthesize a red
// `error` either — the paired tool message proves completion. Status is
// derived (deriveStepStatus), so the guard is behavioral.
test("step status is derived, never a synthetic running/error state (R1-8, 002 F-1)", () => {
  assert.doesNotMatch(
    src,
    /run \?\? \{[^}]*status:\s*"(running|error)"/s,
    "no synthetic fallback run object in ChatPage",
  );
  const base = { id: "tc1", name: "list_agents" };
  assert.equal(
    deriveStepStatus({ ...base, result: undefined, hasResult: false }),
    "pending",
  );
  assert.equal(
    deriveStepStatus({ ...base, result: '{"count":2}', hasResult: true }),
    "success",
  );
  assert.equal(
    deriveStepStatus({ ...base, result: '{"error":"boom"}', hasResult: true }),
    "error",
  );
  assert.equal(
    deriveStepStatus({ ...base, result: "Error: reverted", hasResult: true }),
    "error",
  );
  assert.equal(
    deriveStepStatus({
      ...base,
      result: undefined,
      hasResult: false,
      run: { name: "list_agents", status: "running", startedAt: Date.now() },
    }),
    "running",
  );
  // The success/error paths mark real runs; only the no-run case is derived.
  assert.match(src, /status: "running",\s*\n\s*startedAt: Date\.now\(\)/);
});

// M1: the sidebar-close focus restore must skip the first render — the rail
// starts closed on /chat, so an unguarded mount fire steals the composer
// autofocus.
test("sidebar focus restore fires only after the drawer was open (M1)", () => {
  assert.doesNotMatch(
    src,
    /if \(!sidebarOpen\) \{\s*\n\s*sidebarToggleRef\.current\?\.focus\(\);/,
    "unguarded mount-time focus is gone",
  );
  assert.match(
    src,
    /if \(sidebarOpen\) \{\s*\n\s*sidebarWasOpenRef\.current = true;\s*\n\s*return;\s*\n\s*\}\s*\n\s*if \(sidebarWasOpenRef\.current\) sidebarToggleRef\.current\?\.focus\(\);/,
    "focus returns to the toggle only after an actual open",
  );
});

// M2: the 50ms token flush must not sit inside an aria-live region; the live
// region is the phase label only.
test("streaming token flush is aria-hidden, live region on the phase label (M2)", () => {
  assert.doesNotMatch(
    src,
    /turn--live"\s*\n\s*role="status"/,
    "no aria-live wrapper around the streaming turn",
  );
  assert.match(
    src,
    /<div className="chat-msg chat-msg-wrap" aria-hidden="true">/,
    "token stream renders aria-hidden",
  );
  assert.match(
    src,
    /<span role="status" aria-live="polite">\s*\n\s*\{phaseLabel\(/,
    "phase label keeps the live region",
  );
});

// L1-L8: active-thread resume must survive a closed tab — the resume cache
// (axiom:chat-messages + axiom:chat-thread) persists in localStorage, not
// sessionStorage, and honors the MAX_RESUME_THREADS budget.
test("active-thread resume persists in localStorage with a thread cap (L1-L8)", () => {
  assert.doesNotMatch(
    src,
    /sessionStorage/,
    "resume cache must not use sessionStorage (tab close would lose the thread)",
  );
  const reads = src.match(
    /loadJsonArray<Message>\(localStorage, CHAT_MESSAGES_KEY\)/,
  );
  const writes = src.match(
    /localStorage\.setItem\(CHAT_MESSAGES_KEY, JSON\.stringify\(stored\)\)/,
  );
  assert.ok(
    reads,
    "loadStoredMessages reads the resume cache from localStorage",
  );
  assert.ok(writes, "persist effect writes the resume cache to localStorage");
  assert.match(src, /localStorage\.setItem\(CHAT_THREAD_KEY, threadId\)/);
  const cap = src.match(/export const MAX_RESUME_THREADS = (\d+);/);
  assert.ok(cap, "MAX_RESUME_THREADS budget declared");
  assert.ok(
    Number(cap[1]) > 0 && Number(cap[1]) <= 10,
    `resume cap must be between 1 and 10, got ${cap[1]}`,
  );
});

// 2026-09-08 incident: a history front-cut landing inside a tool block made
// the provider reject the payload with a 400 (orphaned role:"tool" message),
// which the UI then misreported as "Compute is unavailable". fitToContext is
// now the only cut (2026-09-09 redesign); it snaps via snapHistoryStart.
test("history front-cuts snap to tool-block boundaries", () => {
  assert.doesNotMatch(
    src,
    /capRecentMessages/,
    "the count-based capRecentMessages is gone, fitToContext is the only cut",
  );
  assert.doesNotMatch(
    src,
    /\)\.slice\(-50\)/,
    "the blind .slice(-50) on the chat payload stays gone",
  );
});

// B1 follow-up (resume scope): the backend's 50-message schema cap became a
// ~4MB byte guard (C2). The frontend count cap (MAX_HISTORY_MESSAGES 49/48)
// is deleted; fitToContext clamps the history budget to the byte ceiling via
// the token estimate. The token budget is the only limit.
test("the chat payload is bounded by the token budget, no count cap (B1 contract)", () => {
  assert.doesNotMatch(src, /MAX_HISTORY_MESSAGES/, "count cap deleted");
  assert.doesNotMatch(
    src,
    /maxMessages/,
    "no count-cap option remains in the payload path",
  );
  assert.match(
    src,
    /\.\.\.buildPayloadMessages\(\)/,
    "the only payload build path goes through the token-budget fit",
  );
});

// Output budget (resume scope): long answers were clamped by the backend's
// hardcoded max_tokens 2048. The payload now sends the catalog's
// max_completion_tokens (live via /v1/config, else the static map), never
// above it, and reserves the same value in the history budget.
test("the payload sends the catalog output budget, never above it", () => {
  assert.match(
    src,
    /maxCompletion \?\? resolveMaxCompletionTokens\(CHAT_MODEL\)/,
    "live catalog value preferred, static map as fallback",
  );
  assert.match(
    src,
    /max_tokens: effectiveMaxCompletion/,
    "max_tokens sent when the catalog value is known",
  );
  assert.match(
    src,
    /outputReserve: effectiveMaxCompletion/,
    "the history budget reserves exactly the output budget",
  );
});

// Hidden plan reminder (resume scope): the REMAINING PLAN block is a second
// system-position message AFTER the byte-stable prompt, injected only while a
// plan is active; plans are captured from assistant prose via the shared
// detectPlan/matchPlan matchers and cleared on thread switch.
test("REMAINING PLAN block rides after the stable prompt, only with an active plan", () => {
  assert.match(
    src,
    /buildRemainingPlanBlock\(lastPlanRef\.current\)/,
    "block built from the live plan ref",
  );
  const stableIdx = src.indexOf('{ role: "system", content: systemContent }');
  const blockIdx = src.indexOf("content: planBlock");
  assert.ok(
    stableIdx >= 0 && blockIdx > stableIdx,
    "plan block follows the stable system prompt",
  );
  assert.match(
    src,
    /capturePlan\(assistantContent/,
    "plans captured from assistant messages",
  );
  assert.match(
    src,
    /if \(matched\.length >= 2\) recordPlan\(matched\)/,
    "two-plus matched steps filters one-off enumerated answers",
  );
});

// Same incident: one failed turn surfaced the same error three times —
// a sticky banner, a persisted inline card, and one Infinity-duration toast
// per retry (stacked bottom-right). Toasts dedupe by id; the banner re-arms
// per run instead of sticking past recovery.
test("compute failure surfaces dedupe and re-arm", () => {
  assert.match(
    src,
    /id: `chat-error:\$\{msg\}`/,
    "error toasts carry a stable id so repeats update instead of stacking",
  );
  const runStart = src.indexOf("isStreamingRef.current = true;");
  assert.ok(runStart > 0);
  const bannerClear = src.indexOf("setComputeHint(null);", runStart);
  assert.ok(
    bannerClear > runStart && bannerClear - runStart < 400,
    "runAgent clears the stale compute banner at run start",
  );
});

// Same incident, duplicated option card: steps dedupe identical tool_calls
// (dedupeToolCalls) but asks were appended blindly — a repeated ask_user
// result rendered the same AskUserCard twice in one turn.
test("groupTurns dedupes ask_user results like steps", () => {
  assert.match(
    src,
    /cur\.asks\.some\(\s*\(a\) =>\s*a\.content === msg\.content \|\|/,
    "asks dedupe on identical content or tool_call_id",
  );
});

// B6b: an ask_user tool result routed only to turn.asks, so the ask's row in
// Steps stayed "pending" forever. The result must also pair with its step.
test("ask_user results resolve their step row (B6b)", () => {
  const askBranch = src.indexOf('if (msg.name === "ask_user")');
  assert.ok(askBranch > 0, "ask branch present in groupTurns");
  const branch = src.slice(askBranch, askBranch + 1400);
  assert.match(
    branch,
    /cur\.steps\.find\(\(s\) => s\.id === msg\.tool_call_id\)/,
    "the ask result finds its step by tool_call_id",
  );
  assert.match(
    branch,
    /step\.hasResult = true/,
    "the paired step leaves the pending state",
  );
});
