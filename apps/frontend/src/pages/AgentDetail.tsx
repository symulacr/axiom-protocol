import { lazy, Suspense, useEffect, useRef, useState, type ReactElement } from "react";
import { flushSync } from "react-dom";
import { Link, useParams } from "react-router-dom";
import { useAccount } from "wagmi";
import { useAgentMetadata } from "../hooks/useAgentMetadata.js";
import { useAgentEvents } from "../hooks/useAgentEvents.js";
import { usePerformance } from "../hooks/usePerformance.js";
import { useHealth } from "../hooks/useHealth.js";
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
  import("../components/DepositForm.js").then((m) => ({
    default: m.DepositForm,
  })),
);
const WithdrawForm = lazy(() =>
  import("../components/WithdrawForm.js").then((m) => ({
    default: m.WithdrawForm,
  })),
);
const StrategyPanel = lazy(() =>
  import("../components/StrategyPanel.js").then((m) => ({
    default: m.StrategyPanel,
  })),
);
const DelegatePanel = lazy(() =>
  import("../components/DelegatePanel.js").then((m) => ({
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
import {
  COLORS,
  Skeleton,
  Card,
  Button,
  SectionTitle,
  MonoLabel,
  Alert,
  ErrorAlert,
  PageHeader,
  HelpTip,
  withViewTransition,
} from "../components/ui.js";
import { PLACEHOLDER, truncateHex, parseTokenId } from "../utils/format.js";

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

export function AgentDetail(): ReactElement {
  const params = useParams<{ tokenId: string }>();
  const tokenId = parseTokenId(params.tokenId);

  const { isConnected } = useAccount();

  const [transferOpen, setTransferOpen] = useState(false);
  const transferBtnRef = useRef<HTMLSpanElement>(null);
  const [activeSection, setActiveSection] = useState<AgentSection>(sectionFromHash);
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

  const { events: agentEvents } = useAgentEvents(tokenId, {
    enabled: hooksEnabled && activeSection === "activity",
  });
  const { metrics, history: perfHistory } = usePerformance(tokenId, {
    enabled: hooksEnabled && activeSection === "performance",
  });
  const health = useHealth({ enabled: activeSection === "overview" });

  const tokenIdBigInt = tokenId ?? 0n;

  if (tokenId === null) {
    return (
      <div>
        <Alert variant="error" style={{ marginBottom: "var(--space-lg)" }}>
          Invalid token ID in the URL. The ID must be a positive integer.
        </Alert>
      </div>
    );
  }

  return (
    <div>
        <div style={{ marginBottom: "var(--space-md)" }}>
          <Link
            to="/app"
            style={{
              color: COLORS.textMuted,
              fontSize: "var(--text-sm)",
              textDecoration: "none",
            }}
          >
            ← Home
          </Link>
        </div>

        <div style={{ viewTransitionName: "agent-card" }}>
          <PageHeader
            title={data?.dataDescription ?? `Agent #${tokenId.toString()}`}
          />
        </div>

        <div
          role="tablist"
          aria-label="Agent sections"
          className="agent-tabs"
        >
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
                  window.history.replaceState(null, "", `#${s.id}`);
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
        {/* Overview tab: metadata + deposit + transfer */}
        <div
          role="tabpanel"
          id="panel-overview"
          aria-labelledby="tab-overview"
          hidden={activeSection !== "overview"}
        >
          {activeSection === "overview" && (
          <Suspense
            fallback={
              <div style={{ padding: "var(--space-xl)" }}>
                <Skeleton height={200} />
              </div>
            }
          >
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
                      window.history.replaceState(null, "", "#execute");
                    }}
                  >
                    Tick
                  </Button>
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => setVaultTool("deposit")}
                  >
                    Fund
                  </Button>
                  <span ref={transferBtnRef} style={{ display: "inline-block" }}>
                    <Button
                      variant="ghost"
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
                  <Link to="/chat" style={{ textDecoration: "none" }}>
                    <Button variant="ghost" type="button">
                      Chat
                    </Button>
                  </Link>
                </div>

                <div className="agent-tool">
                  <div
                    className="agent-tool__switch"
                    role="tablist"
                    aria-label="Vault tools"
                  >
                    {VAULT_TOOLS.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={vaultTool === t.id}
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
                      <DepositForm tokenId={tokenIdBigInt} />
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
                  {showMeta ? "Hide details" : "Details"}
                </button>
                {showMeta && (
                  <dl className="agent-meta__grid fade-enter">
                    <dt>Owner</dt>
                    <dd>
                      <MonoLabel copyable text={data.owner}>
                        {data.owner}
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

        {/* Execute tab */}
        <div
          role="tabpanel"
          id="panel-execute"
          aria-labelledby="tab-execute"
          hidden={activeSection !== "execute"}
        >
          {activeSection === "execute" && (
          <Suspense
            fallback={
              <div style={{ padding: "var(--space-xl)" }}>
                <Skeleton height={200} />
              </div>
            }
          >
            <ExecutePanel tokenId={tokenId} />
          </Suspense>
          )}
        </div>

        {/* Payments tab */}
        <div
          role="tabpanel"
          id="panel-payments"
          aria-labelledby="tab-payments"
          hidden={activeSection !== "payments"}
        >
          {activeSection === "payments" && (
          <Suspense
            fallback={
              <div style={{ padding: "var(--space-xl)" }}>
                <Skeleton height={200} />
              </div>
            }
          >
            <PaymentPanel tokenId={tokenId} />
          </Suspense>
          )}
        </div>

        {/* Activity tab */}
        <div
          role="tabpanel"
          id="panel-activity"
          aria-labelledby="tab-activity"
          hidden={activeSection !== "activity"}
        >
          {activeSection === "activity" && (
          <Suspense
            fallback={
              <div style={{ padding: "var(--space-xl)" }}>
                <Skeleton height={200} />
              </div>
            }
          >
            {agentEvents.length > 0 ? (
              <Card style={{ marginBottom: "var(--space-xl)" }}>
                <SectionTitle>Agent Activity</SectionTitle>
                <EventTimeline
                  events={agentEvents}
                  renderEvent={(ev) => {
                    if (ev.eventName === "Tick") {
                      const p = ev.payload as Record<string, unknown>;
                      const action = String(p.action ?? "");
                      const actionColor =
                        action === "buy"
                          ? COLORS.success
                          : action === "sell"
                            ? COLORS.danger
                            : COLORS.textMuted;
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
                    return (
                      <span style={{ color: COLORS.text }}>{ev.eventName}</span>
                    );
                  }}
                />
              </Card>
            ) : (
              <EmptyState>
                <p
                  style={{
                    color: COLORS.textMuted,
                    fontSize: "var(--text-sm)",
                    margin: 0,
                  }}
                >
                  No events yet. Run a tick first.
                </p>
              </EmptyState>
            )}
          </Suspense>
          )}
        </div>

        {/* Performance tab */}
        <div
          role="tabpanel"
          id="panel-performance"
          aria-labelledby="tab-performance"
          hidden={activeSection !== "performance"}
        >
          {activeSection === "performance" && (
          <Suspense
            fallback={
              <div style={{ padding: "var(--space-xl)" }}>
                <Skeleton height={200} />
              </div>
            }
          >
            {metrics !== null && metrics.totalTicks > 0 ? (
              <>
                <PerformanceMetrics metrics={metrics} history={perfHistory} />
                <TradeHistory history={perfHistory} />
              </>
            ) : (
              <EmptyState>
                <p
                  style={{
                    color: COLORS.textMuted,
                    fontSize: "var(--text-sm)",
                    margin: 0,
                  }}
                >
                  No ticks yet.{" "}
                  <Button
                    variant="ghost"
                    style={{ padding: 0, textDecoration: "underline" }}
                    onClick={() => setActiveSection("execute")}
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
          <Suspense fallback={null}>
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
