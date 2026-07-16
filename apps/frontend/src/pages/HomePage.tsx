import { lazy, Suspense, useMemo, type ReactElement } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { formatEther } from "viem";
import {
  COLORS,
  Button,
  Card,
  PageHeader,
  Skeleton,
  ConnectedGuard,
} from "../components/ui.js";
import { useAgents } from "../hooks/useAgents.js";
import { useVaultDataBatch } from "../hooks/useVaultDataBatch.js";
import { useHealth } from "../hooks/useHealth.js";

const AgentsBrowser = lazy(() => import("./AgentsBrowser.js"));

/**
 * Home = portfolio KPIs + full agent list (search/actions).
 * Replaces separate Dashboard vs Agents nav destinations.
 */
export function HomePage(): ReactElement {
  return (
    <div>
      <PageHeader
        title="Home"
        subtitle="Your agents, vaults, and next steps — mint, fund, tick, or ask Axiom."
        action={
          <Link to="/app?mint=1" style={{ textDecoration: "none" }}>
            <Button variant="primary">Mint agent</Button>
          </Link>
        }
      />
      <ConnectedGuard>
        <HomeBody />
      </ConnectedGuard>
    </div>
  );
}

function HomeBody(): ReactElement {
  const { address } = useAccount();
  const { agents, isLoading: agentsLoading, error: agentsError } = useAgents();
  const tokenIds = useMemo(() => agents.map((a) => a.tokenId), [agents]);
  const { data: vaultMap, isLoading: vaultLoading } =
    useVaultDataBatch(tokenIds);
  const { data: health } = useHealth();

  const totalVaultWei = useMemo(() => {
    let sum = 0n;
    for (const entry of vaultMap.values()) {
      sum += entry.depositsWei;
    }
    return sum;
  }, [vaultMap]);

  const unbound = useMemo(() => {
    return agents.filter((a) => {
      const v = vaultMap.get(a.tokenId.toString());
      if (!v) return false;
      const root = v.strategyRoot?.toLowerCase?.() ?? "";
      return (
        !root ||
        root ===
          "0x0000000000000000000000000000000000000000000000000000000000000000"
      );
    });
  }, [agents, vaultMap]);

  const unfunded = useMemo(() => {
    return agents.filter((a) => {
      const v = vaultMap.get(a.tokenId.toString());
      return v && v.depositsWei === 0n;
    });
  }, [agents, vaultMap]);

  const loading = agentsLoading || vaultLoading;

  return (
    <>
      <div className="dashboard-grid" style={{ marginBottom: "var(--space-lg)" }}>
        <div className="dashboard-stat">
          <div className="dashboard-stat__label">Agents</div>
          <div className="dashboard-stat__value">
            {loading ? <Skeleton width={40} height={28} /> : agents.length}
          </div>
        </div>
        <div className="dashboard-stat">
          <div className="dashboard-stat__label">Total vault</div>
          <div
            className="dashboard-stat__value"
            style={{ fontSize: "var(--text-lg)" }}
          >
            {loading ? (
              <Skeleton width={80} height={28} />
            ) : (
              `${Number(formatEther(totalVaultWei)).toFixed(4)} 0G`
            )}
          </div>
        </div>
        <div className="dashboard-stat">
          <div className="dashboard-stat__label">Needs funding</div>
          <div className="dashboard-stat__value">
            {loading ? <Skeleton width={32} height={28} /> : unfunded.length}
          </div>
        </div>
        <div className="dashboard-stat">
          <div className="dashboard-stat__label">Oracle</div>
          <div
            className="dashboard-stat__value"
            style={{
              fontSize: "var(--text-sm)",
              color:
                health?.oracle === "up" ? COLORS.success : COLORS.warning,
            }}
          >
            {health
              ? health.oracle === "up"
                ? "Online"
                : "Down"
              : "—"}
          </div>
        </div>
      </div>

      {/* Short task rail — not a second nav */}
      <div className="action-rail">
        <Link to="/chat" style={{ textDecoration: "none" }}>
          <Button variant="secondary">Ask Axiom</Button>
        </Link>
        <Link to="/market" style={{ textDecoration: "none" }}>
          <Button variant="ghost">Market activity</Button>
        </Link>
      </div>

      {agentsError && (
        <Card
          style={{
            marginBottom: "var(--space-xl)",
            borderColor: COLORS.dangerBorder,
          }}
        >
          <p
            style={{
              margin: 0,
              color: COLORS.danger,
              fontSize: "var(--text-sm)",
            }}
          >
            Failed to load agents: {agentsError.message}
          </p>
        </Card>
      )}

      {(unfunded.length > 0 || unbound.length > 0) && (
        <Card style={{ marginBottom: "var(--space-xl)" }}>
          <h2
            style={{
              margin: "0 0 var(--space-md)",
              fontSize: "var(--text-base)",
              color: COLORS.textPrimary,
            }}
          >
            Needs attention
          </h2>
          <ul
            style={{
              margin: 0,
              paddingLeft: "1.25rem",
              color: COLORS.textMuted,
              fontSize: "var(--text-sm)",
              lineHeight: 1.6,
            }}
          >
            {unfunded.slice(0, 4).map((a) => (
              <li key={`f-${a.tokenId}`}>
                #{a.tokenId.toString()} zero vault —{" "}
                <Link
                  to={`/agents/${a.tokenId}`}
                  style={{ color: COLORS.bronzeLight }}
                >
                  fund
                </Link>
              </li>
            ))}
            {unbound.slice(0, 4).map((a) => (
              <li key={`s-${a.tokenId}`}>
                #{a.tokenId.toString()} no strategy —{" "}
                <Link
                  to={`/agents/${a.tokenId}`}
                  style={{ color: COLORS.bronzeLight }}
                >
                  bind
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Suspense
        fallback={
          <Card>
            <Skeleton height={120} />
          </Card>
        }
      >
        <AgentsBrowser embedded />
      </Suspense>

      <p
        style={{
          marginTop: "var(--space-xl)",
          fontSize: "var(--text-xs)",
          color: COLORS.textDim,
        }}
      >
        {address
          ? `${address.slice(0, 6)}…${address.slice(-4)} · `
          : ""}
        Software TEE oracle · agent detail for vault / tick / transfer
      </p>
    </>
  );
}

export default HomePage;
