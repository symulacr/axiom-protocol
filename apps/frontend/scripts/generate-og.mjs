// P4 og-image generator — renders the v2-styled Open Graph card as a raster
// (1200×630 JPEG) with the repository's headless chromium via playwright-core.
// No new dependencies (playwright-core is already a dev dep for e2e).
//
// Design: the v2 copper/graphite language — graphite #111315 ground, copper
// rule + seal (the favicon's ring), phosphor accent, Syne display wordmark,
// JetBrains Mono eyebrow. Matches index.html's og:title/description.
//
// Run standalone: bun scripts/generate-og.mjs
// Wired into build.mjs as an optional step (skips with a note when no
// chromium is available — the committed JPEG stays in place).
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendDir = join(scriptDir, "..");
const outPath = join(frontendDir, "public", "brand", "og-1200.jpg");

// The playwright-core shipped in the repo's bun store (file:// import keeps
// this independent of any global install).
const playwrightCoreCandidates = [
  join(
    frontendDir,
    "..",
    "..",
    "node_modules",
    ".bun",
    "playwright-core@1.62.1",
    "node_modules",
    "playwright-core",
    "index.mjs",
  ),
];

const chromiumCandidates = [
  process.env.AXIOM_OG_CHROMIUM,
  join(
    process.env.HOME ?? "",
    ".cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell",
  ),
].filter(Boolean);

async function loadPlaywright() {
  for (const candidate of playwrightCoreCandidates) {
    if (existsSync(candidate)) {
      return import(`file://${candidate}`);
    }
  }
  // Fallback: any resolvable playwright-core (e.g. run from the workspace).
  try {
    return await import("playwright-core");
  } catch {
    return null;
  }
}

const HTML = `<!doctype html>
<html><head><meta charset="utf-8" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=JetBrains+Mono:wght@500;700&display=swap" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body {
    background:
      radial-gradient(900px 480px at 82% -10%, rgba(210,139,82,.16), transparent 60%),
      radial-gradient(700px 420px at -8% 110%, rgba(103,232,180,.07), transparent 55%),
      #111315;
    color: #ece9de;
    font-family: 'Syne', 'Segoe UI', sans-serif;
    position: relative;
  }
  .rail { position: absolute; left: 64px; top: 84px; bottom: 84px; width: 3px;
    background: linear-gradient(180deg, transparent, #d28b52 12%, #d28b52 88%, transparent); }
  .eyebrow { font: 700 15px/1 'JetBrains Mono', monospace; letter-spacing: .34em;
    color: #998d7d; text-transform: uppercase; }
  h1 { margin-top: 26px; font: 800 88px/0.95 'Syne', sans-serif; letter-spacing: -.045em; }
  h1 em { font-style: normal; color: #e6aa78; }
  .sub { margin-top: 30px; max-width: 640px; color: #cfc4b5;
    font: 400 24px/1.5 'JetBrains Mono', monospace; }
  .sub b { color: #67e8b4; font-weight: 500; }
  .seal { position: absolute; right: 84px; top: 50%; transform: translateY(-50%);
    width: 300px; height: 300px; }
  .brand { position: absolute; left: 64px; bottom: 56px; display: flex; gap: 12px;
    align-items: baseline; color: #f0ece1; font: 800 26px 'Syne', sans-serif; letter-spacing: .08em; }
  .brand small { color: #998d7d; font: 700 13px 'JetBrains Mono', monospace; letter-spacing: .18em; }
</style></head>
<body>
  <div class="rail"></div>
  <div style="position:absolute; left:112px; top:120px; right:430px;">
    <div class="eyebrow">Axiom · Own an AI agent on-chain</div>
    <h1>Own an AI agent.<br /><em>With proof.</em></h1>
    <div class="sub">Mint, fund, run, and transfer agents — data re-sealed for each new owner. <b>Real state, visible at all times.</b></div>
  </div>
  <svg class="seal" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="60" cy="60" r="46" stroke="#d28b52" stroke-width="2.5" opacity=".9"/>
    <circle cx="60" cy="60" r="34" stroke="#d28b52" stroke-width="1" opacity=".35"/>
    <circle cx="60" cy="60" r="15" fill="#67e8b4" opacity=".9"/>
    <circle cx="60" cy="60" r="24" stroke="#67e8b4" stroke-width="1" opacity=".4"/>
    <path d="M60 6 v14 M60 100 v14 M6 60 h14 M100 60 h14" stroke="#998d7d" stroke-width="1.5" opacity=".6"/>
  </svg>
  <div class="brand">AXIOM <small>ERC-7857 · VAULTS · RECEIPTS</small></div>
</body></html>`;

const playwright = await loadPlaywright();
if (!playwright) {
  console.log(
    "[og-image] playwright-core not found — keeping the committed og-1200.jpg",
  );
  process.exit(0);
}

let browser = null;
try {
  browser = await playwright.chromium.launch({ args: ["--no-sandbox"] });
} catch {
  for (const executablePath of chromiumCandidates) {
    if (!existsSync(executablePath)) continue;
    try {
      browser = await playwright.chromium.launch({
        executablePath,
        args: ["--no-sandbox"],
      });
      break;
    } catch {
      // try the next candidate
    }
  }
}
if (!browser) {
  console.log(
    "[og-image] no usable chromium — keeping the committed og-1200.jpg",
  );
  process.exit(0);
}

try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(HTML, { waitUntil: "networkidle" });
  // Fonts settle after networkidle on slow links; give the swap one beat.
  await page.evaluate(() => document.fonts.ready);
  const jpeg = await page.screenshot({
    type: "jpeg",
    quality: 82,
    clip: { x: 0, y: 0, width: 1200, height: 630 },
  });
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, jpeg);
  console.log(`[og-image] wrote ${outPath} (${(jpeg.length / 1024).toFixed(0)} kB)`);
} finally {
  await browser.close();
}
