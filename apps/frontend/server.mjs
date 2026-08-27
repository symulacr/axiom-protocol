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

// L1-M7: legacy /public-* + /features/* hub spellings → canonical short path.
const HUB_REDIRECTS = {
  "/public-agents": "/agents",
  "/public-payments": "/payments",
  "/public-proofs": "/proofs",
  "/public-storage": "/storage/0g",
  "/public-developers": "/developers",
  "/features/agents": "/agents",
  "/features/payments": "/payments",
  "/features/proofs": "/proofs",
  "/features/storage": "/storage/0g",
  "/features/developers": "/developers",
};

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
  // `{...req.headers}` is {} in Bun — it dropped x-api-key and 401'd every authed call.
  const headers = new Headers(req.headers);
  headers.set("host", upstream.host);
  headers.set("origin", target.base);
  try {
    const upstreamRes = await fetch(upstream, {
      method: req.method,
      headers,
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
        // Forward the client's Sec-WebSocket-Protocol verbatim, both ways:
        // upstream (header-path WS auth rides ["axiom", base64(token)]) and
        // back to the browser (Bun needs the response header echoed on the
        // local upgrade or ws.protocol stays "" and clients can't confirm
        // which auth path negotiated).
        const clientProtocolHeader = req.headers.get("sec-websocket-protocol");
        const clientProtocols =
          clientProtocolHeader
            ?.split(",")
            .map((p) => p.trim())
            .filter(Boolean) ?? [];
        const up = srv.upgrade(req, {
          data: {
            upstreamWs: upstreamWs.href,
            protocols: clientProtocols.length > 0 ? clientProtocols : undefined,
          },
          ...(clientProtocolHeader
            ? { headers: { "Sec-WebSocket-Protocol": clientProtocolHeader } }
            : {}),
        });
        if (!up) return new Response("Upgrade failed", { status: 400 });
        return undefined;
      }
      if (target) return await proxyHttpRequest(req, target);

      // sitemap.xml ships a placeholder origin (https://axiom.example/) in the
      // repo — rewrite <loc> URLs to the serving origin at request time so the
      // sitemap is always self-consistent wherever the app is deployed.
      // VITE_PUBLIC_ORIGIN (or PUBLIC_ORIGIN) wins for known canonical hosts.
      if (urlPath === "/sitemap.xml") {
        const file = Bun.file(DIST + "/sitemap.xml");
        if (await file.exists()) {
          const canonical =
            (process.env.VITE_PUBLIC_ORIGIN || process.env.PUBLIC_ORIGIN || "")
              .trim()
              .replace(/\/+$/, "");
          const origin = canonical || url.origin;
          const xml = (await file.text()).replaceAll(
            "https://axiom.example/",
            origin + "/",
          );
          return new Response(xml, {
            headers: { "Content-Type": "application/xml; charset=utf-8" },
          });
        }
      }

      const safePath = urlPath.replace(/^(\.\.[/\\])+/, "");

      // L1-M7: legacy /public-* + /features/* hub spellings → canonical short
      // path, before the SPA fallback (server-side mirror of routeRegistry
      // LEGACY_HUB_REDIRECTS; kept in sync by routeRegistry.hubs.test.ts).
      const hubRedirect = HUB_REDIRECTS[urlPath];
      if (hubRedirect) {
        return new Response(null, {
          status: 308,
          headers: { location: hubRedirect + url.search },
        });
      }

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
      // Bun's WebSocket client rejects subprotocols containing "," or " "
      // ("Wrong protocol for WebSocket"), but accepts a raw request header —
      // so the two-token handshake (axiom, base64(token)) is sent via the
      // headers option instead of the protocols argument.
      const upstream = new WebSocket(ws.data.upstreamWs, {
        headers: ws.data.protocols
          ? { "Sec-WebSocket-Protocol": ws.data.protocols.join(", ") }
          : undefined,
      });
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
