import { lazy, Suspense, useEffect, useState, type ReactElement } from "react";
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
  { id: "overview", label: "Overview" },
  { id: "execute", label: "Execute" },
  { id: "payments", label: "Payments" },
  { id: "activity", label: "Activity" },
  { id: "performance", label: "Performance" },
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
  const [activeSection, setActiveSection] = useState<AgentSection>(sectionFromHash);

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
            to="/agents"
            style={{
              color: COLORS.textMuted,
              fontSize: "var(--text-sm)",
              textDecoration: "none",
            }}
          >
            ← Agents
          </Link>
        </div>

        <PageHeader
          title={data?.dataDescription ?? `Agent #${tokenId.toString()}`}
        />

        <div
          role="tablist"
          aria-label="Agent sections"
          style={{
            display: "flex",
            gap: "var(--space-sm)",
            marginBottom: "var(--space-xl)",
            flexWrap: "wrap",
            borderBottom: `1px solid ${COLORS.border}`,
            paddingBottom: "var(--space-sm)",
          }}
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
                style={{
                  background: "none",
                  color: isActive ? COLORS.bronzeLight : COLORS.textMuted,
                  textDecoration: "none",
                  fontSize: "var(--text-sm)",
                  fontWeight: isActive
                    ? "var(--fw-semibold)"
                    : "var(--fw-medium)",
                  padding: "0.5rem 0.75rem",
                  borderRadius: "var(--radius-md) var(--radius-md) 0 0",
                  border: "none",
                  borderBottom: isActive
                    ? `2px solid ${COLORS.bronzeLight}`
                    : "2px solid transparent",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "color 0.18s ease, border-color 0.18s ease",
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
            message="Couldn't load agent metadata from the chain. Check your connection and try refreshing the page."
            onRetry={metadata.refetch}
          />
        )}

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
            {isConnected && <DepositForm tokenId={tokenIdBigInt} />}

            {data !== null && (
              <Card style={{ marginBottom: "var(--space-xl)" }}>
                <SectionTitle>Metadata</SectionTitle>
                <dl
                  className="stack-on-mobile"
                  style={{
                    margin: 0,
                    display: "grid",
                    gridTemplateColumns: "8.75rem 1fr",
                    gap: "var(--space-md) var(--space-lg)",
                    fontSize: "var(--text-sm)",
                    minWidth: 0,
                  }}
                >
                  <dt
                    style={{
                      color: COLORS.textDim,
                      fontWeight: "var(--fw-medium)",
                    }}
                  >
                    Collection
                  </dt>
                  <dd
                    style={{
                      margin: 0,
                      color: COLORS.text,
                      overflow: "hidden",
                      overflowWrap: "break-word",
                    }}
                  >
                    {data.name === "" ? PLACEHOLDER : data.name}{" "}
                    {data.symbol !== "" && (
                      <span style={{ color: COLORS.textMuted }}>
                        ({data.symbol})
                      </span>
                    )}
                  </dd>
                  <dt
                    style={{
                      color: COLORS.textDim,
                      fontWeight: "var(--fw-medium)",
                    }}
                  >
                    Owner
                  </dt>
                  <dd style={{ margin: 0, overflow: "hidden" }}>
                    <MonoLabel>{data.owner}</MonoLabel>
                  </dd>
                  <dt
                    style={{
                      color: COLORS.textDim,
                      fontWeight: "var(--fw-medium)",
                    }}
                  >
                    Creator
                  </dt>
                  <dd style={{ margin: 0, overflow: "hidden" }}>
                    {data.creator !== undefined ? (
                      <MonoLabel>{data.creator}</MonoLabel>
                    ) : (
                      <span style={{ color: COLORS.textDim }}>
                        {PLACEHOLDER}
                      </span>
                    )}
                  </dd>
                  <dt
                    style={{
                      color: COLORS.textDim,
                      fontWeight: "var(--fw-medium)",
                    }}
                  >
                    Data Hash
                  </dt>
                  <dd style={{ margin: 0, overflow: "hidden" }}>
                    <MonoLabel title={data.dataHash}>
                      {truncateHex(data.dataHash)}
                    </MonoLabel>
                  </dd>
                  <dt
                    style={{
                      color: COLORS.textDim,
                      fontWeight: "var(--fw-medium)",
                    }}
                  >
                    Description
                  </dt>
                  <dd
                    style={{
                      margin: 0,
                      color: COLORS.text,
                      overflow: "hidden",
                      overflowWrap: "break-word",
                    }}
                  >
                    {data.dataDescription === "" ? (
                      <span style={{ color: COLORS.textDim }}>
                        {PLACEHOLDER}
                      </span>
                    ) : (
                      data.dataDescription
                    )}
                  </dd>
                  <dt
                    style={{
                      color: COLORS.textDim,
                      fontWeight: "var(--fw-medium)",
                    }}
                  >
                    Token URI
                  </dt>
                  <dd style={{ margin: 0, overflow: "hidden" }}>
                    {data.tokenUri === "" ? (
                      <span style={{ color: COLORS.textDim }}>
                        {PLACEHOLDER}
                      </span>
                    ) : (
                      <MonoLabel>{data.tokenUri}</MonoLabel>
                    )}
                  </dd>
                  <dt
                    style={{
                      color: COLORS.textDim,
                      fontWeight: "var(--fw-medium)",
                    }}
                  >
                    <HelpTip tip="Trusted Execution Environment — the secure enclave that signs ownership proofs and re-encrypts agent data on transfer">
                      TEE / Oracle
                    </HelpTip>
                  </dt>
                  <dd style={{ margin: 0, overflow: "hidden" }}>
                    {health.data ? (
                      <MonoLabel
                        style={{
                          color:
                            health.data.oracle === "up"
                              ? COLORS.success
                              : COLORS.danger,
                        }}
                      >
                        TEE {health.data.oracle === "up" ? "Up ✓" : "Down ✗"}
                      </MonoLabel>
                    ) : (
                      <span style={{ color: COLORS.textDim }}>
                        {PLACEHOLDER}
                      </span>
                    )}
                  </dd>
                </dl>
              </Card>
            )}

            <Card style={{ marginBottom: "var(--space-xl)" }}>
              <SectionTitle>Transfer</SectionTitle>
              <p
                style={{
                  color: COLORS.textMuted,
                  fontSize: "var(--text-sm)",
                  lineHeight: "var(--lh-normal)",
                  margin: "0 0 var(--space-lg)",
                  fontWeight: "var(--fw-regular)",
                }}
              >
                Transfer ownership with cryptographic proof of integrity. The
                agent's encrypted intelligence is re-keyed on 0G Storage, and
                the receiver unwraps the sealed key inside a TEE.
              </p>
              <Button
                variant="primary"
                onClick={(): void => setTransferOpen(true)}
              >
                Transfer Agent
              </Button>
            </Card>
          </Suspense>
          )}
        </div>

        {/* Execute tab: execute */}
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
                  No activity yet. Execute a strategy to see events here.
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
                <PerformanceMetrics metrics={metrics} />
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
                  No strategy executions yet.{" "}
                  <button
                    type="button"
                    onClick={() => setActiveSection("execute")}
                    style={{
                      background: "none",
                      border: "none",
                      color: COLORS.bronzeLight,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: "inherit",
                      textDecoration: "underline",
                    }}
                  >
                    Execute a strategy
                  </button>{" "}
                  to see performance data here.
                </p>
              </EmptyState>
            )}
          </Suspense>
          )}
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
