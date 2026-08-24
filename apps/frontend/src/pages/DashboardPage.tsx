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
  Database,
  Gauge,
  KeyRound,
  RefreshCw,
  ReceiptText,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from "../components/axiom/icons.js";
import { Button, Status } from "../components/axiom/Controls.js";
import { StatePill } from "../components/StatePill.js";
import { MobileDisclosure } from "../components/MobileDisclosure.js";
import { getCopy } from "../lib/copy.js";
import type { AppState } from "../lib/models.js";
import {
  hasStrategyRoot,
  isInFlightTx,
  isRecoverableTx,
} from "../lib/models.js";
import type { ConsoleAction } from "../lib/consoleStore.js";
import { usePortfolio } from "../hooks/usePortfolio.js";
import { useHealth } from "../hooks/useHealth.js";
import { useEventHistory, eventTokenId } from "../hooks/useEventHistory.js";
import { formatTokenAmount, truncateAddress } from "../utils/format.js";
import { APP_CHAIN, APP_CHAIN_ID } from "../config/wagmi.js";

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
      {/* the network cell is
          gone — the sidebar rail's network card is the single owner of
          name + chain id. A wrong chain still surfaces here through the
          signer cell ("Wrong network"), so no decision state was lost. */}
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

  const activityRows = useMemo(() => {
    // Chat-transcript storage pointers are not operator activity — receipts only.
    const chainSource = events.filter(
      (event) => event.eventName !== "transcript",
    );
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
          ? `agent #${tokenId} · block ${event.blockNumber}`
          : `block ${event.blockNumber}`,
        state: "confirmed" as const,
        open: tokenId ? `/agents/${tokenId}?tab=activity` : "/transactions",
      };
    });
    return [...local, ...chainEvents].slice(0, 3);
  }, [state.transactions, events]);
  return (
    <div className="ops-page">
      <div className="page-head page-head-asymmetric">
        <div>
          <h1>
            {copy.dashboard.titleLead}
            <br />
            <i>{copy.dashboard.titleEmphasis}</i>
          </h1>
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
            value={`${String(agents.length - attention.length).padStart(2, "0")} / ${String(agents.length).padStart(2, "0")}`}
            change={
              attention.length
                ? copy.dashboard.needReview(attention.length)
                : copy.dashboard.fleetNominal
            }
            icon={<Bot size={16} />}
          />
          <Stat
            label={copy.dashboard.storageProofs}
            value={String(events.length)}
            change={copy.dashboard.eventsIndexed}
            icon={<Database size={16} />}
          />
          <Stat
            label={copy.dashboard.liveQueue}
            value={String(
              state.transactions.filter((tx) => isInFlightTx(tx.state)).length,
            ).padStart(2, "0")}
            change={
              health && !health.ok
                ? copy.dashboard.oracleUnreachable
                : copy.dashboard.queueAwaiting
            }
            icon={<Gauge size={16} />}
          />
        </section>
        <section className="panel activity-panel">
          <div className="panel-head">
            <div>
              <h2>{copy.dashboard.latestEvidence}</h2>
            </div>
            <Button
              variant="ghost"
              onClick={() => go("/transactions")}
              icon={<ReceiptText size={14} />}
            >
              {copy.dashboard.allReceipts}
            </Button>
          </div>
          <div className="activity-list">
            {activityRows.length === 0 && (
              <div className="empty-state">
                <strong>{copy.dashboard.noEvidence}</strong>
                <span>{copy.dashboard.noEvidenceHint}</span>
              </div>
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
          <div className="panel-head">
            <div>
              <h2>{copy.dashboard.operatingFleet}</h2>
            </div>
          </div>
          <div className="agent-list">
            {agentsError && (
              <div className="empty-state">
                <strong>{copy.dashboard.registerUnavailable}</strong>
                <span>{agentsError.message}</span>
              </div>
            )}
            {!agentsError && agents.length === 0 && (
              <div className="empty-state">
                <strong>{copy.dashboard.noAgents}</strong>
                <span>{copy.dashboard.noAgentsHint}</span>
                <Button onClick={() => go("/mint")} icon={<Bot size={15} />}>
                  {copy.dashboard.mintAgent}
                </Button>
              </div>
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
                      {truncateAddress(agent.owner)} ·{" "}
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
                      label={needsAttention ? "attention" : "online"}
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
          <div className="panel-head">
            <div>
              <h2>{copy.dashboard.attentionFirst}</h2>
            </div>
            <ShieldCheck size={18} className="copper" />
          </div>
          <div className="proof-card">
            <img src="/brand/hero-seal-512.jpg" alt="Abstract proof field" />
            <div>
              <small>
                {attention[0]
                  ? copy.dashboard.agentFundingLabel(
                      attention[0].tokenId.toString(),
                    )
                  : copy.dashboard.paymentAllowanceLabel}
              </small>
              <strong>{copy.dashboard.allowanceReady}</strong>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
