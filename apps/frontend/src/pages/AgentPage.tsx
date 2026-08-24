/*
  AgentPage — v2 tab layout (overview / execute / payments / activity) fed by
  the v1 data layer: useAgentMetadata (owner + dataHash on-chain reads),
  useAgentEvents (WS + polled events), usePerformance, usePayment earnings.
  Executes bounded operations by deep-linking the flow pages with a prefilled
  intent (review-first, never auto-submitted).
*/
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useChainId } from "wagmi";
import {
  ArrowRight,
  Bot,
  CircleCheck,
  Copy,
  CreditCard,
  Database,
  Play,
  ShieldCheck,
  UploadCloud,
  Wallet,
  X,
  Zap,
} from "../components/axiom/icons.js";
import {
  Button,
  Fact,
  Field,
  PageHead,
  Status,
} from "../components/axiom/Controls.js";
import { StatePill } from "../components/StatePill.js";
import { getCopy, interpolate, type Locale } from "../lib/copy.js";
import { useAgentMetadata } from "../hooks/useAgentMetadata.js";
import { useAgentEvents } from "../hooks/useAgentEvents.js";
import { usePerformance } from "../hooks/usePerformance.js";
import { usePayment } from "../hooks/usePayment.js";
import { paymentSymbolOf, usePaymentToken } from "../hooks/usePaymentToken.js";
import { useVaultData } from "../hooks/useVaultData.js";
import { formatUnits } from "viem";
import { APP_CHAIN } from "../config/wagmi.js";
import { hasStrategyRoot } from "../lib/models.js";
import {
  formatTokenAmount,
  truncateAddress,
  truncateHex,
  explorerTxUrl,
} from "../utils/format.js";

const AGENT_TABS = ["overview", "execute", "payments", "activity"] as const;
type AgentTab = (typeof AGENT_TABS)[number];

export function AgentPage({
  tokenId,
  go,
  locale,
}: {
  tokenId: bigint;
  go: (path: string) => void;
  locale: Locale;
}) {
  const copy = getCopy(locale);
  const agentCopy = copy.agentDetail;
  const chainId = useChainId();
  const explorerTx = (hash: string) => explorerTxUrl(chainId, hash);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab") as AgentTab | null;
  const [tab, setTab] = useState<AgentTab>(
    ["overview", "execute", "payments", "activity"].includes(requestedTab ?? "")
      ? (requestedTab as AgentTab)
      : "overview",
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const action = (message: string) => setNotice(message);

  const { data: metadata, error: metadataError } = useAgentMetadata(tokenId);
  const { events, isLoading: eventsLoading } = useAgentEvents(tokenId);
  const { metrics } = usePerformance(tokenId);
  const vault = useVaultData(tokenId);
  const payment = usePayment();
  const [earnings, setEarnings] = useState<{
    tokenId: string;
    creator: string;
    earnings: string;
  } | null>(null);
  const [paymentConfig, setPaymentConfig] = useState<{
    paymentToken: string;
    protocolFeeBps: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void payment
      .getEarnings(tokenId)
      .then((info) => {
        if (!cancelled) setEarnings(info);
      })
      .catch(() => undefined);
    void payment
      .getPaymentConfig()
      .then((config) => {
        if (!cancelled) setPaymentConfig(config);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // hooks: one-shot per agent page mount
  }, [tokenId.toString()]);

  useEffect(() => {
    if ((AGENT_TABS as readonly string[]).includes(requestedTab ?? ""))
      setTab(requestedTab as AgentTab);
  }, [requestedTab]);

  const chooseTab = (next: AgentTab) => {
    setTab(next);
    setSearchParams({ tab: next }, { replace: true });
  };

  const agentName = `Agent #${tokenId.toString()}`;
  const lastEvent = events[events.length - 1];
  // vault balances are native-denominated (chain config); payments tab uses the payment token symbol.
  const nativeSymbol = APP_CHAIN.nativeCurrency.symbol;
  const paymentToken = usePaymentToken();
  const paymentSymbol = paymentSymbolOf(paymentToken);
  const vaultBalance =
    vault.depositsWei !== undefined
      ? `${formatTokenAmount(vault.depositsWei)} ${nativeSymbol}`
      : "—";
  const strategyBound = hasStrategyRoot(vault.strategyRoot);

  const copyDataHash = () => {
    if (metadata?.dataHash) navigator.clipboard?.writeText(metadata.dataHash);
    action("Metadata root copied locally.");
  };

  return (
    <div className="ops-page agent-page">
      {/* the head kept
          "AGENT / #N" over "Agent #N" plus an owner/last-event line the
          overview tab's provenance list renders verbatim. The name stays;
          the identity dl below is the one canonical owner. */}
      <PageHead title={agentName}>
        <div className="page-head-actions">
          <Status
            label={strategyBound ? "online" : "attention"}
            tone={strategyBound ? "success" : "warning"}
          />
          <Button
            onClick={() =>
              go(`/tick?agent=${tokenId.toString()}&intent=bounded`)
            }
            icon={<Play size={15} />}
          >
            {copy.flows.tick.title}
          </Button>
        </div>
      </PageHead>

      <div className="agent-detail-head">
        <div className="agent-detail-mark">
          <Bot size={28} />
        </div>
        <div>
          <strong>{vaultBalance}</strong>
          <small>
            {agentCopy.operatingBalance} ·{" "}
            {strategyBound
              ? interpolate(agentCopy.vaultRoute, {
                  chainName: APP_CHAIN.name,
                })
              : agentCopy.noStrategy}
          </small>
        </div>
        {/* (duplication map #2): the dataHash block here was the second
            on-screen copy of the metadata root — the overview tab's
            provenance list renders it once, with the copy button. */}
      </div>

      <nav className="detail-tabs">
        {AGENT_TABS.map((item) => (
          <button
            className={tab === item ? "active" : ""}
            key={item}
            onClick={() => chooseTab(item)}
          >
            {agentCopy[item]}
          </button>
        ))}
      </nav>

      {notice && (
        <div className="inline-notice">
          <CircleCheck size={14} />
          {notice}
          <button onClick={() => setNotice(null)} aria-label={agentCopy.cancel}>
            <X size={13} />
          </button>
        </div>
      )}

      {tab === "overview" && (
        <div className="agent-grid">
          <section className="panel agent-identity-card">
            <h2>{agentCopy.agentRecord}</h2>
            <dl className="provenance-list">
              <Fact label={agentCopy.owner}>
                {metadata ? truncateAddress(metadata.owner) : "—"}
              </Fact>
              <Fact label={agentCopy.agentId} mono>
                #{tokenId.toString()}
              </Fact>
              <Fact label={agentCopy.metadataRoot} mono>
                {metadata?.dataHash
                  ? truncateHex(metadata.dataHash, 8, 6)
                  : "—"}{" "}
                <button
                  className="inline-copy"
                  onClick={copyDataHash}
                  aria-label="Copy metadata root"
                >
                  <Copy size={12} />
                </button>
              </Fact>
              <Fact label="Description">
                {metadata?.dataDescription || "—"}
              </Fact>
              <Fact label={agentCopy.lastEvent}>
                {lastEvent
                  ? `${lastEvent.eventName} · block ${lastEvent.blockNumber}`
                  : "no events indexed"}
              </Fact>
              {metadata?.dataHash && (
                <Fact label="Explorer">
                  <a
                    className="text-link"
                    href={explorerTx(metadata.dataHash)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View record <ArrowRight size={12} />
                  </a>
                </Fact>
              )}
            </dl>
            {metadataError && (
              <div className="diagnostic-note">
                <ShieldCheck size={14} />
                <span>
                  On-chain metadata read failed: {metadataError.message}
                </span>
              </div>
            )}
            <Button
              variant="secondary"
              onClick={() => go("/storage")}
              icon={<Database size={15} />}
            >
              {agentCopy.inspectStorageProof}
            </Button>
          </section>
          <section className="panel agent-command-card">
            <h2>{agentCopy.chooseBoundedOperation}</h2>
            <div className="command-actions">
              <Button
                onClick={() =>
                  go(
                    `/payment?agent=${tokenId.toString()}&intent=fund&stage=amount`,
                  )
                }
                icon={<CreditCard size={15} />}
              >
                {agentCopy.fundAgent}
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  go(
                    `/transfer?agent=${tokenId.toString()}&intent=proof&stage=recipient`,
                  )
                }
                icon={<ShieldCheck size={15} />}
              >
                {agentCopy.transferProof}
              </Button>
              <Button
                variant="secondary"
                onClick={() => go(`/deposit?agent=${tokenId.toString()}`)}
                icon={<Wallet size={15} />}
              >
                {agentCopy.depositFunds}
              </Button>
              <Button
                variant="secondary"
                onClick={() => go(`/withdraw?agent=${tokenId.toString()}`)}
                icon={<UploadCloud size={15} />}
              >
                {agentCopy.withdrawFunds}
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  go(`/tick?agent=${tokenId.toString()}&intent=bounded`)
                }
                icon={<Play size={15} />}
              >
                {agentCopy.queueTick}
              </Button>
            </div>
            <p>{agentCopy.commandEvidence}</p>
          </section>
        </div>
      )}

      {tab === "execute" && (
        <section className="panel tab-panel">
          <h2>{agentCopy.runRecoveryPath}</h2>
          <div className="execute-grid">
            <Field
              label={agentCopy.instruction}
              value={instruction}
              onChange={setInstruction}
              placeholder={agentCopy.instructionPlaceholder}
              hint={agentCopy.instructionHint}
            />
            {/* 03: a Field implies editable — this is a read-only
                route readout, so it renders as a definition row, not an
                input. */}
            <div className="field provider-route-readout">
              <span className="field-label">{agentCopy.providerRoute}</span>
              <strong>
                {metrics
                  ? `${metrics.totalTicks ?? 0} ticks recorded`
                  : agentCopy.providerValue}
              </strong>
              <span className="field-hint">{agentCopy.providerHint}</span>
            </div>
          </div>
          <div className="button-row">
            <Button
              onClick={() => {
                if (!instruction.trim()) {
                  action("Describe the bounded instruction first.");
                  return;
                }
                go(
                  `/tick?agent=${tokenId.toString()}&intent=bounded&instruction=${encodeURIComponent(instruction)}`,
                );
              }}
              icon={<Zap size={15} />}
            >
              {agentCopy.createTickIntent}
            </Button>
            <Button variant="ghost" onClick={() => chooseTab("overview")}>
              {agentCopy.cancel}
            </Button>
          </div>
        </section>
      )}

      {tab === "payments" && (
        <section className="panel tab-panel">
          <h2>{agentCopy.valueRouteFor(agentName)}</h2>
          <div className="receipt-grid">
            <div>
              <strong>{paymentSymbol}</strong>
              <small>{agentCopy.token}</small>
            </div>
            <div>
              <strong>
                {earnings
                  ? `${formatUnits(BigInt(earnings.earnings), paymentToken?.decimals ?? 6)} ${paymentSymbol}`
                  : "—"}
              </strong>
              <small>{agentCopy.earnings}</small>
            </div>
            <div>
              <strong>
                {paymentConfig
                  ? `${Number(paymentConfig.protocolFeeBps) / 100}%`
                  : "—"}
              </strong>
              <small>{agentCopy.royalty}</small>
            </div>
          </div>
          <Button
            onClick={() =>
              go(
                `/payment?agent=${tokenId.toString()}&intent=fund&stage=amount`,
              )
            }
            icon={<ArrowRight size={15} />}
          >
            {agentCopy.openPaymentFlow}
          </Button>
        </section>
      )}

      {tab === "activity" && (
        <section className="panel tab-panel">
          <h2>{agentCopy.evidenceTied}</h2>
          <div className="activity-list">
            {eventsLoading && events.length === 0 && (
              <div className="empty-state">
                <strong>Loading events…</strong>
              </div>
            )}
            {!eventsLoading && events.length === 0 && (
              <div className="empty-state">
                <strong>No events indexed</strong>
                <span>
                  On-chain activity for this agent appears here as the indexer
                  sees it.
                </span>
              </div>
            )}
            {[...events].reverse().map((event) => (
              <button
                key={`${event.txHash}:${event.logIndex}`}
                className="activity-row"
                onClick={() =>
                  window.open(explorerTx(event.txHash), "_blank", "noreferrer")
                }
              >
                <span>
                  <Zap size={15} />
                </span>
                <span>
                  <strong>{event.eventName}</strong>
                  <small>
                    block {event.blockNumber} ·{" "}
                    {truncateHex(event.txHash, 10, 6)}
                  </small>
                </span>
                <StatePill state="confirmed" />
                <ArrowRight size={14} />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
