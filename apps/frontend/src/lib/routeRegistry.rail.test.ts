/* T3b rail slim-down guard: the sidebar rail is exactly 6 destinations in 3
 * groups (Overview | Operations | Resources); agent-scoped verbs (tick,
 * deposit, withdraw) and transfer stay off the rail but reachable via
 * AgentPage actions + the ⌘K Command Center. Registry runtime + AppShell
 * structure + copy contract.
 * Convention: routeRegistry.r1.test.ts (bun:test, registry + source regex). */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getCommandRouteItems,
  isOperationPath,
  resolveRoute,
  routePath,
} from "./routeRegistry";
import { getCopy, type Locale } from "./copy";

const appShellSrc = readFileSync(
  join(import.meta.dir, "../components/axiom/AppShell.tsx"),
  "utf8",
);

/** The six rail destinations, in render order (h1 §1b group table). */
const RAIL_DESTINATIONS = [
  "/app",
  "/chat",
  "/transactions",
  "/storage",
  "/mint",
  "/payment",
] as const;

/** Verbs demoted from the rail by T3b — must stay reachable elsewhere. */
const DEMOTED_VERBS = ["transfer", "tick", "deposit", "withdraw"] as const;

describe("T3b rail slim-down guards (registry/AppShell/copy level)", () => {
  it("rail is exactly 6 destinations, all registered routes", () => {
    expect(RAIL_DESTINATIONS).toHaveLength(6);
    for (const path of RAIL_DESTINATIONS) {
      // resolveRoute must 200-render each destination, never a redirect/404.
      expect(resolveRoute(path)).not.toBe("not-found");
    }
  });

  it("AppShell renders the 6 destinations in 3 localized groups (no flat 10-item list)", () => {
    // Groups: three labelKey entries in the h1 §1b order.
    const labelKeys = appShellSrc.match(/labelKey: "(group[A-Za-z]+)"/g) ?? [];
    expect(labelKeys).toEqual([
      'labelKey: "groupOverview"',
      'labelKey: "groupOperations"',
      'labelKey: "groupResources"',
    ]);
    // The grouped render loop is the single nav-item source (6 path entries inside).
    const navBlock = appShellSrc.slice(
      appShellSrc.indexOf("const navGroups"),
      appShellSrc.indexOf("const resizeWithKeyboard"),
    );
    expect(navBlock.match(/path: "\//g)?.length).toBe(6);
    expect(
      appShellSrc.match(/onClick=\{\(\) => go\(item\.path\)\}/g)?.length,
    ).toBe(1);
    // The old flat [...items, ...flows] render is gone.
    expect(appShellSrc).not.toMatch(/\[\.\.\.items, \.\.\.flows\]/);
    // Demoted verbs never appear as rail paths.
    expect(appShellSrc).not.toMatch(
      /path: "\/(transfer|tick|deposit|withdraw)"/,
    );
  });

  it("rail icons come from one source at one size (16px) — no 14/15px rail mix", () => {
    const navBlock = appShellSrc.slice(
      appShellSrc.indexOf("const navGroups"),
      appShellSrc.indexOf("const resizeWithKeyboard"),
    );
    expect(navBlock).toContain("const navGroups");
    expect(navBlock.match(/size=\{16\}/g)?.length).toBe(6);
    expect(navBlock).not.toMatch(/size=\{1[45]\}/);
  });

  it("collapsed rail exposes labels via data-label tooltips", () => {
    expect(appShellSrc).toMatch(/data-label=\{item\.label\}/);
    const tooltipCss = readFileSync(
      join(import.meta.dir, "../styles/index.css"),
      "utf8",
    );
    expect(tooltipCss).toMatch(
      /\.sidebar\.is-collapsed \.nav-item:hover::after/,
    );
    expect(tooltipCss).toMatch(/content: attr\(data-label\)/);
  });

  it("demoted verbs stay reachable: Command Center lists all six operation routes", () => {
    const commandPaths = getCommandRouteItems().map((item) => item.path);
    for (const id of DEMOTED_VERBS) {
      const path = routePath(id);
      expect(isOperationPath(path)).toBe(true);
      expect(commandPaths).toContain(path);
    }
  });

  it("group headers are localized in all three locales (i18n contract)", () => {
    const locales: Locale[] = ["en", "fr", "de"];
    for (const locale of locales) {
      const nav = getCopy(locale).nav;
      expect(nav.groupOverview.length).toBeGreaterThan(0);
      expect(nav.groupOperations.length).toBeGreaterThan(0);
      expect(nav.groupResources.length).toBeGreaterThan(0);
    }
    // Locales must not collapse onto English defaults (fr/de spread then override).
    const french = getCopy("fr");
    const german = getCopy("de");
    expect(french.nav.groupOperations).not.toBe("Operations");
    expect(german.nav.groupOperations).not.toBe("Operations");
  });
});
