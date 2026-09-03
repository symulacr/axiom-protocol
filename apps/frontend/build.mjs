// Bun-native production build for the frontend (replaces `vite build`).
//  - Bundles index.html → dist/ with JS/CSS extraction + code splitting
//  - Inlines every VITE_* var from the repo-root .env as import.meta.env
//  - Copies public/ static assets into dist/
import { cp, mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const frontendDir = import.meta.dirname;
const repoRoot = resolve(frontendDir, "../..");

// Load VITE_* from root .env (single source of truth; Vite's envDir is gone).
// A missing .env is fine — every VITE_* has a runtime default in src/config.
let envSrc = "";
try {
  envSrc = await readFile(join(repoRoot, ".env"), "utf8");
} catch {
  envSrc = "";
}
const define = {};
for (const line of envSrc.split("\n")) {
	const key = /^VITE_[A-Z_]+(?==)/.exec(line)?.[0];
	if (!key) continue;
	define[`import.meta.env.${key}`] = JSON.stringify(line.slice(key.length + 1));
}
// Library dev-asserts check MODE !== "production" (wagmi) and guard on bare
// `import.meta.env` truthiness. Define both.
define["import.meta.env.MODE"] = JSON.stringify("production");
define["import.meta.env"] = JSON.stringify({ MODE: "production" });
// React/wagmi CJS dev builds branch on process.env.NODE_ENV — without this the
// full development React (dev warnings, no prod optimizations) ships to prod.
define["process.env.NODE_ENV"] = JSON.stringify("production");

const dist = join(frontendDir, "dist");
await Bun.$`rm -rf ${dist}`.quiet();

const t0 = performance.now();
const build = await Bun.build({
	entrypoints: [join(frontendDir, "index.html")],
	outdir: dist,
	target: "browser",
	minify: true,
	splitting: true,
	sourcemap: "none",
	plugins: [],
	define,
	// Absolute chunk URLs: built index.html is served from any route depth
	// (SPA fallback), and relative "./chunk-…" URLs break at ≥2-segment paths
	// (document base becomes /app/, chunks resolve to /app/chunk-… → 404).
	publicPath: "/",
});
if (!build.success) {
	for (const log of build.logs) console.error(log);
	process.exit(1);
}

// Copy public/ static assets (brand images, og-1200.jpg).
await mkdir(dist, { recursive: true });
await cp(join(frontendDir, "public"), dist, { recursive: true });

console.log(
	`built ${build.outputs.length} files to dist/ in ${((performance.now() - t0) / 1000).toFixed(2)}s`,
);
