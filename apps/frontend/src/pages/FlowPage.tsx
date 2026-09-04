/*
  FlowPage — v2 review-first operation page over the LIVE v1 encode-relay
  hooks (plan mapping, steps 6):
    mint → useMintWizard (single hashless POST /v1/agents/mint/encode
               { name, owner } + wallet sendTransaction)
    payment → usePayment.payForAgent (exact ERC-20 approve when needed, then
               payForAgent) — the v2 2-boundary sheet: allowance review, then pay
    transfer → useTransfer.prepare (challenge) + confirm (EIP-712 sign +
               ECIES-sealed finalize); cross-party transfers pause for the
               receiver co-sign — in this wallet, or via the handoff link
               when the receiver is on another device
    tick → useOrchestratorTick.tickStream (WS token frames → live stage)
    deposit/withdraw → useVaultWrite (POST /v1/agents/:id/{deposit,withdraw}
               encode relay → wallet sendTransaction; native 0G value)
  The OperationReviewSheet is the single confirm surface; "Simulate reject /
  timeout" stays dev-only and maps onto the real recoverable-error paths.
  every flow-body string (field labels/hints, review rows, receipt
  chrome, notices) routes through copy.ts — copy.flows[kind] for per-flow
  text, copy.flowUi for shared chrome.
*/
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWalletClient,
} from "wagmi";
import { erc20Abi, formatUnits, isAddress, parseUnits } from "viem";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
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
import { EmptyState } from "../components/ui.js";
import { StatePill } from "../components/StatePill.js";
import { routePath } from "../lib/routeRegistry.js";
import { getCopy, interpolate } from "../lib/copy.js";
import type {
  AppState,
  FlowKind,
  Locale,
  OperationDraft,
  OperationDraftPhase,
  Transaction,
  TxState,
} from "../lib/models.js";
import type { ConsoleAction } from "../lib/consoleStore.js";
import { flowMeta } from "../lib/consoleCatalog.js";
import { useAgents } from "../hooks/useAgents.js";
import { useMintWizard } from "../hooks/useMintWizard.js";
import {
  usePayment,
  usePaymentToken,
  paymentSymbolOf,
} from "../hooks/usePayment.js";
import { useTransfer } from "../hooks/useTransfer.js";
import { useVaultData } from "../hooks/useVaultDataBatch.js";
import { useAsyncAction } from "../hooks/useAsyncAction.js";
import {
  RECEIPT_CONFIRM_TIMEOUT_MS,
  waitForReceiptWithTimeout,
} from "../hooks/useReceiptReconcile.js";
import {
  decodeHandoffResult,
  decodeHandoffResultToken,
  ACCEPTANCE_CODE_SHAPE,
  HANDOFF_RESULT_STORAGE_KEY,
  type HandoffResult,
} from "../lib/transferHandoff.js";
import { useModalDismiss } from "../hooks/useModalDismiss.js";
import { useUiStore } from "../lib/uiStore.js";
import {
  getAxiomAgentNftAddress,
  getAxiomPaymentProcessorAddress,
  getAxiomStrategyVaultAddress,
} from "../abi/addresses.js";
import { APP_CHAIN, APP_CHAIN_ID } from "../config/wagmi.js";
import {
  formatTokenAmount,
  humanizeError,
  truncateAddress,
  truncateHex,
  validateNumericInput,
} from "../utils/format.js";
import { toastError, toastSuccess } from "./shared.js";
import { apiFetch, STREAM_TIMEOUT } from "../utils/apiFetch.js";
import { encodeRelayTransaction } from "../utils/encodeRelay.js";
import { openStreamSocket } from "../config/env.js";
import type {
  TickRequest,
  TickResult,
  TickStreamOptions,
} from "@axiom/config/types/orchestrator";
import {
  buildTransferInput as assembleTransferInput,
  runCoSignStep,
} from "../lib/transferHandoff.js";

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

type VaultWriteKind = "deposit" | "withdraw";

const VAULT_WRITE: Record<
  VaultWriteKind,
  { label: string; endpoint: string; verb: string }
> = {
  deposit: { label: "Deposit", endpoint: "deposit", verb: "Deposit" },
  withdraw: { label: "Withdraw", endpoint: "withdraw", verb: "Withdraw" },
};

/** Shared numeric rules for the amount field (deposit + withdraw alike). */
const amountRules = (label: string) => ({
  label,
  min: 0,
  allowDecimals: true,
  maxDecimals: 18,
  max: 1e12,
});

function useVaultWrite(
  kind: VaultWriteKind,
  tokenId: bigint,
  opts?: {
    /** Default true: toast on submit/error and swallow errors. Flow pages pass
     * false so the OperationReviewSheet machine (submitting →
     * recoverable-error → receipt) owns the UX instead of toasts; in that
     * mode handleSubmit rethrows and resolves to the tx hash. */
    toasts?: boolean;
  },
) {
  const vd = useVaultData(tokenId);
  const { data: walletClient } = useWalletClient();
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { label, endpoint, verb } = VAULT_WRITE[kind];
  const toasts = opts?.toasts !== false;

  const error = validateNumericInput(amount, amountRules(label));

  const handleSubmit = useCallback(
    async (amountOverride?: string): Promise<`0x${string}` | null> => {
      const value = (amountOverride ?? amount).trim();
      const overrideError =
        amountOverride === undefined
          ? error
          : validateNumericInput(value, amountRules(label));
      if (!value || overrideError || !walletClient) return null;
      setIsSubmitting(true);
      try {
        // Same backend encode relay as the chat deposit tool — single vault ABI source, no frontend drift.
        const hash = await encodeRelayTransaction(
          walletClient,
          `/v1/agents/${tokenId.toString()}/${endpoint}`,
          { amount: value },
        );
        if (toasts) toastSuccess(`${verb} submitted (${hash.slice(0, 10)}…)`);
        setAmount("");
        await vd.refetch();
        return hash;
      } catch (err) {
        if (toasts) {
          toastError(err);
          return null;
        }
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [amount, error, label, walletClient, tokenId, endpoint, verb, vd, toasts],
  );

  const isValid = amount.trim() !== "" && !error && Number(amount) > 0;

  return {
    amount,
    setAmount,
    isSubmitting,
    isValid,
    error,
    handleSubmit,
    vaultData: vd,
  };
}

const WS_CONNECTION_TIMEOUT_MS = 60_000;

function useOrchestratorTick(): {
  tickStream: (
    req: TickRequest,
    opts: TickStreamOptions,
  ) => Promise<TickResult>;
  cancelTick: () => void;
  isStreaming: boolean;
  streamedTokens: string;
  streamingError: string | null;
  resetStream: () => void;
} {
  const { execute, cancel } = useAsyncAction();
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedTokens, setStreamedTokens] = useState("");
  const streamedRef = useRef("");
  const [streamingError, setStreamingError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
      cancel();
    };
  }, [cancel]);

  const resetStream = useCallback(() => {
    setStreamedTokens("");
    streamedRef.current = "";
    setStreamingError(null);
  }, []);

  // Debounced 50ms flush of ref→state so individual WebSocket tokens don't each trigger a re-render
  useEffect(() => {
    const flush = () => {
      const batch = streamedRef.current;
      if (batch) {
        streamedRef.current = "";
        const MAX_STREAMED_TOKENS = 50000;
        setStreamedTokens((prev) => {
          const next = prev + batch;
          return next.length > MAX_STREAMED_TOKENS
            ? next.slice(next.length - MAX_STREAMED_TOKENS)
            : next;
        });
      }
    };

    if (!isStreaming) {
      flush();
      return;
    }

    const id = setInterval(flush, 50);
    return () => {
      clearInterval(id);
      flush();
    };
  }, [isStreaming]);

  const tickStream = useCallback(
    async (req: TickRequest, opts: TickStreamOptions): Promise<TickResult> => {
      setIsStreaming(true);
      setStreamedTokens("");
      streamedRef.current = "";
      setStreamingError(null);
      const onChunk = opts.onChunk ?? (() => {});
      try {
        return await execute(async (signal) => {
          const signals: AbortSignal[] = [
            signal,
            AbortSignal.timeout(STREAM_TIMEOUT),
          ];
          if (opts.signal) signals.push(opts.signal);
          const combinedSignal = AbortSignal.any(signals);

          // Subscriber must precede the stream POST (400 NO_WS_SUBSCRIBER); topic registers sync at upgrade.
          const topic = `tick.${req.agentTokenId}`;
          const ws = await new Promise<WebSocket>((resolve, reject) => {
            let settled = false;
            const timeoutId = setTimeout(() => {
              settled = true;
              reject(
                new Error(
                  `WebSocket connection timed out after ${WS_CONNECTION_TIMEOUT_MS / 1000}s`,
                ),
              );
            }, WS_CONNECTION_TIMEOUT_MS);
            const onAbort = () => {
              settled = true;
              clearTimeout(timeoutId);
              reject(new DOMException("Aborted", "AbortError"));
            };
            combinedSignal.addEventListener("abort", onAbort, { once: true });
            openStreamSocket(topic).then(
              (socket) => {
                clearTimeout(timeoutId);
                combinedSignal.removeEventListener("abort", onAbort);
                if (settled) {
                  socket.close();
                  return;
                }
                settled = true;
                resolve(socket);
              },
              () => {
                if (settled) return;
                settled = true;
                clearTimeout(timeoutId);
                combinedSignal.removeEventListener("abort", onAbort);
                reject(
                  new Error("WebSocket connection failed for tick stream"),
                );
              },
            );
          });

          return await new Promise<TickResult>((resolve, reject) => {
            let accumulatedResult: Partial<TickResult> = {};
            let settled = false;
            wsRef.current = ws;

            const settle = (
              action: "resolve" | "reject",
              value: TickResult | Error,
            ) => {
              if (settled) return;
              settled = true;
              if (action === "resolve") {
                resolve(value as TickResult);
              } else {
                reject(value);
              }
            };

            const abortHandler = () => {
              ws.close();
              settle("reject", new DOMException("Aborted", "AbortError"));
            };
            combinedSignal.addEventListener("abort", abortHandler, {
              once: true,
            });

            const cleanup = () => {
              combinedSignal.removeEventListener("abort", abortHandler);
              if (wsRef.current === ws) {
                wsRef.current = null;
              }
            };

            ws.onmessage = (msg: MessageEvent) => {
              try {
                const data = JSON.parse(msg.data);
                if (data.topic !== topic) return;
                const payload = data.payload;

                if (payload.type === "token") {
                  onChunk(payload.content);
                  streamedRef.current += payload.content;
                } else if (payload.type === "complete") {
                  accumulatedResult = { ...payload };
                  ws.close();
                  settle("resolve", accumulatedResult as TickResult);
                } else if (payload.type === "error") {
                  setStreamingError(payload.error);
                  ws.close();
                  settle("reject", new Error(payload.error));
                }
              } catch {
                return;
              }
            };

            ws.onerror = () => {
              ws.close();
              settle(
                "reject",
                new Error("WebSocket connection failed for tick stream"),
              );
            };

            ws.onclose = (event) => {
              cleanup();
              if (settled) return;
              let detail = "";
              if (event.reason) {
                detail = `: ${event.reason}`;
              } else if (event.code !== 1000) {
                detail = ` (code ${event.code})`;
              }
              settle(
                "reject",
                new Error(
                  `WebSocket closed before tick stream completed${detail}`,
                ),
              );
            };

            // Start the stream only after subscriber + handlers attach; token frames can race the POST's 202.
            apiFetch<{ ok: boolean; streamTopic: string }>(
              "/v1/orchestrator/tick",
              {
                method: "POST",
                body: JSON.stringify({ ...req, stream: true }),
                signal: combinedSignal,
                timeout: 5000,
                headers: {
                  "content-type": "application/json",
                  accept: "application/json",
                },
              },
            )
              .then((initRes) => {
                if (!initRes.ok) {
                  ws.close();
                  settle("reject", new Error("Failed to start tick stream"));
                }
              })
              .catch((err: unknown) => {
                ws.close();
                settle(
                  "reject",
                  err instanceof Error ? err : new Error(String(err)),
                );
              });
          });
        });
      } finally {
        setIsStreaming(false);
      }
    },
    [execute],
  );

  const cancelTick = useCallback(() => {
    cancel();
    wsRef.current?.close();
    wsRef.current = null;
    setIsStreaming(false);
  }, [cancel]);

  return {
    tickStream,
    cancelTick,
    isStreaming,
    streamedTokens,
    streamingError,
    resetStream,
  };
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
  dispatch: React.Dispatch<ConsoleAction>;
  go: (path: string) => void;
  locale: Locale;
}) {
  const meta = flowMeta[kind];
  const search = new URLSearchParams(window.location.search);
  const copy = getCopy(locale);
  const flow = copy.flows[kind];
  const f = copy.flowUi;
  const draft = state.operationDrafts[kind];
  const formRef = useRef<HTMLDivElement>(null);
  const chainId = useChainId();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { agents, isLoading: agentsLoading } = useAgents();
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
    ? f.agentOption(selectedTokenId)
    : f.agentSelectPlaceholder;

  // Vault flows ride the shared draft/review machine + useVaultWrite encode relay; unit from chain config.
  const isVaultFlow = kind === "deposit" || kind === "withdraw";
  const nativeSymbol = APP_CHAIN.nativeCurrency.symbol;
  const nativeDecimals = APP_CHAIN.nativeCurrency.decimals;
  // Payment unit: payment token's on-chain symbol from one cached source — form, receipt and CTA share it.
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
    (
      {
        fund: f.intentFund,
        proof: f.intentProof,
        bounded: f.intentBounded,
        recovery: f.intentRecovery,
        receipt: f.intentReceipt,
      } as Record<string, string | undefined>
    )[intent ?? ""] ?? null;

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

  // Single dispatch shape for every draft phase transition (reducer nulls absent error).
  const setDraftPhase = (
    phase: OperationDraftPhase,
    error: string | null = null,
  ): void => dispatch({ type: "set-draft-phase", flow: kind, phase, error });

  // Shared recoverable-error tail: message lands in the sheet AND the notice rail.
  const failDraftMessage = (message: string): void => {
    setDraftPhase("recoverable-error", message);
    // U24: failures persist until manually dismissed — no 4s auto-dismiss.
    dispatch({ type: "notice", notice: message, severity: "error" });
  };
  const failDraft = (err: unknown): void =>
    failDraftMessage(humanizeError(err));

  // Keep wizard name in sync with draft — mint keccak256(toHex(name)) must match chat mint derivation.
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
    // hooks: mirror sync semantics
  }, [dispatch, draft, intent, selectedTokenId]);

  useEffect(() => {
    if ((!requestedStage && !intent) || draft.phase !== "draft") return;
    setDraftPhase(kind === "payment" ? "approval-required" : "review");
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

  // One owner for draft text edits: clears the submit error and resets
  // phase/receipt metadata so both fields share the exact same transition.
  const patchDraftText = (
    patch: Partial<Pick<OperationDraft, "value" | "extra">>,
  ): void => {
    setSubmitError(null);
    dispatch({
      type: "save-draft",
      draft: {
        ...draft,
        ...patch,
        phase: "draft",
        error: null,
        receiptId: null,
      },
    });
  };
  const updateValue = (value: string): void => patchDraftText({ value });

  // validate() names the failing FIELD for inline Field errors; recoverable-error state is execution-only.
  type FlowFieldError = {
    field: "value" | "extra" | "agent";
    message: string;
  };
  const [submitError, setSubmitError] = useState<FlowFieldError | null>(null);
  // Wallet cannot expose the receiver account — sheet shows honest blocker + handoff remedies, no retry.
  const [coSignBlocked, setCoSignBlocked] = useState(false);
  // Handoff state: an applied acceptance keeps rendering until the sender submits or edits.
  const [handoffCode, setHandoffCode] = useState("");
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [handoffApplied, setHandoffApplied] = useState(false);
  const [handoffReceiver, setHandoffReceiver] = useState<string | null>(null);

  // Paused co-sign / handoff state is owned by one challenge — cleared as a set.
  const resetHandoff = (): void => {
    setCoSignBlocked(false);
    setHandoffCode("");
    setHandoffError(null);
    setHandoffApplied(false);
    setHandoffReceiver(null);
    transfer.reset();
  };

  const buildTransferInput = () =>
    assembleTransferInput({
      tokenId: BigInt(selectedTokenId || "0"),
      to: draft.value.trim(),
    });

  const validate = (): FlowFieldError | null => {
    const trimmed = draft.value.trim();
    if (
      (kind === "payment" || isVaultFlow) &&
      (!Number.isFinite(Number(trimmed)) || Number(trimmed) <= 0)
    )
      return { field: "value", message: f.errAmountPositive };
    // Withdraw bounded by live vault balance when available; sheet shows resulting balance either way.
    if (kind === "withdraw" && vaultBalanceWei !== undefined) {
      try {
        if (parseUnits(trimmed, nativeDecimals) > vaultBalanceWei)
          return { field: "value", message: f.errExceedsVault };
      } catch {
        return { field: "value", message: f.errInvalidAmount };
      }
    }
    if (kind === "mint" && (trimmed.length < 2 || trimmed.length > 80))
      return { field: "value", message: f.errNameLength };
    if (kind === "transfer" && !isAddress(trimmed))
      return { field: "value", message: f.errRecipientAddress };
    if (kind === "tick" && trimmed.length < 3)
      return { field: "value", message: f.errInstruction };
    if (kind !== "mint" && !selectedTokenId)
      return { field: "agent", message: f.errSelectAgent };
    return null;
  };

  const openReview = () => {
    const invalid = validate();
    if (invalid) {
      // Sheet stays CLOSED for invalid drafts: inline field error first, notice toast as backup.
      setSubmitError(invalid);
      dispatch({ type: "notice", notice: invalid.message, severity: "error" });
      // Forms contract: the focus move to the first invalid control IS the
      // announcement (label + aria-describedby error read with the field).
      requestAnimationFrame(() => {
        formRef.current
          ?.querySelector<HTMLElement>(
            '[aria-invalid="true"], .field-error input, .field-error select, .field-error textarea',
          )
          ?.focus();
      });
      return;
    }
    setSubmitError(null);
    setDraftPhase(kind === "payment" ? "approval-required" : "review");
  };

  const addReceipt = (tx: Omit<Transaction, "icon">) => {
    dispatch({
      type: "add-tx",
      tx: { ...tx, createdAt: Date.now(), icon: meta.icon },
    });
  };

  // Shared execute()-tail receipt row: id/hash/age/state are always the same shape.
  const addFlowReceipt = (
    txHash: string,
    row: Omit<Transaction, "icon" | "id" | "hash" | "age" | "state"> & {
      state?: TxState;
    },
  ): void => {
    addReceipt({
      id: txHash,
      hash: txHash,
      age: "now",
      state: "confirming",
      ...row,
    });
  };

  // Bounded wait: dropped/replaced txs go stale after timeout; status-0 receipts are reverted, never confirmed.
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

  // Shared success tail: receipt row + confirmation pipeline + optional notice.
  const settleFlowTx = (
    txHash: `0x${string}`,
    row: Parameters<typeof addFlowReceipt>[1],
    notice?: string,
  ): void => {
    addFlowReceipt(txHash, row);
    confirmOnChain(txHash);
    if (notice !== undefined) dispatch({ type: "notice", notice });
  };

  // shared transfer tail — receipt row + confirm pipeline + notice.
  const completeTransfer = (txHash: `0x${string}`) => {
    // naming contract: the receipt kind IS the destination's nav name.
    settleFlowTx(
      txHash,
      {
        kind: copy.flows.transfer.receiptKind,
        detail: interpolate(copy.flows.transfer.detail, {
          agent: selectedTokenId,
          recipient: truncateAddress(draft.value.trim()),
        }),
        route: "/transfer",
        agent: selectedTokenId,
      },
      interpolate(copy.flows.transfer.notice, { agent: selectedTokenId }),
    );
  };

  // Receiver co-sign step: signs the paused challenge AS recipient, hands back to sender to submit.
  const executeCoSign = async () => {
    if (kind !== "transfer" || isBusy) return;
    setCoSignBlocked(false);
    setDraftPhase("submitting");
    const attempt = await runCoSignStep(transfer.coSign);
    if (attempt.outcome === "blocked") {
      // Honest blocker: no retry conjures the receiver account here; sheet shows remedies + handoff.
      setCoSignBlocked(true);
      setDraftPhase("review");
      return;
    }
    if (attempt.outcome === "failed") {
      failDraftMessage(attempt.message);
      return;
    }
    try {
      const txHash = await transfer.confirm(buildTransferInput());
      completeTransfer(txHash);
    } catch (err) {
      failDraft(err);
    }
  };

  // Apply a receiver acceptance signature; success flips primary to "Submit transfer" (sender still submits).
  const applyHandoff = async (code: string, viaStorage = false) => {
    if (kind !== "transfer" || isBusy) return;
    setHandoffError(null);
    setDraftPhase("submitting");
    try {
      await transfer.applyHandoffSignature(code.trim() as `0x${string}`);
      setHandoffApplied(true);
      setDraftPhase("review");
      dispatch({
        type: "notice",
        notice: viaStorage ? f.handoffReceivedNotice : f.handoffAppliedNote,
      });
    } catch (err) {
      // Bad code / wrong signer stays retryable in the handoff panel; anything else is recoverable.
      setDraftPhase("review");
      const message = humanizeError(err);
      setHandoffError(message);
    }
  };
  const applyHandoffRef = useRef(applyHandoff);
  applyHandoffRef.current = applyHandoff;

  // Same-browser handoff: storage event delivers acceptance; nonce match binds it to this challenge.
  useEffect(() => {
    if (kind !== "transfer" || transfer.coSignNonce === null || handoffApplied)
      return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== HANDOFF_RESULT_STORAGE_KEY) return;
      const result = decodeHandoffResult(event.newValue);
      if (!result || result.nonce !== transfer.coSignNonce) return;
      void applyHandoffRef.current(result.signature, true);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [kind, transfer.coSignNonce, handoffApplied]);

  // U26: cross-device handoff — a receiver's claim link lands here as
  // ?result=<token>. Held until this tab's paused challenge exists, applied
  // on nonce match, then stripped from the address bar (one-shot).
  const [claimResult, setClaimResult] = useState<HandoffResult | null>(() =>
    kind === "transfer"
      ? decodeHandoffResultToken(
          new URLSearchParams(window.location.search).get("result") ?? "",
        )
      : null,
  );
  useEffect(() => {
    if (
      !claimResult ||
      kind !== "transfer" ||
      transfer.coSignNonce === null ||
      handoffApplied
    )
      return;
    if (claimResult.nonce !== transfer.coSignNonce) return;
    void applyHandoffRef.current(claimResult.signature, false);
    setClaimResult(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("result");
    window.history.replaceState(null, "", url.toString());
  }, [claimResult, kind, transfer.coSignNonce, handoffApplied]);

  const copyHandoffLink = () => {
    const url = transfer.coSignHandoffUrl();
    if (!url) return;
    navigator.clipboard?.writeText(url);
    dispatch({ type: "notice", notice: f.handoffLinkCopied });
  };

  // Handoff tail: acceptance applied + verified — sender's confirm() is the last wallet-gated step.
  const submitHandoffTransfer = async () => {
    if (kind !== "transfer" || isBusy) return;
    setDraftPhase("submitting");
    try {
      const txHash = await transfer.confirm(buildTransferInput());
      setHandoffApplied(false);
      completeTransfer(txHash);
    } catch (err) {
      failDraft(err);
    }
  };

  const execute = async () => {
    if (isBusy) return;
    // Real wallet boundary: exact-amount approve when allowance falls short; explicit no-op notice otherwise.
    if (kind === "payment" && draft.phase === "approval-required") {
      setDraftPhase("submitting");
      try {
        const { approveHash } = await payment.approveExactAllowance(
          draft.value.trim(),
        );
        if (approveHash) {
          settleFlowTx(approveHash, {
            kind: f.allowanceKind,
            detail: interpolate(f.allowanceDetail, {
              amount: draft.value.trim(),
              symbol: paymentSymbol,
            }),
            route: "/payment",
            agent: selectedTokenId,
            opensReceipt: false,
          });
        }
        setDraftPhase("payment-required");
        dispatch({
          type: "notice",
          notice: approveHash ? f.approveSentNotice : f.allowanceCoveredNotice,
        });
      } catch (err) {
        failDraft(err);
      }
      return;
    }
    setDraftPhase("submitting");
    try {
      if (kind === "mint") {
        settleFlowTx(
          await mint.mint(draft.value),
          {
            kind: flow.receiptKind,
            detail: interpolate(flow.detail, { name: draft.value.trim() }),
            route: "/mint",
            agent: "new",
          },
          interpolate(flow.notice, { name: draft.value.trim() }),
        );
      } else if (kind === "payment") {
        // Ledger M4 (open product decision): this panel pays creators only (payForAgent).
        // payForAgentAndCompute (creator + compute provider in one call) already exists,
        // converged through the chat lane (packages/chat-runtime executors/encode.ts).
        // R3 §3 recommendation: converge user-facing payments on payForAgentAndCompute
        // and route this panel through it. Adding a second visible pay path here is a
        // product decision that has NOT been made — do not add UI until it is.
        const result = await payment.payForAgent(
          BigInt(selectedTokenId),
          draft.value.trim(),
        );
        settleFlowTx(
          result.txHash,
          {
            kind: flow.receiptKind,
            detail: interpolate(flow.detail, {
              amount: draft.value.trim(),
              agent: selectedTokenId,
            }),
            route: "/payment",
            agent: selectedTokenId,
          },
          interpolate(flow.notice, { agent: selectedTokenId }),
        );
      } else if (kind === "transfer") {
        const input = buildTransferInput();
        const prepared = await transfer.prepare(input);
        if (prepared.status === "co-sign-required") {
          // Cross-party pause: sheet shows co-sign step ("Sign as receiver"); handoff covers remote receivers.
          setHandoffReceiver(prepared.receiver);
          setDraftPhase("review");
          return;
        }
        completeTransfer(await transfer.confirm(input));
      } else if (kind === "deposit" || kind === "withdraw") {
        // Vault write via shared encode relay; receipt row + receipt phase ride the pipeline below.
        const txHash = await vaultWrite.handleSubmit(draft.value.trim());
        if (!txHash)
          throw new Error("Connect a wallet to submit this operation.");
        settleFlowTx(
          txHash,
          {
            kind: flow.receiptKind,
            detail: interpolate(flow.detail, {
              amount: draft.value.trim(),
              symbol: nativeSymbol,
              agent: selectedTokenId,
            }),
            route: `/${kind}`,
            agent: selectedTokenId,
          },
          interpolate(flow.notice, { agent: selectedTokenId }),
        );
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
        const outcome =
          result.recommendation.action === "act" ? f.tickActed : f.tickHeld;
        addFlowReceipt(hash, {
          kind: flow.receiptKind,
          detail: interpolate(flow.detail, {
            action: outcome,
            reason: result.recommendation.reason.slice(0, 48),
          }),
          route: "/tick",
          agent: selectedTokenId,
          state: "confirmed",
        });
        dispatch({
          type: "notice",
          notice: interpolate(flow.notice, {
            agent: selectedTokenId,
            outcome,
          }),
        });
      }
    } catch (err) {
      failDraft(err);
    }
  };

  const simulateFailure = (reason: "rejected" | "timeout") => {
    tickHook.cancelTick();
    const error =
      reason === "timeout" ? f.simulateTimeoutError : f.simulateRejectedError;
    setDraftPhase("recoverable-error", error);
    dispatch({ type: "notice", notice: `[dev] ${error}`, severity: "error" });
  };

  const restart = () => {
    tickHook.resetStream();
    setSubmitError(null);
    resetHandoff();
    dispatch({ type: "clear-draft", flow: kind });
  };

  // narrowed once so the guarded receipt buttons keep the string type in closures
  const receiptId = draft.receiptId;

  const copyReceipt = () => {
    // no receipt id (held tick / stream-only) → no copy, no false "copied" toast
    if (!receiptId) return;
    navigator.clipboard?.writeText(receiptId);
    dispatch({ type: "notice", notice: f.receiptCopiedNotice });
  };

  // Step labels live in copy.flows[kind].steps (localized, outcome-named) — no hardcoded ladder.
  const proofSteps = flow.steps;

  // Receipt derives from the LIVE tx row — confirmed only when the chain says; aged-out rows fall back to stale.
  const receiptTx = draft.receiptId
    ? state.transactions.find((tx) => tx.id === draft.receiptId)
    : undefined;
  const receiptState: TxState =
    receiptTx?.state ?? (draft.phase === "receipt" ? "stale" : "confirming");
  // Receipt chrome: state→[heading, body] table; unlisted states fall back to confirming.
  const receiptCopy: Partial<Record<TxState, [string, string, string]>> = {
    confirmed: [
      f.receiptHeadingConfirmed,
      f.receiptOverlayConfirmed,
      f.receiptBodyConfirmed,
    ],
    reverted: [
      f.receiptHeadingReverted,
      f.receiptOverlayReverted,
      f.receiptBodyReverted,
    ],
    stale: [
      f.receiptHeadingStale,
      f.receiptOverlayStale,
      interpolate(f.receiptBodyStale, {
        seconds: Math.round(RECEIPT_CONFIRM_TIMEOUT_MS / 1000),
      }),
    ],
  };
  // proto-subpages-a: mint success speaks human — "Done — {name} is live!";
  // every other state (and flow) keeps the shared state→copy table.
  const [receiptHeading, , receiptBody] =
    kind === "mint" && receiptState === "confirmed"
      ? [
          interpolate(f.mintDoneHeading, { name: draft.value }),
          f.receiptOverlayConfirmed,
          f.mintDoneBody,
        ]
      : (receiptCopy[receiptState] ?? [
          f.receiptHeadingConfirming,
          f.receiptOverlayConfirming,
          f.receiptBodyConfirming,
        ]);

  const proofReady = (index: number) =>
    draft.phase === "receipt"
      ? index < 2 || receiptState === "confirmed"
      : isReviewOpen && index < 2;

  // Boundary fact row must match real wallet prompts: approve when allowance short (→2), else pay only (→1).
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
  // Cross-party known at review time — boundary row states truthful prompt count before first execute.
  const transferNeedsCoSign =
    kind === "transfer" &&
    address !== undefined &&
    isAddress(draft.value.trim()) &&
    draft.value.trim().toLowerCase() !== address.toLowerCase();
  const confirmationLabel =
    kind === "transfer"
      ? transferNeedsCoSign
        ? f.confirmReceiverThenSubmit
        : f.confirmOne
      : kind !== "payment"
        ? undefined
        : draft.phase === "payment-required"
          ? f.confirmOne
          : paymentApprovalNeeded === undefined
            ? f.confirmChecking
            : paymentApprovalNeeded
              ? f.confirmTwoApprovePay
              : f.confirmOneAllowance;

  const agentOptions = useMemo(
    () => agents.map((agent) => agent.tokenId.toString()),
    [agents],
  );

  // T3a: the agents poll is the only unknown at first paint — a settled-but-empty
  // register means every non-mint flow is blocked, so the form is replaced by the
  // Dashboard's no-agents EmptyState (Mint CTA) instead of a dead disabled select.
  const zeroAgentFlow =
    kind !== "mint" && !agentsLoading && agentOptions.length === 0;
  // And a still-loading register must not flash "No agents yet" — skeleton row
  // mirrors the Transactions first-load pattern until the poll delivers once.
  const agentsPending = kind !== "mint" && agentsLoading;

  // Resulting-balance estimate for the vault review sheet — cheap since the vault read is already live.
  const balanceFact = useMemo(() => {
    if (!isVaultFlow || vaultBalanceWei === undefined) return undefined;
    try {
      const amount = parseUnits(draft.value.trim() || "0", nativeDecimals);
      const next =
        kind === "deposit"
          ? vaultBalanceWei + amount
          : vaultBalanceWei - amount;
      return {
        dt: f.vaultBalanceAfter,
        dd:
          next < 0n
            ? f.exceedsBalance
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
    f.vaultBalanceAfter,
    f.exceedsBalance,
  ]);

  // Data-driven form fields: one Field renderer serves every operation kind.
  type FormFieldSpec = {
    key: "value" | "extra";
    label: string;
    value: string;
    onChange: (next: string) => void;
    maxLength: number;
    suffix?: string;
    error?: string;
    hint?: string;
    inputMode?: "text" | "decimal";
  };
  const fieldError = (field: "value" | "extra"): string | undefined =>
    submitError?.field === field ? submitError.message : undefined;
  // Wave-10B (critique-2-states-forms.md M7): the live <=0 clause fires only
  // once the field has content — a pristine amount field must not open with a
  // red "amount must be positive" line. Submit-time validate() still blocks
  // empty/invalid drafts; the field-named submitError contract is untouched.
  const amountFieldError =
    fieldError("value") ??
    (draft.value.trim() !== "" && Number(draft.value) <= 0
      ? f.errAmountPositive
      : undefined);
  const baseValueField = {
    key: "value" as const,
    label: flow.fieldLabel,
    value: draft.value,
    onChange: updateValue,
    error: fieldError("value"),
    hint: flow.fieldHint,
  };
  const formFields: FormFieldSpec[] = [];
  if (kind === "mint") {
    formFields.push({ ...baseValueField, maxLength: 80 });
  } else if (kind === "payment" || isVaultFlow) {
    formFields.push({
      ...baseValueField,
      maxLength: 24,
      // Amount entry: decimal keypad on mobile (T7).
      inputMode: "decimal",
      suffix: kind === "payment" ? paymentSymbol : nativeSymbol,
      error: amountFieldError,
      hint:
        kind === "withdraw" && vaultBalanceWei !== undefined
          ? interpolate(f.vaultedHint, {
              amount: formatTokenAmount(vaultBalanceWei, nativeDecimals),
              symbol: nativeSymbol,
            })
          : flow.fieldHint,
    });
  } else if (kind === "transfer") {
    // P3 §(b)#4: a single receiver-ADDRESS field — the pubkey is resolved
    // from the address at prepare time (Advanced paste lives in the modal).
    formFields.push({ ...baseValueField, maxLength: 42 });
  } else if (kind === "tick") {
    formFields.push({ ...baseValueField, maxLength: 320 });
  }

  return (
    <div className={`ops-page flow-page flow-${kind}`}>
      <div className="page-head">
        <div>
          <h1>{flow.title}</h1>
          <p>{flow.copy}</p>
        </div>
        <Button
          variant="secondary"
          onClick={() => go("/transactions")}
          icon={<ReceiptText size={16} />}
        >
          {f.openTransactions}
        </Button>
      </div>

      {intentCopy && (
        // proto-subpages-b: one state label, not banner+stage+overlay stacked.
        <div className="flow-intent-banner">
          <ShieldCheck size={16} />
          <strong>
            {interpolate(intentCopy, { agent: selectedTokenId || "—" })}
          </strong>
        </div>
      )}

      <div className="flow-layout review-first-layout">
        <section className="flow-stage">
          <div className="flow-stage-top">
            <span className="flow-symbol">{meta.icon}</span>
            <div>
              <h2>
                {draft.phase === "receipt" ? receiptHeading : f.stageTitle}
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
            <img src={meta.media} alt={flow.title} />
          </div>

          <div className="flow-form" ref={formRef}>
            {kind !== "mint" && agentsPending && (
              // T3a: skeleton select row — same footprint as the real field so
              // the form doesn't jump when agents arrive (aria-busy while the
              // agents poll is in flight, aria-hidden placeholder content).
              <div className="field" aria-busy="true">
                <span className="field-label">{f.agentLabel} *</span>
                <span className="field-control" aria-hidden="true">
                  <select className="axiom-field" tabIndex={-1} disabled>
                    <option value="">&nbsp;</option>
                  </select>
                </span>
                <span className="field-hint">{f.agentHint}</span>
              </div>
            )}
            {kind !== "mint" && zeroAgentFlow && (
              // T3a: settled with zero agents — the dead select becomes the
              // Dashboard's no-agents EmptyState: honest block + Mint CTA.
              <EmptyState
                title={copy.dashboard.noAgents}
                hint={copy.dashboard.noAgentsHint}
              >
                <Button
                  onClick={() => go(routePath("mint"))}
                  icon={<Bot size={16} />}
                >
                  {copy.dashboard.mintAgent}
                </Button>
              </EmptyState>
            )}
            {kind !== "mint" && !agentsPending && !zeroAgentFlow && (
              <label
                className={`field${submitError?.field === "agent" ? " field-error" : ""}`}
              >
                <span className="field-label">{f.agentLabel} *</span>
                <span className="field-control">
                  <select
                    className="axiom-field"
                    aria-label={f.agentA11y}
                    aria-invalid={submitError?.field === "agent" ? "true" : undefined}
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
                    {agentOptions.map((id) => (
                      <option key={id} value={id}>
                        {f.agentOption(id)}
                      </option>
                    ))}
                  </select>
                </span>
                {submitError?.field === "agent" ? (
                  <span className="field-message" role="alert">
                    {submitError.message}
                  </span>
                ) : (
                  <span className="field-hint">{f.agentHint}</span>
                )}
              </label>
            )}
            {/* T3a: no Mint CTA pointing at value fields that cannot be used —
                the form body waits for agents like the select row does. */}
            {!zeroAgentFlow &&
              formFields.map((field) => (
                <Field
                  key={field.key}
                  label={field.label}
                  value={field.value}
                  onChange={field.onChange}
                  required
                  maxLength={field.maxLength}
                  suffix={field.suffix}
                  error={field.error}
                  hint={field.hint}
                  inputMode={field.inputMode}
                />
              ))}
          </div>

          {kind === "tick" &&
            (tickHook.isStreaming || tickHook.streamedTokens) && (
              <div className="tick-stream" aria-live="polite">
                <span className="visually-hidden">{f.streamLabel}</span>
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
                    {f.cancelStream}
                  </Button>
                )}
              </div>
            )}

          {draft.phase === "receipt" ? (
            <div className="operation-receipt">
              <div>
                {receiptState === "confirmed" ? (
                  <CircleCheck size={18} />
                ) : receiptState === "reverted" || receiptState === "stale" ? (
                  <AlertTriangle size={18} />
                ) : (
                  <Timer size={18} />
                )}
                <div>
                  <strong className="num">
                    {truncateHex(draft.receiptId || "", 12, 8)}
                  </strong>
                  <small>{receiptBody}</small>
                </div>
              </div>
              {receiptState === "reverted" || receiptState === "stale" ? (
                /* T6 recovery: the bare state word left the user with no
                   next action — one remedy line maps the failure class to
                   what to DO (retry tx / raise gas / check network). */
                <div className="receipt-remedy" role="alert">
                  {f.receiptRemedy}
                </div>
              ) : null}
              <div>
                {receiptId ? (
                  <>
                    <Button
                      variant="secondary"
                      onClick={copyReceipt}
                      icon={<Copy size={14} />}
                    >
                      {f.copyReceiptAction}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        go(`/transactions?tx=${encodeURIComponent(receiptId)}`)
                      }
                      icon={<ReceiptText size={14} />}
                    >
                      {f.openReceiptAction}
                    </Button>
                  </>
                ) : null}
                <Button
                  variant="ghost"
                  onClick={restart}
                  icon={<RotateCcw size={14} />}
                >
                  {f.startAnotherAction}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flow-action">
              <Button
                busy={isBusy}
                onClick={openReview}
                icon={<ArrowRight size={16} />}
                disabled={zeroAgentFlow}
              >
                {isReviewOpen ? f.reviewOpenLabel : f.reviewAction}
              </Button>
              {DEV_TOOLS && (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => simulateFailure("rejected")}
                    disabled={isBusy}
                    icon={<AlertTriangle size={14} />}
                  >
                    {f.simulateReject}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => simulateFailure("timeout")}
                    disabled={isBusy}
                    icon={<Timer size={14} />}
                  >
                    {f.simulateTimeout}
                  </Button>
                </>
              )}
            </div>
          )}
        </section>

        <aside className="flow-context panel">
          {flow.contextTitle !== "" && <h2>{flow.contextTitle}</h2>}
          <ol className="passive-proof-timeline">
            {proofSteps.map((step, index) => (
              <li key={step} className={proofReady(index) ? "is-ready" : ""}>
                <i aria-hidden="true" />
                <div>
                  <strong>{step}</strong>
                  {/* proto-subpages-b: plain actor tags — You/You/Us per ladder. */}
                  <small>
                    {index === proofSteps.length - 1
                      ? f.stepAuto
                      : f.stepWallet}
                  </small>
                </div>
                {proofReady(index) ? <Check size={14} /> : null}
              </li>
            ))}
          </ol>
          {kind === "payment" && allowance !== null && (
            <div className="diagnostic-note">
              <CreditCard size={14} />
              <span>
                {interpolate(f.allowanceNote, {
                  amount: formatUnits(
                    BigInt(allowance),
                    paymentToken?.decimals ?? 6,
                  ),
                  symbol: paymentSymbol,
                })}
              </span>
            </div>
          )}
          <div className="diagnostic-note">
            <ShieldCheck size={14} />
            <span>{f.liveRouteNote}</span>
          </div>
        </aside>
      </div>

      {isReviewOpen &&
        (() => {
          // Co-sign stays alive while paused or handoff-applied; a fresh challenge would orphan the acceptance.
          const activeReceiver =
            transfer.coSignReceiver ??
            (handoffApplied ? (handoffReceiver as `0x${string}` | null) : null);
          const coSignActive =
            kind === "transfer" &&
            activeReceiver !== null &&
            activeReceiver.toLowerCase() === draft.value.trim().toLowerCase();
          return (
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
                coSignActive
                  ? {
                      receiver: activeReceiver!,
                      blocked: coSignBlocked && !handoffApplied,
                      onSign: () => void executeCoSign(),
                      handoff: {
                        url: transfer.coSignHandoffUrl() ?? "",
                        onCopyLink: copyHandoffLink,
                        codeValue: handoffCode,
                        onCodeChange: (value: string) => {
                          setHandoffCode(value);
                          setHandoffError(null);
                        },
                        onApplyCode: () => void applyHandoff(handoffCode),
                        codeError: handoffError,
                        applied: handoffApplied,
                        onSubmit: () => void submitHandoffTransfer(),
                      },
                    }
                  : undefined
              }
              onClose={() => {
                // Closing abandons any paused co-sign — a fresh review starts a fresh challenge (nonces single-use).
                if (kind === "transfer") resetHandoff();
                setDraftPhase("draft");
              }}
              onRetry={() =>
                setDraftPhase(
                  kind === "payment" ? "approval-required" : "review",
                )
              }
              onExecute={() => void execute()}
            />
          );
        })()}
    </div>
  );
}

/*
  OperationReviewSheet. The single
  confirm surface over the v1 encode-relay hooks: review facts, then
  "Sign & execute" drives the real wallet call from FlowPage.

  the sheet reads its copy from lib/copy.ts directly (locale via
  useUiStore) — review rows, fact labels, CTA vocabulary and the receipt/
  co-sign/handoff chrome localize like the rest of the flow body. The
  co-sign step additionally carries the cross-wallet handoff (share an
  acceptance link / paste the receiver's code) so a receiver on another
  device never dead-ends the transfer.
*/
type HandoffControl = {
  /** Receiver-signable URL (paused challenge, base64url typed data). */
  url: string;
  onCopyLink: () => void;
  /** Pasted acceptance code (two-way). */
  codeValue: string;
  onCodeChange: (value: string) => void;
  /** Verify + apply the code (disabled until it parses as a signature). */
  onApplyCode: () => void;
  /** Humanized apply error, if the last apply failed. */
  codeError: string | null;
  /** Acceptance applied + verified — primary becomes "Submit transfer". */
  applied: boolean;
  onSubmit: () => void;
};

type OperationReviewSheetProps = {
  kind: FlowKind;
  draft: OperationDraft;
  agentName: string;
  onClose: () => void;
  onRetry: () => void;
  onExecute: () => void;
  busy: boolean;
  /** FlowPage computes the truthful wallet-prompt count from the live
   * allowance; when provided it replaces the static payment fact row. */
  confirmationLabel?: string;
  /** Payment boundary 1: false when the live allowance already covers the
   * amount (CTA relabeled — no wallet prompt fires on that click). */
  approvalNeeded?: boolean;
  /** vault flows show the resulting-balance estimate as an extra fact
   * row (cheap — the vault read is already live on the flow page). */
  balanceFact?: { dt: string; dd: string };
  /** the payment token's on-chain symbol from the hook-layer cache —
   * the confirm CTA interpolates it ("Pay 25 axmUSDC" on Galileo), never a
   * hardcoded unit. */
  paymentSymbol?: string;
  /** cross-party transfer paused for the receiver co-sign. When set
   * (and no recoverable error is showing), the sheet's primary action becomes
   * the receiver signature; `blocked` renders the honest blocker (the wallet
   * cannot sign for the receiver) WITH the handoff remedies (link + code
   * paste) — no dead end. Copy is read from copy.ts inside the sheet. */
  coSign?: {
    receiver: string;
    blocked: boolean;
    onSign: () => void;
    handoff?: HandoffControl;
  };
};

function OperationReviewSheet({
  kind,
  draft,
  agentName,
  onClose,
  onRetry,
  onExecute,
  busy,
  confirmationLabel,
  approvalNeeded,
  balanceFact,
  paymentSymbol,
  coSign,
}: OperationReviewSheetProps) {
  const { state } = useUiStore();
  const copy = getCopy(state.settings.locale);
  const f = copy.flowUi;
  const flow = copy.flows[kind];
  // Dismiss contract: Esc + Tab trap + initial focus + focus restore here, backdrop onMouseDown
  // below, explicit X/"Edit details"; dismissing never submits. The trap keeps Tab inside the
  // sheet — this is the confirm surface for irreversible wallet ops.
  const sheetRef = useRef<HTMLElement>(null);
  useModalDismiss(onClose, sheetRef);
  const paymentNeedsApproval =
    kind === "payment" && draft.phase === "approval-required";
  const paymentReady = kind === "payment" && draft.phase === "payment-required";
  const isRecoverableError = draft.phase === "recoverable-error";
  // Co-sign step replaces the primary while a cross-party transfer is paused for the receiver signature.
  const coSignActive = coSign !== undefined && !isRecoverableError;
  const handoff = coSignActive ? coSign?.handoff : undefined;
  const handoffApplied = handoff?.applied === true;
  const codeLooksSignable = ACCEPTANCE_CODE_SHAPE.test(
    handoff?.codeValue?.trim() ?? "",
  );
  // One copper primary per view: applied handoff → Submit transfer; co-sign → Sign as receiver;
  // co-sign blocked → Apply acceptance (only path until a signature-shaped code is pasted).
  const primaryLabel = isRecoverableError
    ? kind === "payment"
      ? f.restartApproval
      : f.resumeReview
    : coSignActive
      ? handoffApplied
        ? f.submitTransfer
        : coSign!.blocked
          ? f.handoffApply
          : copy.flowUi.coSignAction
      : paymentNeedsApproval
        ? approvalNeeded === false
          ? f.primaryContinuePayment
          : f.primaryApprove
        : paymentReady
          ? interpolate(f.payCta, {
              amount: draft.value,
              symbol: paymentSymbol ?? "",
            }).trimEnd()
          : f.primarySign;
  const primaryDisabled =
    busy ||
    (coSignActive && coSign!.blocked && !handoffApplied && !codeLooksSignable);
  const onPrimary = (): void => {
    if (isRecoverableError) {
      onRetry();
      return;
    }
    if (coSignActive) {
      if (handoffApplied) handoff?.onSubmit();
      else if (coSign!.blocked) handoff?.onApplyCode();
      else coSign!.onSign();
      return;
    }
    onExecute();
  };
  const confirmationCount =
    confirmationLabel ?? (kind === "payment" ? f.confirmTwo : f.confirmOne);
  return createPortal(
    <div
      className="operation-review-layer"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        ref={sheetRef}
        className="operation-review-sheet"
        /* R13 (baseline-ui): destructive/irreversible operations (funds out,
           ownership handoff) MUST announce as an AlertDialog. Constructive
           flows keep the plain dialog role. */
        role={
          kind === "withdraw" || kind === "transfer" || kind === "payment"
            ? "alertdialog"
            : "dialog"
        }
        aria-modal="true"
        aria-labelledby="operation-review-title"
        aria-describedby={draft.error ? "operation-review-error" : undefined}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="operation-review-head">
          <div>
            <h2 id="operation-review-title">{f.reviewTitle}</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={f.closeReviewA11y}
          >
            <X size={16} />
          </button>
        </header>
        <div className="review-decision">
          <span className="review-seal">
            <ShieldCheck size={18} />
          </span>
          <div>
            <strong>{flow.consequence}</strong>
          </div>
        </div>
        <dl className="review-facts">
          {/* mint has no agent yet — agentName IS draft.value */}
          {kind !== "mint" && (
            <div>
              <dt>{f.factAgent}</dt>
              <dd>{agentName}</dd>
            </div>
          )}
          <div>
            <dt>
              {kind === "payment" || kind === "deposit" || kind === "withdraw"
                ? f.factAmount
                : kind === "transfer"
                  ? f.factRecipient
                  : kind === "mint"
                    ? f.factName
                    : f.factInstruction}
            </dt>
            <dd className="mono num">{draft.value}</dd>
          </div>
          {balanceFact && (
            <div>
              <dt>{balanceFact.dt}</dt>
              <dd className="mono num">{balanceFact.dd}</dd>
            </div>
          )}
          {kind === "mint" ? (
            /* proto-subpages-a: mint sheet trims to Name + Cost — the network
               and wallet-ask counts fold into one plain cost row. */
            <div>
              <dt>{f.factCost}</dt>
              <dd>{f.confirmMint}</dd>
            </div>
          ) : (
            <>
              <div>
                <dt>{f.factNetwork}</dt>
                <dd>
                  {interpolate(f.networkFact, {
                    chainName: APP_CHAIN.name,
                    chainId: APP_CHAIN_ID,
                  })}
                </dd>
              </div>
              <div>
                <dt>{f.factBoundary}</dt>
                <dd>{confirmationCount}</dd>
              </div>
            </>
          )}
        </dl>
        {flow.proofLine !== "" && (
          <div className="review-proof">
            <Check size={14} />
            <span>{flow.proofLine}</span>
          </div>
        )}
        {coSignActive && (
          /* proto-subpages-b S12: ONE "Needs approval" card with internal
             sub-states (waiting / not-here / done) replaces the three sibling
             blocks that re-explained who signs when. */
          <div
            className={`review-cosign${
              coSign!.blocked && !handoffApplied ? " review-cosign-blocked" : ""
            }`}
            role={coSign!.blocked && !handoffApplied ? "alert" : undefined}
            data-testid={
              coSign!.blocked && !handoffApplied
                ? "transfer-cosign-blocked"
                : handoffApplied
                  ? "transfer-handoff-applied"
                  : "transfer-cosign"
            }
          >
            {coSign!.blocked && !handoffApplied ? (
              <AlertTriangle size={14} />
            ) : handoffApplied ? (
              <Check size={14} />
            ) : (
              <ShieldCheck size={14} />
            )}
            <div>
              <strong>
                {coSign!.blocked && !handoffApplied
                  ? f.coSignBlockedTitle
                  : handoffApplied
                    ? f.handoffAppliedTitle
                    : f.needsApprovalTitle}
              </strong>
              <p>
                {coSign!.blocked && !handoffApplied
                  ? f.coSignBlockedBody(truncateAddress(coSign!.receiver))
                  : handoffApplied
                    ? f.handoffAppliedNote
                    : f.coSignBody(truncateAddress(coSign!.receiver))}
              </p>
              {handoff && !handoffApplied && (
                <>
                  <div className="review-handoff-actions">
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={handoff.onCopyLink}
                    >
                      <Copy size={14} />
                      {f.handoffCopyLink}
                    </button>
                  </div>
                  <label className="field">
                    <span className="field-label">{f.handoffPasteLabel}</span>
                    <span className="field-control">
                      <input
                        className="axiom-field mono"
                        value={handoff.codeValue}
                        onChange={(event) =>
                          handoff.onCodeChange(event.target.value)
                        }
                        placeholder="0x…"
                        spellCheck={false}
                        maxLength={132}
                        aria-label={f.handoffPasteLabel}
                      />
                    </span>
                    <span className="field-hint">{f.handoffPasteHint}</span>
                  </label>
                  {handoff.codeError && (
                    <div className="review-error" role="alert">
                      <AlertTriangle size={14} />
                      {handoff.codeError}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
        {draft.error && (
          <div
            id="operation-review-error"
            className="review-error"
            role="alert"
          >
            <AlertTriangle size={14} />
            {draft.error}
          </div>
        )}
        <div className="review-actions" aria-label="Operation actions">
          <button
            className="button button-primary"
            onClick={onPrimary}
            disabled={primaryDisabled}
            aria-busy={busy || undefined}
          >
            <ShieldCheck size={16} />
            {busy ? f.awaitingWallet : primaryLabel}
          </button>
          <button className="button button-ghost" onClick={onClose}>
            {f.editDetails}
          </button>
        </div>
        <p className="review-disclaimer">{f.reviewDisclaimer}</p>
      </section>
    </div>,
    document.body,
  );
}
