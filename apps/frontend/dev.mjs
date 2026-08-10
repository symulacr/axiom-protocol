// Bun-native dev server for the frontend (replaces `vite dev`).
//  - Serves src/index.html as the entry with the module graph built on demand
//    by Bun.build in "development" mode (no watch daemon needed — Bun caches)
//  - Proxies /api -> backend (:3000) and /oracle -> oracle (:8787), same-origin
//    so the browser never needs hardcoded localhost URLs (mirrors prod server)
//  - Hot reload via `bun --hot run dev.mjs` (the runtime reloads on file change)
import { serve } from "bun";
import { join } from "node:path";

const frontendDir = import.meta.dirname;
const BACKEND = process.env.PROXY_BACKEND_URL ?? "http://127.0.0.1:3000";
const ORACLE = process.env.PROXY_ORACLE_URL ?? "http://127.0.0.1:8787";
const PORT = Number(process.env.PORT) || 5173;

// Dev build of the entry (no minify, sourcemaps, per-file chunks) served from
// an in-memory build. `bun --hot` restarts this module on source change.
const build = await Bun.build({
	entrypoints: [join(frontendDir, "index.html")],
	outdir: join(frontendDir, "dist-dev"),
	target: "browser",
	splitting: true,
	sourcemap: "inline",
	define: {
		"import.meta.env.MODE": JSON.stringify("development"),
		"import.meta.env": JSON.stringify({ MODE: "development" }),
		...Object.fromEntries(
			Object.entries(process.env)
				.filter(([k]) => k.startsWith("VITE_"))
				.map(([k, v]) => [`import.meta.env.${k}`, JSON.stringify(v)]),
		),
	},
});
if (!build.success) {
	for (const log of build.logs) console.error(log);
	process.exit(1);
}

const distDev = join(frontendDir, "dist-dev");

const server = serve({
	port: PORT,
	async fetch(req) {
		const url = new URL(req.url);
		// Same-origin API proxy (mirrors prod /api -> backend, /oracle -> oracle).
		if (url.pathname.startsWith("/api")) {
			const upstream = new URL(url.pathname.slice(4) + url.search, BACKEND);
			return fetch(upstream, {
				method: req.method,
				headers: req.headers,
				body:
					req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
				duplex: "half",
			});
		}
		if (url.pathname.startsWith("/oracle")) {
			const upstream = new URL(url.pathname.slice(7) + url.search, ORACLE);
			return fetch(upstream, {
				method: req.method,
				headers: req.headers,
				body:
					req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
				duplex: "half",
			});
		}
		// Static from dist-dev (built on start), SPA fallback to index.html.
		const path = url.pathname === "/" ? "/index.html" : url.pathname;
		const file = Bun.file(join(distDev, path));
		if (await file.exists()) return new Response(file);
		const index = Bun.file(join(distDev, "index.html"));
		return new Response(index);
	},
});

console.log(
	`[frontend] dev server on http://localhost:${PORT} (bun native, proxies /api -> ${BACKEND}, /oracle -> ${ORACLE})`,
);
