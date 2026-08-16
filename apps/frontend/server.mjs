// Bun-native production server for the built SPA (apps/frontend/dist).
// Ported from the node:http version: Bun.serve + Bun.file + fetch proxy.
//
//  1. Serves static files from dist/ with SPA fallback to index.html.
//  2. Reverse-proxies API traffic so the browser only talks to this origin:
//       /api/*     -> backend  (PROXY_BACKEND_URL — required in production)
//       /oracle/*  -> backend  (same proxy — the oracle is IN-PROCESS on the
//                               backend since fccbb3ec; /oracle* is forwarded
//                               with its prefix intact so backend routes
//                               /oracle/health + /oracle/v1/agents/mint match)
//     Both HTTP and WebSocket upgrades are proxied, so chat streaming works.
//
// Binds 0.0.0.0:$PORT (Railway injects PORT). dist/ resolved from this file.

const DIST = import.meta.dirname + "/dist";
const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";

function requireProxyUrl(name, fallbackDev) {
  const v = process.env[name]?.trim();
  if (v) return v;
  if (process.env.NODE_ENV === "production") {
    console.error(
      `[frontend] ${name} is required in production (no hardcoded upstreams).`,
    );
    process.exit(1);
  }
  return fallbackDev;
}

const BACKEND_URL = requireProxyUrl(
  "PROXY_BACKEND_URL",
  "http://127.0.0.1:3000",
);
// NOTE: no separate PROXY_ORACLE_URL — the oracle is in-process on the backend
// (fccbb3ec); /oracle* forwards through BACKEND_URL below.

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

function targetFor(urlPath) {
  if (urlPath.startsWith("/api/") || urlPath === "/api")
    return { base: BACKEND_URL, strip: "/api" };
  // Oracle is in-process on the backend: forward /oracle* to the SAME backend,
  // preserving the /oracle prefix (backend registers /oracle/health and
  // /oracle/v1/agents/mint — strip: "" keeps the path untouched).
  if (urlPath.startsWith("/oracle/") || urlPath === "/oracle")
    return { base: BACKEND_URL, strip: "" };
  return null;
}

// HTTP reverse proxy via fetch — decompress:false preserves raw bytes with
// Content-Encoding intact (Bun fetch auto-decompresses by default otherwise).
async function proxyHttpRequest(req, target) {
  const url = new URL(req.url);
  const upstream = new URL(
    url.pathname.replace(target.strip, "") + url.search || "/",
    target.base,
  );
  try {
    const upstreamRes = await fetch(upstream, {
      method: req.method,
      headers: { ...req.headers, host: upstream.host, origin: target.base },
      body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
      decompress: false,
      duplex: "half",
    });
    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: upstreamRes.headers,
    });
  } catch {
    return new Response("Bad gateway", { status: 502 });
  }
}

const server = Bun.serve({
  hostname: HOST,
  port: PORT,
  async fetch(req, srv) {
    const url = new URL(req.url);
    try {
      const urlPath = decodeURIComponent(url.pathname);
      const target = targetFor(urlPath);
      if (target && req.headers.get("upgrade")?.toLowerCase() === "websocket") {
        // WS reverse proxy: upgrade locally, bridge frames to the upstream
        // WebSocket (chat streaming /v1/stream).
        const upstreamWs = new URL(
          url.pathname.replace(target.strip, "") + url.search || "/",
          target.base.replace(/^http/, "ws"),
        );
        const up = srv.upgrade(req, { data: { upstreamWs: upstreamWs.href } });
        if (!up) return new Response("Upgrade failed", { status: 400 });
        return undefined;
      }
      if (target) return await proxyHttpRequest(req, target);

      const safePath = urlPath.replace(/^(\.\.[/\\])+/, "");
      const filePath = (DIST + "/" + safePath).replace(/\/+/g, "/");
      if (!filePath.startsWith(DIST + "/")) {
        return new Response("Forbidden", { status: 403 });
      }

      let file = Bun.file(filePath);
      let isSpaFallback = false;
      if (!(await file.exists())) {
        if (!filePath.includes(".")) {
          file = Bun.file(DIST + "/index.html");
          isSpaFallback = true;
        } else {
          return new Response("Not found", { status: 404 });
        }
      }
      if (!(await file.exists())) return new Response("Not found", { status: 404 });

      // MIME-type by the file actually served, not the requested path: the SPA
      // fallback rewrites /app/chat → index.html, whose ".chat" extension would
      // otherwise fall through to application/octet-stream and offer the app as
      // a download instead of rendering.
      const servedPath = isSpaFallback ? DIST + "/index.html" : filePath;
      const ext = servedPath.slice(servedPath.lastIndexOf("."));
      return new Response(file, {
        headers: {
          "Content-Type": MIME[ext] || "text/html; charset=utf-8",
          "Cache-Control":
            ext === ".html"
              ? "no-cache"
              : "public, max-age=31536000, immutable",
        },
      });
    } catch {
      return new Response("Server error", { status: 500 });
    }
  },
  websocket: {
    open(ws) {
      const upstream = new WebSocket(ws.data.upstreamWs);
      ws.data.up = upstream;
      upstream.onmessage = (e) => {
        try {
          ws.send(e.data);
        } catch { /* client gone */ }
      };
      upstream.onclose = () => {
        try { ws.close(); } catch { /* already closed */ }
      };
      upstream.onerror = () => {
        try { ws.close(); } catch { /* already closed */ }
      };
    },
    message(ws, msg) {
      try {
        if (ws.data.up?.readyState === WebSocket.OPEN) ws.data.up.send(msg);
      } catch { /* upstream gone */ }
    },
    close(ws) {
      try { ws.data.up?.close(); } catch { /* already closed */ }
    },
  },
});

console.log(
  `[frontend] Bun server on http://${HOST}:${PORT} (proxy /api->${BACKEND_URL}, /oracle->${BACKEND_URL})`,
);
