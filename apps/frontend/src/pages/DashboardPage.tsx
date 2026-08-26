/*
  Dashboard (v2 Overview markup fed by the v1 data layer): usePortfolio
  (agents + vault + perf), useHealth, useEventHistory. The agent register is
  the live fleet; the activity panel merges indexer events with the local
  receipts added by the flow pages.
*/
import { useMemo } from "react";
import { useAccount, useChainId } from "wagmi";
import {
  Activity,
  ArrowRight,
  Bot,
  ChevronRight,
  Gauge,
  KeyRound,
  RefreshCw,
  ReceiptText,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from "../components/axiom/icons.js";
import { Button, PanelHead, Status } from "../components/axiom/Controls.js";
import { StatePill } from "../components/StatePill.js";
import { MobileDisclosure } from "../components/MobileDisclosure.js";
import { getCopy } from "../lib/copy.js";
import { routePath } from "../lib/routeRegistry.js";
import type { AppState } from "../lib/models.js";
import {
  hasStrategyRoot,
  isInFlightTx,
  isRecoverableTx,
} from "../lib/models.js";
import type { ConsoleAction } from "../lib/consoleStore.js";
import { useAgents } from "../hooks/useAgents.js";
import {
  useVaultDataBatch,
  type VaultDataEntry,
} from "../hooks/useVaultDataBatch.js";
import { useHealth } from "../hooks/useHealth.js";
import {
  useEventHistory,
  eventTokenId,
  isOwnEvent,
  type AxiomEvent,
} from "../hooks/useEventHistory.js";
import { formatTokenAmount, truncateAddress } from "../utils/format.js";
import { APP_CHAIN, APP_CHAIN_ID } from "../config/wagmi.js";

/**
 * Activity-row detail suffix: local clock/date via Intl (locale-aware) —
 * block numbers mean nothing to a first-time user.
 */
function eventTimeLabel(event: AxiomEvent): string {
  const ts = event.timestamp ?? event.receivedAt;
  const date = new Date(ts);
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

interface PortfolioAgent {
  tokenId: bigint;
  owner: string;
  dataDescription?: string;
}

/** Single owner of the agent portfolio data sources (agents + vault + perf). */
function usePortfolio(): {
  agents: PortfolioAgent[];
  error: Error | null;
  vaultMap: Map<string, VaultDataEntry>;
  loading: boolean;
  refetch: () => void;
} {
  const { agents, isLoading, error, refetch: refetchAgents } = useAgents();
  const tokenIds = useMemo(() => agents.map((a) => a.tokenId), [agents]);
  const {
    data: vaultMap,
    isLoading: vaultLoading,
    refetch: refetchVaults,
  } = useVaultDataBatch(tokenIds);

  return {
    agents,
    error,
    vaultMap,
    loading: isLoading || vaultLoading,
    refetch: () => {
      refetchAgents();
      refetchVaults();
    },
  };
}

function ContextStrip({
  go,
  address,
  chainOk,
  connectorName,
  reviewCount,
  copy,
}: {
  go: (path: string) => void;
  address?: string;
  chainOk: boolean;
  connectorName?: string;
  reviewCount: number;
  copy: ReturnType<typeof getCopy>;
}) {
  return (
    <section className="context-strip">
      {/* Network name/chainId live in the sidebar rail card; wrong-chain
          surfaces via the signer cell. */}
      <div className="context-cell">
        <strong title={address ?? undefined}>
          <Wallet size={15} />{" "}
          {address ? truncateAddress(address) : copy.topbar.notConnected}
        </strong>
      </div>
      <div className="context-cell">
        <strong>
          <KeyRound size={15} />{" "}
          {chainOk ? copy.dashboard.signerReady : copy.dashboard.signerWrong}
        </strong>
        <span className="mono">
          {chainOk
            ? (connectorName ?? copy.dashboard.noConnector)
            : `${connectorName ?? copy.dashboard.noConnector} · ${copy.dashboard.switchRequired}`}
        </span>
      </div>
      <div className="context-cell context-action">
        <strong>{copy.dashboard.attentionCount(reviewCount)}</strong>
        <button
          className="text-link"
          onClick={() => go("/transactions?filter=review")}
        >
          {copy.dashboard.openReviewQueue} <ArrowRight size={14} />
        </button>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  change,
  icon,
}: {
  label: string;
  value: string;
  change: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="stat">
      <div className="stat-top">
        <span>{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <strong>{value}</strong>
      <small>{change}</small>
    </div>
  );
}

/** Shared panel placeholder: title + optional hint line (+ trailing control). */
function EmptyState({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {hint !== undefined && <span>{hint}</span>}
      {children}
    </div>
  );
}
export function DashboardPage({
  go,
  state,
  dispatch,
}: {
  go: (path: string) => void;
  state: AppState;
  dispatch: React.Dispatch<ConsoleAction>;
}) {
  const copy = getCopy(state.settings.locale);
  const { address, connector } = useAccount();
  const chainId = useChainId();
  const chainOk = chainId === APP_CHAIN_ID;
  // Vault balances are native-denominated — the unit comes from chain config, never a literal.
  const nativeSymbol = APP_CHAIN.nativeCurrency.symbol;
  const {
    agents,
    error: agentsError,
    vaultMap,
    loading,
    refetch,
  } = usePortfolio();
  const { data: health, refetch: refetchHealth } = useHealth();
  const { events, refetch: refetchEvents } = useEventHistory({
    pollIntervalMs: 20_000,
  });

  // U8: the indexer subscribes with topics ["*"] — every event surface on
  // this page goes through the shared isOwnEvent scope, never raw length.
  const ownTokenIds = useMemo(
    () => new Set(agents.map((agent) => agent.tokenId.toString())),
    [agents],
  );
  const eventScope = useMemo(
    () => ({ address, tokenIds: ownTokenIds }),
    [address, ownTokenIds],
  );
  const ownEvents = useMemo(
    () =>
      events.filter(
        (event) =>
          event.eventName !== "transcript" && isOwnEvent(event, eventScope),
      ),
    [events, eventScope],
  );

  const totalVaultWei = useMemo(() => {
    let sum = 0n;
    for (const entry of vaultMap.values()) sum += entry.depositsWei;
    return sum;
  }, [vaultMap]);

  const attention = useMemo(
    () =>
      agents.filter((agent) => {
        const vault = vaultMap.get(agent.tokenId.toString());
        if (!vault) return true; // no vault data yet — needs review
        const root = vault.strategyRoot?.toLowerCase?.() ?? "";
        return vault.depositsWei === 0n || !hasStrategyRoot(root);
      }),
    [agents, vaultMap],
  );

  const refresh = () => {
    refetch();
    refetchHealth();
    refetchEvents();
    dispatch({
      type: "notice",
      notice: copy.dashboard.refreshNotice,
    });
  };

  const reviewCount = state.transactions.filter((tx) =>
    isRecoverableTx(tx.state),
  ).length;

  // First unready agent drives the one primary CTA (next-action panel).
  const firstAttention = attention[0];

  const activityRows = useMemo(() => {
    // Chat-transcript storage pointers are not operator activity — receipts only.
    // U8: scoped through isOwnEvent; strangers' chain events are noise here.
    const chainSource = ownEvents.slice(0, 3);
    const local = state.transactions.slice(0, 3).map((tx) => ({
      key: tx.id,
      icon: tx.icon,
      kind: tx.kind,
      detail: tx.detail,
      state: tx.state,
      open: `/transactions?tx=${encodeURIComponent(tx.id)}`,
    }));
    const chainEvents = chainSource.slice(0, 3).map((event) => {
      const tokenId = eventTokenId(event);
      return {
        key: `${event.txHash}:${event.logIndex}`,
        icon: <Activity size={15} />,
        kind: event.eventName || "Event",
        detail: tokenId
          ? `agent #${tokenId} · ${eventTimeLabel(event)}`
          : eventTimeLabel(event),
        state: "confirmed" as const,
        open: tokenId
          ? `/agents/${tokenId}?tab=activity`
          : routePath("transactions"),
      };
    });
    return [...local, ...chainEvents].slice(0, 3);
  }, [state.transactions, ownEvents]);
  return (
    <div className="ops-page">
      <div className="page-head page-head-asymmetric">
        <div>
          <h1>{copy.dashboard.title}</h1>
        </div>
        <div className="action-lane">
          <strong>{copy.dashboard.review(attention.length)}</strong>
          {/* One owner for the payment next-action at depth 0: the
              PriorityActionStrip (global chrome). The action lane keeps the
              attention readout + Refresh only. */}
          <button className="text-link" onClick={refresh}>
            {copy.dashboard.refresh} <RefreshCw size={13} />
          </button>
        </div>
      </div>

      <ContextStrip
        go={go}
        address={address}
        chainOk={chainOk}
        connectorName={connector?.name}
        reviewCount={reviewCount}
        copy={copy}
      />

      <MobileDisclosure
        className="dashboard-mobile-disclosure"
        title={copy.dashboard.telemetryTitle}
      >
        <section className="stats-grid">
          <Stat
            label={copy.dashboard.managedValue}
            value={`${formatTokenAmount(totalVaultWei)} ${nativeSymbol}`}
            change={
              loading
                ? copy.dashboard.loadingVaults
                : copy.dashboard.agentsScoped(agents.length)
            }
            icon={<TrendingUp size={16} />}
          />
          <Stat
            label={copy.dashboard.agentsOnline}
            value={`${agents.length - attention.length} / ${agents.length}`}
            change={
              attention.length
                ? copy.dashboard.needReview(attention.length)
                : copy.dashboard.fleetNominal
            }
            icon={<Bot size={16} />}
          />
          <Stat
            label={copy.dashboard.pendingMine}
            value={String(
              state.transactions.filter((tx) => isInFlightTx(tx.state)).length,
            )}
            change={
              health && !health.ok
                ? copy.dashboard.oracleUnreachable
                : copy.dashboard.queueAwaiting
            }
            icon={<Gauge size={16} />}
          />
        </section>
        <section className="panel activity-panel">
          <PanelHead title={copy.dashboard.latestEvidence}>
            <Button
              variant="ghost"
              onClick={() => go(routePath("transactions"))}
              icon={<ReceiptText size={14} />}
            >
              {copy.dashboard.allReceipts}
            </Button>
          </PanelHead>
          <div className="activity-list">
            {activityRows.length === 0 && (
              <EmptyState
                title={copy.dashboard.noEvidence}
                hint={copy.dashboard.noEvidenceHint}
              />
            )}
            {activityRows.map((row) => (
              <button
                key={row.key}
                className="activity-row"
                onClick={() => go(row.open)}
              >
                <span>{row.icon}</span>
                <span>
                  <strong>{row.kind}</strong>
                  <small>{row.detail}</small>
                </span>
                <StatePill state={row.state} />
                <ChevronRight size={14} />
              </button>
            ))}
          </div>
        </section>
      </MobileDisclosure>

      <div className="dashboard-split">
        <section className="panel agent-panel">
          <PanelHead title={copy.dashboard.operatingFleet} />
          <div className="agent-list">
            {agentsError && (
              <EmptyState
                title={copy.dashboard.registerUnavailable}
                hint={agentsError.message}
              />
            )}
            {/* U4: the register is empty only after load — during fetch the
                panel shows a busy placeholder, never "No agents yet". */}
            {!agentsError && loading && agents.length === 0 && (
              <div aria-busy="true">
                <EmptyState title={copy.dashboard.loadingVaults} />
              </div>
            )}
            {!agentsError && !loading && agents.length === 0 && (
              <EmptyState
                title={copy.dashboard.noAgents}
                hint={copy.dashboard.noAgentsHint}
              >
                <Button
                  onClick={() => go(routePath("mint"))}
                  icon={<Bot size={15} />}
                >
                  {copy.dashboard.mintAgent}
                </Button>
              </EmptyState>
            )}
            {agents.map((agent) => {
              const vault = vaultMap.get(agent.tokenId.toString());
              const needsAttention = attention.some(
                (a) => a.tokenId === agent.tokenId,
              );
              return (
                <button
                  key={agent.tokenId.toString()}
                  className="agent-row"
                  onClick={() => go(`/agents/${agent.tokenId}`)}
                >
                  <span className="agent-row-mark">
                    <Bot size={16} />
                  </span>
                  <span>
                    <strong>Agent #{agent.tokenId.toString()}</strong>
                    <small>
                      {agent.dataDescription
                        ? agent.dataDescription.slice(0, 42)
                        : copy.dashboard.noDescription}
                    </small>
                  </span>
                  <span className="agent-value">
                    <b>
                      {vault
                        ? `${formatTokenAmount(vault.depositsWei)} ${nativeSymbol}`
                        : "—"}
                    </b>
                    <Status
                      label={
                        needsAttention
                          ? copy.dashboard.needsSetupLabel
                          : copy.dashboard.readyLabel
                      }
                      tone={needsAttention ? "warning" : "success"}
                    />
                  </span>
                  <ChevronRight size={15} />
                </button>
              );
            })}
          </div>
        </section>
        <section className="panel next-action-panel">
          <PanelHead title={copy.dashboard.attentionFirst}>
            <ShieldCheck size={18} className="copper" />
          </PanelHead>
          <div className="proof-card">
            {/* U8: no canned allowance card when nothing needs attention —
                the fallback collapses to honest text-only. */}
            {firstAttention ? (
              <>
                <div>
                  <small>
                    {copy.dashboard.agentFundingLabel(
                      firstAttention.tokenId.toString(),
                    )}
                  </small>
                  <strong>{copy.dashboard.allowanceReady}</strong>
                </div>
                <Button
                  onClick={() =>
                    go(
                      `${routePath("deposit")}?agent=${firstAttention.tokenId.toString()}`,
                    )
                  }
                  icon={<Wallet size={15} />}
                >
                  {copy.dashboard.addMoney}
                </Button>
              </>
            ) : (
              <div>
                <strong>{copy.dashboard.fleetNominal}</strong>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
