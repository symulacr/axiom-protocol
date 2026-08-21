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
    deposit/withdraw → useVaultWrite (POST /v1/agents/:id/{deposit,withdraw}
               encode relay → wallet sendTransaction; native 0G value)
  The OperationReviewSheet is the single confirm surface; "Simulate reject /
  timeout" stays dev-only and maps onto the real recoverable-error paths.
*/
import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useChainId, usePublicClient } from "wagmi";
import { erc20Abi, formatUnits, isAddress, parseUnits } from "viem";
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
import { paymentSymbolOf, usePaymentToken } from "../hooks/usePaymentToken.js";
import {
  isReceiverAccountUnavailable,
  useTransfer,
} from "../hooks/useTransfer.js";
import { useOrchestratorTick } from "../hooks/useOrchestratorTick.js";
import { useVaultWrite } from "../hooks/useVaultWrite.js";
import {
  RECEIPT_CONFIRM_TIMEOUT_MS,
  waitForReceiptWithTimeout,
} from "../hooks/useReceiptReconcile.js";
import {
  getAxiomAgentNftAddress,
  getAxiomPaymentProcessorAddress,
  getAxiomStrategyVaultAddress,
} from "../abi/addresses.js";
import { APP_CHAIN } from "../config/wagmi.js";
import {
  formatTokenAmount,
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

  // C-07: vault flows ride the same draft/review/receipt machine; the write
  // itself goes through the shared useVaultWrite encode relay (toasts off —
  // this page owns the UX). Token unit comes from chain config, never a
  // hardcoded literal.
  const isVaultFlow = kind === "deposit" || kind === "withdraw";
  const nativeSymbol = APP_CHAIN.nativeCurrency.symbol;
  const nativeDecimals = APP_CHAIN.nativeCurrency.decimals;
  // C-12: the payment flow's unit is the payment token's ON-CHAIN symbol
  // (Galileo: axmUSDC), resolved once via the hook-layer cache — the form
  // suffix, the receipt detail and the review-sheet CTA all read this one
  // source, so they can never contradict each other.
  const paymentToken = usePaymentToken();
  const paymentSymbol = paymentSymbolOf(paymentToken);
  const vaultTokenId = useMemo(() => {
    if (!isVaultFlow || !/^\d+$/.test(selectedTokenId)) return 0n;
    return BigInt(selectedTokenId);
  }, [isVaultFlow, selectedTokenId]);
  const vaultWrite = useVaultWrite(
    kind === "withdraw" ? "withdraw" : "deposit",
    vaultTokenId,
    { toasts: false },
  );
  const vaultBalanceWei = isVaultFlow
    ? vaultWrite.vaultData.depositsWei
    : undefined;

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
    tickHook.isStreaming ||
    vaultWrite.isSubmitting;

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
    setSubmitError(null);
    dispatch({
      type: "save-draft",
      draft: { ...draft, value, phase: "draft", error: null, receiptId: null },
    });
  };
  const updateExtra = (extra: string) => {
    setSubmitError(null);
    dispatch({
      type: "save-draft",
      draft: { ...draft, extra, phase: "draft", error: null, receiptId: null },
    });
  };

  // 05 FINDING-008 / 04 FINDING-014: one wording per rule, one surface per
  // error. validate() names the failing FIELD so openReview can render the
  // message inline via the Field error contract instead of opening the
  // review sheet to deliver validation news. The phase machine's
  // recoverable-error state is reserved for execution failures.
  type FlowFieldError = {
    field: "value" | "extra" | "agent";
    message: string;
  };
  const [submitError, setSubmitError] = useState<FlowFieldError | null>(null);
  // F-01: true when the receiver co-sign was attempted but the wallet cannot
  // expose the receiver account — the sheet renders the honest blocker (no
  // futile retry) instead of the "Sign as receiver" action.
  const [coSignBlocked, setCoSignBlocked] = useState(false);

  const buildTransferInput = () => ({
    tokenId: BigInt(selectedTokenId || "0"),
    to: draft.value.trim() as `0x${string}`,
    receiverPubKey64: draft.extra.trim() as `0x${string}`,
    accessProofNonce: nonceRef.current,
  });

  const validate = (): FlowFieldError | null => {
    const trimmed = draft.value.trim();
    if (
      (kind === "payment" || isVaultFlow) &&
      (!Number.isFinite(Number(trimmed)) || Number(trimmed) <= 0)
    )
      return { field: "value", message: "Enter an amount above zero." };
    // Withdraw is bounded by the live vault balance when the read is
    // available — the review sheet shows the resulting balance either way.
    if (kind === "withdraw" && vaultBalanceWei !== undefined) {
      try {
        if (parseUnits(trimmed, nativeDecimals) > vaultBalanceWei)
          return {
            field: "value",
            message: "Amount exceeds the vault balance.",
          };
      } catch {
        return { field: "value", message: "Enter a valid amount." };
      }
    }
    if (kind === "mint" && (trimmed.length < 2 || trimmed.length > 80))
      return { field: "value", message: "Use 2–80 characters." };
    if (kind === "transfer" && !isAddress(trimmed))
      return {
        field: "value",
        message: "Recipient must be a valid 0x address.",
      };
    if (kind === "transfer" && !/^0x[0-9a-fA-F]{128}$/.test(draft.extra.trim()))
      return {
        field: "extra",
        message: "Recipient public key must be 64 bytes of hex (0x…).",
      };
    if (kind === "tick" && trimmed.length < 3)
      return { field: "value", message: "Describe the instruction." };
    if (kind !== "mint" && !selectedTokenId)
      return { field: "agent", message: "Select an agent first." };
    return null;
  };

  const openReview = () => {
    const invalid = validate();
    if (invalid) {
      // Sheet stays CLOSED for invalid drafts: the failing field shows the
      // inline error (Field contract), the notice toast is the backup.
      setSubmitError(invalid);
      dispatch({ type: "notice", notice: invalid.message });
      return;
    }
    setSubmitError(null);
    dispatch({
      type: "set-draft-phase",
      flow: kind,
      phase: kind === "payment" ? "approval-required" : "review",
    });
  };

  const addReceipt = (tx: Omit<Transaction, "icon">) => {
    dispatch({
      type: "add-tx",
      tx: { ...tx, createdAt: Date.now(), icon: meta.icon },
    });
  };

  // C-15: bounded confirmation wait — a dropped/replaced tx must surface as
  // "stale" (check explorer) after the timeout instead of polling forever,
  // and a reverted receipt (status 0) is "reverted", never "confirmed".
  const confirmOnChain = (hash: `0x${string}` | undefined) => {
    if (!hash || !publicClient || hash === "0x") return;
    void waitForReceiptWithTimeout(publicClient, hash)
      .then((receipt) =>
        dispatch({
          type: "tx-state",
          txId: hash,
          txState: receipt.status === "success" ? "confirmed" : "reverted",
        }),
      )
      .catch(() =>
        dispatch({ type: "tx-state", txId: hash, txState: "stale" }),
      );
  };

  // F-01: shared transfer tail — receipt row + confirm pipeline (C-15) + notice.
  const completeTransfer = (txHash: `0x${string}`) => {
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
  };

  // F-01 receiver co-sign step: signs the paused challenge AS the recipient,
  // then hands straight back to the sender for the on-chain submission.
  const executeCoSign = async () => {
    if (kind !== "transfer" || isBusy) return;
    setCoSignBlocked(false);
    dispatch({
      type: "set-draft-phase",
      flow: kind,
      phase: "submitting",
      error: null,
    });
    try {
      await transfer.coSign();
      const txHash = await transfer.confirm(buildTransferInput());
      completeTransfer(txHash);
    } catch (err) {
      if (isReceiverAccountUnavailable(err)) {
        // Honest blocker — no retry can conjure the receiver account in this
        // wallet; the sheet shows the two real remedies (add the account, or
        // the receiver accepts from their own session), not a retry loop.
        setCoSignBlocked(true);
        dispatch({
          type: "set-draft-phase",
          flow: kind,
          phase: "review",
          error: null,
        });
        return;
      }
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

  const execute = async () => {
    if (isBusy) return;
    // Payment boundary 1 is a REAL wallet boundary: send the exact-amount
    // ERC-20 approve when the current allowance does not cover the reviewed
    // amount; when it already does, advance with an explicit no-op notice.
    if (kind === "payment" && draft.phase === "approval-required") {
      dispatch({
        type: "set-draft-phase",
        flow: kind,
        phase: "submitting",
        error: null,
      });
      try {
        const { approveHash } = await payment.approveExactAllowance(
          draft.value.trim(),
        );
        if (approveHash) {
          addReceipt({
            id: approveHash,
            kind: "Allowance approval",
            detail: `${draft.value.trim()} ${paymentSymbol} → exact allowance (boundary 1)`,
            hash: approveHash,
            age: "now",
            state: "confirming",
            route: "/payment",
            agent: selectedTokenId,
            opensReceipt: false,
          });
          confirmOnChain(approveHash);
        }
        dispatch({
          type: "set-draft-phase",
          flow: kind,
          phase: "payment-required",
          error: null,
        });
        dispatch({
          type: "notice",
          notice: approveHash
            ? "Exact allowance approved on-chain. Boundary 2: sign the payment."
            : "Allowance already covers this amount — no approval transaction needed.",
        });
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
        const input = buildTransferInput();
        const prepared = await transfer.prepare(input);
        if (prepared.status === "co-sign-required") {
          // F-01: cross-party transfer pauses after the challenge — the review
          // sheet stays open and renders the receiver co-sign step (the primary
          // action becomes "Sign as receiver", driven by executeCoSign).
          dispatch({
            type: "set-draft-phase",
            flow: kind,
            phase: "review",
            error: null,
          });
          return;
        }
        const txHash = await transfer.confirm(input);
        completeTransfer(txHash);
      } else if (kind === "deposit" || kind === "withdraw") {
        // Vault write through the shared encode relay; the receipt row and
        // the draft's receipt phase ride the C-15 pipeline below.
        const txHash = await vaultWrite.handleSubmit(draft.value.trim());
        if (!txHash)
          throw new Error("Connect a wallet to submit this operation.");
        addReceipt({
          id: txHash,
          kind: kind === "deposit" ? "Vault deposit" : "Vault withdraw",
          detail: `${draft.value.trim()} ${nativeSymbol} ${
            kind === "deposit" ? "into" : "from"
          } agent #${selectedTokenId}`,
          hash: txHash,
          age: "now",
          state: "confirming",
          route: `/${kind}`,
          agent: selectedTokenId,
        });
        confirmOnChain(txHash);
        dispatch({
          type: "notice",
          notice: `${
            kind === "deposit" ? "Deposit" : "Withdrawal"
          } submitted for agent #${selectedTokenId}. Receipt added to the Transaction Center.`,
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
    setSubmitError(null);
    setCoSignBlocked(false);
    transfer.reset();
    dispatch({ type: "clear-draft", flow: kind });
  };

  const copyReceipt = () => {
    if (draft.receiptId) navigator.clipboard?.writeText(draft.receiptId);
    dispatch({ type: "notice", notice: "Receipt identifier copied locally." });
  };

  // 02 FINDING-012: step labels live in copy.flows[kind].steps (localized,
  // outcome-named) — no hardcoded ladder, no protocol identifiers.
  const proofSteps = flow.steps;

  // C-15: the receipt panel derives from the LIVE tx row, not static copy —
  // "confirmed" is only ever rendered after the chain says so. A persisted
  // draft whose row aged out of storage falls back to "stale" (unknown —
  // check explorer), never to a resurrected "confirming".
  const receiptTx = draft.receiptId
    ? state.transactions.find((tx) => tx.id === draft.receiptId)
    : undefined;
  const receiptState: TxState =
    draft.phase === "receipt"
      ? (receiptTx?.state ?? "stale")
      : (receiptTx?.state ?? "confirming");
  const receiptHeading =
    receiptState === "confirmed"
      ? "Receipt ready."
      : receiptState === "reverted"
        ? "Reverted on-chain."
        : receiptState === "stale"
          ? "Confirmation unknown."
          : "Submitted — confirming…";
  const receiptOverlay =
    receiptState === "confirmed"
      ? "Receipt indexed"
      : receiptState === "reverted"
        ? "Reverted"
        : receiptState === "stale"
          ? "Check explorer"
          : "Confirming on-chain";
  const receiptBody =
    receiptState === "confirmed"
      ? "Proof and event indexed in the Transaction Center."
      : receiptState === "reverted"
        ? "Reverted on-chain — the Transaction Center row has recovery."
        : receiptState === "stale"
          ? `No confirmation after ${Math.round(RECEIPT_CONFIRM_TIMEOUT_MS / 1000)}s — check the explorer; the row is marked Needs review.`
          : "Submitted — awaiting on-chain confirmation.";
  const proofReady = (index: number) =>
    draft.phase === "receipt"
      ? index < 2 || receiptState === "confirmed"
      : isReviewOpen && index < 2;

  // FINDING-009: the sheet's Boundary fact row must match the number of
  // wallet prompts the click path actually produces. Boundary 1 sends the
  // approve tx when the live allowance is short (→ 2 prompts total);
  // otherwise the pay boundary is the only prompt (→ 1).
  const paymentApprovalNeeded = useMemo(() => {
    if (kind !== "payment" || draft.phase !== "approval-required")
      return undefined;
    if (allowance === null) return undefined;
    try {
      return (
        BigInt(allowance) <
        parseUnits(draft.value.trim() || "0", paymentToken?.decimals ?? 6)
      );
    } catch {
      return undefined;
    }
  }, [kind, draft.phase, allowance, draft.value, paymentToken?.decimals]);
  // F-01: a cross-party transfer is known at review time (recipient ≠ the
  // connected account) — the boundary row names the truthful prompt count
  // before the first execute, not after the co-sign pause.
  const transferNeedsCoSign =
    kind === "transfer" &&
    address !== undefined &&
    isAddress(draft.value.trim()) &&
    draft.value.trim().toLowerCase() !== address.toLowerCase();
  const confirmationLabel =
    kind === "transfer"
      ? transferNeedsCoSign
        ? "2 wallet confirmations (receiver signs, then you submit)"
        : "1 wallet confirmation required"
      : kind !== "payment"
        ? undefined
        : draft.phase === "payment-required"
          ? "1 wallet confirmation required"
          : paymentApprovalNeeded === undefined
            ? "Up to 2 wallet confirmations (checking allowance…)"
            : paymentApprovalNeeded
              ? "2 wallet confirmations required (approve, then pay)"
              : "1 wallet confirmation required (allowance sufficient)";

  const agentOptions = useMemo(
    () => agents.map((agent) => agent.tokenId.toString()),
    [agents],
  );

  // C-07: resulting-balance estimate for the vault review sheet — cheap
  // because the vault read is already live on this page.
  const balanceFact = useMemo(() => {
    if (!isVaultFlow || vaultBalanceWei === undefined) return undefined;
    try {
      const amount = parseUnits(draft.value.trim() || "0", nativeDecimals);
      const next =
        kind === "deposit"
          ? vaultBalanceWei + amount
          : vaultBalanceWei - amount;
      return {
        dt: "Vault balance after",
        dd:
          next < 0n
            ? "exceeds balance"
            : `${formatTokenAmount(next, nativeDecimals)} ${nativeSymbol}`,
      };
    } catch {
      return undefined;
    }
  }, [
    isVaultFlow,
    vaultBalanceWei,
    draft.value,
    kind,
    nativeDecimals,
    nativeSymbol,
  ]);

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
                  ? receiptHeading
                  : "Review before you act."}
              </h2>
            </div>
            <StatePill
              state={
                draft.phase === "receipt"
                  ? receiptState
                  : phaseState[draft.phase]
              }
            />
          </div>
          <div className="flow-visual">
            <img src={meta.media} alt={`${kind} operational artifact`} />
            <div className="flow-visual-overlay">
              <span className="eyebrow">{meta.artifact}</span>
              <strong>
                {draft.phase === "receipt"
                  ? receiptOverlay
                  : isReviewOpen
                    ? "Review open"
                    : "Details editable"}
              </strong>
              <span className="mono">chain {chainId} · live wallet</span>
            </div>
          </div>

          <div className="flow-form">
            {kind !== "mint" && (
              <label
                className={`field${submitError?.field === "agent" ? " field-error" : ""}`}
              >
                <span className="field-label">Agent *</span>
                <span className="field-control">
                  <select
                    className="axiom-field"
                    aria-label="Target agent"
                    value={selectedTokenId}
                    disabled={isReviewOpen}
                    onChange={(event) => {
                      setSubmitError(null);
                      dispatch({
                        type: "save-draft",
                        draft: {
                          ...draft,
                          agent: event.target.value,
                          phase: "draft",
                        },
                      });
                    }}
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
                {submitError?.field === "agent" ? (
                  <span className="field-message" role="alert">
                    {submitError.message}
                  </span>
                ) : (
                  <span className="field-hint">
                    The agent whose vault or record this operation targets.
                  </span>
                )}
              </label>
            )}
            {kind === "mint" && (
              <Field
                label="Agent name"
                value={draft.value}
                onChange={updateValue}
                required
                maxLength={80}
                error={
                  submitError?.field === "value"
                    ? submitError.message
                    : undefined
                }
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
                suffix={paymentSymbol}
                error={
                  submitError?.field === "value"
                    ? submitError.message
                    : Number(draft.value) <= 0
                      ? "Enter an amount above zero."
                      : undefined
                }
                hint="Exact allowance is shown in review."
              />
            )}
            {isVaultFlow && (
              <Field
                label="Amount"
                value={draft.value}
                onChange={updateValue}
                required
                maxLength={24}
                suffix={nativeSymbol}
                error={
                  submitError?.field === "value"
                    ? submitError.message
                    : Number(draft.value) <= 0
                      ? "Enter an amount above zero."
                      : undefined
                }
                hint={
                  kind === "withdraw" && vaultBalanceWei !== undefined
                    ? `In vault: ${formatTokenAmount(vaultBalanceWei, nativeDecimals)} ${nativeSymbol}. The resulting balance appears in review.`
                    : "The resulting vault balance appears in review."
                }
              />
            )}
            {kind === "transfer" && (
              <Field
                label="Recipient"
                value={draft.value}
                onChange={updateValue}
                required
                maxLength={42}
                error={
                  submitError?.field === "value"
                    ? submitError.message
                    : undefined
                }
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
                error={
                  submitError?.field === "extra"
                    ? submitError.message
                    : undefined
                }
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
                error={
                  submitError?.field === "value"
                    ? submitError.message
                    : undefined
                }
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
                {receiptState === "confirmed" ? (
                  <CircleCheck size={17} />
                ) : receiptState === "reverted" || receiptState === "stale" ? (
                  <AlertTriangle size={17} />
                ) : (
                  <Timer size={17} />
                )}
                <div>
                  <span className="eyebrow">
                    RECEIPT /{" "}
                    {(copy.status[receiptState] ?? receiptState).toUpperCase()}
                  </span>
                  <strong>{truncateHex(draft.receiptId || "", 12, 8)}</strong>
                  <small>{receiptBody}</small>
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
                  : kind === "deposit"
                    ? "Review before value moves."
                    : kind === "withdraw"
                      ? "Balance before withdrawal."
                      : "Stream before result."}
          </h2>
          <ol className="passive-proof-timeline">
            {proofSteps.map((step, index) => (
              <li key={step} className={proofReady(index) ? "is-ready" : ""}>
                <span aria-hidden="true" />
                <div>
                  <strong>{step}</strong>
                  <small>{index === 1 ? f.stepWallet : f.stepAuto}</small>
                </div>
                {proofReady(index) ? <Check size={14} /> : null}
              </li>
            ))}
          </ol>
          {kind === "payment" && allowance !== null && (
            <div className="diagnostic-note">
              <CreditCard size={14} />
              <span>
                Current allowance:{" "}
                {formatUnits(BigInt(allowance), paymentToken?.decimals ?? 6)}{" "}
                {paymentSymbol} (exact-amount approval only, never infinite).
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
          confirmationLabel={confirmationLabel}
          approvalNeeded={paymentApprovalNeeded}
          balanceFact={balanceFact}
          paymentSymbol={paymentSymbol}
          coSign={
            kind === "transfer" &&
            transfer.coSignReceiver !== null &&
            transfer.coSignReceiver.toLowerCase() ===
              draft.value.trim().toLowerCase()
              ? {
                  receiver: transfer.coSignReceiver,
                  blocked: coSignBlocked,
                  onSign: () => void executeCoSign(),
                  title: f.coSignTitle,
                  body: f.coSignBody(transfer.coSignReceiver),
                  action: f.coSignAction,
                  note: f.coSignNote,
                  blockedTitle: f.coSignBlockedTitle,
                  blockedBody: f.coSignBlockedBody(transfer.coSignReceiver),
                }
              : undefined
          }
          onClose={() => {
            // Closing the sheet abandons any paused receiver co-sign — a fresh
            // review always starts a fresh challenge (nonces are single-use).
            if (kind === "transfer") {
              setCoSignBlocked(false);
              transfer.reset();
            }
            dispatch({
              type: "set-draft-phase",
              flow: kind,
              phase: "draft",
              error: null,
            });
          }}
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
