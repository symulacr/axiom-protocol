/* U1/U2 drift guard: the route registry owns public hub existence and paths;
   aliases, SEO page hrefs and sitemap.xml must never point outside it. */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  KNOWN_PATHS,
  PUBLIC_HUB_PATHS,
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

describe("public hub paths (route registry single source)", () => {
  it("derives one registered canonical path per public slug", () => {
    expect(PUBLIC_HUB_PATHS).toEqual({
      agents: "/public-agents",
      payments: "/public-payments",
      proofs: "/public-proofs",
      storage: "/storage/0g",
      developers: "/public-developers",
    });
  });

  it("resolves every hub path and /features/* alias to a real route", () => {
    for (const slug of SLUGS) {
      expect(resolveRoute(PUBLIC_HUB_PATHS[slug])).not.toBe("not-found");
      expect(resolveRoute(`/features/${slug}`)).toBe(
        resolveRoute(PUBLIC_HUB_PATHS[slug]),
      );
    }
  });

  it("maps every hub path back to its public SEO slug", () => {
    for (const slug of SLUGS) {
      expect(resolvePublicSeoSlug(PUBLIC_HUB_PATHS[slug])).toBe(slug);
    }
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
  });
});
