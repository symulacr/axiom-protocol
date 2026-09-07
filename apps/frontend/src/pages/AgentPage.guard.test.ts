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
  const effect = src.indexOf(
    'if (agentMissing) go("/this-path-does-not-exist-404");',
  );
  const earlyReturn = src.indexOf("if (agentMissing) return null;");
  assert.ok(effect >= 0, "navigation effect present");
  assert.ok(effect < earlyReturn, "effect (a hook) must precede the return");
});
