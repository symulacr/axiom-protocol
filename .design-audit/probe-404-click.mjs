#!/usr/bin/env node
/* R21 probe: what does clicking the primary control on the 404 page do in a
   fresh (unauthenticated) browser? Sweep reported "clicked-then-blank". */
import { spawn } from "node:child_process";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9531;
const proc = spawn("/home/hoplite/.agent-browser/browsers/chrome-152.0.7977.42/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox",
  `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/probe-${process.pid}`, "about:blank",
]);
let target = null;
for (let i = 0; i < 40; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/json/list`);
    const p = (await r.json()).find((t) => t.type === "page");
    if (p) { target = p.webSocketDebuggerUrl; break; }
  } catch {}
  await sleep(250);
}
const ws = new WebSocket(target);
let id = 0;
const pending = new Map();
const events = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id).resolve(m.result); pending.delete(m.id); }
  else if (m.method) events.push(m);
};
const next = (method, params = {}) =>
  new Promise((resolve) => { const msg = { id: ++id, method, params }; pending.set(msg.id, { resolve }); ws.send(JSON.stringify(msg)); });
const evalJs = async (e) =>
  (await next("Runtime.evaluate", { expression: e, returnByValue: true })).result?.value;
await new Promise((r) => (ws.onopen = r));
await next("Page.enable");
await next("Runtime.enable");
await next("Page.navigate", { url: "http://localhost:3000/nonexistent-route" });
await sleep(2500);
console.log("probe:", await evalJs(`(() => { const el = document.querySelector(".nav-connect") || document.querySelector(".button-primary") || document.querySelector(".button:not(.button-ghost)"); return el ? el.outerHTML.slice(0, 160) : "none"; })()`));
console.log("click:", await evalJs(`(() => { const el = document.querySelector(".nav-connect") || document.querySelector(".button-primary") || document.querySelector(".button:not(.button-ghost)"); if (!el) return "no-target"; el.click(); return "clicked"; })()`));
await sleep(800);
console.log("after:", await evalJs(`JSON.stringify({ text: document.body.innerText.trim().length, gate: !!document.querySelector(".wallet-gate"), path: location.pathname })`));
for (const e of events.filter((e) => e.method === "Runtime.exceptionThrown").slice(0, 2)) {
  console.log("exc:", String(e.params.exceptionDetails.exception?.description ?? e.params.exceptionDetails.text).slice(0, 220));
}
ws.close();
proc.kill();
