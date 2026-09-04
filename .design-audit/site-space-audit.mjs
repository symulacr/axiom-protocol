// Site-wide space audit: dead-space %, horizontal overflow, text-overlap
// across every route family (landing / hubs / console / gate / 404).
// Usage: node site-space-audit.mjs <baseUrl> [before|after]
import { spawn } from "node:child_process";

const CHROME = "/home/hoplite/.agent-browser/browsers/chrome-152.0.7977.42/chrome";
const base = process.argv[2] || "http://localhost:3000";
const label = process.argv[3] || "run";
// Wide widths only: the cap/dead-space class of defect lives at 1440/1920
// (mobile behavior is covered by the shared <=700px media queries and the
// landing 5-width audit).
const WIDTHS = process.argv.includes("--mobile") ? [390, 768] : [1440, 1920];
const ROUTES = (process.env.SITE_ROUTES ? process.env.SITE_ROUTES.split(",") : [
  "/", "/agents", "/payments", "/proofs", "/storage/0g", "/developers",
  "/app", "/chat", "/settings", "/transactions", "/mint", "/payment",
  "/tick", "/deposit", "/withdraw", "/agents/7", "/transfer/co-sign",
  "/definitely-not-a-route-404",
]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MEASURE = `(() => {
  const vw = innerWidth;
  const de = document.documentElement;
  const round1 = (n) => Math.round(n * 10) / 10;
  const shell = document.querySelector('.app-shell');
  const locked = document.querySelector('.public-locked');
  const landing = document.querySelector('.landing-page');
  const family = shell ? 'console' : locked ? 'hub' : landing ? 'landing' : 'other';
  // Content container per family: console measures inside the .main column
  // (the rail is chrome, not dead space); hub/landing measure vs viewport.
  let frame = null, frameSel = null;
  if (family === 'console') {
    frame = document.querySelector('.main');
    frameSel = '.main';
  } else {
    frame = document.body;
    frameSel = 'body';
  }
  const fr = frame.getBoundingClientRect();
  const fw = family === 'console' ? fr.width : vw;
  // Widest visible text-bearing content edge within the frame.
  let maxRight = 0, minLeft = fr.left;
  for (const el of frame.querySelectorAll('*')) {
    if (el.children.length > 0) continue;
    const t = (el.textContent || '').trim();
    if (!t) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > maxRight) maxRight = r.right;
    if (r.left < minLeft && r.left >= fr.left - 1) minLeft = r.left;
  }
  const rightDead = Math.max(0, round1(((fr.left + fw - maxRight) / fw) * 100));
  const leftDead = Math.max(0, round1(((minLeft - fr.left) / fw) * 100));
  // Container cap: the console caps .ops-page inside .main — that gap is dead.
  let capDead = null;
  if (family === 'console') {
    const ops = document.querySelector('.ops-page');
    if (ops) {
      const ow = ops.getBoundingClientRect().width;
      if (fw > 0) capDead = round1(((fw - ow) / fw) * 100);
    }
  }
  // Text-on-text overlaps: visible leaf text elements intersecting, neither
  // an ancestor of the other (catches "cards overlaid by text"). Rects are
  // cached once and pairs are band-filtered (|left delta|) so dense pages
  // stay O(n) in practice.
  const leafData = [...frame.querySelectorAll('*')].filter((el) => {
    if (el.children.length > 0) return false;
    if (!(el.textContent || '').trim()) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    return true;
  }).slice(0, 400).map((el) => {
    const r = el.getBoundingClientRect();
    return { el, r, cls: String(el.className).slice(0, 20), ok: r.width > 0 && r.height > 0 };
  }).filter((d) => d.ok);
  const overlaps = [];
  for (let i = 0; i < leafData.length && overlaps.length < 5; i++) {
    for (let j = i + 1; j < leafData.length && overlaps.length < 5; j++) {
      const a = leafData[i], b = leafData[j];
      if (Math.abs(a.r.left - b.r.left) > 900) continue;
      const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      if (ox <= 4) continue;
      const oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (oy <= 4) continue;
      const pa = a.el.parentElement, pb = b.el.parentElement;
      let n = pa, related = false;
      while (n) { if (n === b.el || n === pb) { related = true; break } n = n.parentElement }
      if (!related) {
        n = pb;
        while (n) { if (n === a.el || n === pa) { related = true; break } n = n.parentElement }
      }
      if (!related) overlaps.push(a.cls + '~' + b.cls);
    }
  }
  return JSON.stringify({
    family, frameSel, frameW: Math.round(fw),
    hOverflow: de.scrollWidth > de.clientWidth + 1,
    rightDeadPct: rightDead, leftDeadPct: leftDead, capDeadPct: capDead,
    textOverlaps: overlaps,
  });
})()`;

const results = [];
let port = 9460;
for (const w of WIDTHS) {
  port += 1;
  const udd = `/tmp/site-audit-${process.pid}-${port}`;
  const proc = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
    `--window-size=${w},900`, `--remote-debugging-port=${port}`,
    `--user-data-dir=${udd}`, "about:blank",
  ]);
  let ws = null;
  try {
    let target = null;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/list`);
        const page = (await res.json()).find((t) => t.type === "page");
        if (page) { target = page.webSocketDebuggerUrl; break; }
      } catch {}
      await sleep(250);
    }
    if (!target) throw new Error("no devtools target");
    ws = new WebSocket(target);
    let id = 0;
    const pending = new Map();
    const next = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const msg = { id: ++id, method, params };
        pending.set(msg.id, { resolve, reject });
        ws.send(JSON.stringify(msg));
      });
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        pending.get(m.id).resolve(m.result);
        pending.delete(m.id);
      }
    };
    await new Promise((r) => (ws.onopen = r));
    await next("Page.enable");
    await next("Runtime.enable");
    await next("Emulation.setDeviceMetricsOverride", {
      width: w, height: 900, deviceScaleFactor: 1, mobile: w <= 700,
    });
    for (const route of ROUTES) {
      try {
        await next("Page.navigate", { url: base + route });
        // Wait for the app to hydrate (skeletons have no .ops-page/.public-locked
        // containers — measuring them reports skeleton-width numbers).
        for (let i = 0; i < 24; i++) {
          const ready = await next("Runtime.evaluate", {
            expression: `!!(document.querySelector('.ops-page') || document.querySelector('.public-locked') || document.querySelector('.landing-page') || document.querySelector('.recovery-404'))`,
            returnByValue: true,
          });
          if (ready.result.value === true) break;
          await sleep(400);
        }
        await sleep(600);
        await next("Runtime.evaluate", {
          expression: `(async()=>{const H=document.documentElement.scrollHeight;for(let y=0;y<=H;y+=600){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,50))}window.scrollTo(0,0);await new Promise(r=>setTimeout(r,120))})()`,
          awaitPromise: true,
        });
        const r = await next("Runtime.evaluate", {
          expression: MEASURE, returnByValue: true,
        });
        results.push({ route, width: w, ...(JSON.parse(r.result.value || "{}")) });
      } catch (err) {
        results.push({ route, width: w, error: String(err).slice(0, 80) });
      }
      process.stderr.write(".");
    }
    ws.close();
  } catch (err) {
    for (const route of ROUTES) results.push({ route, width: w, error: String(err).slice(0, 80) });
  } finally {
    proc.kill("SIGKILL");
  }
}
process.stderr.write("\n");
console.log(JSON.stringify({ label, results }, null, 1));
