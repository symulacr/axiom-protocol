// Bun-native production build for the frontend (replaces `vite build`).
//  - Bundles index.html → dist/ with JS/CSS extraction + code splitting
//  - Inlines every VITE_* var from the repo-root .env as import.meta.env
//  - Copies public/ static assets into dist/
import { cp, mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const frontendDir = import.meta.dirname;
const repoRoot = resolve(frontendDir, "../..");

// Load VITE_* from root .env (single source of truth; Vite's envDir is gone).
// VITE_* values are public by design (they ship in the browser bundle), so the
// gitignored .env.secrets-local may carry the real ones (browser API key,
// WalletConnect project id) that must never be committed to the tracked .env
// template; it layers over .env. Shell/CI/Vercel-exported VITE_*
// (process.env) take final precedence, mirroring dev.mjs.
// Missing files are fine — every VITE_* has a runtime default in src/config.
const envFileVars = {};
for (const rel of [".env", ".env.secrets-local"]) {
  let envSrc = "";
  try {
    envSrc = await readFile(join(repoRoot, rel), "utf8");
  } catch {
    continue;
  }
  for (const line of envSrc.split("\n")) {
	const key = /^VITE_[A-Z_]+(?==)/.exec(line)?.[0];
	if (!key) continue;
	envFileVars[key] = line.slice(key.length + 1);
  }
}
function pickViteEnv(source) {
	const out = {};
	for (const [key, value] of Object.entries(source)) {
		if (key.startsWith("VITE_") && value !== undefined && value !== "") out[key] = value;
	}
	return out;
}
const define = {};
for (const [key, value] of Object.entries({ ...envFileVars, ...pickViteEnv(process.env) })) {
	define[`import.meta.env.${key}`] = JSON.stringify(value);
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
