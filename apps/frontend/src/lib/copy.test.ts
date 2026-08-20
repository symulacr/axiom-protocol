import { describe, expect, it } from "bun:test";
import { formatCount, getCopy, interpolate } from "./copy";

describe("Axiom copy pluralisation", () => {
  it("keeps singular and plural forms explicit in every supported locale", () => {
    expect(formatCount("en", 1, "messages")).toBe("1 message");
    expect(formatCount("en", 2, "messages")).toBe("2 messages");
    expect(formatCount("fr", 1, "transactions")).toBe("1 transaction");
    expect(formatCount("fr", 2, "transactions")).toBe("2 transactions");
    expect(formatCount("de", 1, "steps")).toBe("1 Schritt");
    expect(formatCount("de", 2, "steps")).toBe("2 Schritte");
  });

  it("keeps dashboard attention grammar valid at one and many", () => {
    expect(getCopy("en").dashboard.review(1)).toBe(
      "1 agent action requires attention.",
    );
    expect(getCopy("en").dashboard.review(3)).toBe(
      "3 agent actions require attention.",
    );
    expect(getCopy("fr").dashboard.review(1)).toContain("nécessite");
    expect(getCopy("fr").dashboard.review(3)).toContain("nécessitent");
    expect(getCopy("de").dashboard.review(2)).toBe(
      "2 Agentenaktionen erfordern Aufmerksamkeit.",
    );
  });

  it("keeps authenticated page labels present in every locale", () => {
    for (const locale of ["en", "fr", "de"] as const) {
      const copy = getCopy(locale);
      for (const value of Object.values(copy.settings))
        expect(valueOrFunction(value)).toBeTruthy();
      for (const flow of Object.values(copy.flowUi))
        expect(valueOrFunction(flow)).toBeTruthy();
      for (const value of Object.values(copy.agentDetail))
        expect(valueOrFunction(value)).toBeTruthy();
      for (const value of Object.values(copy.transactions))
        expect(valueOrFunction(value)).toBeTruthy();
    }
  });

  it("keeps semantic dashboard labels free of sequential decoration", () => {
    for (const locale of ["en", "fr", "de"] as const) {
      const copy = getCopy(locale);
      expect(copy.dashboard.agentRegister).not.toMatch(/\/\s*0\d+$/);
      expect(copy.dashboard.proofLane).not.toMatch(/\/\s*0\d+$/);
    }
  });
});

describe("Axiom i18n contract (C-08/C-11/C-12)", () => {
  it("keeps shell sections (nav/topbar/strip/command) complete in every locale", () => {
    for (const locale of ["en", "fr", "de"] as const) {
      const copy = getCopy(locale);
      for (const value of Object.values(copy.nav))
        expect(valueOrFunction(value)).toBeTruthy();
      for (const value of Object.values(copy.topbar))
        expect(valueOrFunction(value)).toBeTruthy();
      for (const value of Object.values(copy.strip))
        expect(valueOrFunction(value)).toBeTruthy();
      for (const value of Object.values(copy.command))
        expect(valueOrFunction(value)).toBeTruthy();
      for (const value of Object.values(copy.chat))
        expect(valueOrFunction(value)).toBeTruthy();
    }
  });

  it("never hardcodes a chain name, chain ID or token symbol in copy", () => {
    // The standing rule: network prose interpolates {chainName}/{chainId}
    // from APP_CHAIN; token units come from payment config / nativeCurrency.
    const forbidden =
      /0G Mainnet|Aristotle|Galileo|\b16661\b|\b16602\b|\bUSDC\b|Northstar/;
    for (const locale of ["en", "fr", "de"] as const) {
      const copy = getCopy(locale);
      for (const value of flatten(copy)) {
        expect(value).not.toMatch(forbidden);
      }
    }
  });

  it("keeps {chainName} placeholders present where network prose is parameterized", () => {
    for (const locale of ["en", "fr", "de"] as const) {
      const copy = getCopy(locale);
      expect(copy.wallet.wrongNetworkTitle).toContain("{chainName}");
      expect(copy.wallet.switchNetwork).toContain("{chainName}");
      expect(copy.agentDetail.vaultRoute).toContain("{chainName}");
      expect(copy.chat.statusOnline).toContain("{chainName}");
      expect(copy.chat.statusWrongNetwork).toContain("{chainName}");
      expect(copy.chat.wrongNetworkBanner).toContain("{chainName}");
      expect(copy.chat.promptVaultHint).toContain("{nativeSymbol}");
    }
  });

  it("interpolates placeholders and leaves unknown tokens untouched", () => {
    expect(
      interpolate("Switch to {chainName} · chain {chainId}", {
        chainName: "0G Galileo Testnet",
        chainId: 16602,
      }),
    ).toBe("Switch to 0G Galileo Testnet · chain 16602");
    expect(interpolate("a {missing} token", { chainName: "x" })).toBe(
      "a {missing} token",
    );
  });

  it("names the live attention target in the dashboard CTA, never a fixture", () => {
    expect(getCopy("en").dashboard.reviewAction("#7")).toBe("Review agent #7");
    expect(getCopy("en").dashboard.reviewAction()).toBe("Review next action");
    expect(getCopy("fr").dashboard.reviewAction("#7")).toContain("#7");
    expect(getCopy("de").dashboard.reviewAction("#7")).toContain("#7");
  });
});

function valueOrFunction(value: unknown): string {
  return typeof value === "function" ? String(value) : String(value);
}

/** Every leaf string of the copy tree (functions sampled with a probe arg). */
function* flatten(value: unknown): Generator<string> {
  if (typeof value === "string") {
    yield value;
    return;
  }
  if (typeof value === "function") {
    yield String((value as (probe: string) => unknown)("probe"));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) yield* flatten(item);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) yield* flatten(item);
  }
}
