#!/usr/bin/env node
/*
  R21 all-pages sweep — every route, live: JS/console errors, page emptiness,
  horizontal overflow, unlabeled icon-only buttons (a11y), images without alt,
  broken in-app hash anchors, and a click probe of the first primary control.
  Same spawn + raw-WebSocket CDP pattern as site-space-audit.mjs (no deps).
*/
import { spawn } from "node:child_process";

const CHROME = "/home/hoplite/.agent-browser/browsers/chrome-152.0.7977.42/chrome";
const BASE = process.env.BASE ?? "http://localhost:3000";
const WIDTH = Number(process.env.WIDTH ?? 1440);
const ROUTES = [
  "/", "/app", "/chat", "/transactions", "/storage", "/mint", "/payment",
  "/transfer", "/tick", "/deposit", "/withdraw", "/settings", "/staking",
  "/agents/3", "/transfer/co-sign", "/hub/proof", "/nonexistent-route",
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const port = 9490;
const udd = `/tmp/all-pages-${process.pid}`;
const proc = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  `--window-size=${WIDTH},2400`, `--remote-debugging-port=${port}`,
  `--user-data-dir=${udd}`, "about:blank",
]);

let target = null;
for (let i = 0; i < 40; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`);
    const page = (await res.json()).find((t) => t.type === "page");
    if (page) { target = page.webSocketDebuggerUrl; break; }
  } catch {}
  await sleep(250);
}
if (!target) { console.error("no devtools target"); proc.kill(); process.exit(1); }

const ws = new WebSocket(target);
let id = 0;
const pending = new Map();
const events = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id).resolve(m.result);
    pending.delete(m.id);
  } else if (m.method) {
    for (const h of events) h(m);
  }
};
const next = (method, params = {}) =>
  new Promise((resolve) => {
    const msg = { id: ++id, method, params };
    pending.set(msg.id, { resolve });
    ws.send(JSON.stringify(msg));
  });
await new Promise((r) => (ws.onopen = r));
await next("Page.enable");
await next("Runtime.enable");
await next("Log.enable");
await next("Emulation.setDeviceMetricsOverride", {
  width: WIDTH, height: 2400, deviceScaleFactor: 1, mobile: false,
});

const evalJs = async (expression) => {
  const r = await next("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  return r?.result?.value ?? null;
};

const results = [];
for (const route of ROUTES) {
  const jsErrors = [];
  const handler = (m) => {
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error") {
      jsErrors.push(`${String(m.params.entry.text).slice(0, 90)} <- ${String(m.params.entry.url ?? "").slice(0, 60)}`);
    }
    if (m.method === "Runtime.exceptionThrown") {
      const d = m.params.exceptionDetails;
      jsErrors.push(String(d.exception?.description ?? d.text ?? "").slice(0, 130));
    }
  };
  events.push(handler);
  try {
    await next("Page.navigate", { url: BASE + route });
    for (let i = 0; i < 24; i++) {
      const ready = await evalJs(`!!(document.querySelector('.ops-page') || document.querySelector('.public-locked') || document.querySelector('.landing-page') || document.querySelector('.recovery-404') || document.querySelector('.session-settling'))`);
      if (ready === true) break;
      await sleep(250);
    }
    await sleep(900);

    const audit = JSON.parse((await evalJs(`(() => {
      const out = {};
      out.title = document.title;
      out.bodyText = (document.body.innerText || '').trim().length;
      out.horizOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      out.shell = document.querySelector('.app-shell') ? 'console' : (document.querySelector('.landing-page, .public-locked') ? 'public' : 'other');
      out.unlabeledButtons = [...document.querySelectorAll('button')].filter(b => {
        const iconOnly = !b.textContent.trim() && b.querySelector('svg, img');
        const named = b.getAttribute('aria-label') || b.getAttribute('title') || b.getAttribute('aria-labelledby');
        return iconOnly && !named;
      }).map(b => b.className.toString().slice(0, 36));
      out.imagesNoAlt = [...document.querySelectorAll('img:not([alt])')].length;
      out.deadHashAnchors = [...document.querySelectorAll('a[href^="#"]')]
        .filter(a => a.getAttribute('href') !== '#' && !document.querySelector(a.getAttribute('href')))
        .map(a => a.getAttribute('href'));
      out.hasPrimary = !!document.querySelector('.button-primary, .button:not(.button-ghost), .nav-connect, .flow-action .button');
      return JSON.stringify(out);
    })()`)) ?? "{}");

    let clickOk = "skipped";
    if (audit.hasPrimary) {
      clickOk = await evalJs(`(() => {
        const el = document.querySelector('.nav-connect') || document.querySelector('.button-primary') || document.querySelector('.button:not(.button-ghost)');
        if (!el) return 'no-target';
        try { el.click(); return 'clicked'; } catch (e) { return 'error'; }
      })()`);
      await sleep(600);
      const stillAlive = await evalJs(`!!document.body && document.body.innerText.trim().length > 0`);
      if (clickOk === "clicked" && stillAlive !== true) clickOk = "clicked-then-blank";
    }
    results.push({ route, ...audit, clickOk, jsErrors: jsErrors.slice(0, 3) });
  } catch (e) {
    results.push({ route, error: String(e).slice(0, 100), jsErrors });
  }
  const idx = events.indexOf(handler);
  if (idx >= 0) events.splice(idx, 1);
}
ws.close();
proc.kill();

let bad = 0;
for (const r of results) {
  const issues = [];
  if (r.error) issues.push("NAV-ERROR");
  if ((r.bodyText ?? 0) < 40) issues.push("NEAR-EMPTY");
  if ((r.horizOverflow ?? 0) > 1) issues.push(`H-OVERFLOW+${r.horizOverflow}px`);
  if ((r.unlabeledButtons ?? []).length) issues.push(`UNLABELED:${r.unlabeledButtons.join(",")}`);
  if ((r.imagesNoAlt ?? 0) > 0) issues.push(`IMG-NO-ALT:${r.imagesNoAlt}`);
  if ((r.deadHashAnchors ?? []).length) issues.push(`DEAD-ANCHOR:${r.deadHashAnchors.join(",")}`);
  if ((r.jsErrors ?? []).length) issues.push(`JS-ERRORS:${r.jsErrors.length}`);
  if (r.clickOk && r.clickOk.startsWith("error")) issues.push(`CLICK:${r.clickOk}`);
  if (r.clickOk === "clicked-then-blank") issues.push("CLICK-KILLED-PAGE");
  if (issues.length) bad++;
  console.log(`${issues.length ? "✗" : "✓"} ${r.route.padEnd(22)} ${(r.shell ?? "-").padEnd(7)} text=${String(r.bodyText ?? 0).padStart(5)} click=${r.clickOk ?? "-"} ${issues.join(" | ")}`);
  for (const e of r.jsErrors ?? []) console.log(`    js: ${e}`);
}
console.log(`\n${results.length - bad}/${results.length} routes clean`);
