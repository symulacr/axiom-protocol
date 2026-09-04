// Headless-Chrome responsive audit: real layout metrics at mobile/tablet widths.
// Usage: node responsive-audit.mjs <width> <height> <url> [screenshotPath]
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const CHROME = "/home/hoplite/.agent-browser/browsers/chrome-152.0.7977.42/chrome";
const [width, height, url, shotPath, mediaCsv] = process.argv.slice(2);

const proc = spawn(CHROME, [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  "--hide-scrollbars",
  `--window-size=${width},${height}`,
  "--remote-debugging-port=9333",
  "about:blank",
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTargetWs() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch("http://127.0.0.1:9333/json/list");
      const list = await res.json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error("chrome devtools endpoint never came up");
}

const ws = new WebSocket(await getTargetWs());
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
// Exact CSS viewport (Chrome window min is ~500px, so override after launch).
await next("Emulation.setDeviceMetricsOverride", {
  width: Number(width),
  height: Number(height),
  deviceScaleFactor: 2,
  mobile: true,
});
if (mediaCsv) {
  const features = mediaCsv.split(",").map((pair) => {
    const [name, value] = pair.split("=");
    return { name, value };
  });
  await next("Emulation.setEmulatedMedia", { features });
}
await next("Page.navigate", { url });
await sleep(4000); // SPA render settle

const evalJs = async (expr) => {
  const r = await next("Runtime.evaluate", { expression: expr, returnByValue: true });
  return r.result.value;
};

const metrics = await evalJs(`(() => {
  const de = document.documentElement;
  const h1 = document.querySelector('h1');
  return JSON.stringify({
    vw: innerWidth, vh: innerHeight,
    scrollW: de.scrollWidth, clientW: de.clientWidth,
    hOverflow: de.scrollWidth > de.clientWidth + 1,
    mobileMQ: matchMedia('(max-width: 720px)').matches,
    h1Visible: !!h1 && h1.getBoundingClientRect().height > 0,
    h1Font: h1 ? getComputedStyle(h1).fontSize : null,
    kicker: document.querySelectorAll('.eyebrow,.section-eyebrow,.p-num,.j-num,.seo-evidence-artifact').length,
    reduceMQ: matchMedia('(prefers-reduced-motion: reduce)').matches,
    revealStuck: [...document.querySelectorAll('.aw-reveal,[data-aw-reveal]')].filter(el => {
      const st = getComputedStyle(el);
      return parseFloat(st.opacity) < 0.05 && st.animationName === 'none';
    }).length,
    theme: document.documentElement.dataset.theme || document.documentElement.getAttribute('data-theme') || 'default',
    title: document.title,
  });
})()`);

console.log(`${width}x${height} ${url}`);
console.log(metrics);

if (shotPath) {
  const cap = await next("Page.captureScreenshot", { format: "png" });
  writeFileSync(shotPath, Buffer.from(cap.data, "base64"));
  console.log(`saved ${shotPath}`);
}

proc.kill("SIGTERM");
process.exit(0);
