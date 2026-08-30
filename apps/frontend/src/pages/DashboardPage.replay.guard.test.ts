/*
  T1 onboarding-replay regression guards (Wave-J1):
  - first-run-reset re-opens the checklist AND clears firstRunDismissed in
    one action (reducer test — no source regex needed, the reducer is pure).
  - Dashboard keeps one muted replay link only when dismissed && !allDone.
  - Settings exposes the checklist replay control.
  Structural guards follow the ChatPage.guard.test.ts convention.
*/
import { describe, expect, test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  consoleReducer,
  createInitialConsoleState,
  defaultSettings,
} from "../lib/consoleStore.js";
import type { ConsoleAction } from "../lib/consoleStore.js";

const dashboardSrc = readFileSync(
  join(import.meta.dir, "DashboardPage.tsx"),
  "utf8",
);
const settingsSrc = readFileSync(
  join(import.meta.dir, "SettingsPage.tsx"),
  "utf8",
);

const stateWith = (overrides: Partial<typeof defaultSettings>) =>
  createInitialConsoleState({ ...defaultSettings, ...overrides });

describe("T1 first-run-reset reducer", () => {
  test("clears firstRunDismissed and opens the checklist in one action", () => {
    const dismissed = stateWith({ firstRunDismissed: true });
    assert.ok(dismissed.settings.firstRunDismissed);
    assert.ok(!dismissed.firstRunOpen);

    const reset = consoleReducer(dismissed, {
      type: "first-run-reset",
    } as ConsoleAction);
    assert.ok(!reset.settings.firstRunDismissed, "dismissal flag cleared");
    assert.ok(reset.firstRunOpen, "checklist card re-opened");
  });

  test("first-run-dismiss still closes the card and persists the dismissal", () => {
    const open = { ...stateWith({}), firstRunOpen: true };
    const dismissed = consoleReducer(open, {
      type: "first-run-dismiss",
    } as ConsoleAction);
    assert.ok(dismissed.settings.firstRunDismissed);
    assert.ok(!dismissed.firstRunOpen);
  });
});

describe("T1 replay surfaces (structural guards)", () => {
  test("DashboardPage shows the replay link only when dismissed && !allDone", () => {
    // Both conditions gate the same link — neither alone is enough.
    assert.match(
      dashboardSrc,
      /\{checklistDismissed && checklistIncomplete && \(\s*\n\s*<button\s*\n\s*className="text-link checklist-replay"/,
    );
    // The link dispatches first-run-reset (flag + card in one dispatch).
    assert.match(
      dashboardSrc,
      /checklist-replay"[\s\S]{0,200}?type: "first-run-reset"/,
    );
    // Completeness derives from the exported pure predicates, not ad-hoc checks.
    assert.match(
      dashboardSrc,
      /firstRunSteps\(\{\s*\n\s*hasAgent: agents\.length > 0,/,
    );
  });

  test("the checklist render gate is still exactly !firstRunDismissed", () => {
    assert.match(
      dashboardSrc,
      /\{!state\.settings\.firstRunDismissed && \(\s*\n\s*<FirstRunChecklist/,
    );
  });

  test("SettingsPage exposes the checklist replay control", () => {
    // Separate from the Guide overlay replay (replayOnboarding dispatches guide).
    assert.match(
      settingsSrc,
      /type: "first-run-reset"[\s\S]{0,200}?\{labels\.showChecklistAgain\}/,
    );
    // The Guide replay button must keep its own action.
    assert.match(
      settingsSrc,
      /type: "guide"[\s\S]{0,200}?\{labels\.replayOnboarding\}/,
    );
  });
});
