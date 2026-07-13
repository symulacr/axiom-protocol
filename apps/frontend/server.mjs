// Dependency-free production server for the built SPA (apps/frontend/dist).
//
//  1. Serves static files from dist/ with SPA fallback to index.html.
//  2. Reverse-proxies API traffic so the browser only ever talks to this
//     server's own origin (no CORS, works behind Railway/Vercel):
//       /api/*     -> backend  (PROXY_BACKEND_URL, default live backend)
//       /oracle/*  -> oracle   (PROXY_ORACLE_URL,  default live oracle)
//     Both HTTP and WebSocket upgrades are proxied, so chat streaming works.
//
// Binds 0.0.0.0:$PORT (Railway injects PORT). Path to dist is resolved from
// this file's location so it works regardless of the process cwd.
import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import net from "node:net";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, "dist");
const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";

const BACKEND_URL =
  process.env.PROXY_BACKEND_URL ||
  "https://axiom-backend-production-7bfc.up.railway.app";
const ORACLE_URL =
  process.env.PROXY_ORACLE_URL ||
  "https://oracle-production-9f7d.up.railway.app";

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
};

async function tryFile(p) {
  try {
    const s = await stat(p);
    if (s.isFile()) return p;
  } catch {
    /* not found */
  }
  return null;
}

function targetFor(urlPath) {
  if (urlPath.startsWith("/api/") || urlPath === "/api")
    return { base: BACKEND_URL, strip: "/api" };
  if (urlPath.startsWith("/oracle/") || urlPath === "/oracle")
    return { base: ORACLE_URL, strip: "/oracle" };
  return null;
}

function proxyHttpRequest(req, res, target) {
  const upstream = new URL(
    req.url.replace(target.strip, "") || "/",
    target.base,
  );
  const options = {
    method: req.method,
    headers: { ...req.headers, host: upstream.host, origin: target.base },
  };
  const proxyReq = https.request(upstream, options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on("error", () => {
    if (!res.headersSent) res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("Bad gateway");
  });
  req.pipe(proxyReq);
}

function proxyUpgrade(req, clientSocket, head, target) {
  const upstream = new URL(
    req.url.replace(target.strip, "") || "/",
    target.base,
  );
  const socket = tls.connect(
    { host: upstream.hostname, port: upstream.port || 443, servername: upstream.hostname },
    () => {
      const lines = [
        `${req.method} ${upstream.pathname}${upstream.search} HTTP/1.1`,
        `Host: ${upstream.host}`,
        `Connection: Upgrade`,
        `Upgrade: websocket`,
        `Sec-WebSocket-Version: ${req.headers["sec-websocket-version"] || "13"}`,
      ];
      if (req.headers["sec-websocket-key"])
        lines.push(`Sec-WebSocket-Key: ${req.headers["sec-websocket-key"]}`);
      if (req.headers["sec-websocket-protocol"])
        lines.push(`Sec-WebSocket-Protocol: ${req.headers["sec-websocket-protocol"]}`);
      lines.push(`Origin: ${target.base}`);
      lines.push("");
      lines.push("");
      socket.write(lines.join("\r\n"));
      if (head && head.length) socket.write(head);
    },
  );
  socket.on("data", (d) => clientSocket.write(d));
  clientSocket.on("data", (d) => socket.write(d));
  socket.on("end", () => clientSocket.end());
  clientSocket.on("end", () => socket.end());
  socket.on("error", () => clientSocket.destroy());
  clientSocket.on("error", () => socket.destroy());
}

const server = http.createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    const target = targetFor(urlPath);
    if (target) {
      proxyHttpRequest(req, res, target);
      return;
    }

    const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
    const filePath = path.join(DIST, safePath);
    if (!filePath.startsWith(DIST)) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Forbidden");
      return;
    }

    let resolved = await tryFile(filePath);
    if (!resolved && !path.extname(safePath)) {
      resolved = await tryFile(path.join(DIST, "index.html"));
    }
    if (!resolved) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(resolved);
    const data = await readFile(resolved);
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control":
        ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
    });
    res.end(data);
  } catch {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Server error");
  }
});

server.on("upgrade", (req, clientSocket, head) => {
  const urlPath = (req.url || "/").split("?")[0];
  const target = targetFor(urlPath);
  if (!target) {
    clientSocket.destroy();
    return;
  }
  proxyUpgrade(req, clientSocket, head, target);
});

server.listen(PORT, HOST, () => {
  console.log(
    `Frontend server listening on http://${HOST}:${PORT} (proxy /api->${BACKEND_URL}, /oracle->${ORACLE_URL})`,
  );
});
