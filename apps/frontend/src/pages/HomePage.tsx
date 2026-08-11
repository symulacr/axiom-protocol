import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
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
import { usePortfolio } from "../hooks/usePortfolio.js";
import { useMediaQuery } from "../hooks/useMediaQuery.js";
import { formatTokenAmount, truncateAddress } from "../utils/format.js";

const AgentsBrowser = lazy(() => import("./AgentsBrowser.js"));

/** Fired by the app-shell mint modal on confirmed mint (see App.tsx). */
const MINT_COMPLETE_EVENT = "axiom:mint-complete";

// Module-scoped mint tracker: survives route unmounts so a just-minted agent
// shows a pending row on Home until the agents poll picks it up.
let lastMintAt: number | null = null;
let lastMintCount: number | null = null;

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
        <HomeSeal />
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

/** Decorative seal; hidden on mobile so the agent list stays above the fold. */
function HomeSeal(): ReactElement | null {
  const isMobile = useMediaQuery("(max-width: 640px)");
  if (isMobile) return null;
  return (
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
  );
}

function HomeBody(): ReactElement {
  const { address } = useAccount();
  const isMobile = useMediaQuery("(max-width: 640px)");
  const { agents, error: agentsError, vaultMap, loading } = usePortfolio();

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

  // Optimistic mint row: a confirmed mint shows a pending card until the
  // agents poll returns the new agent (then the real card replaces it).
  const agentsCountRef = useRef(agents.length);
  agentsCountRef.current = agents.length;
  const [mintPending, setMintPending] = useState<boolean>(() => {
    return (
      lastMintAt !== null &&
      Date.now() - lastMintAt < 90_000 &&
      agents.length === lastMintCount
    );
  });

  useEffect(() => {
    function onMintComplete(): void {
      lastMintAt = Date.now();
      lastMintCount = agentsCountRef.current;
      setMintPending(true);
    }
    window.addEventListener(MINT_COMPLETE_EVENT, onMintComplete);
    return () =>
      window.removeEventListener(MINT_COMPLETE_EVENT, onMintComplete);
  }, []);

  useEffect(() => {
    if (!mintPending) return;
    const resolved =
      (lastMintCount !== null && agents.length !== lastMintCount) ||
      (lastMintAt !== null && Date.now() - lastMintAt > 120_000);
    if (resolved) {
      setMintPending(false);
      lastMintAt = null;
      lastMintCount = null;
    }
  }, [mintPending, agents.length]);

  const mobileStatStyle = isMobile
    ? { flex: "0 0 auto", minWidth: "8.5rem", padding: "var(--space-md)" }
    : {};

  return (
    <>
      <div
        className="dashboard-grid home-stats stagger-in"
        style={{
          marginBottom: "var(--space-lg)",
          ...(isMobile
            ? {
                display: "flex",
                overflowX: "auto",
                WebkitOverflowScrolling: "touch",
                scrollbarWidth: "none",
              }
            : {}),
        }}
        aria-label="Portfolio stats"
      >
        <div
          className="dashboard-stat"
          style={{ ["--i" as string]: 0, ...mobileStatStyle }}
        >
          <div className="dashboard-stat__label">Agents</div>
          <div className="dashboard-stat__value">
            {loading ? <Skeleton width={40} height={28} /> : agents.length}
          </div>
        </div>
        <div
          className="dashboard-stat dashboard-stat--vault"
          style={{ ["--i" as string]: 1, ...mobileStatStyle }}
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
        <div
          className="dashboard-stat"
          style={{ ["--i" as string]: 2, ...mobileStatStyle }}
        >
          <div className="dashboard-stat__label">Needs funding</div>
          <div className="dashboard-stat__value">
            {loading ? <Skeleton width={32} height={28} /> : unfunded.length}
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

      {loading || unfunded.length > 0 || unbound.length > 0 ? (
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
          {loading ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-sm)",
              }}
            >
              <Skeleton width="55%" height={14} />
              <Skeleton width="40%" height={14} />
            </div>
          ) : (
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
          )}
        </div>
      ) : null}

      {mintPending && (
        <Card style={{ marginBottom: "var(--space-md)" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-md)",
            }}
          >
            <Skeleton
              width={40}
              height={40}
              style={{ borderRadius: "var(--radius-md)", flexShrink: 0 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontWeight: "var(--fw-semibold)",
                  fontSize: "var(--text-sm)",
                  color: COLORS.textPrimary,
                  marginBottom: 6,
                }}
              >
                Your new agent
              </div>
              <Skeleton width="45%" height={12} />
            </div>
            <span
              style={{
                fontSize: "var(--text-xs)",
                color: COLORS.textDim,
                flexShrink: 0,
              }}
            >
              minting…
            </span>
          </div>
        </Card>
      )}

      <Suspense
        fallback={
          <Card>
            <Skeleton height={120} />
          </Card>
        }
      >
        <AgentsBrowser />
      </Suspense>

      {address ? (
        <p
          style={{
            marginTop: "var(--space-xl)",
            fontSize: "var(--text-xs)",
            color: COLORS.textDim,
          }}
        >
          {truncateAddress(address)}
        </p>
      ) : null}
    </>
  );
}

export default HomePage;
