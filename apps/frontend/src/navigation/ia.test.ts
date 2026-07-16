/**
 * Exercises shipped IA helpers by importing the module under test
 * (Node strip-types resolves .ts) and by asserting App shell wiring.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const iaUrl = pathToFileURL(path.join(dir, "ia.ts")).href;
const appSrc = readFileSync(path.join(dir, "../App.tsx"), "utf8");

const ia = await import(iaUrl);

describe("IA routing helpers (shipped module)", () => {
  it("primary nav is Home + Chat links and Mint action only", () => {
    const labels = ia.primaryNavLabels();
    assert.deepEqual(labels, ["Home", "Chat", "Mint"]);
    assert.equal(ia.PRIMARY_NAV.length, 3);
    assert.equal(ia.PRIMARY_NAV.find((n: { id: string }) => n.id === "mint")?.kind, "action");
    assert.ok(!labels.includes("Market"));
    assert.ok(!labels.includes("Dashboard"));
    assert.ok(!labels.includes("Agents"));
  });

  it("redirects redundant peers into Home or mint modal", () => {
    for (const p of ["/agents", "/market", "/dashboard", "/settings"]) {
      assert.equal(ia.resolveLegacyRedirect(p), ia.APP_HOME, p);
    }
    assert.equal(ia.resolveLegacyRedirect("/agents/new"), `${ia.APP_HOME}?mint=1`);
    assert.equal(ia.resolveLegacyRedirect("/app"), null);
    assert.equal(ia.resolveLegacyRedirect("/chat"), null);
    assert.equal(ia.resolveLegacyRedirect("/agents/42"), null);
  });

  it("mint query open/close is stable", () => {
    assert.equal(ia.isMintOpen("mint=1"), true);
    assert.equal(ia.isMintOpen("mint=0"), false);
    assert.equal(ia.isMintOpen(""), false);
    const opened = ia.withMintOpen("", true);
    assert.equal(opened.get("mint"), "1");
    const closed = ia.withMintOpen(opened, false);
    assert.equal(closed.get("mint"), null);
  });
});

describe("App shell wiring (shipped App.tsx)", () => {
  it("does not register Market as a peer page and redirects legacy mint", () => {
    assert.match(appSrc, /PRIMARY_NAV/);
    assert.match(appSrc, /path="\/market"\s+element=\{<Navigate/);
    assert.match(appSrc, /path="\/agents\/new"/);
    assert.match(appSrc, /\$\{APP_HOME\}\?mint=1/);
    assert.doesNotMatch(appSrc, /element=\{<MarketPage/);
    assert.doesNotMatch(appSrc, /to="\/market"/);
  });

  it("exposes Home and Chat as primary links", () => {
    assert.match(appSrc, /APP_HOME|to=\{item\.path/);
    assert.match(appSrc, /APP_CHAT|"\/chat"/);
    assert.match(appSrc, /MintForm/);
    assert.match(appSrc, /mintOpen/);
  });
});

describe("Brand lattice on agent cards (shipped AgentsBrowser)", () => {
  it("references BRAND.agentLattice in card UI", () => {
    const browser = readFileSync(
      path.join(dir, "../pages/AgentsBrowser.tsx"),
      "utf8",
    );
    assert.match(browser, /from ["']\.\.\/brand\/assets\.js["']/);
    assert.match(browser, /BRAND\.agentLattice/);
    assert.match(browser, /agent-card__motif|url\(\$\{BRAND\.agentLattice\}\)/);
  });
});
