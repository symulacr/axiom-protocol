/*
  AgentPage — v2 tab layout (overview / execute / payments / activity) fed by
  the v1 data layer: useAgentMetadata (owner + dataHash on-chain reads),
  useAgentEvents (WS + polled events), usePerformance, usePayment earnings.
  Executes bounded operations by deep-linking the flow pages with a prefilled
  intent (review-first, never auto-submitted).
*/
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  useAccount,
  useChainId,
  useReadContracts,
  useWalletClient,
} from "wagmi";
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
import { routePath } from "../lib/routeRegistry.js";
import { useAgents } from "../hooks/useAgents.js";
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
import { usePaymentTokenOnchain } from "../hooks/usePaymentTokenOnchain.js";
import { formatUnits, type Address, type Hex } from "viem";
import { APP_CHAIN } from "../config/wagmi.js";
import { hasStrategyRoot } from "../lib/models.js";
import {
  formatTokenAmount,
  truncateAddress,
  truncateHex,
  explorerTxUrl,
} from "../utils/format.js";
import { encodeRelayTransaction } from "../utils/encodeRelay.js";
import {
  getAxiomAgentNftAddress,
  getAxiomDelegationRegistryAddress,
  toViemAbi,
} from "../abi/addresses.js";
import { DELEGATION_REGISTRY_ABI } from "@axiom/config/abis";
import { useGenericWrite } from "../hooks/useGenericWrite.js";
import { useSignTypedData } from "wagmi";
import {
  AGENT_DELEGATION_TYPES,
  DELEGATION_REGISTRY_DOMAIN,
  buildAgentDelegation,
} from "../lib/delegation.js";
import { usePaymentSnapshot } from "../hooks/usePaymentSnapshot.js";
import { useAgentDelegation } from "../hooks/useAgentDelegation.js";
import { toastError, toastSuccess } from "./shared.js";
import { useUiStore } from "../lib/uiStore.js";
import { Spinner } from "../components/ui.js";

const AGENT_TABS = ["overview", "execute", "payments", "activity"] as const;
type AgentTab = (typeof AGENT_TABS)[number];

const axiomAgentNftAbiParsed = toViemAbi(AGENT_NFT_ABI);

/** Fact/activity value: local clock/date via Intl — block numbers mean nothing to a first-time user. */
function eventTimeLabel(event: AxiomEvent): string {
  const ts = event.timestamp ?? event.receivedAt;
  const date = new Date(ts);
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

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
  refetch: () => void;
}

function useAgentEvents(
  tokenId: bigint | null,
  options: UseAgentEventsOptions = {},
): UseAgentEventsResult {
  const { enabled = true } = options;
  const { events, isLoading, refetch } = useEventHistory({
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
      refetch,
    }),
    [agentEvents, isLoading, refetch],
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
  const { agents, settled: agentsSettled } = useAgents();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab") as AgentTab | null;
  const [tab, setTab] = useState<AgentTab>(
    (AGENT_TABS as readonly string[]).includes(requestedTab ?? "")
      ? (requestedTab as AgentTab)
      : "overview",
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const action = (message: string) => setNotice(message);

  const { data: metadata, error: metadataError } = useAgentMetadata(tokenId);
  const { events, isLoading: eventsLoading } = useAgentEvents(tokenId);
  // T8: in-flight receipts from the flow pages join the activity tab the
  // moment the user signs — no wait for the 15s event poll.
  const { state: consoleState } = useUiStore();
  const agentId = tokenId.toString();
  const localReceipts = consoleState.transactions.filter(
    (tx) => tx.agent === agentId,
  );
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

  // F1: unknown agent id → the 404 route, never a plausible locked gate.
  // Decided only on a settled successful agents read (wallet connected + list
  // loaded): absent id means the token does not exist for this operator.
  // Loading, error, and empty-wallet states keep rendering the page honestly.
  const agentKnown = agents.some((agent) => agent.tokenId === tokenId);
  const agentMissing = agentsSettled && agents.length > 0 && !agentKnown;
  useEffect(() => {
    if (agentMissing) go("/this-path-does-not-exist-404");
    // hooks: one navigation per concluded-missing id
  }, [agentMissing, go]);

  if (agentMissing) return null;

  const [moreOpen, setMoreOpen] = useState(false);
  const primaryActions: {
    path: string;
    icon: React.ReactNode;
    variant?: "secondary" | "ghost";
    label: string;
  }[] = [
    {
      path: `${routePath("deposit")}?agent=${agentId}`,
      icon: <Wallet size={15} />,
      label: agentCopy.addMoneyPrimary,
    },
    {
      path: `/tick?agent=${agentId}&intent=bounded`,
      icon: <Play size={15} />,
      label: agentCopy.runTask,
    },
  ];
  const secondaryActions: {
    path: string;
    icon: React.ReactNode;
    label: string;
  }[] = [
    {
      path: `/transfer?agent=${agentId}&intent=proof&stage=recipient`,
      icon: <ShieldCheck size={15} />,
      label: agentCopy.transferProof,
    },
    {
      path: `/withdraw?agent=${agentId}`,
      icon: <UploadCloud size={15} />,
      label: agentCopy.withdrawFunds,
    },
    {
      path: `/payment?agent=${agentId}&intent=fund&stage=amount`,
      icon: <CreditCard size={15} />,
      label: agentCopy.fundAgent,
    },
  ];
  // vault balances are native-denominated (chain config); payments tab uses the payment token symbol.
  const nativeSymbol = APP_CHAIN.nativeCurrency.symbol;
  const paymentToken = usePaymentToken();
  const paymentSymbol = paymentSymbolOf(paymentToken);
  // W2-C: live decimals via ONE Multicall3 aggregate3 round-trip (also carries the
  // caller's allowance read for the pay flow) instead of a second sequential RPC.
  const onchain = usePaymentTokenOnchain(
    paymentToken?.paymentToken
      ? (paymentToken.paymentToken.toLowerCase() as Address)
      : null,
  );
  const liveDecimals = onchain.decimals ?? paymentToken?.decimals;
  // W4 statefold: Processor.paymentSnapshot pre-flight for the pay panel (cap,
  // earnings, allowance, token) — one more multicall leg.
  const snapshot = usePaymentSnapshot();
  const vaultBalance =
    vault.depositsWei !== undefined
      ? `${formatTokenAmount(vault.depositsWei)} ${nativeSymbol}`
      : "—";
  const strategyBound = hasStrategyRoot(vault.strategyRoot);

  // M6: creator earnings withdrawal — direct withdrawAgentEarnings() wallet write.
  const { data: walletClient } = useWalletClient();
  const [isWithdrawing, setWithdrawing] = useState(false);
  const hasEarnings = earnings !== null && BigInt(earnings.earnings) > 0n;
  const withdrawEarnings = async (): Promise<void> => {
    if (!hasEarnings || isWithdrawing) return;
    setWithdrawing(true);
    try {
      const hash = await payment.withdrawEarnings();
      toastSuccess(agentCopy.withdrawToast(hash));
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
      setStrategyError(agentCopy.errLimitPositive);
      return;
    }
    if (!walletClient) {
      setStrategyError(agentCopy.errLimitWallet);
      return;
    }
    setStrategySubmitting(true);
    setStrategyError(null);
    try {
      const hash = await encodeRelayTransaction(
        walletClient,
        `/v1/agents/${agentId}/set-strategy`,
        {
          root: strategyBound ? vault.strategyRoot : undefined,
          dailyLimit: value,
          // Preserve the live expiry; "0" sentinel keeps "no expiry" when unset.
          validUntilDay: vault.validUntilDay.toString(),
        },
      );
      toastSuccess(agentCopy.limitToast(hash));
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
    action(agentCopy.copiedNotice);
  };

  // W3-C: Permit2 pay panel — amount input + sign-and-pay; the hook picks the
  // lane (permit2 signature vs existing allowance) and reports which one ran.
  const [payAmountInput, setPayAmountInput] = useState("");
  const [isPermit2Submitting, setPermit2Submitting] = useState(false);
  const [permit2Lane, setPermit2Lane] = useState<string | null>(null);
  const submitPermit2Pay = async (): Promise<void> => {
    const value = payAmountInput.trim();
    if (!/^\d+(\.\d+)?$/.test(value) || Number(value) <= 0) {
      toastError(new Error(agentCopy.errLimitPositive));
      return;
    }
    setPermit2Submitting(true);
    try {
      const result = await payment.payForAgentWithPermit2(tokenId, value);
      setPermit2Lane(result.lane);
      toastSuccess(agentCopy.permit2LaneNote(result.lane));
      setPayAmountInput("");
    } catch (err) {
      toastError(err);
    } finally {
      setPermit2Submitting(false);
    }
  };

  // W3-C: Agent Delegation card — owner-only install/revoke over the registry.
  const connectedAddress = walletClient?.account?.address;
  const isOwner =
    !!metadata?.owner &&
    !!connectedAddress &&
    metadata.owner.toLowerCase() === connectedAddress.toLowerCase();
  const delegationRegistryAddress = getAxiomDelegationRegistryAddress();
  const delegation = useAgentDelegation(tokenId);
  const { write } = useGenericWrite();
  const { signTypedDataAsync } = useSignTypedData();
  const delegationAbi = useMemo(() => toViemAbi(DELEGATION_REGISTRY_ABI), []);
  const [delegateInput, setDelegateInput] = useState("");
  const [targetsInput, setTargetsInput] = useState("");
  const [perTxCapInput, setPerTxCapInput] = useState("");
  const [windowCapInput, setWindowCapInput] = useState("");
  const [windowSecondsInput, setWindowSecondsInput] = useState("86400");
  const [expiresDaysInput, setExpiresDaysInput] = useState("7");
  const [delegationError, setDelegationError] = useState<string | null>(null);
  const [isDelegationSubmitting, setDelegationSubmitting] = useState(false);

  const installDelegation = async (): Promise<void> => {
    if (!delegationRegistryAddress || !walletClient) return;
    if (!walletClient.account) {
      setDelegationError(agentCopy.errDelegationWallet);
      return;
    }
    setDelegationSubmitting(true);
    setDelegationError(null);
    try {
      const targets = targetsInput
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [target, selector] = line.split(":") as [string, string];
          return { target: target as Address, selector: selector as Hex };
        });
      const { delegation: d, error } = buildAgentDelegation(
        {
          agentTokenId: tokenId,
          delegate: delegateInput.trim() as Address,
          perTxCap: perTxCapInput.trim(),
          windowCap: windowCapInput.trim() || "0",
          windowSeconds: windowSecondsInput.trim(),
          expiresInDays: expiresDaysInput.trim(),
          allowedTargets: targets,
        },
        BigInt(Math.floor(Date.now() / 1000)),
      );
      if (error || !d) {
        setDelegationError(
          (agentCopy.errDelegationForm as string).replace(
            "{error}",
            error ?? "",
          ),
        );
        return;
      }
      const signature = await signTypedDataAsync({
        domain: DELEGATION_REGISTRY_DOMAIN(chainId, delegationRegistryAddress),
        types: AGENT_DELEGATION_TYPES,
        primaryType: "AgentDelegation",
        message: {
          agentTokenId: d.agentTokenId,
          delegate: d.delegate,
          perTxCap: d.perTxCap,
          windowCap: d.windowCap,
          windowSeconds: d.windowSeconds,
          expiresAt: d.expiresAt,
          allowedSelectorsRoot: d.allowedSelectorsRoot,
          nonce: d.nonce,
        },
      });
      const hash = await write({
        to: delegationRegistryAddress,
        abi: delegationAbi,
        functionName: "installDelegation",
        args: [
          [
            d.agentTokenId,
            d.delegate,
            d.perTxCap,
            d.windowCap,
            d.windowSeconds,
            d.expiresAt,
            d.allowedSelectorsRoot,
            d.nonce,
          ],
          signature,
        ],
      });
      toastSuccess(agentCopy.delegationToast(hash));
      delegation.refresh();
    } catch (err) {
      toastError(err);
    } finally {
      setDelegationSubmitting(false);
    }
  };

  const revokeDelegation = async (): Promise<void> => {
    if (!delegationRegistryAddress) return;
    setDelegationSubmitting(true);
    try {
      const hash = await write({
        to: delegationRegistryAddress,
        abi: delegationAbi,
        functionName: "revokeDelegation",
        args: [tokenId],
      });
      toastSuccess(agentCopy.delegationToast(hash));
      delegation.refresh();
    } catch (err) {
      toastError(err);
    } finally {
      setDelegationSubmitting(false);
    }
  };

  return (
    <div className="ops-page agent-page">
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
            {agentCopy.runTask}
          </Button>
        </div>
      </PageHead>

      <div className="agent-detail-head">
        <div className="agent-detail-mark">
          <Bot size={28} />
        </div>
        <div>
          <strong>
            {vaultBalance}
            {/* T8: churn cue while the 30s vault poll re-reads this balance. */}
            {vault.isFetching && <Spinner size={10} variant="churn" />}
          </strong>
          <small>
            {strategyBound
              ? interpolate(agentCopy.balanceToSpend, {
                  amount: vaultBalance,
                })
              : agentCopy.needsSetup}
          </small>
        </div>
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
                  aria-label={agentCopy.copyHashA11y}
                >
                  <Copy size={12} />
                </button>
              </Fact>
              <Fact label={agentCopy.descriptionLabel}>
                {metadata?.dataDescription || "—"}
              </Fact>
              <Fact label={agentCopy.lastEvent}>
                {lastEvent
                  ? eventTimeLabel(lastEvent)
                  : agentCopy.noActivityYet}
              </Fact>
              {lastEvent?.txHash && (
                <Fact label={agentCopy.explorerLabel}>
                  <a
                    className="text-link"
                    href={explorerTx(lastEvent.txHash)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {agentCopy.viewRecordLink} <ArrowRight size={12} />
                  </a>
                </Fact>
              )}
            </dl>
            {metadataError && (
              <div className="diagnostic-note">
                <ShieldCheck size={14} />
                <span>{agentCopy.metadataReadFailed}</span>
              </div>
            )}
            <Button
              variant="secondary"
              onClick={() => go("/storage")}
              icon={<Database size={15} />}
            >
              {agentCopy.openStorage}
            </Button>
          </section>
          <section className="panel agent-command-card">
            <h2>{agentCopy.chooseBoundedOperation}</h2>
            <div className="command-actions">
              {primaryActions.map((item) => (
                <Button
                  key={item.label}
                  variant={item.variant}
                  onClick={() => go(item.path)}
                  icon={item.icon}
                >
                  {item.label}
                </Button>
              ))}
              {!moreOpen && (
                <Button variant="ghost" onClick={() => setMoreOpen(true)}>
                  {agentCopy.moreActions}
                </Button>
              )}
              {moreOpen &&
                secondaryActions.map((item) => (
                  <Button
                    key={item.label}
                    variant="secondary"
                    onClick={() => go(item.path)}
                    icon={item.icon}
                  >
                    {item.label}
                  </Button>
                ))}
            </div>
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
                  ? agentCopy.ticksRun(metrics.totalTicks ?? 0)
                  : agentCopy.providerValue}
              </strong>
              <span className="field-hint">{agentCopy.providerHint}</span>
            </div>
          </div>
          <div className="button-row">
            <Button
              onClick={() => {
                if (!instruction.trim()) {
                  action(agentCopy.describeFirst);
                  return;
                }
                go(
                  `/tick?agent=${tokenId.toString()}&intent=bounded&instruction=${encodeURIComponent(instruction)}`,
                );
              }}
              icon={<Zap size={15} />}
            >
              {agentCopy.previewRun}
            </Button>
            <Button variant="ghost" onClick={() => chooseTab("overview")}>
              {agentCopy.cancel}
            </Button>
          </div>
        </section>
      )}

      {tab === "payments" && (
        <>
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
                    ? `${formatUnits(BigInt(earnings.earnings), liveDecimals ?? 18)} ${paymentSymbol}`
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
                {agentCopy.withdrawEarningsCta}
              </Button>
            </div>
          </section>
          <section className="panel tab-panel">
            <h2>{agentCopy.permit2Title}</h2>
            <p className="field-hint">{agentCopy.permit2Hint}</p>
            {snapshot.snapshot && (
              <dl className="provenance-list">
                <Fact label={agentCopy.permit2SnapshotCap} mono>
                  {snapshot.snapshot.maxPayCap > 0n
                    ? `${formatUnits(snapshot.snapshot.maxPayCap, liveDecimals ?? 18)} ${paymentSymbol}`
                    : "—"}
                </Fact>
                <Fact label={agentCopy.permit2SnapshotAllowance} mono>
                  {snapshot.snapshot.paymentToken
                    ? `${formatUnits(snapshot.snapshot.payerAllowance, liveDecimals ?? 18)} ${paymentSymbol}`
                    : "—"}
                </Fact>
                <Fact label={agentCopy.permit2SnapshotBalance} mono>
                  {snapshot.snapshot.paymentToken
                    ? `${formatUnits(snapshot.snapshot.agentBalance, liveDecimals ?? 18)} ${paymentSymbol}`
                    : "—"}
                </Fact>
              </dl>
            )}
            <div className="execute-grid">
              <Field
                label={agentCopy.payAmountLabel}
                value={payAmountInput}
                onChange={setPayAmountInput}
                suffix={paymentSymbol}
                placeholder="e.g. 1.00"
              />
            </div>
            {permit2Lane && (
              <p className="field-hint">
                {agentCopy.permit2LaneNote(permit2Lane)}
              </p>
            )}
            <div className="button-row">
              <Button
                onClick={() => void submitPermit2Pay()}
                busy={isPermit2Submitting}
                disabled={!paymentToken}
              >
                {agentCopy.permit2Cta}
              </Button>
            </div>
          </section>
          <section className="panel tab-panel">
            <h2>{agentCopy.dailySpendingLimitTitle}</h2>
            <dl className="provenance-list">
              <Fact label={agentCopy.dailyLimitFact}>
                {vault.dailyLimitWei > 0n
                  ? `${formatTokenAmount(vault.dailyLimitWei)} ${nativeSymbol}`
                  : "—"}
              </Fact>
              <Fact label={agentCopy.spentTodayFact} mono>
                {vault.dailyLimitWei > 0n
                  ? `${formatTokenAmount(vault.dailySpentWei)} ${nativeSymbol}`
                  : "—"}
              </Fact>
              <Fact label={agentCopy.remainingFact} mono>
                {vault.dailyLimitWei > 0n
                  ? `${formatTokenAmount(
                      vault.dailySpentWei > vault.dailyLimitWei
                        ? 0n
                        : vault.dailyLimitWei - vault.dailySpentWei,
                    )} ${nativeSymbol}`
                  : "—"}
              </Fact>
              <Fact label={agentCopy.resetsFact}>
                {vault.resetDay > 0n
                  ? `${utcDayDateLabel(vault.resetDay + 1n)} (UTC)`
                  : "—"}
              </Fact>
              <Fact label={agentCopy.expiresFact}>
                {vault.validUntilDay > 0n
                  ? `${utcDayDateLabel(vault.validUntilDay)} (UTC)`
                  : strategyBound
                    ? agentCopy.neverExpires
                    : "—"}
              </Fact>
            </dl>
            <div className="execute-grid">
              <Field
                label={agentCopy.newDailyLimit}
                value={limitInput}
                onChange={setLimitInput}
                suffix={nativeSymbol}
                placeholder="e.g. 0.5"
                error={strategyError ?? undefined}
                hint={
                  strategyBound
                    ? agentCopy.limitTipBound
                    : agentCopy.limitTipUnbound
                }
              />
            </div>
            <div className="button-row">
              <Button
                onClick={() => void submitStrategyLimit()}
                busy={isStrategySubmitting}
              >
                {agentCopy.setSpendingLimit}
              </Button>
            </div>
          </section>
          {isOwner && (
            <section className="panel tab-panel">
              <h2>{agentCopy.delegationTitle}</h2>
              <p className="field-hint">{agentCopy.delegationHint}</p>
              {!delegationRegistryAddress && (
                <div className="diagnostic-note">
                  <ShieldCheck size={14} />
                  <span>{agentCopy.delegationNotConfigured}</span>
                </div>
              )}
              {delegationRegistryAddress && (
                <>
                  <dl className="provenance-list">
                    <Fact label={agentCopy.delegationActive}>
                      {delegation.isLoading
                        ? "…"
                        : delegation.delegation?.delegate &&
                            delegation.delegation.delegate !== "0x0" &&
                            delegation.delegation.isDelegationActive
                          ? truncateAddress(delegation.delegation.delegate)
                          : agentCopy.delegationNone}
                    </Fact>
                    {delegation.delegation?.delegate &&
                      delegation.delegation.delegate !== "0x0" &&
                      delegation.delegation.isDelegationActive && (
                        <>
                          <Fact label={agentCopy.delegationPerTxCapLabel} mono>
                            {formatTokenAmount(delegation.delegation.perTxCap)}{" "}
                            {nativeSymbol}
                          </Fact>
                          <Fact label={agentCopy.delegationWindowCapLabel} mono>
                            {delegation.delegation.windowCap > 0n
                              ? `${formatTokenAmount(delegation.delegation.windowCap)} ${nativeSymbol} / ${delegation.delegation.windowSeconds}s`
                              : "—"}
                          </Fact>
                          <Fact label={agentCopy.delegationExpiryLabel}>
                            {new Date(
                              Number(delegation.delegation.expiresAt) * 1000,
                            ).toLocaleString()}
                          </Fact>
                        </>
                      )}
                  </dl>
                  <div className="execute-grid">
                    <Field
                      label={agentCopy.delegationDelegateLabel}
                      value={delegateInput}
                      onChange={setDelegateInput}
                      placeholder="0x…"
                    />
                    <Field
                      label={agentCopy.delegationPerTxCapLabel}
                      value={perTxCapInput}
                      onChange={setPerTxCapInput}
                      suffix={nativeSymbol}
                      placeholder="e.g. 0.01 (wei)"
                    />
                    <Field
                      label={agentCopy.delegationWindowCapLabel}
                      value={windowCapInput}
                      onChange={setWindowCapInput}
                      suffix={nativeSymbol}
                      placeholder="e.g. 0.1 (wei)"
                    />
                    <Field
                      label={agentCopy.delegationWindowLabel}
                      value={windowSecondsInput}
                      onChange={setWindowSecondsInput}
                      placeholder="86400"
                    />
                    <Field
                      label={agentCopy.delegationExpiryLabel}
                      value={expiresDaysInput}
                      onChange={setExpiresDaysInput}
                      placeholder="7"
                    />
                    <Field
                      label={agentCopy.delegationTargetsLabel}
                      value={targetsInput}
                      onChange={setTargetsInput}
                      placeholder={agentCopy.delegationTargetsPlaceholder}
                    />
                  </div>
                  {delegationError && (
                    <p className="field-hint">{delegationError}</p>
                  )}
                  <div className="button-row">
                    <Button
                      onClick={() => void installDelegation()}
                      busy={isDelegationSubmitting}
                    >
                      {agentCopy.delegationInstall}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => void revokeDelegation()}
                      busy={isDelegationSubmitting}
                      disabled={
                        !delegation.delegation?.delegate ||
                        delegation.delegation.delegate === "0x0" ||
                        !delegation.delegation.isDelegationActive
                      }
                    >
                      {agentCopy.delegationRevoke}
                    </Button>
                  </div>
                </>
              )}
            </section>
          )}
        </>
      )}

      {tab === "activity" && (
        <section className="panel tab-panel">
          <h2>{agentCopy.evidenceTied}</h2>
          <div className="activity-list">
            {events.length === 0 && localReceipts.length === 0 && (
              <div className="empty-state">
                <strong>
                  {eventsLoading
                    ? agentCopy.activityLoading
                    : agentCopy.activityEmptyTitle}
                </strong>
                {!eventsLoading && <span>{agentCopy.activityEmptyHint}</span>}
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
                    {eventTimeLabel(event)} · {truncateHex(event.txHash, 10, 6)}
                  </small>
                </span>
                <StatePill state="confirmed" />
                <ArrowRight size={14} />
              </button>
            ))}
            {localReceipts.map((tx) => (
              <button
                key={tx.id}
                className="activity-row"
                onClick={() =>
                  go(`/transactions?tx=${encodeURIComponent(tx.id)}`)
                }
              >
                <span>{tx.icon}</span>
                <span>
                  <strong>{tx.kind}</strong>
                  <small>{tx.detail}</small>
                </span>
                <StatePill state={tx.state} />
                <ArrowRight size={14} />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
