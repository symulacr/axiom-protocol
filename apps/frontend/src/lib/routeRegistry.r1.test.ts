/* R1 route-surface structural guards: the five R1 dead-flow defects must stay
 * fixed at the registry/config level. Registry runtime is executor A's scope —
 * these asserts pin the config surface (routeRegistry.ts, App.tsx wiring,
 * FlowPage/AgentPage render gates) without duplicating runtime tests.
 * Convention: ChatPage.guard.test.ts (regex on source). */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { KNOWN_PATHS, isOperationPath, resolveRoute } from "./routeRegistry";
import { getCopy } from "./copy";

const read = (path: string): string =>
  readFileSync(join(import.meta.dir, path), "utf8");

const registrySrc = read("routeRegistry.ts");
const appSrc = read("../App.tsx");
const flowSrc = read("../pages/FlowPage.tsx");

describe("R1 route-surface guards (registry/config level)", () => {
  it("R1-1: /tick is a registered first-class operation route with its own identity (own hero, not a redirect)", () => {
    expect(resolveRoute("/tick")).toBe("tick");
    expect(KNOWN_PATHS.has("/tick")).toBe(true);
    expect(isOperationPath("/tick")).toBe(true);
    // FlowPage derives per-kind identity from copy.flows[kind]; the tick kind
    // must be a real key, not aliased onto another flow's surface.
    expect(flowSrc).toMatch(/kind === "tick"/);
    expect(flowSrc).toMatch(/const flow = copy\.flows\[kind\]/);
    // The registry entry must not be a compat redirect (only /dashboard and
    // /market redirect declaratively in App.tsx).
    expect(appSrc.match(/<Route path="\/(dashboard|market)"/g)?.length).toBe(2);
    expect(appSrc).not.toMatch(/<Route path="\/tick"/);
  });

  it("R1-2: /deposit is a registered operation route with no client redirect to landing", () => {
    expect(resolveRoute("/deposit")).toBe("deposit");
    expect(KNOWN_PATHS.has("/deposit")).toBe(true);
    expect(isOperationPath("/deposit")).toBe(true);
    // No Navigate element and no go("/")/navigate("/") redirect may own /deposit.
    expect(appSrc).not.toMatch(/<Route path="\/deposit"/);
    expect(appSrc).not.toMatch(/Navigate to="\/deposit/);
    // Vault-write surface (deposit/withdraw) is implemented in FlowPage.
    expect(flowSrc).toMatch(/type VaultWriteKind = "deposit" \| "withdraw"/);
    expect(flowSrc).toMatch(
      /isVaultFlow = kind === "deposit" \|\| kind === "withdraw"/,
    );
  });

  it("R1-3: /withdraw is a registered operation route rendering its own vault surface (no generic gate, no redirect)", () => {
    expect(resolveRoute("/withdraw")).toBe("withdraw");
    expect(KNOWN_PATHS.has("/withdraw")).toBe(true);
    expect(isOperationPath("/withdraw")).toBe(true);
    expect(flowSrc).toMatch(/withdraw: \{ label: "Withdraw"/);
    // Withdraw-specific validation gate proves a real withdraw surface exists.
    expect(flowSrc).toMatch(
      /kind === "withdraw" && vaultBalanceWei !== undefined/,
    );
  });

  it("R1-4: /agents/:nonNumericSlug renders the not-found route (Recovery404), never a plausible gate", () => {
    // Registry keeps /agents/:tokenId addressable for real tokenIds…
    expect(resolveRoute("/agents/7")).toBe("agent");
    // …and App's not-found detection never hides behind the /agents/ prefix…
    expect(appSrc).toMatch(/!location\.pathname\.startsWith\("\/agents\/"\)/);
    // …so the AgentRoute component itself must reject non-tokenId slugs by
    // rendering the shared 404 surface (F1: was a custom "Agent not
    // addressable" block; the audit wants the real not-found route).
    expect(appSrc).toMatch(/function shortTokenId/);
    expect(appSrc).toMatch(/if \(tokenId === null\)/);
    expect(appSrc).not.toMatch(/Agent not addressable/);
    expect(appSrc).toMatch(
      /return <Recovery404 go=\{go\} locale=\{locale\} \/>;/,
    );
    // BigInt rejects the audit's fake slug, matching AgentRoute's null path.
    expect(() => BigInt("fake-agent-9999")).toThrow();
  });

  it("R1-4c: a known-absent tokenId routes to not-found before the gate renders (agents-query validation)", () => {
    // AgentPage validates the id against the existing agents query and only
    // concludes "missing" on a settled, successful, non-empty read.
    expect(agentSrc).toMatch(
      /import \{ useAgents \} from "\.\.\/hooks\/useAgents\.js";/,
    );
    expect(agentSrc).toMatch(
      /const agentKnown = agents\.some\(\(agent\) => agent\.tokenId === tokenId\);/,
    );
    expect(agentSrc).toMatch(
      /const agentMissing = agentsSettled && agents\.length > 0 && !agentKnown;/,
    );
    expect(agentSrc).toMatch(/if \(agentMissing\) go\("/);
    expect(agentSrc).toMatch(/if \(agentMissing\) return null;/);
    // The hook exposes the settled flag the guard depends on.
    expect(read("../hooks/useAgents.ts")).toMatch(/settled: isSuccess/);
  });

  it("R1-5: the three flow routes missing from lockedRouteMeta have their own pre-auth hero copy (no /app fallback)", () => {
    // Every flow route must be a first-class lockedRouteMeta key…
    const catalogSrc = read("consoleCatalog.tsx");
    for (const path of ['"/tick"', '"/deposit"', '"/withdraw"']) {
      expect(catalogSrc).toMatch(new RegExp(`${path}: \\{`));
    }
    // …and LockedRoute must prefer the localized lockedHero copy over the
    // meta table for those routes (copy.ts is the single locale owner).
    expect(appSrc).toMatch(/copy\.lockedHero\.tick/);
    expect(appSrc).toMatch(/copy\.lockedHero\.deposit/);
    expect(appSrc).toMatch(/copy\.lockedHero\.withdraw/);
    const copySrc = read("copy.ts");
    for (const locale of ["en", "fr", "de"] as const) {
      for (const route of ["tick", "deposit", "withdraw"] as const) {
        const hero = getCopy(locale).lockedHero[route];
        expect(hero.titleLead).toBeTruthy();
        expect(hero.titleEmphasis).toBeTruthy();
        expect(hero.copy).toBeTruthy();
      }
    }
    expect(copySrc).toMatch(/lockedHero: \{/);
  });

  it("R1-4b: a reverted ownerOf (nonexistent tokenId) surfaces metadataReadFailed, not a fake healthy agent", () => {
    // useAgentMetadata maps the ownerOf revert to confirmed-null metadata…
    expect(agentSrc).toMatch(/ownerOfReverted/);
    expect(agentSrc).toMatch(/if \(ownerOfReverted\) return null;/);
    // …and the page renders the existing failed-metadata copy key.
    expect(agentSrc).toMatch(/metadataError && \(/);
    expect(agentSrc).toMatch(/agentCopy\.metadataReadFailed/);
  });
});
