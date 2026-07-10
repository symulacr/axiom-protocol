#!/usr/bin/env node
// contrast-budget.mjs — WCAG contrast guard for Axiom frontend design tokens.
//
// Parses src/styles/index.css, resolves each theme scope's custom properties
// (following var() references), and asserts the required foreground/background
// token pairs meet WCAG 2.1 AA thresholds:
//   • >= 4.5:1 for normal body text
//   • >= 3:1   for large / UI text (flagged `large: true`)
//
// Guards STYLE-001 regressions — including the opt-in light theme
// (see the MODERN-013 note on `--c-text-dim`).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import Color from "colorjs.io";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSS_PATH = resolve(__dirname, "..", "src", "styles", "index.css");

// Required pairs, resolved per theme scope. `min` is the WCAG AA ratio;
// `large: true` relaxes to 3:1 (large text / UI accents).
const REQUIRED_PAIRS = [
  { fg: "--c-text", bg: "--c-bg", min: 4.5, note: "body text on page background" },
  { fg: "--c-text-primary", bg: "--c-bg", min: 4.5, note: "primary text on page background" },
  { fg: "--c-text-muted", bg: "--c-bg", min: 4.5, note: "muted text on page background" },
  { fg: "--c-text-dim", bg: "--c-bg", min: 4.5, note: "dim text on page background (flags MODERN-013 light-theme token)" },
  { fg: "--c-text", bg: "--c-surface", min: 4.5, note: "text on surface" },
  { fg: "--c-text-muted", bg: "--c-surface", min: 4.5, note: "muted text on surface" },
  { fg: "--c-danger", bg: "--c-bg", min: 4.5, note: "danger text on page background" },
  { fg: "--c-success", bg: "--c-bg", min: 3, large: true, note: "success text (large/UI)" },
  { fg: "--c-warning", bg: "--c-bg", min: 3, large: true, note: "warning text (large/UI)" },
  { fg: "--c-bronze", bg: "--c-bg", min: 3, large: true, note: "bronze accent (large/UI)" },
  { fg: "--c-teal", bg: "--c-bg", min: 3, large: true, note: "teal accent (large/UI)" },
];

// --- CSS parsing ------------------------------------------------------------
function parseBlocks(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, ""); // strip comments
  const blocks = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(clean)) !== null) {
    const selector = m[1].trim();
    const declsText = m[2].trim();
    if (!selector || !declsText) continue;
    const decls = {};
    for (const line of declsText.split(";")) {
      const t = line.trim();
      if (!t) continue;
      const idx = t.indexOf(":");
      if (idx === -1) continue;
      const name = t.slice(0, idx).trim();
      const value = t.slice(idx + 1).trim();
      if (name.startsWith("--")) decls[name] = value;
    }
    if (Object.keys(decls).length) blocks.push({ selector, decls });
  }
  return blocks;
}

// --- Cascade + var() resolution --------------------------------------------
function resolveVar(value, scope, depth = 0) {
  if (value === undefined) return undefined;
  let v = value;
  for (let i = 0; i < 12 && i <= depth + 12; i++) {
    const m = v.match(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/);
    if (!m) break;
    const ref = m[1];
    const fallback = m[2];
    const repl = scope[ref] ?? fallback?.trim();
    if (repl === undefined) return undefined;
    v = v.slice(0, m.index) + repl + v.slice(m.index + m[0].length);
  }
  return v;
}

function buildScopes(blocks) {
  const base = {};
  const scopes = [];
  for (const block of blocks) {
    if (block.selector === ":root") {
      Object.assign(base, block.decls);
      scopes.push({ selector: ":root", map: { ...base } });
    } else {
      const merged = { ...base, ...block.decls };
      scopes.push({ selector: block.selector, map: merged });
    }
  }
  return scopes;
}

// --- Main -------------------------------------------------------------------
function main() {
  const css = readFileSync(CSS_PATH, "utf8");
  const scopes = buildScopes(parseBlocks(css));

  const report = [];
  let failures = 0;
  let checked = 0;

  for (const scope of scopes) {
    if (resolveVar(scope.map["--c-bg"], scope.map) === undefined) continue; // only bg-defining scopes
    const label = scope.selector.replace(/\s+/g, " ");

    for (const pair of REQUIRED_PAIRS) {
      const fgRaw = scope.map[pair.fg];
      const bgRaw = scope.map[pair.bg];
      if (fgRaw === undefined || bgRaw === undefined) continue;

      const fg = resolveVar(fgRaw, scope.map);
      const bg = resolveVar(bgRaw, scope.map);
      if (!fg || !bg) {
        report.push(`  ? ${label}: cannot resolve ${pair.fg} / ${pair.bg}`);
        continue;
      }

      let ratio;
      try {
        ratio = new Color(fg).contrast(new Color(bg), "WCAG21");
      } catch (err) {
        report.push(`  ? ${label}: ${pair.fg} (${fg}) vs ${pair.bg} (${bg}) — ${err.message}`);
        continue;
      }

      checked++;
      const pass = ratio >= pair.min;
      if (!pass) failures++;
      const kind = pair.large ? "large/UI" : "body";
      report.push(
        `  ${pass ? "PASS" : "FAIL"} ${label}: ${pair.fg} vs ${pair.bg} = ${ratio.toFixed(2)}:1` +
          ` (need ${pair.min}:1, ${kind})${pair.note ? ` — ${pair.note}` : ""}`
      );
    }
  }

  console.log("Contrast budget — Axiom frontend design tokens");
  console.log(`Source: ${CSS_PATH}`);
  console.log("");
  for (const line of report) console.log(line);
  console.log("");
  console.log(`Checked ${checked} foreground/background pair(s), ${failures} failing.`);

  if (failures > 0) {
    console.error(`\n✗ Contrast budget FAILED — ${failures} pair(s) below WCAG AA threshold.`);
    process.exit(1);
  }
  console.log("✓ Contrast budget passed — all checked pairs meet WCAG 2.1 AA.");
}

main();
