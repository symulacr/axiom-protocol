/*
  FlowPage — v2 review-first operation page over the LIVE v1 encode-relay
  hooks (plan mapping, steps 6):
    mint     → useMintWizard (oracle ack POST /v1/agents/mint, then
               POST /v1/agents/mint/encode + wallet sendTransaction)
    payment  → usePayment.payForAgent (exact ERC-20 approve when needed, then
               payForAgent) — the v2 2-boundary sheet: allowance review, then pay
    transfer → useTransfer.prepare (challenge) + confirm (EIP-712 sign +
               ECIES-sealed finalize)
    tick     → useOrchestratorTick.tickStream (WS token frames → live stage)
  The OperationReviewSheet is the single confirm surface; "Simulate reject /
  timeout" stays dev-only and maps onto the real recoverable-error paths.
*/
import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useChainId, usePublicClient } from "wagmi";
import { erc20Abi, isAddress } from "viem";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CircleCheck,
  Copy,
  CreditCard,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  Timer,
  X,
} from "../components/axiom/icons.js";
import { Button, Field } from "../components/axiom/Controls.js";
import { StatePill } from "../components/StatePill.js";
import { OperationReviewSheet } from "../components/OperationReviewSheet.js";
import { getCopy } from "../lib/copy.js";
import type {
  AppState,
  FlowKind,
  Locale,
  OperationDraftPhase,
  Transaction,
  TxState,
} from "../lib/models.js";
import type { PrototypeAction } from "../lib/prototypeStore.js";
import { flowMeta } from "../lib/prototypeCatalog.js";
import { useAgents } from "../hooks/useAgents.js";
import { useMintWizard } from "../hooks/useMintWizard.js";
import { usePayment } from "../hooks/usePayment.js";
import { useTransfer } from "../hooks/useTransfer.js";
import { useOrchestratorTick } from "../hooks/useOrchestratorTick.js";
import {
  getAxiomAgentNftAddress,
  getAxiomPaymentProcessorAddress,
  getAxiomStrategyVaultAddress,
} from "../abi/addresses.js";
import {
  humanizeError,
  truncateAddress,
  truncateHex,
} from "../utils/format.js";

const phaseState: Record<OperationDraftPhase, TxState> = {
  draft: "ready",
  review: "signing",
  "approval-required": "approval",
  "payment-required": "signing",
  submitting: "confirming",
  receipt: "confirmed",
  "recoverable-error": "rejected",
};

const DEV_TOOLS = import.meta.env.MODE !== "production";

function freshNonceHex(byteLength = 32): `0x${string}` {
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto?.getRandomValues(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;
}

export function FlowPage({
  kind,
  state,
  dispatch,
  go,
  locale,
}: {
  kind: FlowKind;
  state: AppState;
  dispatch: React.Dispatch<PrototypeAction>;
  go: (path: string) => void;
  locale: Locale;
}) {
  const meta = flowMeta[kind];
  const search = new URLSearchParams(window.location.search);
  const copy = getCopy(locale);
  const flow = copy.flows[kind];
  const f = copy.flowUi;
  const draft = state.operationDrafts[kind];
  const chainId = useChainId();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { agents } = useAgents();
  const mint = useMintWizard();
  const payment = usePayment();
  const transfer = useTransfer();
  const tickHook = useOrchestratorTick();

  const requestedAgent = search.get("agent");
  const intent = search.get("intent");
  const requestedStage = search.get("stage");
  const requestedInstruction = search.get("instruction");

  const selectedTokenId =
    requestedAgent ?? (draft.agent || agents[0]?.tokenId.toString() || "");
  const selectedAgentName = selectedTokenId
    ? `Agent #${selectedTokenId}`
    : "select an agent";

  const [allowance, setAllowance] = useState<string | null>(null);
  const nonceRef = useRef<`0x${string}`>(freshNonceHex());

  // Prefilled instruction links (?instruction=…) seed the draft once.
  useEffect(() => {
    if (
      kind === "tick" &&
      requestedInstruction &&
      draft.value !== requestedInstruction &&
      draft.phase === "draft"
    ) {
      dispatch({
        type: "save-draft",
        draft: { ...draft, value: requestedInstruction },
      });
    }
    // hooks: seed once per instruction link
  }, [kind, requestedInstruction]);

  const intentCopy =
    intent === "fund"
      ? "Agent selected. Review the exact allowance."
      : intent === "proof"
        ? "Proof mode selected. Check the recipient challenge."
        : intent === "bounded"
          ? "Bounded instruction selected. Streaming stays cancellable."
          : intent === "recovery"
            ? "Recovering an existing receipt. No duplicate operation."
            : intent === "receipt"
              ? "Linked to an indexed receipt."
              : null;

  const isReviewOpen = [
    "review",
    "approval-required",
    "payment-required",
    "submitting",
    "recoverable-error",
  ].includes(draft.phase);
  const isBusy =
    draft.phase === "submitting" ||
    mint.busy ||
    payment.isPayLoading ||
    transfer.isLoading ||
    tickHook.isStreaming;

  // Keep the wizard's name in sync with the persisted draft (mint derivation
  // keccak256(toHex(name)) must match the chat mint_agent derivation).
  useEffect(() => {
    if (kind === "mint") mint.setAgentName(draft.value);
    // hooks: sync on draft value only
  }, [kind, draft.value]);

  useEffect(() => {
    if (draft.agent === selectedTokenId && draft.intent === intent) return;
    dispatch({
      type: "save-draft",
      draft: { ...draft, agent: selectedTokenId, intent },
    });
    // hooks: mirror mockup sync semantics
  }, [dispatch, draft, intent, selectedTokenId]);

  useEffect(() => {
    if ((!requestedStage && !intent) || draft.phase !== "draft") return;
    dispatch({
      type: "set-draft-phase",
      flow: kind,
      phase: kind === "payment" ? "approval-required" : "review",
    });
    // hooks: opens review once per intent link
  }, [dispatch, draft.phase, intent, kind, requestedStage]);

  // Live allowance read for the payment review facts (boundary 1).
  useEffect(() => {
    if (kind !== "payment" || draft.phase !== "approval-required") return;
    let cancelled = false;
    const load = async () => {
      try {
        const config = await payment.getPaymentConfig();
        const account = address;
        if (!account || !publicClient) return;
        const raw = (await publicClient.readContract({
          address: config.paymentToken,
          abi: erc20Abi,
          functionName: "allowance",
          args: [account, getAxiomPaymentProcessorAddress(chainId)],
        })) as bigint;
        if (!cancelled) setAllowance(raw.toString());
      } catch {
        if (!cancelled) setAllowance(null);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // hooks: one read per review open
  }, [kind, draft.phase, chainId]);

  const updateValue = (value: string) => {
    dispatch({
      type: "save-draft",
      draft: { ...draft, value, phase: "draft", error: null, receiptId: null },
    });
  };
  const updateExtra = (extra: string) =>
    dispatch({
      type: "save-draft",
      draft: { ...draft, extra, phase: "draft", error: null, receiptId: null },
    });

  const validate = (): string | null => {
    const trimmed = draft.value.trim();
    if (
      kind === "payment" &&
      (!Number.isFinite(Number(trimmed)) || Number(trimmed) <= 0)
    )
      return "Enter a positive amount.";
    if (kind === "mint" && (trimmed.length < 2 || trimmed.length > 80))
      return "Use 2–80 characters.";
    if (kind === "transfer" && !isAddress(trimmed))
      return "Recipient must be a valid 0x address.";
    if (kind === "transfer" && !/^0x[0-9a-fA-F]{128}$/.test(draft.extra.trim()))
      return "Recipient public key must be 64 bytes of hex (0x…).";
    if (kind === "tick" && trimmed.length < 3)
      return "Describe the instruction.";
    if (kind !== "mint" && !selectedTokenId) return "Select an agent first.";
    return null;
  };

  const openReview = () => {
    const error = validate();
    if (error) {
      dispatch({
        type: "set-draft-phase",
        flow: kind,
        phase: "recoverable-error",
        error,
      });
      dispatch({ type: "notice", notice: error });
      return;
    }
    dispatch({
      type: "set-draft-phase",
      flow: kind,
      phase: kind === "payment" ? "approval-required" : "review",
    });
  };

  const addReceipt = (tx: Omit<Transaction, "icon">) => {
    dispatch({ type: "add-tx", tx: { ...tx, icon: meta.icon } });
  };

  const confirmOnChain = (hash: `0x${string}` | undefined) => {
    if (!hash || !publicClient || hash === "0x") return;
    void publicClient
      .waitForTransactionReceipt({ hash })
      .then(() =>
        dispatch({ type: "tx-state", txId: hash, txState: "confirmed" }),
      )
      .catch(() =>
        dispatch({ type: "tx-state", txId: hash, txState: "stale" }),
      );
  };

  const execute = async () => {
    if (isBusy) return;
    // Payment boundary 1: allowance reviewed → advance to the pay boundary.
    if (kind === "payment" && draft.phase === "approval-required") {
      dispatch({
        type: "set-draft-phase",
        flow: kind,
        phase: "payment-required",
      });
      return;
    }
    dispatch({
      type: "set-draft-phase",
      flow: kind,
      phase: "submitting",
      error: null,
    });
    try {
      if (kind === "mint") {
        const dataHash = await mint.registerOracle(draft.value);
        const txHash = await mint.chainMint(dataHash);
        addReceipt({
          id: txHash,
          kind: "Oracle mint",
          detail: `${draft.value.trim()} · oracle acknowledged`,
          hash: txHash,
          age: "now",
          state: "confirming",
          route: "/mint",
          agent: "new",
        });
        confirmOnChain(txHash);
        dispatch({
          type: "notice",
          notice: `Mint submitted for ${draft.value.trim()}. Receipt added to the Transaction Center.`,
        });
      } else if (kind === "payment") {
        const result = await payment.payForAgent(
          BigInt(selectedTokenId),
          draft.value.trim(),
        );
        addReceipt({
          id: result.txHash,
          kind: "Payment",
          detail: `${draft.value.trim()} → agent #${selectedTokenId}`,
          hash: result.txHash,
          age: "now",
          state: "confirming",
          route: "/payment",
          agent: selectedTokenId,
        });
        confirmOnChain(result.txHash);
        dispatch({
          type: "notice",
          notice: `Payment submitted for agent #${selectedTokenId}. Receipt added to the Transaction Center.`,
        });
      } else if (kind === "transfer") {
        const input = {
          tokenId: BigInt(selectedTokenId),
          to: draft.value.trim() as `0x${string}`,
          receiverPubKey64: draft.extra.trim() as `0x${string}`,
          accessProofNonce: nonceRef.current,
        };
        await transfer.prepare(input);
        const txHash = await transfer.confirm(input);
        nonceRef.current = freshNonceHex();
        addReceipt({
          id: txHash,
          kind: "Transfer proof",
          detail: `agent #${selectedTokenId} → ${truncateAddress(draft.value.trim())}`,
          hash: txHash,
          age: "now",
          state: "confirming",
          route: "/transfer",
          agent: selectedTokenId,
        });
        confirmOnChain(txHash);
        dispatch({
          type: "notice",
          notice: `Transfer submitted for agent #${selectedTokenId}. Proof receipt added.`,
        });
      } else {
        const result = await tickHook.tickStream(
          {
            vault: getAxiomStrategyVaultAddress(chainId),
            agentNft: getAxiomAgentNftAddress(chainId),
            agentTokenId: selectedTokenId,
          },
          {},
        );
        const hash = result.execution?.txHash ?? result.storage.rootHash;
        addReceipt({
          id: hash,
          kind: "Tick stream",
          detail: `${result.recommendation.action} · ${result.recommendation.reason.slice(0, 48)}`,
          hash,
          age: "now",
          state: "confirmed",
          route: "/tick",
          agent: selectedTokenId,
        });
        dispatch({
          type: "notice",
          notice: `Tick ${result.recommendation.action === "act" ? "acted" : "held"} for agent #${selectedTokenId}. Stream receipt indexed.`,
        });
      }
    } catch (err) {
      const message = humanizeError(err);
      dispatch({
        type: "set-draft-phase",
        flow: kind,
        phase: "recoverable-error",
        error: message,
      });
      dispatch({ type: "notice", notice: message });
    }
  };

  const simulateFailure = (reason: "rejected" | "timeout") => {
    tickHook.cancelTick();
    const error =
      reason === "timeout"
        ? "Confirmation expired. Resume from review."
        : "Signature rejected. Reviewed details are saved.";
    dispatch({
      type: "set-draft-phase",
      flow: kind,
      phase: "recoverable-error",
      error,
    });
    dispatch({ type: "notice", notice: `[dev] ${error}` });
  };

  const restart = () => {
    nonceRef.current = freshNonceHex();
    tickHook.resetStream();
    dispatch({ type: "clear-draft", flow: kind });
  };

  const copyReceipt = () => {
    if (draft.receiptId) navigator.clipboard?.writeText(draft.receiptId);
    dispatch({ type: "notice", notice: "Receipt identifier copied locally." });
  };

  const proofSteps =
    kind === "payment"
      ? ["Exact allowance", "Approval / payment boundary", "Receipt indexed"]
      : kind === "transfer"
        ? ["Recipient challenge", "Signature boundary", "Receipt indexed"]
        : kind === "mint"
          ? ["Metadata hash", "Oracle acknowledgement", "Receipt indexed"]
          : ["Bounded instruction", "Provider route", "Event indexed"];

  const agentOptions = useMemo(
    () => agents.map((agent) => agent.tokenId.toString()),
    [agents],
  );

  return (
    <div className={`ops-page flow-page flow-${kind}`}>
      <div className="page-head">
        <div>
          <span className="eyebrow">{flow.eyebrow}</span>
          <h1>{flow.title}</h1>
          <p>{flow.copy}</p>
        </div>
        <Button
          variant="secondary"
          onClick={() => go("/transactions")}
          icon={<ReceiptText size={15} />}
        >
          {f.openTransactions}
        </Button>
      </div>

      {intentCopy && (
        <div className="flow-intent-banner">
          <ShieldCheck size={15} />
          <div>
            <span className="eyebrow">PREFILLED · REVIEW REQUIRED</span>
            <strong>{intentCopy}</strong>
          </div>
          <span className="mono">agent / {selectedTokenId || "—"}</span>
        </div>
      )}

      <div className="flow-layout review-first-layout">
        <section className="flow-stage">
          <div className="flow-stage-top">
            <span className="flow-symbol">{meta.icon}</span>
            <div>
              <span className="eyebrow">EDIT · REVIEW · RECEIPT</span>
              <h2>
                {draft.phase === "receipt"
                  ? "Receipt ready."
                  : "Review before you act."}
              </h2>
            </div>
            <StatePill state={phaseState[draft.phase]} />
          </div>
          <div className="flow-visual">
            <img src={meta.media} alt={`${kind} operational artifact`} />
            <div className="flow-visual-overlay">
              <span className="eyebrow">{meta.artifact}</span>
              <strong>
                {draft.phase === "receipt"
                  ? "Receipt indexed"
                  : isReviewOpen
                    ? "Review open"
                    : "Details editable"}
              </strong>
              <span className="mono">chain {chainId} · live wallet</span>
            </div>
          </div>

          <div className="flow-form">
            {kind !== "mint" && (
              <label className="field">
                <span className="field-label">Agent *</span>
                <span className="field-control">
                  <select
                    className="axiom-field"
                    aria-label="Target agent"
                    value={selectedTokenId}
                    disabled={isReviewOpen}
                    onChange={(event) =>
                      dispatch({
                        type: "save-draft",
                        draft: {
                          ...draft,
                          agent: event.target.value,
                          phase: "draft",
                        },
                      })
                    }
                  >
                    {agentOptions.length === 0 && (
                      <option value="">no agents — mint first</option>
                    )}
                    {agentOptions.map((id) => (
                      <option key={id} value={id}>
                        Agent #{id}
                      </option>
                    ))}
                  </select>
                </span>
                <span className="field-hint">
                  The agent whose vault or record this operation targets.
                </span>
              </label>
            )}
            {kind === "mint" && (
              <Field
                label="Agent name"
                value={draft.value}
                onChange={updateValue}
                required
                maxLength={80}
                hint="Metadata hash is derived and shown in review."
              />
            )}
            {kind === "payment" && (
              <Field
                label="Amount"
                value={draft.value}
                onChange={updateValue}
                required
                maxLength={24}
                suffix="0G"
                error={
                  Number(draft.value) <= 0
                    ? "Enter an amount above zero."
                    : undefined
                }
                hint="Exact allowance is shown in review."
              />
            )}
            {kind === "transfer" && (
              <Field
                label="Recipient"
                value={draft.value}
                onChange={updateValue}
                required
                maxLength={42}
                hint="Challenge and expiry appear in review."
              />
            )}
            {kind === "transfer" && (
              <Field
                label="Recipient public key"
                value={draft.extra}
                onChange={updateExtra}
                required
                maxLength={130}
                hint="64-byte hex (0x…) — the new owner's encryption key."
              />
            )}
            {kind === "tick" && (
              <Field
                label="Instruction"
                value={draft.value}
                onChange={updateValue}
                required
                maxLength={320}
                hint="Bounded and cancellable; streamed tokens appear below."
              />
            )}
          </div>

          {kind === "tick" &&
            (tickHook.isStreaming || tickHook.streamedTokens) && (
              <div className="tick-stream" aria-live="polite">
                <span className="eyebrow">STREAM / TOKENS</span>
                <pre className="mono">
                  {tickHook.streamedTokens || "…"}
                  {tickHook.isStreaming && (
                    <span className="caret-blink">▍</span>
                  )}
                </pre>
                {tickHook.streamingError && (
                  <div className="review-error" role="alert">
                    <AlertTriangle size={14} /> {tickHook.streamingError}
                  </div>
                )}
                {tickHook.isStreaming && (
                  <Button
                    variant="ghost"
                    onClick={tickHook.cancelTick}
                    icon={<X size={14} />}
                  >
                    Cancel stream
                  </Button>
                )}
              </div>
            )}

          {draft.phase === "receipt" ? (
            <div className="operation-receipt">
              <div>
                <CircleCheck size={17} />
                <div>
                  <span className="eyebrow">RECEIPT / CONFIRMED</span>
                  <strong>{truncateHex(draft.receiptId || "", 12, 8)}</strong>
                  <small>
                    Proof and event indexed in the Transaction Center.
                  </small>
                </div>
              </div>
              <div>
                <Button
                  variant="secondary"
                  onClick={copyReceipt}
                  icon={<Copy size={14} />}
                >
                  Copy receipt
                </Button>
                <Button
                  variant="ghost"
                  onClick={() =>
                    go(
                      `/transactions?tx=${encodeURIComponent(draft.receiptId || "")}`,
                    )
                  }
                  icon={<ReceiptText size={14} />}
                >
                  Open receipt
                </Button>
                <Button
                  variant="ghost"
                  onClick={restart}
                  icon={<RotateCcw size={14} />}
                >
                  Start another
                </Button>
              </div>
            </div>
          ) : (
            <div className="flow-action">
              <Button
                busy={isBusy}
                onClick={openReview}
                icon={<ArrowRight size={15} />}
              >
                {isReviewOpen ? "Review open" : "Review operation"}
              </Button>
              {DEV_TOOLS && (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => simulateFailure("rejected")}
                    disabled={isBusy}
                    icon={<AlertTriangle size={14} />}
                  >
                    Simulate reject
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => simulateFailure("timeout")}
                    disabled={isBusy}
                    icon={<Timer size={14} />}
                  >
                    Simulate timeout
                  </Button>
                </>
              )}
            </div>
          )}
        </section>

        <aside className="flow-context panel">
          <span className="eyebrow">{f.evidenceBoundary}</span>
          <h2>
            {kind === "mint"
              ? "Identity before ownership."
              : kind === "payment"
                ? "Allowance before value."
                : kind === "transfer"
                  ? "Challenge before finality."
                  : "Stream before result."}
          </h2>
          <ol className="passive-proof-timeline">
            {proofSteps.map((step, index) => (
              <li
                key={step}
                className={
                  draft.phase === "receipt" || (isReviewOpen && index < 2)
                    ? "is-ready"
                    : ""
                }
              >
                <span aria-hidden="true" />
                <div>
                  <strong>{step}</strong>
                  <small>
                    {index === 1 ? "Wallet boundary" : "Observed automatically"}
                  </small>
                </div>
                {draft.phase === "receipt" || (isReviewOpen && index < 2) ? (
                  <Check size={14} />
                ) : null}
              </li>
            ))}
          </ol>
          {kind === "payment" && allowance !== null && (
            <div className="diagnostic-note">
              <CreditCard size={14} />
              <span>
                Current allowance: {allowance} (exact-amount approval only,
                never infinite).
              </span>
            </div>
          )}
          <div className="diagnostic-note">
            <ShieldCheck size={14} />
            <span>
              Live route: wallet signature and contract write happen only after
              review.
            </span>
          </div>
        </aside>
      </div>

      {isReviewOpen && (
        <OperationReviewSheet
          kind={kind}
          draft={draft}
          agentName={
            kind === "mint"
              ? draft.value.trim() || "Axiom agent"
              : selectedAgentName
          }
          busy={isBusy}
          onClose={() =>
            dispatch({
              type: "set-draft-phase",
              flow: kind,
              phase: "draft",
              error: null,
            })
          }
          onRetry={() =>
            dispatch({
              type: "set-draft-phase",
              flow: kind,
              phase: kind === "payment" ? "approval-required" : "review",
              error: null,
            })
          }
          onExecute={() => void execute()}
        />
      )}
    </div>
  );
}
