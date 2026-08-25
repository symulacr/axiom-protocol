import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// L5-04 guard: StrictMode's mount/unmount cycle dropped the providers query's
// only observer, so react-query v5 aborted the in-flight queryFn signal
// (net::ERR_ABORTED) and the remount re-fetched. Fix: module-scope transport
// dedupe scoped to the providers query only.
// Convention: ChatPage.guard.test.ts (regex on source).
const chatSrc = readFileSync(
  join(import.meta.dir, "../pages/ChatPage.tsx"),
  "utf8",
);
const polledSrc = readFileSync(join(import.meta.dir, "usePolledApi.ts"), "utf8");

test("providers transport is deduped at module scope", () => {
  assert.match(
    chatSrc,
    /const inflightProviders = new Map<string, Promise<ProvidersResponse>>\(\);/,
  );
  const set = chatSrc.indexOf("inflightProviders.set(url, p)");
  const fin = chatSrc.indexOf(".finally(", chatSrc.indexOf("function fetchProvidersDeduped"));
  const del = chatSrc.indexOf("inflightProviders.delete(url)");
  assert.ok(set >= 0, "in-flight promise cached under its URL");
  assert.ok(del >= 0, "cache entry cleared when the fetch settles");
  assert.ok(fin >= 0 && fin < del, "clear wired via finally");
});

test("deduped fetch is the providers queryFn (signal-free)", () => {
  const fn = chatSrc.indexOf("function fetchProvidersDeduped");
  const use = chatSrc.indexOf("queryFn: () => fetchProvidersDeduped(url)");
  assert.ok(fn >= 0, "fetchProvidersDeduped defined");
  assert.ok(use >= 0, "providers query uses the deduped fetch");
  // The deduped fetch must not thread an abort signal into apiFetch.
  const body = chatSrc.slice(fn, chatSrc.indexOf("}", fn) + 1);
  assert.ok(!body.includes("signal"), "deduped fetch ignores observer signals");
});

test("other polled hooks keep signal cancellation", () => {
  assert.match(polledSrc, /apiFetch<T>\(url, \{ signal: querySignal \}\)/);
});
