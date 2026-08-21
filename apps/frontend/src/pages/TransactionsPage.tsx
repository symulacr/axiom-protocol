/*
  TransactionsPage — v2 receipt center. Rows come from two merged sources:
  the local receipts added by the flow pages (uiStore transactions, real tx
  hashes) and live on-chain events (useEventStream WS `*` + useEventHistory
  polled/deduped), mapped onto v2 Transaction rows + StatePill states.
*/
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useChainId } from "wagmi";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Bot,
  ChevronDown,
  ChevronRight,
  Copy,
  CreditCard,
  KeyRound,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  X,
  Zap,
} from "../components/axiom/icons.js";
import { Button } from "../components/axiom/Controls.js";
import { StatePill } from "../components/StatePill.js";
import { MobileDisclosure } from "../components/MobileDisclosure.js";
import { getCopy } from "../lib/copy.js";
import type { AppState, Transaction, TxState } from "../lib/models.js";
import type { PrototypeAction } from "../lib/prototypeStore.js";
import {
  useEventHistory,
  eventDedupeKey,
  eventTokenId,
  type AxiomEvent,
} from "../hooks/useEventHistory.js";
import { useEventStream } from "../hooks/useEventStream.js";
import { truncateHex, explorerTxUrl } from "../utils/format.js";
import { useModalDismiss } from "../hooks/useModalDismiss.js";

function eventKindIcon(eventName: string) {
  const name = eventName.toLowerCase();
  if (name.includes("pay") || name.includes("earning"))
    return <CreditCard size={15} />;
  if (name.includes("approve") || name.includes("allowance"))
    return <KeyRound size={15} />;
  if (name.includes("transfer")) return <ShieldCheck size={15} />;
  if (name.includes("tick") || name.includes("run")) return <Play size={15} />;
  if (name.includes("mint") || name.includes("agent")) return <Bot size={15} />;
  return <Zap size={15} />;
}

function eventToTransaction(event: AxiomEvent): Transaction {
  const tokenId = eventTokenId(event);
  return {
    id: `${event.txHash}:${event.logIndex}`,
    kind: event.eventName || "Chain event",
    detail: tokenId
      ? `agent #${tokenId} · block ${event.blockNumber}`
      : `block ${event.blockNumber}`,
    hash: event.txHash || "—",
    age: event.timestamp
      ? `${Math.max(0, Math.round((Date.now() - event.timestamp * 1000) / 60000))}m ago`
      : "indexed",
    state: "confirmed",
    route: tokenId ? `/agents/${tokenId}` : "/transactions",
    agent: tokenId ?? "chain",
    icon: eventKindIcon(event.eventName ?? ""),
  };
}

/** C-15: local receipts persist across reload — derive their age from the
 *  persisted creation time instead of resurrecting a frozen "now". */
function transactionAge(tx: Transaction): string {
  if (typeof tx.createdAt === "number") {
    return `${Math.max(0, Math.round((Date.now() - tx.createdAt) / 60000))}m ago`;
  }
  return tx.age;
}

/* C-SETTINGS filter depth contract (03 FINDING-011): depth 0 keeps the three
 * everyday buckets (All / Needs review / Confirmed); the seven per-state
 * filters live behind a "More filters" popover at depth 1. The review bucket
 * (reverted+rejected+stale) and the stale-only state get distinct labels
 * (txCopy.filterReview vs txCopy.filterStale) — they shared "Needs review"
 * before. ?filter= deep links keep working: the state machine is unchanged. */
const ADVANCED_FILTERS = [
  "approval",
  "signing",
  "submitted",
  "confirming",
  "reverted",
  "rejected",
  "stale",
] as const satisfies readonly TxState[];

type AdvancedFilter = (typeof ADVANCED_FILTERS)[number];

function AdvancedFiltersPopover({
  title,
  options,
  filter,
  position,
  onChoose,
  onClose,
}: {
  title: string;
  options: readonly { value: AdvancedFilter; label: string }[];
  filter: "all" | "review" | TxState;
  position: { top?: number; bottom?: number; right: number };
  onChoose: (value: AdvancedFilter) => void;
  onClose: () => void;
}) {
  // Modal-dismiss contract (C-14): Esc + focus restore here; the backdrop
  // element covers the click-away leg; selection closes explicitly.
  useModalDismiss(onClose);
  return createPortal(
    <>
      <div className="filters-backdrop" onMouseDown={onClose} />
      <div
        className="filters-popover"
        role="dialog"
        aria-label={title}
        style={{
          top: position.top,
          bottom: position.bottom,
          right: position.right,
        }}
      >
        {options.map((option) => (
          <button
            key={option.value}
            className={filter === option.value ? "filter active" : "filter"}
            onClick={() => onChoose(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </>,
    document.body,
  );
}

function ReceiptDrawer({
  tx,
  explorerTx,
  onClose,
  go,
  dispatch,
  locale,
}: {
  tx: Transaction;
  explorerTx: (hash: string) => string;
  onClose: () => void;
  go: (path: string) => void;
  dispatch: React.Dispatch<PrototypeAction>;
  locale: "en" | "fr" | "de";
}) {
  const copy = getCopy(locale);
  const txCopy = copy.transactions;
  // C-14 dismiss trio: Esc + focus restore here; backdrop (layer onClick) and
  // the X already existed.
  useModalDismiss(onClose);
  const recover = ["reverted", "rejected", "stale"].includes(tx.state);
  const copyHash = () => {
    navigator.clipboard?.writeText(tx.hash);
    dispatch({ type: "notice", notice: "Receipt hash copied locally." });
  };
  const primaryAction = recover ? (
    <Button
      onClick={() => {
        dispatch({ type: "tx-state", txId: tx.id, txState: "ready" });
        dispatch({ type: "notice", notice: txCopy.recoveryNotice });
        onClose();
        go(`${tx.route}?intent=recovery`);
      }}
      icon={<RotateCcw size={15} />}
    >
      {txCopy.openRecovery}
    </Button>
  ) : (
    <Button
      variant="secondary"
      onClick={() => go(`${tx.route}?intent=receipt`)}
      icon={<ArrowRight size={15} />}
    >
      {txCopy.openOperation}
    </Button>
  );
  return createPortal(
    <div className="drawer-layer" onClick={onClose}>
      <aside
        className="receipt-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`${txCopy.drawerTitle}: ${tx.kind}`}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="icon-button drawer-close"
          onClick={onClose}
          aria-label={txCopy.closeReceipt}
        >
          <X size={16} />
        </button>
        {/* S1 (audit 06 FINDING-005 / duplication map #1): the row under this
            drawer already shows kind, detail, state and the truncated hash —
            the drawer renders only what the row cannot: the full hash, the
            explorer link, the agent and the event note. */}
        <h2>{txCopy.drawerTitle}</h2>
        <div className="receipt-primary-action">{primaryAction}</div>
        <MobileDisclosure
          className="receipt-proof-disclosure"
          eyebrow={txCopy.proofEyebrow}
          title={txCopy.proofTitle}
        >
          <dl className="provenance-list drawer-list">
            <div>
              <dt>{txCopy.transactionHash}</dt>
              <dd className="mono">
                {tx.hash}{" "}
                <button
                  className="inline-copy"
                  onClick={copyHash}
                  aria-label="Copy receipt hash"
                >
                  <Copy size={12} />
                </button>
              </dd>
            </div>
            <div>
              <dt>{txCopy.network}</dt>
              <dd>
                <a
                  className="text-link"
                  href={explorerTx(tx.hash)}
                  target="_blank"
                  rel="noreferrer"
                >
                  View on explorer <ArrowRight size={12} />
                </a>
              </dd>
            </div>
            <div>
              <dt>{txCopy.agent}</dt>
              <dd>{tx.agent}</dd>
            </div>
            <div>
              <dt>{txCopy.event}</dt>
              <dd>
                {tx.state === "confirmed"
                  ? txCopy.decodedIndexed
                  : txCopy.awaitingFinalEvidence}
              </dd>
            </div>
          </dl>
        </MobileDisclosure>
      </aside>
    </div>,
    document.body,
  );
}

export function TransactionsPage({
  go,
  state,
  dispatch,
}: {
  go: (path: string) => void;
  state: AppState;
  dispatch: React.Dispatch<PrototypeAction>;
}) {
  const copy = getCopy(state.settings.locale);
  const txCopy = copy.transactions;
  const chainId = useChainId();
  const explorerTx = (hash: string) => explorerTxUrl(chainId, hash);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedFilter = searchParams.get("filter");
  const requestedTx = searchParams.get("tx");
  const [filter, setFilter] = useState<"all" | "review" | TxState>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filtersPos, setFiltersPos] = useState<{
    top?: number;
    bottom?: number;
    right: number;
  } | null>(null);
  const filtersTriggerRef = useRef<HTMLButtonElement>(null);
  const { events, refetch: refetchHistory } = useEventHistory({
    pollIntervalMs: 15_000,
  });
  const { events: wsEvents, isConnected: wsConnected } = useEventStream({
    topics: ["*"],
  });

  useEffect(() => {
    if (
      requestedFilter === "review" ||
      [
        "all",
        "approval",
        "signing",
        "submitted",
        "confirming",
        "confirmed",
        "reverted",
        "rejected",
        "stale",
      ].includes(requestedFilter ?? "")
    ) {
      setFilter(requestedFilter as "all" | "review" | TxState);
    }
    if (requestedTx) setSelectedId(requestedTx);
  }, [requestedFilter, requestedTx]);

  const transactions = useMemo<Transaction[]>(() => {
    // One receipt per on-chain log: WS live frames and the polled history must
    // merge on the (chainId, txHash, logIndex) dedupe key, and chat-transcript
    // bookkeeping events are server-side storage pointers, not console
    // receipts — a receipt center listing "transcript / block 0" rows is noise.
    const merged = new Map<string, AxiomEvent>();
    for (const event of [...events, ...wsEvents]) {
      if (event.eventName === "transcript") continue;
      merged.set(eventDedupeKey(event), event);
    }
    const chainEvents = [...merged.values()].map((event) =>
      eventToTransaction(event),
    );
    const seen = new Set(chainEvents.map((tx) => tx.id));
    const local = state.transactions.filter((tx) => !seen.has(tx.id));
    return [...local, ...chainEvents];
  }, [events, wsEvents, state.transactions]);

  const filtered =
    filter === "all"
      ? transactions
      : filter === "review"
        ? transactions.filter((tx) =>
            ["reverted", "rejected", "stale"].includes(tx.state),
          )
        : transactions.filter((tx) => tx.state === filter);
  const selected = transactions.find((tx) => tx.id === selectedId) ?? null;

  const chooseFilter = (value: "all" | "review" | TxState) => {
    setFilter(value);
    const next = new URLSearchParams(searchParams);
    next.set("filter", value);
    next.delete("tx");
    setSelectedId(null);
    setSearchParams(next, { replace: true });
  };

  // Chip labels: the stale-only filter gets its own label so it can never
  // collide with the review bucket again (03 FINDING-011).
  const stateFilterLabel = (value: TxState) =>
    value === "stale" ? txCopy.filterStale : (copy.status[value] ?? value);
  const advancedActive = (ADVANCED_FILTERS as readonly string[]).includes(
    filter,
  );
  const toggleFiltersPopover = () => {
    if (filtersPos) {
      setFiltersPos(null);
      return;
    }
    const rect = filtersTriggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const right = Math.max(8, Math.round(window.innerWidth - rect.right));
    // Viewport-fit (C-13 lesson): open downward only when the popover fits;
    // otherwise anchor to the trigger's top edge and grow upward.
    if (window.innerHeight - rect.bottom >= 280) {
      setFiltersPos({ top: Math.round(rect.bottom + 6), right });
    } else {
      setFiltersPos({
        bottom: Math.round(window.innerHeight - rect.top + 6),
        right,
      });
    }
  };

  return (
    <div className="ops-page">
      <div className="page-head">
        <div>
          <span className="eyebrow">{txCopy.eyebrow}</span>
          <h1>{txCopy.title}</h1>
          <p>{txCopy.description}</p>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            refetchHistory();
            dispatch({
              type: "notice",
              notice: wsConnected
                ? txCopy.refreshNotice
                : `${txCopy.refreshNotice} ${txCopy.feedDown}`,
            });
          }}
          icon={<RefreshCw size={15} />}
        >
          {txCopy.refreshState}
        </Button>
      </div>

      <section className="ops-summary">
        <div>
          <span className="eyebrow">{txCopy.liveQueue}</span>
          <strong>
            {String(
              transactions.filter((tx) =>
                ["submitted", "confirming"].includes(tx.state),
              ).length,
            ).padStart(2, "0")}
          </strong>
          <small>{txCopy.confirmingNow}</small>
        </div>
        <button
          className="ops-summary-recovery"
          onClick={() => chooseFilter("review")}
        >
          <span className="eyebrow">{txCopy.recovery}</span>
          <strong>
            {String(
              transactions.filter((tx) =>
                ["reverted", "rejected", "stale"].includes(tx.state),
              ).length,
            ).padStart(2, "0")}
          </strong>
          <small>{txCopy.needReview}</small>
          <ArrowRight size={14} />
        </button>
        <div className="ops-summary-note">
          <ShieldCheck size={16} />
          <span>{txCopy.confirmedNote}</span>
        </div>
      </section>

      <section className="panel transaction-panel">
        <div className="panel-head transaction-panel-head">
          <div>
            <span className="eyebrow">{txCopy.activitySharedStore}</span>
            <h2>{txCopy.statefulOperations}</h2>
          </div>
          <div className="transaction-filter-controls">
            <span className="result-count" aria-live="polite">
              {filtered.length} of {transactions.length} receipts
            </span>
            <div
              className="filters"
              role="group"
              aria-label="Receipt state filter"
            >
              {(["all", "review", "confirmed"] as const).map((value) => (
                <button
                  key={value}
                  className={filter === value ? "filter active" : "filter"}
                  onClick={() => chooseFilter(value)}
                >
                  {value === "all"
                    ? txCopy.filterAll
                    : value === "review"
                      ? txCopy.filterReview
                      : stateFilterLabel("confirmed")}
                </button>
              ))}
              <button
                ref={filtersTriggerRef}
                className={`filter filters-trigger${advancedActive ? " active" : ""}`}
                aria-expanded={Boolean(filtersPos)}
                aria-haspopup="dialog"
                onClick={toggleFiltersPopover}
              >
                {advancedActive
                  ? `${txCopy.moreFilters} · ${stateFilterLabel(filter as TxState)}`
                  : txCopy.moreFilters}
                <ChevronDown size={11} />
              </button>
            </div>
          </div>
        </div>
        <div className="transaction-table">
          <div className="transaction-table-head">
            <span>{txCopy.operation}</span>
            <span>{txCopy.hash}</span>
            <span>{txCopy.age}</span>
            <span>{txCopy.state}</span>
          </div>
          {filtered.map((tx) => (
            <button
              className="transaction-row"
              key={tx.id}
              onClick={() => {
                setSelectedId(tx.id);
                const next = new URLSearchParams(searchParams);
                next.set("filter", filter);
                next.set("tx", tx.id);
                setSearchParams(next, { replace: true });
              }}
            >
              <span className="transaction-kind">
                <i>{tx.icon}</i>
                <span>
                  <strong>{tx.kind}</strong>
                  <small>{tx.detail}</small>
                </span>
              </span>
              <span className="mono transaction-proof-cell">
                {truncateHex(tx.hash, 8, 4)}
              </span>
              <span className="mono transaction-age">{transactionAge(tx)}</span>
              <StatePill state={tx.state} />
              <ChevronRight size={15} />
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="empty-state transaction-empty-state">
              <p>{txCopy.emptyState}</p>
              <button className="text-link" onClick={() => chooseFilter("all")}>
                Clear filter <RotateCcw size={13} />
              </button>
            </div>
          )}
        </div>
      </section>

      {filtersPos && (
        <AdvancedFiltersPopover
          title={txCopy.moreFilters}
          options={ADVANCED_FILTERS.map((value) => ({
            value,
            label: stateFilterLabel(value),
          }))}
          filter={filter}
          position={filtersPos}
          onChoose={(value) => {
            chooseFilter(value);
            setFiltersPos(null);
          }}
          onClose={() => setFiltersPos(null)}
        />
      )}

      {selected && (
        <ReceiptDrawer
          tx={selected}
          explorerTx={explorerTx}
          onClose={() => {
            setSelectedId(null);
            const next = new URLSearchParams(searchParams);
            next.delete("tx");
            setSearchParams(next, { replace: true });
          }}
          go={go}
          dispatch={dispatch}
          locale={state.settings.locale}
        />
      )}
    </div>
  );
}
