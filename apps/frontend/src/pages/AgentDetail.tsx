import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { Link, useParams } from "react-router-dom";
import { useAccount } from "wagmi";
import { useAgentMetadata } from "../hooks/useAgentMetadata.js";
import { useAgentEvents } from "../hooks/useAgentEvents.js";
import type { AxiomEvent } from "../hooks/useEventHistory.js";
import { usePerformance } from "../hooks/usePerformance.js";
import { useHealth } from "../hooks/useHealth.js";
import { useVaultData } from "../hooks/useVaultData.js";
const EventTimeline = lazy(() =>
  import("../components/EventTimeline.js").then((m) => ({
    default: m.EventTimeline,
  })),
);
const ExecutePanel = lazy(() =>
  import("../components/ExecutePanel.js").then((m) => ({
    default: m.ExecutePanel,
  })),
);
const PaymentPanel = lazy(() =>
  import("../components/PaymentPanel.js").then((m) => ({
    default: m.PaymentPanel,
  })),
);
const TransferModal = lazy(() =>
  import("../components/TransferModal.js").then((m) => ({
    default: m.TransferModal,
  })),
);
const DepositForm = lazy(() =>
  import("../components/VaultTools.js").then((m) => ({
    default: m.DepositForm,
  })),
);
const WithdrawForm = lazy(() =>
  import("../components/VaultTools.js").then((m) => ({
    default: m.WithdrawForm,
  })),
);
const StrategyPanel = lazy(() =>
  import("../components/VaultTools.js").then((m) => ({
    default: m.StrategyPanel,
  })),
);
const DelegatePanel = lazy(() =>
  import("../components/VaultTools.js").then((m) => ({
    default: m.DelegatePanel,
  })),
);
const PerformanceMetrics = lazy(() =>
  import("../components/PerformanceMetrics.js").then((m) => ({
    default: m.PerformanceMetrics,
  })),
);
const TradeHistory = lazy(() =>
  import("../components/TradeHistory.js").then((m) => ({
    default: m.TradeHistory,
  })),
);
import { EmptyState } from "../components/EmptyState.js";
import { ErrorBoundary } from "../components/ErrorBoundary.js";
import {
  COLORS,
  Skeleton,
  Spinner,
  Card,
  Button,
  SectionTitle,
  MonoLabel,
  Alert,
  ErrorAlert,
  PageHeader,
  HelpTip,
  withViewTransition,
  backLinkStyle,
  mutedTextSm,
} from "../components/ui.js";
import {
  PLACEHOLDER,
  truncateHex,
  truncateAddress,
  parseTokenId,
} from "../utils/format.js";

const VALID_SECTIONS = [
  "overview",
  "execute",
  "payments",
  "activity",
  "performance",
] as const;

type AgentSection = (typeof VALID_SECTIONS)[number];

const AGENT_TABS: ReadonlyArray<{ id: AgentSection; label: string }> = [
  { id: "overview", label: "Vault" },
  { id: "execute", label: "Tick" },
  { id: "payments", label: "Pay" },
  { id: "activity", label: "Log" },
  { id: "performance", label: "Stats" },
];

type VaultTool = "deposit" | "withdraw" | "strategy" | "delegate";

const VAULT_TOOLS: ReadonlyArray<{ id: VaultTool; label: string }> = [
  { id: "deposit", label: "Fund" },
  { id: "withdraw", label: "Withdraw" },
  { id: "strategy", label: "Strategy" },
  { id: "delegate", label: "Delegate" },
];

function sectionFromHash(): AgentSection {
  const hash = window.location.hash.slice(1);
  return (VALID_SECTIONS as readonly string[]).includes(hash)
    ? (hash as (typeof VALID_SECTIONS)[number])
    : "overview";
}

const BackLink = (): ReactElement => (
  <div style={{ marginBottom: "var(--space-md)" }}>
    <Link to="/app" style={backLinkStyle}>
      ← Home
    </Link>
  </div>
);

const skeletonFallback = (
  <div style={{ padding: "var(--space-xl)" }}>
    <Skeleton height={200} />
  </div>
);

function AgentDetail(): ReactElement {
  const params = useParams<{ tokenId: string }>();
  const tokenId = parseTokenId(params.tokenId);

  const { isConnected } = useAccount();

  const [transferOpen, setTransferOpen] = useState(false);
  const transferBtnRef = useRef<HTMLSpanElement>(null);
  const [activeSection, setActiveSection] =
    useState<AgentSection>(sectionFromHash);
  const [pressed, setPressed] = useState<AgentSection | null>(null);
  const [vaultTool, setVaultTool] = useState<VaultTool>("deposit");
  const [showMeta, setShowMeta] = useState(false);

  useEffect(() => {
    const syncFromHash = (): void => {
      setActiveSection(sectionFromHash());
    };
    window.addEventListener("hashchange", syncFromHash);
    window.addEventListener("popstate", syncFromHash);
    return () => {
      window.removeEventListener("hashchange", syncFromHash);
      window.removeEventListener("popstate", syncFromHash);
    };
  }, []);

  const hooksEnabled = tokenId !== null;

  const metadata = useAgentMetadata(tokenId ?? 0n, {
    enabled: hooksEnabled,
  });
  const { data, isLoading: metaLoading, error: metaError } = metadata;

  const { events: agentEvents, isLoading: eventsLoading } = useAgentEvents(
    tokenId,
    {
      enabled: hooksEnabled && activeSection === "activity",
    },
  );
  const {
    metrics,
    history: perfHistory,
    isLoading: perfLoading,
    refetch: refetchPerformance,
  } = usePerformance(tokenId, {
    enabled: hooksEnabled && activeSection === "performance",
  });
  const health = useHealth({ enabled: activeSection === "overview" });

  const tokenIdBigInt = tokenId ?? 0n;
  const vault = useVaultData(tokenIdBigInt);

  // F7/F13: tab switches scroll to top and refresh the 30s-polled performance query
  useEffect(() => {
    window.scrollTo({ top: 0 });
    if (activeSection === "performance") void refetchPerformance();
  }, [activeSection, refetchPerformance]);

  if (tokenId === null) {
    return (
      <div>
        <Alert variant="error" style={{ marginBottom: "var(--space-lg)" }}>
          Invalid token ID in the URL. The ID must be a positive integer.
        </Alert>
      </div>
    );
  }

  // tokenNotFound: metadata loaded, ownerOf reverted (canonical "does not exist" signal), no query error
  const tokenNotFound =
    hooksEnabled &&
    isConnected &&
    !metaLoading &&
    metaError === null &&
    data === null;

  if (tokenNotFound) {
    return (
      <div>
        <BackLink />
        <EmptyState title={`Agent #${tokenId.toString()} not found`}>
          <p style={{ margin: 0 }}>
            No agent with this ID exists on the current chain. The ID may be
            wrong, or the agent may have been minted on another network.
          </p>
          <Link to="/app" style={{ textDecoration: "none" }}>
            <Button variant="primary">Back to your agents</Button>
          </Link>
        </EmptyState>
      </div>
    );
  }

  // Stable identity for the memoized EventTimeline — a per-render callback defeats the per-row memo on each live WS event
  const renderAgentEvent = useCallback((ev: AxiomEvent): ReactNode => {
    if (ev.eventName === "Tick") {
      const p = ev.payload as Record<string, unknown>;
      const action = String(p.action ?? "");
      let actionColor: string = COLORS.textMuted;
      if (action === "buy") actionColor = COLORS.success;
      else if (action === "sell") actionColor = COLORS.danger;
      return (
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            fontSize: "var(--text-sm)",
          }}
        >
          <strong
            style={{
              color: actionColor,
              textTransform: "uppercase",
            }}
          >
            {action}
          </strong>
          {p.amount !== undefined && p.amount !== null && (
            <span style={{ color: COLORS.textMuted }}>
              amount: {String(p.amount)}
            </span>
          )}
          <span style={{ color: COLORS.textDim }}>
            {String(p.durationMs ?? "")}ms
          </span>
        </div>
      );
    }
    return <span style={{ color: COLORS.text }}>{ev.eventName}</span>;
  }, []);

  // F3: post-mint next-step checklist — hidden once the vault is funded and a strategy is bound
  const vaultFunded = (vault.depositsWei ?? 0n) > 0n;
  const strategyBound = vault.strategyRoot !== "";
  const showNextSteps =
    !vault.isLoading && vault.error === null && !(vaultFunded && strategyBound);

  return (
    <div>
      <BackLink />

      <div style={{ viewTransitionName: "agent-card" }}>
        <PageHeader
          title={data?.dataDescription ?? `Agent #${tokenId.toString()}`}
        />
      </div>

      <div role="tablist" aria-label="Agent sections" className="agent-tabs">
        {AGENT_TABS.map((s) => {
          const isActive = activeSection === s.id;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              id={`tab-${s.id}`}
              aria-selected={isActive}
              aria-controls={`panel-${s.id}`}
              tabIndex={isActive ? 0 : -1}
              className={`agent-tabs__btn${isActive ? " is-active" : ""}`}
              data-axiom-btn=""
              onPointerDown={() => setPressed(s.id)}
              onPointerUp={() => setPressed(null)}
              onPointerLeave={() => setPressed(null)}
              style={{
                transform: pressed === s.id ? "scale(0.97)" : undefined,
              }}
              onClick={() => {
                setActiveSection(s.id);
                window.history.pushState(null, "", `#${s.id}`);
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {metaLoading && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-sm)",
            marginBottom: "var(--space-xl)",
          }}
        >
          <Skeleton height={24} />
          <Skeleton height={24} />
          <Skeleton height={24} />
        </div>
      )}

      {metaError !== null && (
        <ErrorAlert
          message="Couldn't load agent metadata. Retry."
          onRetry={metadata.refetch}
        />
      )}

      <div key={activeSection} className="fade-enter">
        <div
          role="tabpanel"
          id="panel-overview"
          aria-labelledby="tab-overview"
          hidden={activeSection !== "overview"}
        >
          {activeSection === "overview" && (
            <Suspense fallback={skeletonFallback}>
              {isConnected && (
                <>
                  <div
                    className="action-rail agent-quick-actions"
                    aria-label="Primary agent actions"
                  >
                    <Button
                      variant="primary"
                      type="button"
                      onClick={() => {
                        setActiveSection("execute");
                        window.history.pushState(null, "", "#execute");
                      }}
                    >
                      Tick
                    </Button>
                    <span
                      ref={transferBtnRef}
                      style={{ display: "inline-block" }}
                      onPointerEnter={(): void => {
                        void import("../components/TransferModal.js");
                      }}
                    >
                      <Button
                        variant="secondary"
                        type="button"
                        onClick={(): void => {
                          transferBtnRef.current?.style.setProperty(
                            "view-transition-name",
                            "transfer-dialog",
                          );
                          withViewTransition(() => {
                            flushSync(() => setTransferOpen(true));
                          });
                          transferBtnRef.current?.style.removeProperty(
                            "view-transition-name",
                          );
                        }}
                      >
                        Transfer
                      </Button>
                    </span>
                    <Link
                      to={`/chat?agent=${tokenId.toString()}`}
                      style={{ textDecoration: "none" }}
                    >
                      <Button variant="ghost" type="button">
                        Chat
                      </Button>
                    </Link>
                  </div>

                  {showNextSteps && (
                    <p
                      style={{
                        margin: "0 0 var(--space-sm)",
                        fontSize: "var(--text-xs)",
                        color: COLORS.textDim,
                      }}
                    >
                      Next:{" "}
                      <span
                        style={{
                          color: vaultFunded ? COLORS.success : undefined,
                        }}
                      >
                        {vaultFunded ? "✓ Fund" : "○ Fund"}
                      </span>{" "}
                      →{" "}
                      <span
                        style={{
                          color: strategyBound ? COLORS.success : undefined,
                        }}
                      >
                        {strategyBound ? "✓ Bind strategy" : "○ Bind strategy"}
                      </span>{" "}
                      →{" "}
                      <span
                        style={{
                          color:
                            vaultFunded && strategyBound
                              ? COLORS.success
                              : undefined,
                        }}
                      >
                        {vaultFunded && strategyBound ? "✓ Tick" : "○ Tick"}
                      </span>
                    </p>
                  )}

                  <div className="agent-tool">
                    <div
                      className="agent-tool__switch"
                      role="radiogroup"
                      aria-label="Vault tools"
                    >
                      {VAULT_TOOLS.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          role="radio"
                          aria-checked={vaultTool === t.id}
                          className={`agent-tool__btn${
                            vaultTool === t.id ? " is-active" : ""
                          }`}
                          data-axiom-btn=""
                          onClick={() => setVaultTool(t.id)}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                    <div
                      key={vaultTool}
                      className="agent-tool__panel fade-enter"
                    >
                      {vaultTool === "deposit" && (
                        <DepositForm
                          variant="warning"
                          tokenId={tokenIdBigInt}
                        />
                      )}
                      {vaultTool === "withdraw" && (
                        <WithdrawForm tokenId={tokenIdBigInt} />
                      )}
                      {vaultTool === "strategy" && (
                        <StrategyPanel tokenId={tokenIdBigInt} />
                      )}
                      {vaultTool === "delegate" && (
                        <DelegatePanel tokenId={tokenIdBigInt} />
                      )}
                    </div>
                  </div>
                </>
              )}

              {data !== null && (
                <div className="agent-meta">
                  <button
                    type="button"
                    className="agent-meta__toggle"
                    aria-expanded={showMeta}
                    onClick={() => setShowMeta((v) => !v)}
                  >
                    {showMeta ? "Details ▴" : "Details ▾"}
                  </button>
                  {showMeta && (
                    <dl className="agent-meta__grid fade-enter">
                      <dt>Owner</dt>
                      <dd>
                        <MonoLabel
                          copyable
                          text={data.owner}
                          title={data.owner}
                        >
                          {truncateAddress(data.owner)}
                        </MonoLabel>
                      </dd>
                      <dt>Data hash</dt>
                      <dd>
                        <MonoLabel
                          copyable
                          text={data.dataHash}
                          title={data.dataHash}
                        >
                          {truncateHex(data.dataHash)}
                        </MonoLabel>
                      </dd>
                      <dt>Name</dt>
                      <dd>
                        {data.dataDescription === ""
                          ? PLACEHOLDER
                          : data.dataDescription}
                      </dd>
                      <dt>
                        <HelpTip tip="Software oracle signer — not hardware TEE.">
                          Oracle
                        </HelpTip>
                      </dt>
                      <dd
                        style={{
                          color:
                            health.data?.oracle === "up"
                              ? COLORS.success
                              : COLORS.textDim,
                        }}
                      >
                        {health.data
                          ? health.data.oracle === "up"
                            ? "Up"
                            : "Down"
                          : PLACEHOLDER}
                      </dd>
                    </dl>
                  )}
                </div>
              )}
            </Suspense>
          )}
        </div>

        <div
          role="tabpanel"
          id="panel-execute"
          aria-labelledby="tab-execute"
          hidden={activeSection !== "execute"}
        >
          {activeSection === "execute" && (
            <Suspense fallback={skeletonFallback}>
              <ErrorBoundary>
                <ExecutePanel tokenId={tokenId} />
              </ErrorBoundary>
            </Suspense>
          )}
        </div>

        <div
          role="tabpanel"
          id="panel-payments"
          aria-labelledby="tab-payments"
          hidden={activeSection !== "payments"}
        >
          {activeSection === "payments" && (
            <Suspense fallback={skeletonFallback}>
              <ErrorBoundary>
                <PaymentPanel tokenId={tokenId} />
              </ErrorBoundary>
            </Suspense>
          )}
        </div>

        <div
          role="tabpanel"
          id="panel-activity"
          aria-labelledby="tab-activity"
          hidden={activeSection !== "activity"}
        >
          {activeSection === "activity" && (
            <Suspense fallback={skeletonFallback}>
              {eventsLoading && agentEvents.length === 0 ? (
                <Card style={{ marginBottom: "var(--space-xl)" }}>
                  <Skeleton height={96} />
                </Card>
              ) : agentEvents.length > 0 ? (
                <Card style={{ marginBottom: "var(--space-xl)" }}>
                  <SectionTitle>Agent Activity</SectionTitle>
                  <EventTimeline
                    events={agentEvents}
                    renderEvent={renderAgentEvent}
                  />
                </Card>
              ) : (
                <EmptyState>
                  <p style={mutedTextSm}>No events yet. Run a tick first.</p>
                </EmptyState>
              )}
            </Suspense>
          )}
        </div>

        <div
          role="tabpanel"
          id="panel-performance"
          aria-labelledby="tab-performance"
          hidden={activeSection !== "performance"}
        >
          {activeSection === "performance" && (
            <Suspense fallback={skeletonFallback}>
              {perfLoading && metrics === null ? (
                <Card style={{ marginBottom: "var(--space-xl)" }}>
                  <Skeleton height={96} />
                </Card>
              ) : metrics !== null && metrics.totalTicks > 0 ? (
                <>
                  <PerformanceMetrics metrics={metrics} history={perfHistory} />
                  <TradeHistory history={perfHistory} />
                </>
              ) : (
                <EmptyState>
                  <p style={mutedTextSm}>
                    No ticks yet.{" "}
                    <Button
                      variant="ghost"
                      style={{ padding: 0, textDecoration: "underline" }}
                      onClick={() => {
                        setActiveSection("execute");
                        window.history.pushState(null, "", "#execute");
                      }}
                    >
                      Run tick
                    </Button>
                  </p>
                </EmptyState>
              )}
            </Suspense>
          )}
        </div>
      </div>
      {transferOpen && (
        <Suspense fallback={<Spinner />}>
          <TransferModal
            open={transferOpen}
            tokenId={tokenId}
            onClose={(): void => setTransferOpen(false)}
            onSuccess={(): void => setTransferOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}

export default AgentDetail;
