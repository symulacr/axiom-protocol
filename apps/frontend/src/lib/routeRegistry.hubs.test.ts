/* U1/U2 drift guard + L1-M7 rebrand guard: the route registry owns public hub
 * existence and paths; the SHORT URLs are canonical (aliases, SEO page hrefs
 * and sitemap.xml must never point outside them), while the legacy /public-*
 * and /features/* spellings are permanent redirects — never 200-rendered. */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  KNOWN_PATHS,
  PUBLIC_HUB_PATHS,
  redirectHubTarget,
  resolvePublicSeoSlug,
  resolveRoute,
} from "./routeRegistry";

const SLUGS = [
  "agents",
  "payments",
  "proofs",
  "storage",
  "developers",
] as const;

const LEGACY_PATHS = [
  "/public-agents",
  "/public-payments",
  "/public-proofs",
  "/public-storage",
  "/public-developers",
  "/features/agents",
  "/features/payments",
  "/features/proofs",
  "/features/storage",
  "/features/developers",
] as const;

describe("public hub paths (route registry single source)", () => {
  it("derives one registered canonical SHORT path per public slug (L1-M7)", () => {
    expect(PUBLIC_HUB_PATHS).toEqual({
      agents: "/agents",
      payments: "/payments",
      proofs: "/proofs",
      storage: "/storage/0g",
      developers: "/developers",
    });
  });

  it("resolves every canonical hub path to its real route", () => {
    for (const slug of SLUGS) {
      expect(resolveRoute(PUBLIC_HUB_PATHS[slug])).not.toBe("not-found");
      expect(resolveRoute(PUBLIC_HUB_PATHS[slug])).not.toBe("redirect");
    }
  });

  it("maps every canonical hub path back to its public SEO slug", () => {
    for (const slug of SLUGS) {
      expect(resolvePublicSeoSlug(PUBLIC_HUB_PATHS[slug])).toBe(slug);
    }
  });

  it("redirect-marks every legacy hub spelling to the canonical short path, never 200-rendered (L1-M7)", () => {
    const expectedTargets = [
      PUBLIC_HUB_PATHS.agents,
      PUBLIC_HUB_PATHS.payments,
      PUBLIC_HUB_PATHS.proofs,
      PUBLIC_HUB_PATHS.storage,
      PUBLIC_HUB_PATHS.developers,
      PUBLIC_HUB_PATHS.agents,
      PUBLIC_HUB_PATHS.payments,
      PUBLIC_HUB_PATHS.proofs,
      PUBLIC_HUB_PATHS.storage,
      PUBLIC_HUB_PATHS.developers,
    ] as const;
    LEGACY_PATHS.forEach((legacy, index) => {
      // Registry emits the redirect marker — App.tsx turns it into <Navigate replace>.
      expect(resolveRoute(legacy), legacy).toBe("redirect");
      expect(redirectHubTarget(legacy), legacy).toBe(expectedTargets[index]);
      // A redirect must never also resolve as a renderable SEO slug.
      expect(resolvePublicSeoSlug(legacy), legacy).toBeNull();
    });
  });

  it("keeps pre-wave-1 short hub URLs as inbound compat aliases (U1)", () => {
    expect(resolvePublicSeoSlug("/agents")).toBe("agents");
    expect(resolveRoute("/agents")).toBe("agents");
    // the /agents/:tokenId prefix rule must not be shadowed by the alias
    expect(resolveRoute("/agents/7")).toBe("agent");
    expect(KNOWN_PATHS.has("/payments")).toBe(true);
    expect(KNOWN_PATHS.has("/proofs")).toBe(true);
    expect(KNOWN_PATHS.has("/developers")).toBe(true);
  });

  it("App.tsx renders the registry redirect marker as <Navigate replace> (L1-M7)", () => {
    const appSrc = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
    expect(appSrc).toMatch(/redirectHubTarget/);
    expect(appSrc).toMatch(/<Navigate to=\{hubRedirect\} replace \/>/);
  });

  it("keeps dev.mjs + server.mjs 308 maps in sync with the registry (L1-M7)", () => {
    const expected = Object.fromEntries(
      LEGACY_PATHS.map((legacy) => [legacy, redirectHubTarget(legacy)]),
    );
    for (const server of ["../../dev.mjs", "../../server.mjs"] as const) {
      const src = readFileSync(new URL(server, import.meta.url), "utf8");
      const match = src.match(/HUB_REDIRECTS = \{([\s\S]*?)\};/);
      expect(match, server).not.toBeNull();
      const entries = [
        ...(match![1] ?? "").matchAll(/"(\/[^"]+)":\s*"([^"]+)"/g),
      ].map(([, from, to]) => [from, to]);
      expect(Object.fromEntries(entries), server).toEqual(expected);
    }
  });

  it("registers the cross-wallet handoff receive path (U2)", () => {
    expect(KNOWN_PATHS.has("/transfer/co-sign")).toBe(true);
    expect(resolveRoute("/transfer/co-sign")).toBe("transfer-co-sign");
    expect(KNOWN_PATHS.has("/transfer-co-sign")).toBe(false);
  });

  it("keeps sitemap.xml URLs inside KNOWN_PATHS (no phantom hub URLs)", () => {
    const xml = readFileSync(
      new URL("../../public/sitemap.xml", import.meta.url),
      "utf8",
    );
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (match) => new URL(match[1]).pathname,
    );
    expect(locs.length).toBeGreaterThan(0);
    for (const loc of locs) expect(KNOWN_PATHS.has(loc)).toBe(true);
    // L1-M7: the sitemap must list the canonical SHORT paths only — no
    // duplicate-content legacy spellings, ever.
    expect(locs).toEqual(["/", ...SLUGS.map((slug) => PUBLIC_HUB_PATHS[slug])]);
  });
});
