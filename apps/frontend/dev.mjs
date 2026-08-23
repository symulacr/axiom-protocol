// Bun-native dev server for the frontend (replaces `vite dev`).
//  - Serves src/index.html as the entry with the module graph built on demand
//    by Bun.build in "development" mode (no watch daemon needed — Bun caches)
//  - Proxies /api -> backend (:3000) and /oracle -> backend (:3000, in-process
//    oracle since fccbb3ec — same-origin so the browser never needs hardcoded
//    localhost URLs, mirrors prod server)
//  - Hot reload via `bun --hot run dev.mjs` (the runtime reloads on file change)
import { serve } from "bun";
import { join, resolve } from "node:path";
import { readFile } from "node:fs/promises";

const frontendDir = import.meta.dirname;
const BACKEND = process.env.PROXY_BACKEND_URL ?? "http://127.0.0.1:3000";
const PORT = Number(process.env.PORT) || 5173;

// VITE_* from the repo-root .env (single source of truth, same as build.mjs)
// with shell-exported VITE_* taking precedence for one-off overrides. Without
// this the dev build silently fell back to wagmi's mainnet default while the
// backend/contracts target the env-selected chain.
let rootViteVars = {};
try {
  const envSrc = await readFile(resolve(frontendDir, "../../.env"), "utf8");
  for (const line of envSrc.split("\n")) {
    const key = /^VITE_[A-Z_]+(?==)/.exec(line)?.[0];
    if (key) rootViteVars[key] = line.slice(key.length + 1);
  }
} catch {
  // no root .env — dev runs on explicit process.env only
}
const viteDefines = Object.fromEntries(
  Object.entries({ ...rootViteVars, ...process.env })
    .filter(([k]) => k.startsWith("VITE_"))
    .map(([k, v]) => [`import.meta.env.${k}`, JSON.stringify(v)]),
);

// Dev build of the entry (no minify, sourcemaps, per-file chunks) written to
// disk in dist-dev/. `bun --hot` restarts this module on source change.
const build = await Bun.build({
  entrypoints: [join(frontendDir, "index.html")],
  outdir: join(frontendDir, "dist-dev"),
  target: "browser",
  splitting: true,
  publicPath: "/",
  sourcemap: "inline",
  define: {
    "import.meta.env.MODE": JSON.stringify("development"),
    "import.meta.env": JSON.stringify({ MODE: "development" }),
    ...viteDefines,
  },
});
if (!build.success) {
  for (const log of build.logs) console.error(log);
  process.exit(1);
}

const distDev = join(frontendDir, "dist-dev");

serve({
  port: PORT,
  async fetch(req) {
    try {
      const url = new URL(req.url);
      // Same-origin API proxy (mirrors prod /api -> backend, /oracle -> backend).
      if (url.pathname.startsWith("/api")) {
        const upstream = new URL(url.pathname.slice(4) + url.search, BACKEND);
        // Buffer the request body: streaming req.body through with duplex
        // "half" truncates chunked upstream responses in some Bun versions
        // (the browser saw 200 + an unreadable body on transfer finalization).
        const body =
          req.method === "GET" || req.method === "HEAD"
            ? undefined
            : await req.arrayBuffer();
        // Force identity encoding: Bun's fetch re-adds its own
        // accept-encoding when the header is absent, and compressed chunked
        // upstream responses get mangled by this proxy (browser-only
        // "Failed to fetch"). Compression still happens end-to-end in
        // production where express serves dist directly.
        const headers = new Headers(req.headers);
        headers.set("accept-encoding", "identity");
        return fetch(upstream, {
          method: req.method,
          headers,
          body,
        });
      }
      if (url.pathname.startsWith("/oracle")) {
        // In-process oracle on the backend: forward /oracle* unchanged
        // (backend registers /oracle/health + /oracle/v1/agents/mint).
        const upstream = new URL(url.pathname + url.search, BACKEND);
        const headers = new Headers(req.headers);
        headers.delete("accept-encoding");
        const body =
          req.method === "GET" || req.method === "HEAD"
            ? undefined
            : await req.arrayBuffer();
        return fetch(upstream, {
          method: req.method,
          headers,
          body,
        });
      }
    // Static from dist-dev (built on start), then public/ (brand images,
    // robots.txt, sitemap.xml — not part of the module graph), SPA fallback.
    const path = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = Bun.file(join(distDev, path));
    if (await file.exists()) return new Response(file);
    const publicFile = Bun.file(join(frontendDir, "public", path));
    if (await publicFile.exists()) {
      return new Response(publicFile, {
        headers: { "cache-control": "no-cache" },
      });
    }
    const index = Bun.file(join(distDev, "index.html"));
    return new Response(index);
    } catch {
      return new Response("Server error", { status: 500 });
    }
  },
});

console.log(
  `[frontend] dev server on http://localhost:${PORT} (bun native, proxies /api -> ${BACKEND}, /oracle -> ${BACKEND})`,
);
