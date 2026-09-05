#!/usr/bin/env node
/*
  R27 theme sweep — every route × dark/light: effective-background contrast
  audit of all visible text. Sets localStorage["axiom-ui-settings"].theme and
  reloads per cell (the index.html boot + App bridge make body.light /
  html[data-theme] deterministic). OKLCH values are converted to sRGB in JS.
  Flags: ratio < 4.5 for body text, < 3.0 for large text (>=24px, or >=18.66px
  bold). Also probes two open states on the landing: guide modal + wallet
  popover.
*/
import { spawn } from "node:child_process";

const CHROME = "/home/hoplite/.agent-browser/browsers/chrome-152.0.7977.42/chrome";
const BASE = "http://localhost:3000";
const WIDTH = 1440;
const ROUTES = [
  "/", "/app", "/chat", "/transactions", "/storage", "/mint", "/payment",
  "/transfer", "/tick", "/deposit", "/withdraw", "/settings", "/staking",
  "/agents/3", "/transfer/co-sign", "/hub/proof", "/nonexistent-route",
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const port = 9551;
const proc = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  `--window-size=${WIDTH},2000`, `--remote-debugging-port=${port}`,
  `--user-data-dir=/tmp/theme-sweep-${process.pid}`, "about:blank",
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
  (await next("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result?.value;
await new Promise((r) => (ws.onopen = r));
await next("Page.enable");
await next("Runtime.enable");
await next("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: 2000, deviceScaleFactor: 1, mobile: false });

const AUDIT_FN = `(() => {
  // oklch → sRGB (Björn Ottosson's OKLab → linear sRGB → gamma).
  function oklchToSrgb(L, C, H) {
    const h = H * Math.PI / 180;
    const a = C * Math.cos(h), b = C * Math.sin(h);
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
    let r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    let bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
    const gam = (v) => v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055;
    return [gam(r), gam(g), gam(bb)].map((v) => Math.min(1, Math.max(0, v)));
  }
  function parseColor(raw) {
    if (!raw) return null;
    let m = raw.match(/rgba?\\(([^)]+)\\)/);
    if (m) {
      const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number);
      return { r: p[0] / 255, g: p[1] / 255, b: p[2] / 255, a: p.length > 3 ? p[3] : 1 };
    }
    m = raw.match(/color\\(srgb ([\\d.]+) ([\\d.]+) ([\\d.]+)(?: \\/ ([\\d.]+))?\\)/);
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 };
    m = raw.match(/oklch\\(([\\d.]+)%? ([\\d.]+) ([\\d.]+)(?: \\/ ([\\d.]+))?\\)/);
    if (m) {
      const [r, g, b] = oklchToSrgb(+m[1] / (raw.includes('%') ? 100 : 1), +m[2], +m[3]);
      return { r, g, b, a: m[4] !== undefined ? +m[4] : 1 };
    }
    m = raw.match(/#([0-9a-f]{6}|[0-9a-f]{3})/i);
    if (m) {
      const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
      return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255, a: 1 };
    }
    return null;
  }
  const lum = (c) => {
    const f = (v) => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  function bgChain(el) {
    // composite alphas up to the first opaque ancestor, over html bg
    const layers = [];
    let node = el;
    while (node && node !== document.documentElement) {
      const cs = getComputedStyle(node);
      const bg = parseColor(cs.backgroundColor);
      if (bg && bg.a > 0) layers.push(bg);
      if (bg && bg.a >= 1) break;
      node = node.parentElement;
    }
    const rootBg = parseColor(getComputedStyle(document.documentElement).backgroundColor)
      || { r: 0.043, g: 0.055, b: 0.06, a: 1 };
    let acc = rootBg;
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i];
      acc = {
        r: l.r * l.a + acc.r * (1 - l.a),
        g: l.g * l.a + acc.g * (1 - l.a),
        b: l.b * l.a + acc.b * (1 - l.a),
        a: 1,
      };
    }
    return acc;
  }
  const sel = 'h1,h2,h3,h4,p,span,strong,small,button,a,td,th,li,label,kbd,code,dt,dd';
  const seen = new Set();
  const fails = [];
  const els = [...document.querySelectorAll(sel)];
  let checked = 0;
  for (const el of els) {
    if (seen.size > 260) break;
    const text = (el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
      ? el.textContent.trim().slice(0, 26) : null;
    if (!text) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) continue;
    const key = el.className + '|' + text;
    if (seen.has(key)) continue;
    seen.add(key);
    const cs = getComputedStyle(el);
    const fg = parseColor(cs.color);
    if (!fg || fg.a < 0.9) continue;
    const bg = bgChain(el);
    const cr = ratio(fg, bg);
    const size = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const min = large ? 3.0 : 4.5;
    checked++;
    if (cr < min) {
      fails.push({
        cls: String(el.className).slice(0, 30) || el.tagName.toLowerCase(),
        text, cr: Math.round(cr * 10) / 10, size,
        fg: cs.color.slice(0, 30), theme: document.body.classList.contains('light') ? 'L' : 'D',
      });
    }
  }
  return JSON.stringify({ checked, fails: fails.slice(0, 8) });
})()`;

const results = [];
for (const theme of ["dark", "light"]) {
  // One warm-up navigation to the origin sets the theme before the route
  // pass — no double navigation per cell.
  await next("Page.navigate", { url: BASE + "/" });
  await sleep(400);
  await evalJs(`localStorage.setItem('axiom-ui-settings', JSON.stringify({ theme: '${theme}' }))`);
  for (const route of ROUTES) {
    try {
      await next("Page.navigate", { url: BASE + route });
      // settle: app shell present (an error page means the server died)
      let settled = false;
      for (let i = 0; i < 24; i++) {
        settled = await evalJs(`!!(document.querySelector('.ops-page') || document.querySelector('.public-locked') || document.querySelector('.landing-page') || document.querySelector('.recovery-404') || document.querySelector('.session-settling') || document.querySelector('.operator-preferences'))`);
        if (settled === true) break;
        await sleep(250);
      }
      if (settled !== true) throw new Error("app shell absent (server down?)");
      // wait for the theme bridge to apply body.light
      for (let i = 0; i < 12; i++) {
        const applied = await evalJs(`document.body.classList.contains('light') === ${theme === "light"}`);
        if (applied === true) break;
        await sleep(200);
      }
      await sleep(500);
      const audit = JSON.parse((await evalJs(AUDIT_FN)) ?? '{"checked":0,"fails":[]}');
      results.push({ theme, route, ...audit });
    } catch (e) {
      results.push({ theme, route, error: String(e).slice(0, 80) });
    }
  }
}
// open states on the landing: guide + wallet popover, per theme
for (const theme of ["dark", "light"]) {
  for (const state of ["guide", "wallet"]) {
    try {
      await next("Page.navigate", { url: BASE + "/" });
      await sleep(150);
      await evalJs(`localStorage.setItem('axiom-ui-settings', JSON.stringify({ theme: '${theme}' }))`);
      await next("Page.navigate", { url: BASE + "/" });
      for (let i = 0; i < 14; i++) {
        const applied = await evalJs(`document.body.classList.contains('light') === ${theme === "light"}`);
        if (applied === true) break;
        await sleep(250);
      }
      await sleep(600);
      await evalJs(state === "guide"
        ? `document.querySelector('.button-row .button-ghost')?.click(); 'ok'`
        : `document.querySelector('.nav-connect')?.click(); 'ok'`);
      await sleep(900);
      const stateOpen = await evalJs(state === "guide"
        ? `!!document.querySelector('.guide-card')`
        : `!!document.querySelector('.wallet-gate')`);
      if (stateOpen !== true) throw new Error("state did not open");
      const audit = JSON.parse((await evalJs(AUDIT_FN)) ?? '{"checked":0,"fails":[]}');
      results.push({ theme, route: `(${state} open)`, ...audit });
    } catch (e) {
      results.push({ theme, route: `(${state} open)`, error: String(e).slice(0, 80) });
    }
  }
}
ws.close();
proc.kill();

let bad = 0;
for (const r of results) {
  if (r.error) { console.log(`✗ ${r.theme.padEnd(5)} ${r.route.padEnd(20)} ERROR ${r.error}`); bad++; continue; }
  if (r.fails.length) {
    bad++;
    console.log(`✗ ${r.theme.padEnd(5)} ${r.route.padEnd(20)} ${r.fails.length} low-contrast of ${r.checked}`);
    for (const f of r.fails) console.log(`      [${f.cr}] ${f.cls.padEnd(26)} "${f.text}" ${f.fg}`);
  } else {
    console.log(`✓ ${r.theme.padEnd(5)} ${r.route.padEnd(20)} ${r.checked} text nodes clean`);
  }
}
console.log(`\n${results.length - bad}/${results.length} cells clean`);
