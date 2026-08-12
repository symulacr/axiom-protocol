import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type ReactElement,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAccount } from "wagmi";
import { formatEther } from "viem";
import { flushSync } from "react-dom";
import { usePortfolio } from "../hooks/usePortfolio.js";
import type { VaultDataEntry } from "../hooks/useVaultDataBatch.js";
import type { PerformanceMetrics } from "@axiom/config/types/performance";
import { truncateAddress } from "../utils/format.js";
import { BRAND } from "../brand/assets.js";
import { EmptyState } from "../components/EmptyState.js";
import {
  COLORS,
  Skeleton,
  ErrorAlert,
  ConnectedGuard,
  Input,
  Button,
  withViewTransition,
} from "../components/ui.js";

const emptyHintStyle: CSSProperties = {
  color: COLORS.textDim,
  textAlign: "center",
  margin: "var(--space-2xl) 0",
};
const pillButtonStyle: CSSProperties = {
  fontSize: "var(--text-xs)",
  padding: "0.25rem 0.5rem",
};

/** Subsequence scorer with boundary, streak, and prefix bonuses; 0 = no match. */
function rank(query: string, value: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const v = value.toLowerCase();
  let score = 0,
    streak = 0,
    best = 0,
    qi = 0;
  for (let vi = 0; vi < v.length && qi < q.length; vi++) {
    if (v[vi] === q[qi]) {
      qi++;
      score += vi === 0 || !/[a-z0-9]/.test(v[vi - 1] ?? "") ? 2 : 1;
      best = Math.max(best, ++streak);
    } else streak = 0;
  }
  if (qi < q.length) return 0;
  return score + best * 2 + (v.startsWith(q) ? 4 : 0);
}

const AGENT_GRID_LIMIT = 24;

interface AgentCardStatusProps {
  vaultData: VaultDataEntry | undefined;
  metrics: PerformanceMetrics | undefined;
}

function AgentCardStatus({ vaultData, metrics }: AgentCardStatusProps) {
  if (!vaultData || vaultData.depositsWei === undefined) return null;
  const balance = formatEther(vaultData.depositsWei);
  const balanceNum = parseFloat(balance);
  const hasBalance = balanceNum > 0;
  let lastAction: string | null = null;
  if (metrics && metrics.totalTicks > 0) {
    if (metrics.buyCount > metrics.sellCount) lastAction = "Mostly buy";
    else if (metrics.sellCount > metrics.buyCount) lastAction = "Mostly sell";
    else lastAction = "Mixed";
  }
  return (
    <span
      style={{
        fontSize: "var(--text-xs)",
        color: COLORS.textDim,
        display: "flex",
        gap: "var(--space-sm)",
      }}
    >
      {hasBalance && <span>{balanceNum.toFixed(2)} 0G</span>}
      {lastAction && (
        <span
          style={{ color: COLORS.textMuted }}
          title="Summary of all historical ticks; for the latest action, open the agent detail."
        >
          {hasBalance ? "· " : ""}
          {lastAction}
        </span>
      )}
    </span>
  );
}

function AgentsBrowser(): ReactElement {
  const { isConnected } = useAccount();
  const navigate = useNavigate();
  const {
    agents,
    isLoading,
    error,
    vaultMap: vaultDataMap,
    perfMap,
  } = usePortfolio();
  const count = agents.length;
  const [searchTerm, setSearchTerm] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showAllAgents, setShowAllAgents] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  function handleSearchChange(e: ChangeEvent<HTMLInputElement>) {
    setSearchTerm(e.target.value);
    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(
      () => setDebouncedSearch(e.target.value),
      200,
    );
  }

  useEffect(() => () => clearTimeout(debounceTimerRef.current), []);

  const filteredAgents = useMemo(() => {
    if (!debouncedSearch) return agents;
    return agents
      .map((a) => ({
        agent: a,
        score: rank(
          debouncedSearch,
          `${a.tokenId?.toString() ?? ""} ${a.owner ?? ""} ${a.dataDescription ?? ""}`,
        ),
      }))
      .filter((r) => r.score > 0)
      .sort((x, y) => y.score - x.score)
      .map((r) => r.agent);
  }, [debouncedSearch, agents]);
  const hasMoreAgents = filteredAgents.length > AGENT_GRID_LIMIT;
  const displayedAgents = showAllAgents
    ? filteredAgents
    : filteredAgents.slice(0, AGENT_GRID_LIMIT);

  if (error !== null) {
    return (
      <div>
        <ErrorAlert
          message="Couldn't load your agents from the chain. Check your connection and try again."
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-md)",
          }}
        >
          <Skeleton height={48} />
          <Skeleton height={48} />
          <Skeleton height={48} />
        </div>
      </div>
    );
  }

  if (count === 0) {
    return (
      <div>
        {!isConnected ? (
          <EmptyState>Connect your wallet to get started</EmptyState>
        ) : (
          <EmptyState
            illustrated
            title="No agents yet"
            action={
              <Link to="/app?mint=1">
                <Button variant="primary">Mint your first agent</Button>
              </Link>
            }
          >
            Name an agent and mint. Fund later on agent detail.
          </EmptyState>
        )}
      </div>
    );
  }

  return (
    <div>
      <ConnectedGuard>
        <h2
          style={{
            margin: "0 0 var(--space-md)",
            fontSize: "var(--text-base)",
            color: COLORS.textPrimary,
          }}
        >
          Your agents
        </h2>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-sm)",
            marginBottom: 16,
          }}
        >
          <Input
            id="agent-search"
            ref={searchRef}
            type="text"
            placeholder="Search by ID, name, or owner… (⌘K)"
            value={searchTerm}
            onChange={handleSearchChange}
            aria-label="Search agents"
            style={{ flex: 1, minWidth: 0, boxSizing: "border-box" }}
          />
          {debouncedSearch && (
            <span
              style={{
                color: COLORS.textDim,
                fontSize: "var(--text-xs)",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {filteredAgents.length} of {count}
            </span>
          )}
        </div>
        {filteredAgents.length === 0 ? (
          <p style={emptyHintStyle}>No agents match your search</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {displayedAgents.map((agent, i) => (
              <div
                key={agent.tokenId}
                className="agent-card cv-auto fade-enter card-layered"
                style={{
                  padding: "12px 16px",
                  borderRadius: "var(--radius-lg)",
                  background: COLORS.surface,
                  color: COLORS.text,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  border: `1px solid ${COLORS.border}`,
                  overflow: "hidden",
                  minWidth: 0,
                  gap: "var(--space-md)",
                  animationDelay: `${Math.min(i, 10) * 40}ms`,
                  backgroundImage: `linear-gradient(120deg, rgba(79,70,229,0.08), transparent 42%, rgba(196,122,58,0.05)), url(${BRAND.agentLattice})`,
                  backgroundSize: "cover, 56px 56px",
                  backgroundPosition: "center, right 8px center",
                  backgroundRepeat: "no-repeat, no-repeat",
                  transition:
                    "transform 150ms var(--ease-out), border-color 150ms var(--ease-out), box-shadow 150ms var(--ease-out)",
                }}
              >
                <img
                  src={BRAND.agentLattice}
                  alt=""
                  width={40}
                  height={40}
                  loading="lazy"
                  decoding="async"
                  className="agent-card__motif"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "var(--radius-md)",
                    border: `1px solid ${COLORS.border}`,
                    objectFit: "cover",
                    flexShrink: 0,
                    opacity: 0.9,
                  }}
                />
                <Link
                  to={`/agents/${agent.tokenId}`}
                  onClick={(e) => {
                    e.preventDefault();
                    const card = e.currentTarget.closest(
                      ".agent-card",
                    ) as HTMLElement | null;
                    card?.style.setProperty(
                      "view-transition-name",
                      "agent-card",
                    );
                    withViewTransition(() =>
                      flushSync(() => navigate(`/agents/${agent.tokenId}`)),
                    );
                    card?.style.removeProperty("view-transition-name");
                  }}
                  style={{
                    overflow: "hidden",
                    minWidth: 0,
                    textDecoration: "none",
                    color: "inherit",
                    flex: 1,
                  }}
                >
                  {agent.dataDescription && agent.dataDescription !== "" && (
                    <span
                      style={{
                        color: COLORS.text,
                        fontWeight: "var(--fw-semibold)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        display: "block",
                        minWidth: 0,
                      }}
                    >
                      {agent.dataDescription}
                    </span>
                  )}
                  <span
                    style={{
                      color: COLORS.textMuted,
                      fontSize: "var(--text-sm)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      display: "block",
                      minWidth: 0,
                    }}
                  >
                    Agent #{agent.tokenId.toString()}
                  </span>
                  <AgentCardStatus
                    vaultData={vaultDataMap.get(agent.tokenId.toString())}
                    metrics={perfMap.get(agent.tokenId.toString())}
                  />
                </Link>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-sm)",
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      color: COLORS.textDim,
                      fontSize: "var(--text-sm)",
                    }}
                  >
                    {truncateAddress(agent.owner ?? "")}
                  </span>
                  <Link to={`/agents/${agent.tokenId}#execute`}>
                    <Button variant="secondary" style={pillButtonStyle}>
                      Execute ▶
                    </Button>
                  </Link>
                  <Link to={`/agents/${agent.tokenId}#payments`}>
                    <Button variant="secondary" style={pillButtonStyle}>
                      Payments
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
            {hasMoreAgents && !showAllAgents && (
              <div style={{ textAlign: "center" }}>
                <Button
                  variant="secondary"
                  onClick={() => setShowAllAgents(true)}
                >
                  Show all {filteredAgents.length} agents
                </Button>
              </div>
            )}
          </div>
        )}
      </ConnectedGuard>
    </div>
  );
}

export default AgentsBrowser;
