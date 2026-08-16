import { describe, expect, it } from "bun:test";
import { formatCount, getCopy } from "./copy";

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
        expect(value).toBeTruthy();
      for (const flow of Object.values(copy.flowUi))
        expect(valueOrFunction(flow)).toBeTruthy();
      for (const value of Object.values(copy.agentDetail))
        expect(valueOrFunction(value)).toBeTruthy();
      for (const value of Object.values(copy.transactions))
        expect(valueOrFunction(value)).toBeTruthy();
    }
  });

  it("keeps semantic dashboard and chat labels free of sequential decoration", () => {
    for (const locale of ["en", "fr", "de"] as const) {
      const copy = getCopy(locale);
      expect(copy.dashboard.agentRegister).not.toMatch(/\/\s*0\d+$/);
      expect(copy.dashboard.proofLane).not.toMatch(/\/\s*0\d+$/);
      expect(copy.chat.threads).not.toMatch(/\/\s*0\d+$/);
    }
  });
});

function valueOrFunction(value: unknown): string {
  return typeof value === "function" ? String(value) : String(value);
}
