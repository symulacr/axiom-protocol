import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Shipped-CSS contrast gate (wave3 campaign1 U1/U6).
 * Parses the actual token blocks out of src/styles/index.css and asserts
 * WCAG 2.x relative-luminance ratios — no hardcoded expected values.
 */

const cssPath = join(import.meta.dir, "index.css");
const css = readFileSync(cssPath, "utf8");

type Vars = Map<string, string>;

/** Extract custom-property declarations from every rule matching the selector. */
function blockVars(selector: RegExp): Vars {
  const vars: Vars = new Map();
  const re = new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    for (const line of m[1].split(";")) {
      const decl = line.match(/(--[a-z0-9-]+)\s*:\s*([^;\s][^;]*)/i);
      if (decl) vars.set(decl[1]!, decl[2]!.trim());
    }
  }
  return vars;
}

// Dark defaults live in the `:root` design-token block.
const dark = blockVars(/:root(?![\w-])/);
// Light overrides live across the scattered `.app-shell.light` blocks (merged).
const light = blockVars(/\.app-shell\.light(?![\w-])/);

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace(/^#/, "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`not a 6-digit hex: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function luminance(hex: string): number {
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
}

export function contrastRatio(fg: string, bg: string): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi! + 0.05) / (lo! + 0.05);
}

const STATE_TOKENS = ["--warning", "--danger", "--teal"] as const;

describe("shipped-CSS state-token contrast (U1/U6)", () => {
  test("light theme defines AA state colors", () => {
    for (const token of STATE_TOKENS) {
      const value = light.get(token);
      expect(value).toBeDefined();
      expect(value).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  test("light warning/danger/teal ≥ 4.5:1 on paper #fffdf8 (and other light surfaces)", () => {
    const paper = "#fffdf8"; // light --panel
    const canvas = light.get("--bg");
    const input = light.get("--bg-2");
    expect(canvas).toMatch(/^#/);
    expect(input).toMatch(/^#/);
    // Guard: parsed surfaces must actually be the audited paper family.
    expect(paper).toEqual(light.get("--panel"));
    for (const token of STATE_TOKENS) {
      const fg = light.get(token)!;
      for (const surface of [paper, canvas!, input!]) {
        const ratio = contrastRatio(fg, surface);
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  test("dark warning/danger/teal ≥ 4.5:1 on dark surfaces", () => {
    const panel = dark.get("--panel");
    const canvas = dark.get("--bg");
    const elevated = dark.get("--bg-2");
    for (const surface of [panel, canvas, elevated]) {
      expect(surface).toMatch(/^#/);
    }
    for (const token of STATE_TOKENS) {
      const fg = dark.get(token);
      expect(fg).toBeDefined();
      expect(fg).toMatch(/^#/);
      for (const surface of [panel!, canvas!, elevated!]) {
        expect(contrastRatio(fg!, surface)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

/** All rule blocks as [selector, body]; selector chunk cannot cross braces. */
function rules(): Array<[string, string]> {
  return [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => [
    m[1]!,
    m[2]!,
  ]);
}

  test("U6: muted/dim/line are defined exactly once per theme scope", () => {
    // (?<![\w-]) avoids substring hits on --completion-* aliases and var() reads.
    // Classify on the LAST real selector: chunks carry preceding comments.
    const lastSelector = (sel: string) =>
      sel
        .replace(/\/\*[^]*?\*\//g, "")
        .split(",")
        .pop()!
        .trim();
    for (const token of ["--muted", "--dim", "--line"]) {
      const declRe = new RegExp(`(?<![\\w-])${token}\\s*:`);
      const lightCount = rules().filter(
        ([sel, body]) =>
          lastSelector(sel).startsWith(".app-shell.light") &&
          declRe.test(body),
      ).length;
      expect(lightCount).toBe(1);
      const darkCount = rules().filter(
        ([sel, body]) => lastSelector(sel) === ":root" && declRe.test(body),
      ).length;
      expect(darkCount).toBe(1);
    }
  });

  test("U6: split-brain palette hexes no longer re-pinned in light blocks", () => {
    for (const dead of ["#494a45", "#5b5a53"]) {
      expect(css).not.toContain(dead);
    }
  });

  test("U1b: locked-route accents resolve through semantic tokens", () => {
    expect(css).toMatch(
      /\.locked-payment\s*\{\s*--route-accent:\s*var\(--warning\)/,
    );
    expect(css).toMatch(
      /\.locked-transfer\s*\{\s*--route-accent:\s*var\(--teal\)/,
    );
  });
});
