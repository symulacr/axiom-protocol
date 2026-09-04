// better-layout growth audit: render the REAL German copy (from lib/copy.ts)
// into the live landing DOM, then measure overflow at mobile/desktop widths.
// Usage: bun .design-audit/locale-growth.ts <width> <height> <url>
import { spawn } from "node:child_process";
import { getCopy } from "../apps/frontend/src/lib/copy.ts";

const CHROME = "/home/hoplite/.agent-browser/browsers/chrome-152.0.7977.42/chrome";
const [width, height, url] = process.argv.slice(2);

// Parallel-order leaf flattening: en/de objects share identical key shape.
const pairs: Record<string, string> = {};
const flatten = (en: unknown, de: unknown) => {
  if (typeof en === "string" && typeof de === "string") {
    if (en !== de) pairs[en] = de;
    return;
  }
  if (en && de && typeof en === "object" && typeof de === "object") {
    for (const k of Object.keys(en)) flatten((en as any)[k], (de as any)[k]);
  }
};
flatten(getCopy("en"), getCopy("de"));

const proc = spawn(CHROME, [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  "--hide-scrollbars",
  `--user-data-dir=/tmp/aw-growth-${process.pid}`,
  `--window-size=${width},${height}`,
  "--remote-debugging-port=9334",
  "about:blank",
]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const getTargetWs = async () => {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch("http://127.0.0.1:9334/json/list")).json();
      const page = list.find((t: any) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error("chrome devtools endpoint never came up");
};
const ws = new WebSocket(await getTargetWs());
let id = 0;
const pending = new Map();
const next = (method: string, params: any = {}) =>
  new Promise((resolve, reject) => {
    const msg = { id: ++id, method, params };
    pending.set(msg.id, { resolve, reject });
    ws.send(JSON.stringify(msg));
  });
ws.onmessage = (ev: any) => {
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
  width: Number(width),
  height: Number(height),
  deviceScaleFactor: 2,
  mobile: true,
});
await next("Page.navigate", { url });
await sleep(4000);

const evalJs = async (expr: string) => {
  const r = await next("Runtime.evaluate", { expression: expr, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result.value;
};

// 1) Swap every matching English text node for its real German string.
const swapped = await evalJs(`(() => {
  const pairs = ${JSON.stringify(pairs)};
  let n = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const key = (node.nodeValue || "").trim();
    if (key && pairs[key]) {
      node.nodeValue = String(node.nodeValue).replace(key, pairs[key]);
      n++;
    }
  }
  return n;
})()`);

// 2) Measure overflow caused by the German strings.
const report = await evalJs(`(() => {
  const de = document.documentElement;
  const vw = innerWidth;
  const clipped = [];
  for (const el of document.querySelectorAll('button,a,input,select,h1,h2,h3,p,li,span,code')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    const textClip = el.scrollWidth > el.clientWidth + 2;
    const edgeClip = r.right > vw + 1 || r.left < -1;
    if (textClip || edgeClip) {
      clipped.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '').toString().slice(0, 40),
        textClip,
        edgeClip,
        nowrap: cs.whiteSpace === 'nowrap',
        scrollW: el.scrollWidth,
        clientW: el.clientWidth,
        text: (el.textContent || '').trim().slice(0, 40),
      });
    }
  }
  return JSON.stringify({
    vw,
    docOverflow: de.scrollWidth > de.clientWidth + 1,
    scrollW: de.scrollWidth,
    clientW: de.clientWidth,
    clippedCount: clipped.length,
    clipped: clipped.slice(0, 12),
  });
})()`);

console.log(`${width}x${height} ${url}`);
console.log(`swapped text nodes: ${swapped}`);
console.log(report);
proc.kill("SIGTERM");
process.exit(0);
