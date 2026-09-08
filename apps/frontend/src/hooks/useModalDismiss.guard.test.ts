import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Structural guard for the F3 scroll-lock fix: modal layers that opt into the
// body scroll lock pass { scrollLock: true } to useModalDismiss (the hook owns
// save/restore of document.body.style.overflow, same contract as the ChatPage
// and AppShell drawers' inline lock). Default stays off for popovers/dialogs.
// Convention: AgentPage.guard.test.ts (regex on source).
const hookSrc = readFileSync(
  join(import.meta.dir, "useModalDismiss.ts"),
  "utf8",
);
const txSrc = readFileSync(
  join(import.meta.dir, "../pages/TransactionsPage.tsx"),
  "utf8",
);
const flowSrc = readFileSync(
  join(import.meta.dir, "../pages/FlowPage.tsx"),
  "utf8",
);

test("useModalDismiss exposes an opt-in scroll lock", () => {
  assert.match(
    hookSrc,
    /options\?: \{ scrollLock\?: boolean \}/,
    "options parameter with scrollLock flag",
  );
  const lock = hookSrc.indexOf('document.body.style.overflow = "hidden"');
  const gate = hookSrc.indexOf("scrollLock ?");
  assert.ok(
    gate >= 0 && lock > gate,
    "the overflow write is gated on scrollLock",
  );
  assert.match(
    hookSrc,
    /document\.body\.style\.overflow = priorOverflow/,
    "prior overflow restored on cleanup",
  );
});

test("ReceiptDrawer and OperationReviewSheet opt into the scroll lock", () => {
  assert.match(
    txSrc,
    /useModalDismiss\(onClose, drawerRef, \{ scrollLock: true \}\)/,
    "ReceiptDrawer locks body scroll",
  );
  assert.match(
    flowSrc,
    /useModalDismiss\(onClose, sheetRef, \{ scrollLock: true \}\)/,
    "OperationReviewSheet locks body scroll",
  );
});

test("existing consumers keep the default (no scroll lock)", () => {
  assert.match(
    txSrc,
    /useModalDismiss\(onClose, popoverRef\)/,
    "filters popover stays unlocked",
  );
  assert.match(
    hookSrc,
    /const scrollLock = options\?\.scrollLock === true;/,
    "default is off unless explicitly requested",
  );
});
