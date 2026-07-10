import { lazy, Suspense, type ReactElement } from "react";
import { COLORS, Card, SectionTitle } from "../components/ui.js";

const AgentsBrowser = lazy(() => import("./AgentsBrowser.js"));
const MarketPage = lazy(() => import("./MarketPage.js"));

export function HomePage(): ReactElement {
  return (
    <div>
      <section
        style={{
          textAlign: "center",
          padding: "var(--space-2xl) var(--space-xl)",
          border: `1px solid ${COLORS.border}`,
          borderRadius: "var(--radius-xl)",
          background: "var(--c-surface)",
          marginBottom: "var(--space-2xl)",
        }}
      >
        <h1
          style={{
            fontSize: "var(--text-2xl)",
            margin: "0 0 var(--space-md)",
            color: COLORS.text,
          }}
        >
          Axiom Protocol
        </h1>
        <p
          style={{
            color: COLORS.textMuted,
            maxWidth: 560,
            margin: "0 auto",
            lineHeight: "var(--lh-normal)",
          }}
        >
          Mint, trade, and run ERC-7857 iNFT agents on 0G Chain — ownable,
          transferable on-chain AI strategies with live vaults and market.
        </p>
      </section>

      <Suspense
        fallback={
          <Card style={{ padding: "var(--space-2xl)" }}>
            <SectionTitle>Agents</SectionTitle>
          </Card>
        }
      >
        <AgentsBrowser />
      </Suspense>
      <Suspense
        fallback={
          <Card style={{ padding: "var(--space-2xl)" }}>
            <SectionTitle>Market</SectionTitle>
          </Card>
        }
      >
        <MarketPage showLeaderboard={false} />
      </Suspense>
    </div>
  );
}

export default HomePage;
