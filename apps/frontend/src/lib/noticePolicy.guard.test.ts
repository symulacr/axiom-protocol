import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { consoleReducer, createInitialConsoleState } from "./consoleStore.js";
import type { Transaction } from "./models.js";

/* U24 notification policy + receipt-row integrity guards (2026-09-09 prod
 * paste: toasts stuck on screen, failed ops rendering as raw error rows).
 * Convention: FlowPage.guard.test.ts (regex on source) + pure reducer units. */
const src = (...segs: string[]) =>
  readFileSync(join(import.meta.dir, ...segs), "utf8");
const mainTsx = src("..", "main.tsx");
const appTsx = src("..", "App.tsx");
const sharedTs = src("..", "pages", "shared.ts");
const flowPageTsx = src("..", "pages", "FlowPage.tsx");
const uiTsx = src("..", "components", "ui.tsx");

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts")) yield p;
  }
}

test("U24: timed toasts get a finite default; Infinity stays on error/action toasts only", () => {
  assert.match(
    mainTsx,
    /duration=\{5000\}/,
    "Toaster mounts a 5s floor for timed (success/info) toasts",
  );
  // shared toastError persists by design; toastSuccess inherits the 5s floor.
  const toastErrorBody = sharedTs.slice(
    sharedTs.indexOf("export const toastError"),
  );
  assert.match(toastErrorBody, /duration: Infinity/);
  const toastSuccessBody = sharedTs.slice(
    sharedTs.indexOf("export const toastSuccess"),
    sharedTs.indexOf("export const toastError"),
  );
  assert.doesNotMatch(
    toastSuccessBody,
    /duration/,
    "toastSuccess passes no duration — it auto-dismisses",
  );
  // No success toast anywhere may opt into persistence.
  for (const file of walk(join(import.meta.dir, ".."))) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(
      text,
      /toast\.success\([^)]*duration:\s*Infinity/,
      `success toast with duration: Infinity in ${file}`,
    );
  }
});

test("U24: the App notice rail auto-dismisses non-errors, errors persist", () => {
  const effect = appTsx.match(
    /if \(!state\.notice \|\| state\.noticeSeverity === "error"\) return;[\s\S]{0,400}?dispatch\(\{ type: "notice", notice: null \}\)/,
  );
  assert.ok(
    effect,
    "the notice timer skips error severity and clears the notice after the reading-time timeout",
  );
});

test("failed ops never become receipt rows (FlowPage error tails)", () => {
  const failTail = flowPageTsx.slice(
    flowPageTsx.indexOf("const failDraftMessage"),
    flowPageTsx.indexOf("const addReceipt"),
  );
  assert.doesNotMatch(
    failTail,
    /addReceipt|"add-tx"/,
    "failDraft/failDraftMessage must not write receipt rows",
  );
  const addTxSites = flowPageTsx.match(/type: "add-tx"/g) ?? [];
  assert.equal(
    addTxSites.length,
    1,
    "receipt rows enter the store from the single addReceipt site only",
  );
});

test("no bare Ref line: ErrorRef and errorRefString require a requestId", () => {
  const errorRef = uiTsx.slice(
    uiTsx.indexOf("export function ErrorRef"),
    uiTsx.indexOf("export function Spinner"),
  );
  assert.match(
    errorRef,
    /if \(requestId === undefined\) return <><\/>;/,
    "code-only errors render no Ref line in the chat error card",
  );
  const formatTs = src("..", "utils", "format.ts");
  assert.match(
    formatTs,
    /ref\?\.requestId !== undefined\s*\?\s*`Ref · /,
    "toast ref description requires a requestId",
  );
});

test("reducer: notice severity defaults to success (timed), error persists, clear resets", () => {
  const base = createInitialConsoleState();
  const ok = consoleReducer(base, { type: "notice", notice: "Saved." });
  assert.equal(ok.noticeSeverity, "success");
  const err = consoleReducer(base, {
    type: "notice",
    notice: "Failed.",
    severity: "error",
  });
  assert.equal(err.noticeSeverity, "error");
  const cleared = consoleReducer(err, { type: "notice", notice: null });
  assert.equal(cleared.notice, null);
  assert.equal(cleared.noticeSeverity, null);
});

test("reducer: a recoverable-error phase writes no transaction row; add-tx keeps tx.agent", () => {
  const base = createInitialConsoleState();
  const failed = consoleReducer(base, {
    type: "set-draft-phase",
    flow: "mint",
    phase: "recoverable-error",
    error: "Transaction cancelled — you rejected the request in your wallet.",
  });
  assert.equal(
    failed.transactions.length,
    0,
    "a failed/cancelled op must not append a receipt row",
  );
  const tx: Transaction = {
    id: "0xabc",
    kind: "Agent mint",
    detail: "Agent Alpha",
    hash: "0xabc",
    age: "now",
    state: "confirming",
    route: "/mint",
    agent: "7",
    icon: null,
  };
  const added = consoleReducer(base, { type: "add-tx", tx });
  assert.equal(
    added.transactions[0]?.agent,
    "7",
    "AgentPage filters on tx.agent",
  );
});
