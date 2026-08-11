import { lazy, Suspense, useMemo, type ReactElement } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
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
import { formatTokenAmount, truncateAddress } from "../utils/format.js";

const AgentsBrowser = lazy(() => import("./AgentsBrowser.js"));

/** Home = portfolio KPIs + full agent list; merges the old Dashboard and Agents destinations. */
function HomePage(): ReactElement {
  return (
    <div>
      <div
        className="home-hero-row"
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "var(--space-xl)",
          marginBottom: "var(--space-md)",
          flexWrap: "wrap",
        }}
      >
        <img
          src="/brand/hero-seal-512.jpg"
          alt=""
          width={72}
          height={72}
          className="home-hero-seal"
          style={{
            width: 72,
            height: 72,
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--c-border)",
            objectFit: "cover",
            boxShadow: "var(--shadow-1)",
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: "12rem" }}>
          <PageHeader
            title="Home"
            subtitle="Agents and vaults. Open detail to fund, tick, or transfer."
            action={
              <Link to="/app?mint=1" style={{ textDecoration: "none" }}>
                <Button variant="primary">Mint</Button>
              </Link>
            }
          />
        </div>
      </div>
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
      <div
        className="dashboard-grid home-stats stagger-in"
        style={{ marginBottom: "var(--space-lg)" }}
        aria-label="Portfolio stats"
      >
        <div className="dashboard-stat" style={{ ["--i" as string]: 0 }}>
          <div className="dashboard-stat__label">Agents</div>
          <div className="dashboard-stat__value">
            {loading ? <Skeleton width={40} height={28} /> : agents.length}
          </div>
        </div>
        <div
          className="dashboard-stat dashboard-stat--vault"
          style={{ ["--i" as string]: 1 }}
        >
          <div className="dashboard-stat__label">Total vault</div>
          <div
            className="dashboard-stat__value"
            style={{ fontSize: "var(--text-lg)" }}
          >
            {loading ? (
              <Skeleton width={80} height={28} />
            ) : (
              `${formatTokenAmount(totalVaultWei)} 0G`
            )}
          </div>
        </div>
        <div className="dashboard-stat" style={{ ["--i" as string]: 2 }}>
          <div className="dashboard-stat__label">Needs funding</div>
          <div className="dashboard-stat__value">
            {loading ? <Skeleton width={32} height={28} /> : unfunded.length}
          </div>
        </div>
        <div
          className={`dashboard-stat${
            health?.oracle === "up" ? " dashboard-stat--live" : ""
          }`}
          style={{ ["--i" as string]: 3 }}
        >
          <div className="dashboard-stat__label">Oracle</div>
          <div
            className="dashboard-stat__value"
            style={{
              fontSize: "var(--text-sm)",
              color: health?.oracle === "up" ? COLORS.success : COLORS.warning,
            }}
          >
            {health ? (health.oracle === "up" ? "Online" : "Down") : "—"}
          </div>
        </div>
      </div>

      <div className="action-rail" aria-label="Quick actions">
        <Link to="/chat" style={{ textDecoration: "none" }}>
          <Button variant="secondary">Chat</Button>
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
        <div
          className="home-attention"
          style={{
            marginBottom: "var(--space-xl)",
            padding: "var(--space-md) 0",
            borderTop: `1px solid ${COLORS.border}`,
            borderBottom: `1px solid ${COLORS.border}`,
          }}
        >
          <div
            style={{
              marginBottom: "var(--space-sm)",
              fontSize: "var(--text-xs)",
              fontFamily: "var(--font-mono)",
              color: COLORS.textDim,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            Needs attention
          </div>
          <ul
            style={{
              margin: 0,
              paddingLeft: "1.15rem",
              color: COLORS.textMuted,
              fontSize: "var(--text-sm)",
              lineHeight: 1.55,
            }}
          >
            {unfunded.slice(0, 3).map((a) => (
              <li key={`f-${a.tokenId}`}>
                #{a.tokenId.toString()} empty vault —{" "}
                <Link
                  to={`/agents/${a.tokenId}`}
                  style={{ color: COLORS.bronzeLight }}
                >
                  fund
                </Link>
              </li>
            ))}
            {unbound.slice(0, 3).map((a) => (
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
        </div>
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
        {address ? `${truncateAddress(address)} · ` : ""}
        Open an agent to fund, tick, or transfer
      </p>
    </>
  );
}

export default HomePage;
