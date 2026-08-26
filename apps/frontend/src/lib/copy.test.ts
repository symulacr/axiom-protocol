import { describe, expect, it } from "bun:test";
import { getCopy, interpolate } from "./copy";

describe("Axiom copy pluralisation", () => {
  it("keeps dashboard attention grammar valid at one and many", () => {
    // Current contracts after the proto-subpages-A copy reword ("not ready").
    expect(getCopy("en").dashboard.review(1)).toBe("1 agent isn't ready yet");
    expect(getCopy("en").dashboard.review(3)).toBe("3 agents aren't ready yet");
    expect(getCopy("fr").dashboard.review(1)).toBe("1 agent n'est pas prêt");
    expect(getCopy("fr").dashboard.review(3)).toBe(
      "3 agents ne sont pas prêts",
    );
    expect(getCopy("de").dashboard.review(1)).toBe(
      "1 Agent ist noch nicht bereit",
    );
    expect(getCopy("de").dashboard.review(2)).toBe(
      "2 Agents sind noch nicht bereit",
    );
  });

  it("keeps authenticated page labels present in every locale", () => {
    for (const locale of ["en", "fr", "de"] as const) {
      const copy = getCopy(locale);
      for (const value of Object.values(copy.settings))
        expect(valueOrFunction(value)).toBeTruthy();
      // Deliberately-blank labels (copy-clearance wave): their render sites
      // show them only when non-empty, so "" is a valid localized state.
      const INTENTIONALLY_BLANK = new Set([
        "liveRouteNote",
        "providerHint",
        // proto-subpages-b: the co-sign note merged into the one "Needs approval" card.
        "coSignNote",
      ]);
      for (const [key, flow] of Object.entries(copy.flowUi))
        if (!INTENTIONALLY_BLANK.has(key))
          expect(valueOrFunction(flow)).toBeTruthy();
      for (const [key, value] of Object.entries(copy.agentDetail))
        if (!INTENTIONALLY_BLANK.has(key))
          expect(valueOrFunction(value)).toBeTruthy();
      for (const value of Object.values(copy.transactions))
        expect(valueOrFunction(value)).toBeTruthy();
      for (const value of Object.values(copy.errorBoundary))
        expect(valueOrFunction(value)).toBeTruthy();
    }
  });

  it("keeps the six flow bodies fully localized in every locale (P4)", () => {
    // Flow-body i18n scope: every per-flow string (head, steps, receipt kind,
    // review rows, field label/hint, receipt detail + notice templates) is
    // present — no locale may fall back to another's text.
    for (const locale of ["en", "fr", "de"] as const) {
      const copy = getCopy(locale);
      // Payment-flow explainer rows deleted by proto-subpages-b (the review
      // sheet already states them): "" is a valid localized state there.
      const FLOW_BLANK_OK = new Set(["fieldHint", "contextTitle", "proofLine"]);
      for (const flow of Object.values(copy.flows)) {
        for (const [key, value] of Object.entries(flow))
          if (!(FLOW_BLANK_OK.has(key) && valueOrFunction(value) === ""))
            expect(valueOrFunction(value)).toBeTruthy();
        expect(flow.steps.length).toBeGreaterThan(0);
      }
    }
  });

  it("names receipts exactly like the destination (one name per destination, P4)", () => {
    // Receipt kinds match the canonical nav labels — "Oracle mint"/"Transfer
    // proof"/"Tick stream" style drift is now a hard failure.
    for (const locale of ["en", "fr", "de"] as const) {
      const copy = getCopy(locale);
      for (const kind of [
        "mint",
        "payment",
        "transfer",
        "tick",
        "deposit",
        "withdraw",
      ] as const) {
        expect(copy.flows[kind].receiptKind).toBe(copy.nav[kind]);
      }
    }
  });

  it("keeps semantic dashboard labels free of sequential decoration", () => {
    for (const locale of ["en", "fr", "de"] as const) {
      const copy = getCopy(locale);
      // dashboard.agentRegister/proofLane were removed as render-dead (loc-A);
      // the no-"/01"-suffix contract now scans every dashboard leaf instead.
      for (const value of Object.values(copy.dashboard)) {
        expect(valueOrFunction(value)).not.toMatch(/\/\s*0\d+$/);
      }
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
      expect(copy.agentDetail.balanceToSpend).toContain("{amount}");
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

  it("keeps the receipt filter chip labels distinct per locale (C-SETTINGS)", () => {
    // FINDING-011: the review bucket chip and the stale-state chip shared one
    // label ("Needs review") with different semantics — no two filter chips
    // may share a label. (The stale PILL keeps its own copy — pill and filter
    // are different contexts.)
    for (const locale of ["en", "fr", "de"] as const) {
      const copy = getCopy(locale);
      const chipLabels = [
        copy.transactions.filterAll,
        copy.transactions.filterReview,
        copy.transactions.filterStale,
        ...[
          "approval",
          "signing",
          "submitted",
          "confirming",
          "confirmed",
          "reverted",
          "rejected",
        ].map((state) => copy.status[state]),
      ];
      expect(new Set(chipLabels).size).toBe(chipLabels.length);
      expect(copy.transactions.filterStale).not.toBe(copy.status.stale);
    }
  });

  it("keeps raw protocol terms out of user-facing copy (02 FINDING-012/017/024)", () => {
    // Mechanism names live behind disclosures/drilldowns, never in copy.ts
    // strings. A term that must stay gets a translated label (e.g. dataHash →
    // "Metadata hash"); it never survives as a raw identifier. P4: "iNFT" is
    // banned too — agents are "agents" everywhere user-facing.
    const forbidden = /PayForAgent|dataHash|EIP-712|calldata|iNFT/i;
    for (const locale of ["en", "fr", "de"] as const) {
      const copy = getCopy(locale);
      for (const value of flatten(copy)) {
        expect(value).not.toMatch(forbidden);
      }
    }
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
