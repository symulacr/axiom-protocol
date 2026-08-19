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
  CreditCard,
  Database,
  Gauge,
  KeyRound,
  Network,
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
import type { PrototypeAction } from "../lib/prototypeStore.js";
import { usePortfolio } from "../hooks/usePortfolio.js";
import { useHealth } from "../hooks/useHealth.js";
import { useEventHistory, eventTokenId } from "../hooks/useEventHistory.js";
import { formatTokenAmount, truncateAddress } from "../utils/format.js";
import { APP_CHAIN, APP_CHAIN_ID } from "../config/wagmi.js";

const ZERO_ROOT =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

function ContextStrip({
  go,
  address,
  chainOk,
  connectorName,
  reviewCount,
}: {
  go: (path: string) => void;
  address?: string;
  chainOk: boolean;
  connectorName?: string;
  reviewCount: number;
}) {
  return (
    <section className="context-strip">
      <div className="context-cell">
        <span className="eyebrow">WALLET CONTEXT</span>
        <strong>
          <Wallet size={15} />{" "}
          {address ? truncateAddress(address) : "not connected"}
        </strong>
        <span className="mono">{address ?? "—"}</span>
      </div>
      <div className="context-cell">
        <span className="eyebrow">NETWORK</span>
        <strong>
          <Network size={15} /> {APP_CHAIN.name}
        </strong>
        <span className="mono">
          chain {APP_CHAIN_ID}
          {chainOk ? "" : " · switch required"}
        </span>
      </div>
      <div className="context-cell">
        <span className="eyebrow">SIGNER</span>
        <strong>
          <KeyRound size={15} /> {chainOk ? "Ready to sign" : "Wrong network"}
        </strong>
        <span className="mono">{connectorName ?? "no connector"}</span>
      </div>
      <div className="context-cell context-action">
        <span className="eyebrow">ATTENTION</span>
        <strong>
          {reviewCount} action{reviewCount === 1 ? "" : "s"} need review
        </strong>
        <button
          className="text-link"
          onClick={() => go("/transactions?filter=review")}
        >
          Open review queue <ArrowRight size={14} />
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
  dispatch: React.Dispatch<PrototypeAction>;
}) {
  const copy = getCopy(state.settings.locale);
  const { address, connector } = useAccount();
  const chainId = useChainId();
  const chainOk = chainId === APP_CHAIN_ID;
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
        return vault.depositsWei === 0n || !root || root === ZERO_ROOT;
      }),
    [agents, vaultMap],
  );

  const refresh = () => {
    refetch();
    refetchHealth();
    refetchEvents();
    dispatch({
      type: "notice",
      notice: "Overview refreshed from the live indexers.",
    });
  };

  const reviewCount = state.transactions.filter((tx) =>
    ["reverted", "rejected", "stale"].includes(tx.state),
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
          <span className="eyebrow">{copy.dashboard.eyebrow}</span>
          <h1>
            {copy.dashboard.titleLead}
            <br />
            <i>{copy.dashboard.titleEmphasis}</i>
          </h1>
          <p>{copy.dashboard.description}</p>
        </div>
        <div className="action-lane">
          <span className="eyebrow copper">NOW / REVIEW</span>
          <strong>{copy.dashboard.review(attention.length)}</strong>
          <Button
            onClick={() =>
              go(
                attention[0]
                  ? `/payment?agent=${attention[0].tokenId}&intent=fund&stage=amount`
                  : "/payment?intent=fund&stage=amount",
              )
            }
            icon={<ArrowRight size={15} />}
          >
            {copy.dashboard.reviewAction}
          </Button>
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
      />

      <MobileDisclosure
        className="dashboard-mobile-disclosure"
        eyebrow="SECONDARY TELEMETRY"
        title="Telemetry & recent evidence"
      >
        <section className="stats-grid">
          <Stat
            label={copy.dashboard.managedValue}
            value={`${formatTokenAmount(totalVaultWei)} 0G`}
            change={
              loading
                ? "loading vaults…"
                : `${agents.length} agent${agents.length === 1 ? "" : "s"} scoped`
            }
            icon={<TrendingUp size={16} />}
          />
          <Stat
            label={copy.dashboard.agentsOnline}
            value={`${String(agents.length - attention.length).padStart(2, "0")} / ${String(agents.length).padStart(2, "0")}`}
            change={
              attention.length
                ? `${attention.length} need review`
                : "fleet nominal"
            }
            icon={<Bot size={16} />}
          />
          <Stat
            label={copy.dashboard.storageProofs}
            value={String(events.length)}
            change="events indexed"
            icon={<Database size={16} />}
          />
          <Stat
            label={copy.dashboard.liveQueue}
            value={String(
              state.transactions.filter((tx) =>
                ["submitted", "confirming"].includes(tx.state),
              ).length,
            ).padStart(2, "0")}
            change={health?.ok ? "oracle live" : "oracle unreachable"}
            icon={<Gauge size={16} />}
          />
        </section>
        <section className="panel activity-panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">{copy.dashboard.recentStore}</span>
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
                <strong>No evidence yet</strong>
                <span>
                  Mint an agent or run a payment to create the first receipt.
                </span>
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
              <span className="eyebrow">{copy.dashboard.agentRegister}</span>
              <h2>{copy.dashboard.operatingFleet}</h2>
            </div>
            <Button
              variant="ghost"
              onClick={() => go("/app")}
              icon={<ArrowRight size={14} />}
            >
              {copy.dashboard.openRegister}
            </Button>
          </div>
          <div className="agent-list">
            {agentsError && (
              <div className="empty-state">
                <strong>Agent register unavailable</strong>
                <span>{agentsError.message}</span>
              </div>
            )}
            {!agentsError && agents.length === 0 && (
              <div className="empty-state">
                <strong>No agents yet</strong>
                <span>Mint your first agent to start the fleet.</span>
                <Button onClick={() => go("/mint")} icon={<Bot size={15} />}>
                  Mint an agent
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
                        : "no description"}
                    </small>
                  </span>
                  <span className="agent-value">
                    <b>
                      {vault
                        ? `${formatTokenAmount(vault.depositsWei)} 0G`
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
              <span className="eyebrow">{copy.dashboard.proofLane}</span>
              <h2>{copy.dashboard.attentionFirst}</h2>
            </div>
            <ShieldCheck size={18} className="copper" />
          </div>
          <div className="proof-card">
            <img src="/brand/hero-seal-512.jpg" alt="Abstract proof field" />
            <div>
              <span className="eyebrow">
                {attention[0]
                  ? `AGENT #${attention[0].tokenId} / FUNDING`
                  : "PAYMENT / ALLOWANCE"}
              </span>
              <strong>{copy.dashboard.allowanceReady}</strong>
              <p>{copy.dashboard.allowanceDescription}</p>
              <Button
                onClick={() =>
                  go(
                    attention[0]
                      ? `/payment?agent=${attention[0].tokenId}&intent=fund&stage=amount`
                      : "/payment?intent=fund&stage=amount",
                  )
                }
                icon={<CreditCard size={15} />}
              >
                {copy.dashboard.openPayment}
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
