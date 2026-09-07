import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Structural regression guards for the F2a medium fixes (M3/M4/M5):
// the ?agent= select value must be validated against the loaded register,
// the tick token stream must not live inside an aria-live region, and the
// tick reason slice must carry an ellipsis.
// Convention: useTransfer.dataHash.test.ts (regex on source).
const src = readFileSync(join(import.meta.dir, "FlowPage.tsx"), "utf8");

test("M3: ?agent= id is validated against agentOptions before it reaches the select", () => {
  assert.match(
    src,
    /agentOptions\.length > 0 &&\s*\n?\s*!agentOptions\.includes\(requestedTokenId\)/,
    "stale requested id must fall back to a listed option",
  );
  const validation = src.indexOf("!agentOptions.includes(requestedTokenId)");
  const selectValue = src.indexOf("value={selectedTokenId}");
  assert.ok(validation >= 0 && selectValue > validation);
  // agentOptions must be computed before selectedTokenId (single definition).
  const defs = src.match(/const agentOptions = useMemo/g) ?? [];
  assert.equal(defs.length, 1, "exactly one agentOptions definition");
  assert.ok(
    src.indexOf("const agentOptions = useMemo") <
      src.indexOf("const selectedTokenId ="),
    "agentOptions must precede selectedTokenId",
  );
});

test("M4: tick token stream is aria-hidden; live region carries the status node only", () => {
  assert.doesNotMatch(
    src,
    /className="tick-stream" aria-live/,
    "no aria-live on the streaming container",
  );
  assert.match(
    src,
    /<pre className="mono" aria-hidden="true">/,
    "token flush renders aria-hidden",
  );
  assert.match(
    src,
    /className="visually-hidden" role="status">/,
    "start announcement goes through a status node",
  );
  // The stream error keeps its own assertive channel.
  const tickBlock = src.slice(src.indexOf('className="tick-stream"'));
  assert.match(tickBlock, /role="alert"/, "stream error still announced");
});

test("M5: tick reason slice appends an ellipsis when truncated", () => {
  assert.doesNotMatch(
    src,
    /recommendation\.reason\.slice\(0, 48\)/,
    "bare slice without ellipsis is gone",
  );
  assert.ok(
    src.includes(
      "reason: reason.length > 48 ? `${reason.slice(0, 48)}…` : reason,",
    ),
    "truncated reason carries the ellipsis",
  );
});
