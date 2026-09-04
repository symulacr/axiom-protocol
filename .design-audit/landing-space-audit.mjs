// Landing space audit: dead-space %, ticker visibility, hero split, overlaps.
// Usage: node landing-space-audit.mjs <url>
import { spawn } from "node:child_process";

const CHROME = "/home/hoplite/.agent-browser/browsers/chrome-152.0.7977.42/chrome";
const url = process.argv[2] || "http://localhost:3000/";
const WIDTHS = [390, 768, 1024, 1440, 1920];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MEASURE = `(() => {
  const vw = innerWidth;
  const de = document.documentElement;
  const pct = (w) => Math.round(((vw - w) / vw) * 1000) / 10;
  const box = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x) };
  };
  const sections = {};
  for (const [name, sel] of [
    ["heroMain", ".landing-main"], ["ticker", ".ticker"],
    ["principles", ".principles-section"], ["journey", ".journey-section"],
    ["footer", ".landing-footer"],
  ]) {
    const b = box(sel);
    if (b) sections[name] = { ...b, sideSpacePct: pct(b.w) };
  }
  const tickerEl = document.querySelector(".ticker");
  let ticker = null;
  if (tickerEl) {
    const items = [...document.querySelectorAll(".ticker-item")];
    const inView = items.filter((it) => {
      const r = it.getBoundingClientRect();
      return r.width > 0 && r.right > 0 && r.left < vw;
    }).length;
    ticker = {
      h: Math.round(tickerEl.getBoundingClientRect().height),
      display: getComputedStyle(tickerEl).display,
      itemsTotal: items.length, itemsInView: inView,
      labelVisible: (() => {
        const l = document.querySelector(".ticker-label");
        return !!l && l.getBoundingClientRect().width > 0;
      })(),
    };
  }
  const hero = {
    copy: box(".landing-copy"), visual: box(".landing-visual"),
    poster: box(".hero-visual-poster"), receipt: box(".floating-receipt"),
    caption: box(".hero-caption"),
  };
  const inter = (a, b) => {
    if (!a || !b) return null;
    const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return overlapX > 2 && overlapY > 2 ? { x: Math.round(overlapX), y: Math.round(overlapY) } : null;
  };
  const rct = (sel) => {
    const el = document.querySelector(sel);
    return el ? el.getBoundingClientRect() : null;
  };
  const overlaps = {
    captionVsReceipt: inter(rct(".hero-caption"), rct(".floating-receipt")),
    cardTextSpill: [...document.querySelectorAll(".journey-card, .principle")].map((card) => {
      const cr = card.getBoundingClientRect();
      const spill = [...card.querySelectorAll("h3, h4, p, strong, .j-cta")].filter((t) => {
        const tr = t.getBoundingClientRect();
        return tr.width > 0 && (tr.left < cr.left - 1 || tr.right > cr.right + 1);
      }).length;
      return { cls: String(card.className).slice(0, 18), spill };
    }).filter((c) => c.spill > 0),
  };
  return JSON.stringify({
    vw, hOverflow: de.scrollWidth > de.clientWidth + 1,
    sections, ticker, hero, overlaps,
  });
})()`;

const results = [];
for (const w of WIDTHS) {
  const port = 9340 + w;
  const udd = `/tmp/space-audit-${process.pid}-${w}`;
  const proc = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
    `--window-size=${w},900`, `--remote-debugging-port=${port}`,
    `--user-data-dir=${udd}`, "about:blank",
  ]);
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
    const ws = new WebSocket(target);
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
    await next("Page.navigate", { url });
    await sleep(4000);
    // scroll through to settle reveals
    await next("Runtime.evaluate", {
      expression: `(async()=>{const H=document.documentElement.scrollHeight;for(let y=0;y<=H;y+=500){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,80))}window.scrollTo(0,0);await new Promise(r=>setTimeout(r,200))})()`,
      awaitPromise: true,
    });
    const r = await next("Runtime.evaluate", {
      expression: MEASURE, returnByValue: true,
    });
    results.push({ width: w, data: JSON.parse(r.result.value) });
    ws.close();
  } finally {
    proc.kill("SIGTERM");
  }
}
console.log(JSON.stringify(results, null, 1));
