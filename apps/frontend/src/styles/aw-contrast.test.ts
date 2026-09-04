import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * AW-layer OKLCH contrast gate. Mirrors contrast.test.ts's approach but for
 * the --aw-* namespace in axiom-awwwards.css: parses the :root token block,
 * converts oklch() to sRGB, and asserts WCAG AA ratios on the ink ramp.
 * No hardcoded expected ratios for values — only the AA floor.
 */

const cssPath = join(import.meta.dir, "axiom-awwwards.css");
const css = readFileSync(cssPath, "utf8");

function rootVars(): Map<string, string> {
  const vars = new Map<string, string>();
  const re = /:root\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    for (const line of m[1]!.split(";")) {
      const decl = line.match(/(--aw-[a-z0-9-]+)\s*:\s*([^;\s][^;]*)/i);
      if (decl) vars.set(decl[1]!, decl[2]!.trim());
    }
  }
  return vars;
}

const vars = rootVars();

/** oklch(L% C H) -> linear-ish sRGB triple in 0..1 (Björn Ottosson matrices). */
function oklchToRgb(raw: string): [number, number, number] {
  const m = raw.match(
    /oklch\(\s*([\d.]+)%?\s*([\d.]+)\s*([\d.]+)\s*\)/i,
  );
  if (!m) throw new Error(`not an oklch() literal: ${raw}`);
  const L = Number(m[1]) / 100;
  const C = Number(m[2]);
  const H = (Number(m[3]) * Math.PI) / 180;
  const a = C * Math.cos(H);
  const b = C * Math.sin(H);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const mm = m_ ** 3;
  const s = s_ ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s;
  const gamma = (c: number) => {
    const v = Math.min(1, Math.max(0, c));
    return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  };
  return [gamma(r), gamma(g), gamma(bl)];
}

function luminance(rgb: [number, number, number]): number {
  const lin = (c: number) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const [r, g, b] = rgb.map(lin);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrastRatio(fg: [number, number, number], bg: [number, number, number]): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** Resolve a token through var() aliases until an oklch() literal is reached. */
function resolveOklch(token: string): [number, number, number] {
  const seen = new Set<string>();
  let current = token;
  while (true) {
    if (seen.has(current)) throw new Error(`alias cycle at ${current}`);
    seen.add(current);
    const value = vars.get(current);
    if (!value) throw new Error(`token not defined in :root: ${current}`);
    if (value.startsWith("oklch(")) return oklchToRgb(value);
    const alias = value.match(/^var\((--aw-[a-z0-9-]+)\)$/);
    if (alias) {
      current = alias[1]!;
      continue;
    }
    throw new Error(`${token} does not resolve to an oklch() literal`);
  }
}

describe("AW OKLCH palette", () => {
  test("ramp + state roles are oklch() literals", () => {
    for (const token of [
      "--aw-copper-400",
      "--aw-copper-500",
      "--aw-ink-900",
      "--aw-ink-800",
      "--aw-ink-700",
      "--aw-paper-100",
      "--aw-paper-300",
      "--aw-warn",
      "--aw-danger",
    ]) {
      expect(vars.get(token)).toMatch(/^oklch\(/);
    }
  });

  test("legacy aliases resolve onto the ramp (no drifted duplicates)", () => {
    expect(vars.get("--aw-copper")).toBe("var(--aw-copper-400)");
    expect(vars.get("--aw-copper-bright")).toBe("var(--aw-copper-500)");
    expect(vars.get("--aw-phosphor")).toBe("var(--aw-ok)");
    expect(vars.get("--aw-teal")).toBe("var(--aw-info)");
    expect(vars.get("--aw-ink")).toBe("var(--aw-ink-900)");
    expect(vars.get("--aw-ink-2")).toBe("var(--aw-ink-800)");
  });

  test("state roles hit WCAG AA (≥ 4.5:1) on every ink surface", () => {
    const surfaces = ["--aw-ink-900", "--aw-ink-800", "--aw-ink-700"];
    const roles = ["--aw-ok", "--aw-info", "--aw-warn", "--aw-danger"];
    for (const role of roles) {
      for (const surface of surfaces) {
        const ratio = contrastRatio(resolveOklch(role), resolveOklch(surface));
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  test("accent + text roles hit WCAG AA on the deepest ink", () => {
    for (const role of ["--aw-accent", "--aw-accent-strong", "--aw-text"]) {
      const ratio = contrastRatio(resolveOklch(role), resolveOklch("--aw-ink-900"));
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("no raw hex pins remain in the AW token block", () => {
    for (const value of vars.values()) {
      expect(value).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    }
  });

  test("motion ladder is tokenized (no ad-hoc ms literals in :root)", () => {
    for (const [key, value] of vars) {
      if (key.startsWith("--aw-dur") || key === "--aw-stagger") {
        expect(value).toMatch(/^\d+m?s$/);
      }
    }
    expect(vars.get("--aw-dur-fast")).toBe("220ms");
    expect(vars.get("--aw-stagger")).toBe("120ms");
  });
});
