import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Structural regression guard for the F1 hooks-order fix: agentMissing flips
// true only after the agents read settles, so an early return placed above
// any later hook changes the hook count mid-life and React throws "Rendered
// fewer hooks than expected". The return must sit below EVERY hook call,
// immediately before the main JSX return.
// Convention: useTransfer.dataHash.test.ts (regex on source).
const src = readFileSync(join(import.meta.dir, "AgentPage.tsx"), "utf8");

test("agentMissing early return appears exactly once, after the last hook", () => {
  const returns = src.match(/if \(agentMissing\) return null;/g) ?? [];
  assert.equal(returns.length, 1, "exactly one early return");
  const earlyReturn = src.indexOf("if (agentMissing) return null;");
  const lastSignHook = src.indexOf("useSignTypedData()");
  const lastState = src.indexOf(
    "[isDelegationSubmitting, setDelegationSubmitting] = useState(false)",
  );
  assert.ok(lastSignHook >= 0 && lastState >= 0, "anchor hooks present");
  assert.ok(
    earlyReturn > lastSignHook,
    "early return must follow useSignTypedData",
  );
  assert.ok(
    earlyReturn > lastState,
    "early return must follow the last useState in the component body",
  );
});

test("no hook call between the early return and the main return", () => {
  const earlyReturn = src.indexOf("if (agentMissing) return null;");
  const mainReturn = src.indexOf(
    'return (\n    <div className="ops-page agent-page">',
  );
  assert.ok(earlyReturn >= 0 && mainReturn > earlyReturn);
  const between = src.slice(earlyReturn, mainReturn);
  assert.doesNotMatch(
    between,
    /\buse(State|Effect|Memo|Ref|Callback|SignTypedData|GenericWrite|AgentDelegation|PaymentToken|PaymentTokenOnchain|PaymentSnapshot|WalletClient|Agents|SearchParams|ChainId|Account|ReadContracts|Payment|Performance|VaultData|UiStore)\s*\(/,
    "no hook call may follow the early return",
  );
});

test("the 404 navigation effect stays above the early return", () => {
  const effect = src.indexOf("if (agentMissing) go(NOT_FOUND_PATH);");
  const earlyReturn = src.indexOf("if (agentMissing) return null;");
  assert.ok(effect >= 0, "navigation effect present");
  assert.ok(effect < earlyReturn, "effect (a hook) must precede the return");
});

// F3: the synthetic 404 path lives in ONE named export (routeRegistry), never
// as a magic string at a call site.
test("404 navigation targets NOT_FOUND_PATH from routeRegistry", () => {
  assert.match(
    src,
    /import \{ NOT_FOUND_PATH, routePath \} from "\.\.\/lib\/routeRegistry\.js";/,
    "AgentPage imports NOT_FOUND_PATH",
  );
  assert.ok(
    !src.includes('"/this-path-does-not-exist-404"'),
    "no hardcoded synthetic 404 path in the page",
  );
  const registry = readFileSync(
    join(import.meta.dir, "../lib/routeRegistry.ts"),
    "utf8",
  );
  assert.match(
    registry,
    /export const NOT_FOUND_PATH = "\/this-path-does-not-exist-404";/,
    "routeRegistry exports the constant",
  );
});

// F3 activity tab: chain events and local receipts render as ONE time-sorted
// list (a fresh receipt interleaves with older chain events), and chain rows
// are real anchors when a tx hash exists (middle-click / copy-link), a
// disabled button otherwise — never window.open on a bare button.
test("activity rows merge-sort both sources and chain rows are anchors", () => {
  assert.match(
    src,
    /\.sort\(\(a, b\) => b\.sortTs - a\.sortTs\)/,
    "merged rows sort by timestamp",
  );
  assert.ok(
    !src.includes("[...events].reverse().map"),
    "chain events no longer render as a separate reversed block",
  );
  const localBlock = src.indexOf("{localReceipts.map((tx) => (");
  assert.equal(
    localBlock,
    -1,
    "local receipts no longer render as a second stacked block",
  );
  assert.ok(!src.includes("window.open("), "no window.open navigation");
  assert.match(
    src,
    /href=\{explorerTx\(event\.txHash\)\}/,
    "chain row carries a real href",
  );
});

// M9: the copy-hash button renders only with a real hash, and the copied
// notice fires only after a resolved clipboard write.
test("copy-hash button is hash-gated and the notice follows a resolved write (M9)", () => {
  assert.match(
    src,
    /if \(!hash \|\| !clipboard\?\.writeText\) return;/,
    "no hash or no clipboard API returns before any notice",
  );
  const write = src.indexOf("await clipboard.writeText(hash);");
  const notice = src.indexOf("action(agentCopy.copiedNotice);");
  assert.ok(write >= 0 && notice > write, "notice follows the resolved write");
  assert.match(
    src,
    /\{metadata\?\.dataHash && \(\s*\n\s*<button\s*\n\s*className="inline-copy"/,
    "copy button renders only when a hash exists",
  );
});
