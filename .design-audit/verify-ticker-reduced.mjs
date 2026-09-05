#!/usr/bin/env node
/* R22 verify: under emulated prefers-reduced-motion, the ticker renders ONE
   set (no duplicated "screenshot list"); without it, the marquee keeps its
   measured multi-set strip. */
import { spawn } from "node:child_process";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9541;
const proc = spawn("/home/hoplite/.agent-browser/browsers/chrome-152.0.7977.42/chrome", [
  "--headless=new", "--disable-gpu", "--no-sandbox",
  `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/rm-verify-${process.pid}`, "about:blank",
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
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id).resolve(m.result); pending.delete(m.id); }
};
const next = (method, params = {}) =>
  new Promise((resolve) => { const msg = { id: ++id, method, params }; pending.set(msg.id, { resolve }); ws.send(JSON.stringify(msg)); });
const evalJs = async (e) =>
  (await next("Runtime.evaluate", { expression: e, returnByValue: true })).result?.value;
await new Promise((r) => (ws.onopen = r));
await next("Page.enable");
await next("Runtime.enable");

async function tickerState(label) {
  await next("Page.navigate", { url: "http://localhost:3000/" });
  await sleep(2200);
  const s = await evalJs(`(() => {
    const sets = document.querySelectorAll('.ticker-set').length;
    const items = document.querySelectorAll('.ticker-item').length;
    const track = document.querySelector('.ticker-track');
    const cs = track ? getComputedStyle(track) : null;
    const vp = document.querySelector('.ticker-viewport');
    const vcs = vp ? getComputedStyle(vp) : null;
    const texts = [...document.querySelectorAll('.ticker-item strong')].map(s => s.textContent);
    const unique = [...new Set(texts)].length;
    return JSON.stringify({ sets, items, uniqueAgents: unique, anim: cs?.animationName, viewportOverflowX: vcs?.overflowX });
  })()`);
  console.log(label, s);
}

await tickerState("normal:     ");
await next("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-reduced-motion", value: "reduce" }],
});
await tickerState("reduced-rm: ");
ws.close();
proc.kill();
