import { useMemo, type ReactElement } from "react";
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

/**
 * Production operator dashboard — portfolio KPIs + next actions.
 * Does not re-embed AgentsBrowser/Market (those live on their own routes).
 */
export function HomePage(): ReactElement {
  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Portfolio health and next actions for your iNFT agents on 0G."
      />
      <ConnectedGuard>
        <DashboardBody />
      </ConnectedGuard>
    </div>
  );
}

function DashboardBody(): ReactElement {
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
      <div className="dashboard-grid" style={{ marginBottom: "var(--space-xl)" }}>
        <div className="dashboard-stat">
          <div className="dashboard-stat__label">Agents</div>
          <div className="dashboard-stat__value">
            {loading ? <Skeleton width={40} height={28} /> : agents.length}
          </div>
        </div>
        <div className="dashboard-stat">
          <div className="dashboard-stat__label">Total vault</div>
          <div className="dashboard-stat__value" style={{ fontSize: "var(--text-lg)" }}>
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
              fontSize: "var(--text-base)",
              color:
                health?.oracle === "up" ? COLORS.success : COLORS.warning,
            }}
          >
            {health
              ? health.oracle === "up"
                ? "Online (sim. TEE)"
                : "Down"
              : "—"}
          </div>
        </div>
      </div>

      <div className="action-rail">
        <Link to="/agents/new" style={{ textDecoration: "none" }}>
          <Button variant="primary">Mint agent</Button>
        </Link>
        <Link to="/agents" style={{ textDecoration: "none" }}>
          <Button variant="secondary">Browse agents</Button>
        </Link>
        <Link to="/chat" style={{ textDecoration: "none" }}>
          <Button variant="ghost">Chat console</Button>
        </Link>
        <Link to="/market" style={{ textDecoration: "none" }}>
          <Button variant="ghost">Market</Button>
        </Link>
      </div>

      {agentsError && (
        <Card style={{ marginBottom: "var(--space-xl)", borderColor: COLORS.dangerBorder }}>
          <p style={{ margin: 0, color: COLORS.danger, fontSize: "var(--text-sm)" }}>
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
            {unfunded.slice(0, 5).map((a) => (
              <li key={`f-${a.tokenId}`}>
                Agent #{a.tokenId.toString()} has zero vault balance —{" "}
                <Link
                  to={`/agents/${a.tokenId}`}
                  style={{ color: COLORS.bronzeLight }}
                >
                  fund vault
                </Link>
              </li>
            ))}
            {unbound.slice(0, 5).map((a) => (
              <li key={`s-${a.tokenId}`}>
                Agent #{a.tokenId.toString()} has no strategy root —{" "}
                <Link
                  to={`/agents/${a.tokenId}`}
                  style={{ color: COLORS.bronzeLight }}
                >
                  bind strategy
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: "var(--space-md)",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "var(--text-base)",
              color: COLORS.textPrimary,
            }}
          >
            Your agents
          </h2>
          <Link
            to="/agents"
            style={{
              fontSize: "var(--text-sm)",
              color: COLORS.bronzeLight,
              textDecoration: "none",
            }}
          >
            View all →
          </Link>
        </div>
        {loading && <Skeleton height={48} />}
        {!loading && agents.length === 0 && (
          <p style={{ margin: 0, color: COLORS.textMuted, fontSize: "var(--text-sm)" }}>
            No agents yet.{" "}
            <Link to="/agents/new" style={{ color: COLORS.bronzeLight }}>
              Mint your first iNFT agent
            </Link>{" "}
            to start funding a vault and running ticks.
          </p>
        )}
        {!loading && agents.length > 0 && (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {agents.slice(0, 6).map((a) => {
              const v = vaultMap.get(a.tokenId.toString());
              const bal = v ? Number(formatEther(v.depositsWei)).toFixed(4) : "—";
              return (
                <li
                  key={a.tokenId.toString()}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "var(--space-md)",
                    padding: "var(--space-md) 0",
                    borderBottom: `1px solid ${COLORS.border}`,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <Link
                      to={`/agents/${a.tokenId}`}
                      style={{
                        color: COLORS.textPrimary,
                        fontWeight: "var(--fw-semibold)",
                        textDecoration: "none",
                        fontSize: "var(--text-sm)",
                      }}
                    >
                      #{a.tokenId.toString()}
                      {a.dataDescription
                        ? ` · ${a.dataDescription.slice(0, 48)}`
                        : ""}
                    </Link>
                    <div
                      className="surface-lcd"
                      style={{
                        display: "inline-block",
                        marginTop: 6,
                        padding: "2px 8px",
                        fontSize: "var(--text-xs)",
                      }}
                    >
                      {bal} 0G
                    </div>
                  </div>
                  <Link
                    to={`/agents/${a.tokenId}#execute`}
                    style={{ textDecoration: "none", flexShrink: 0 }}
                  >
                    <Button variant="ghost" style={{ fontSize: "var(--text-xs)" }}>
                      Tick
                    </Button>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <p
        style={{
          marginTop: "var(--space-xl)",
          fontSize: "var(--text-xs)",
          color: COLORS.textDim,
        }}
      >
        Signed in as {address?.slice(0, 6)}…{address?.slice(-4)}. Oracle is a
        software-simulated TEE signer — not Intel TDX/SEV.
      </p>
    </>
  );
}

export default HomePage;
