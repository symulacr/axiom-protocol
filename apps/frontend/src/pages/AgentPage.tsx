/*
  AgentPage — v2 tab layout (overview / execute / payments / activity) fed by
  the v1 data layer: useAgentMetadata (owner + dataHash on-chain reads),
  useAgentEvents (WS + polled events), usePerformance, usePayment earnings.
  Executes bounded operations by deep-linking the flow pages with a prefilled
  intent (review-first, never auto-submitted).
*/
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAccount, useChainId, useReadContracts, useWalletClient } from "wagmi";
import { toast } from "sonner";
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
import {
  useEventHistory,
  eventTokenId,
  mergeDedupedEvents,
  type AxiomEvent,
} from "../hooks/useEventHistory.js";
import { useEventStream } from "../hooks/useEventStream.js";
import { usePolledApi } from "../hooks/usePolledApi.js";
import { AGENT_NFT_ABI } from "@axiom/config/abis";
import type { PerformanceMetrics } from "@axiom/config/types/orchestrator";
import {
  usePayment,
  usePaymentToken,
  paymentSymbolOf,
} from "../hooks/usePayment.js";
import { useVaultData, utcDayDateLabel } from "../hooks/useVaultDataBatch.js";
import { formatUnits, type Address, type Hex } from "viem";
import { APP_CHAIN } from "../config/wagmi.js";
import { hasStrategyRoot } from "../lib/models.js";
import {
  formatTokenAmount,
  truncateAddress,
  truncateHex,
  explorerTxUrl,
  humanizeError,
  errorRefString,
} from "../utils/format.js";
import { apiFetch, type EncodeResponse } from "../utils/apiFetch.js";
import { getAxiomAgentNftAddress, toViemAbi } from "../abi/addresses.js";

const AGENT_TABS = ["overview", "execute", "payments", "activity"] as const;
type AgentTab = (typeof AGENT_TABS)[number];

const axiomAgentNftAbiParsed = toViemAbi(AGENT_NFT_ABI);

type AgentMetadata = {
  tokenId: bigint;
  owner: Address;
  dataHash: Hex;
  dataDescription: string;
};

function useAgentMetadata(tokenId: bigint): {
  data: AgentMetadata | null;
  error: Error | null;
} {
  const chainId = useChainId();
  const { isConnected } = useAccount();
  const agentNftAddr = getAxiomAgentNftAddress(chainId);

  const contracts = useMemo(
    () =>
      [
        {
          address: agentNftAddr,
          abi: axiomAgentNftAbiParsed,
          functionName: "ownerOf",
          args: [tokenId],
        },
        {
          address: agentNftAddr,
          abi: axiomAgentNftAbiParsed,
          functionName: "intelligentDatasOf",
          args: [tokenId],
        },
      ] as const,
    [tokenId, agentNftAddr],
  );

  const query = useReadContracts({
    allowFailure: true,
    contracts,
    query: {
      enabled: isConnected && tokenId > 0n,
    },
  });

  const intelligentDatas =
    (
      query.data?.[1] as
        | {
            result?: ReadonlyArray<{ dataDescription: string; dataHash: Hex }>;
            error?: Error;
          }
        | undefined
    )?.result ?? undefined;
  const firstData = intelligentDatas?.[0];

  // ownerOf revert is the canonical on-chain "token does not exist" signal — treat as confirmed null; network failures don't carry the revert message
  const ownerOfError = (query.data?.[0] as { error?: Error } | undefined)
    ?.error;
  const ownerOfReverted =
    ownerOfError !== undefined &&
    /revert/i.test(ownerOfError.message ?? String(ownerOfError));

  const data = useMemo<AgentMetadata | null>(() => {
    if (!query.data) return null;
    if (ownerOfReverted) return null;
    return {
      tokenId,
      owner:
        (query.data[0] as { result?: Address; error?: Error } | undefined)
          ?.result ?? "0x0",
      dataHash: firstData?.dataHash ?? "0x",
      dataDescription: firstData?.dataDescription ?? "",
    };
  }, [query.data, tokenId, firstData, ownerOfReverted]);

  return useMemo(
    () => ({
      data,
      error: (query.error as Error | null) ?? null,
    }),
    [data, query.error],
  );
}

interface UseAgentEventsOptions {
  enabled?: boolean;
}

interface UseAgentEventsResult {
  events: AxiomEvent[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

function useAgentEvents(
  tokenId: bigint | null,
  options: UseAgentEventsOptions = {},
): UseAgentEventsResult {
  const { enabled = true } = options;
  const { events, isLoading, error, refetch } = useEventHistory({
    pollIntervalMs: 15_000,
    enabled,
  });
  const { events: wsEvents, isConnected } = useEventStream({
    topics: ["*"],
    enabled,
  });

  const hadWsConnectRef = useRef(false);
  useEffect(() => {
    if (!enabled) {
      hadWsConnectRef.current = false;
      return;
    }
    if (!isConnected || hadWsConnectRef.current) return;
    hadWsConnectRef.current = true;
    refetch();
  }, [enabled, isConnected, refetch]);

  const agentEvents = useMemo(() => {
    if (!enabled || tokenId === null) return [];

    const tid = tokenId.toString();
    const matches = (ev: AxiomEvent) => eventTokenId(ev) === tid;

    const httpFiltered = events.filter(matches);
    const wsFiltered = wsEvents.filter(matches);
    return mergeDedupedEvents(httpFiltered, wsFiltered);
  }, [enabled, events, wsEvents, tokenId]);

  return useMemo(
    () => ({
      events: agentEvents,
      isLoading,
      error,
      refetch,
    }),
    [agentEvents, isLoading, error, refetch],
  );
}

interface PerformanceResponse {
  metrics: PerformanceMetrics;
}

/** Per-agent tick metrics; the only consumer-facing field (AgentPage fact row). */
function usePerformance(tokenId: bigint | null): {
  metrics: PerformanceMetrics | null;
} {
  const { isConnected } = useAccount();
  const enabled = isConnected && tokenId !== null && tokenId > 0n;
  const url = enabled ? `/v1/agents/${tokenId.toString()}/performance` : "";

  const { data } = usePolledApi<PerformanceResponse>(url, {
    enabled,
    queryKey: ["performance", tokenId?.toString()],
  });

  const metrics = data?.metrics ?? null;
  return useMemo(() => ({ metrics }), [metrics]);
}

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
  const agentId = tokenId.toString();
  // Bounded-operation launcher: one data-driven row per deep-linked flow.
  const commandActions: {
    path: string;
    icon: React.ReactNode;
    variant?: "secondary" | "ghost";
    label: string;
  }[] = [
    {
      path: `/payment?agent=${agentId}&intent=fund&stage=amount`,
      icon: <CreditCard size={15} />,
      label: agentCopy.fundAgent,
    },
    {
      path: `/transfer?agent=${agentId}&intent=proof&stage=recipient`,
      icon: <ShieldCheck size={15} />,
      variant: "secondary",
      label: agentCopy.transferProof,
    },
    {
      path: `/deposit?agent=${agentId}`,
      icon: <Wallet size={15} />,
      variant: "secondary",
      label: agentCopy.depositFunds,
    },
    {
      path: `/withdraw?agent=${agentId}`,
      icon: <UploadCloud size={15} />,
      variant: "secondary",
      label: agentCopy.withdrawFunds,
    },
    {
      path: `/tick?agent=${agentId}&intent=bounded`,
      icon: <Play size={15} />,
      variant: "ghost",
      label: agentCopy.queueTick,
    },
  ];
  // vault balances are native-denominated (chain config); payments tab uses the payment token symbol.
  const nativeSymbol = APP_CHAIN.nativeCurrency.symbol;
  const paymentToken = usePaymentToken();
  const paymentSymbol = paymentSymbolOf(paymentToken);
  const vaultBalance =
    vault.depositsWei !== undefined
      ? `${formatTokenAmount(vault.depositsWei)} ${nativeSymbol}`
      : "—";
  const strategyBound = hasStrategyRoot(vault.strategyRoot);

  // Shared write-flow toasts — same shape as FlowPage's canonical helpers.
  const toastSuccess = (msg: string): void => {
    toast.success(msg);
  };
  const toastError = (err: unknown): void => {
    const refStr = errorRefString(err);
    toast.error(humanizeError(err), refStr ? { description: refStr } : undefined);
  };

  // M6: creator earnings withdrawal — direct withdrawAgentEarnings() wallet write.
  const { data: walletClient } = useWalletClient();
  const [isWithdrawing, setWithdrawing] = useState(false);
  const hasEarnings = earnings !== null && BigInt(earnings.earnings) > 0n;
  const withdrawEarnings = async (): Promise<void> => {
    if (!hasEarnings || isWithdrawing) return;
    setWithdrawing(true);
    try {
      const hash = await payment.withdrawEarnings();
      toastSuccess(`Withdrawal submitted (${hash.slice(0, 10)}…)`);
      // Refresh the earnings figure from the live read; a stale non-zero value would re-enable the CTA against an empty balance.
      const info = await payment.getEarnings(tokenId).catch(() => null);
      if (info) setEarnings(info);
    } catch (err) {
      toastError(err);
    } finally {
      setWithdrawing(false);
    }
  };

  // M3: owner spending-strategy surface — refresh the daily limit through the
  // set-strategy encode relay; root is pre-filled from the live strategyOf read
  // so refreshing a limit never zeroes the Merkle root.
  const [limitInput, setLimitInput] = useState("");
  const [strategyError, setStrategyError] = useState<string | null>(null);
  const [isStrategySubmitting, setStrategySubmitting] = useState(false);
  const submitStrategyLimit = async (): Promise<void> => {
    const value = limitInput.trim();
    // Same shape the set-strategy relay schema enforces — catch it inline before the 400.
    if (!/^\d+(\.\d+)?$/.test(value) || Number(value) <= 0) {
      setStrategyError("Enter a daily limit greater than zero.");
      return;
    }
    if (!walletClient) {
      setStrategyError("Connect a wallet to set the spending limit.");
      return;
    }
    setStrategySubmitting(true);
    setStrategyError(null);
    try {
      const encoded = await apiFetch<EncodeResponse>(
        `/v1/agents/${agentId}/set-strategy`,
        {
          method: "POST",
          body: JSON.stringify({
            root: strategyBound ? vault.strategyRoot : undefined,
            dailyLimit: value,
            // Preserve the live expiry; "0" sentinel keeps "no expiry" when unset.
            validUntilDay: vault.validUntilDay.toString(),
          }),
        },
      );
      const hash = await walletClient.sendTransaction({
        to: encoded.to,
        data: encoded.data,
        value: BigInt(encoded.value || "0"),
        chain: walletClient.chain,
      });
      toastSuccess(`Spending limit submitted (${hash.slice(0, 10)}…)`);
      setLimitInput("");
      vault.refetch();
    } catch (err) {
      toastError(err);
    } finally {
      setStrategySubmitting(false);
    }
  };

  const copyDataHash = () => {
    if (metadata?.dataHash) navigator.clipboard?.writeText(metadata.dataHash);
    action("Metadata root copied.");
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
              {lastEvent?.txHash && (
                <Fact label="Explorer">
                  <a
                    className="text-link"
                    href={explorerTx(lastEvent.txHash)}
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
              {commandActions.map((item) => (
                <Button
                  key={item.label}
                  variant={item.variant}
                  onClick={() => go(item.path)}
                  icon={item.icon}
                >
                  {item.label}
                </Button>
              ))}
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
            {[
              {
                value: paymentSymbol,
                label: agentCopy.token,
              },
              {
                value: earnings
                  ? `${formatUnits(BigInt(earnings.earnings), paymentToken?.decimals ?? 6)} ${paymentSymbol}`
                  : "—",
                label: agentCopy.earnings,
              },
              {
                value: paymentConfig
                  ? `${Number(paymentConfig.protocolFeeBps) / 100}%`
                  : "—",
                label: agentCopy.royalty,
              },
            ].map((cell) => (
              <div key={cell.label}>
                <strong>{cell.value}</strong>
                <small>{cell.label}</small>
              </div>
            ))}
          </div>
          <div className="button-row">
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
            <Button
              variant="secondary"
              onClick={() => void withdrawEarnings()}
              busy={isWithdrawing}
              disabled={!hasEarnings}
            >
              Withdraw earnings
            </Button>
          </div>
        </section>
      )}

      {tab === "payments" && (
        <section className="panel tab-panel">
          <h2>Spending strategy</h2>
          <dl className="provenance-list">
            <Fact label="Daily limit">
              {vault.dailyLimitWei > 0n
                ? `${formatTokenAmount(vault.dailyLimitWei)} ${nativeSymbol}`
                : "—"}
            </Fact>
            <Fact label="Spent today" mono>
              {vault.dailyLimitWei > 0n
                ? `${formatTokenAmount(vault.dailySpentWei)} ${nativeSymbol}`
                : "—"}
            </Fact>
            <Fact label="Remaining" mono>
              {vault.dailyLimitWei > 0n
                ? `${formatTokenAmount(
                    vault.dailySpentWei > vault.dailyLimitWei
                      ? 0n
                      : vault.dailyLimitWei - vault.dailySpentWei,
                  )} ${nativeSymbol}`
                : "—"}
            </Fact>
            <Fact label="Resets">
              {vault.resetDay > 0n
                ? `${utcDayDateLabel(vault.resetDay + 1n)} (UTC)`
                : "—"}
            </Fact>
            <Fact label="Expires">
              {vault.validUntilDay > 0n
                ? `${utcDayDateLabel(vault.validUntilDay)} (UTC)`
                : strategyBound
                  ? "Never"
                  : "—"}
            </Fact>
          </dl>
          <div className="execute-grid">
            <Field
              label="New daily limit"
              value={limitInput}
              onChange={setLimitInput}
              suffix={nativeSymbol}
              placeholder="e.g. 0.5"
              error={strategyError ?? undefined}
              hint={
                strategyBound
                  ? "Submitted through the set-strategy relay; the existing Merkle root and expiry are preserved."
                  : "No Merkle root is set on this vault — autonomous settlement additionally needs a proof root plus an off-chain Merkle-proof producer."
              }
            />
          </div>
          <div className="button-row">
            <Button
              onClick={() => void submitStrategyLimit()}
              busy={isStrategySubmitting}
            >
              Set spending limit
            </Button>
          </div>
        </section>
      )}

      {tab === "activity" && (
        <section className="panel tab-panel">
          <h2>{agentCopy.evidenceTied}</h2>
          <div className="activity-list">
            {events.length === 0 && (
              <div className="empty-state">
                <strong>
                  {eventsLoading ? "Loading events…" : "No events indexed"}
                </strong>
                {!eventsLoading && (
                  <span>
                    On-chain activity for this agent appears here as the indexer
                    sees it.
                  </span>
                )}
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
