import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from "react";
import {
  useSendTransaction,
  useWriteContract,
  useAccount,
  usePublicClient,
} from "wagmi";
import { parseAbi, parseEther, parseUnits } from "viem";
import type { Address } from "viem";

const erc20Abi = parseAbi([
  "function decimals() view returns (uint8)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

import { PAYMENT_PROCESSOR_ABI } from "@axiom/config/abis";

const paymentProcessorAbi = parseAbi(PAYMENT_PROCESSOR_ABI);
import { getAxiomPaymentProcessorAddress } from "../abi/addresses.js";
import {
  PLACEHOLDER,
  truncateHex,
  humanizeError,
  validateNumericInput,
} from "../utils/format.js";
import {
  usePayment,
  type PaymentConfig,
  type EarningsInfo,
} from "../hooks/usePayment.js";
import { toast } from "sonner";
import {
  COLORS,
  Card,
  Button,
  Input,
  Alert,
  SectionTitle,
  MonoLabel,
  Modal,
  Spinner,
  ConnectedGuard,
} from "./ui.js";

type ActionStatus = "idle" | "pending" | "success" | "error";

function useAutoClear(
  status: ActionStatus,
  setStatus: (s: ActionStatus) => void,
  ms = 6000,
): void {
  useEffect(() => {
    if (status === "success" || status === "error") {
      const timer = setTimeout(() => setStatus("idle"), ms);
      return () => clearTimeout(timer);
    }
  }, [status, setStatus, ms]);
}

const formRowClassName = "flex items-center gap-sm mt-sm";

function PaymentConfigDisplay({
  config,
  initError,
}: {
  config: PaymentConfig | null;
  initError: string | null;
}): ReactElement {
  if (initError !== null) {
    return (
      <Alert variant="error" style={{ marginBottom: "var(--space-lg)" }}>
        {initError}
      </Alert>
    );
  }
  if (config === null) {
    return <Spinner size={16} />;
  }
  const pct = (config.protocolFeeBps / 100).toFixed(2);
  return (
    <p
      style={{
        fontSize: "var(--text-xs)",
        color: COLORS.textMuted,
        margin: 0,
        display: "flex",
        gap: "8px",
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <span>
        Protocol fee: {config.protocolFeeBps} bps ({pct}%)
      </span>
      <span>•</span>
      <span
        title={`Payment token: ${config.paymentToken}\nProtocol treasury: ${config.protocolTreasury}`}
        style={{ cursor: "help", borderBottom: `1px dotted ${COLORS.textDim}` }}
      >
        Token: {config.paymentToken.slice(0, 6)}...
        {config.paymentToken.slice(-4)}
      </span>
    </p>
  );
}

function PaymentForm({
  isPayLoading,
  payAmount,
  payStatus,
  payError,
  payAmountError,
  onPayAmountChange,
  onPay,
}: {
  isPayLoading: boolean;
  payAmount: string;
  payStatus: ActionStatus;
  payError: string | null;
  payAmountError: string | null;
  onPayAmountChange: (value: string) => void;
  onPay: () => void;
}): ReactElement {
  return (
    <>
      <h3>Pay for Agent</h3>
      <p className="text-xs text-muted">
        Enter amount in tokens (e.g. &quot;10&quot;). Converted to smallest unit
        automatically.
      </p>
      <div className={formRowClassName}>
        <Input
          type="number"
          inputMode="numeric"
          min="0"
          step="0.000001"
          maxLength={78}
          placeholder="amount (tokens)"
          value={payAmount}
          onChange={(e): void => {
            onPayAmountChange(e.target.value);
          }}
          style={{ flex: 1 }}
          aria-invalid={payAmountError !== null}
          aria-describedby="pay-amount-error"
        />
        <Button
          variant="primary"
          disabled={
            isPayLoading ||
            payStatus === "pending" ||
            payAmount === "" ||
            payAmountError !== null
          }
          onClick={onPay}
          style={{ minWidth: "140px" }}
        >
          {payStatus === "pending" ? <Spinner size={16} /> : "Pay"}
        </Button>
      </div>
      {payAmountError !== null && (
        <p id="pay-amount-error" className="field-error">
          {payAmountError}
        </p>
      )}
      {payStatus === "success" && (
        <Alert variant="success">Payment submitted.</Alert>
      )}
      {payStatus === "error" && (
        <Alert variant="error">{payError ?? "Payment failed."}</Alert>
      )}
    </>
  );
}

function EarningsSection({
  earnings,
  isWithdrawPending,
  withdrawStatus,
  showWithdrawConfirm,
  withdrawActionError,
  onWithdrawRequest,
  onWithdrawCancel,
  onWithdrawConfirm,
}: {
  earnings: EarningsInfo | null;
  isWithdrawPending: boolean;
  withdrawStatus: ActionStatus;
  showWithdrawConfirm: boolean;
  withdrawActionError: string | null;
  onWithdrawRequest: () => void;
  onWithdrawCancel: () => void;
  onWithdrawConfirm: () => void;
}): ReactElement {
  return (
    <>
      <h3>Earnings</h3>
      {earnings === null ? (
        <Spinner size={16} />
      ) : (
        <dl
          className="stack-on-mobile"
          style={{
            margin: "var(--space-md) 0",
            display: "grid",
            gridTemplateColumns: "140px 1fr",
            gap: "8px 16px",
            fontSize: "var(--text-sm)",
          }}
        >
          <dt style={{ color: COLORS.textDim, fontWeight: "var(--fw-medium)" }}>
            Creator
          </dt>
          <dd style={{ margin: 0 }}>
            <MonoLabel title={earnings.creator}>
              {earnings.creator === ethersZero
                ? PLACEHOLDER
                : truncateHex(earnings.creator)}
            </MonoLabel>
          </dd>
          <dt style={{ color: COLORS.textDim, fontWeight: "var(--fw-medium)" }}>
            Accumulated Earnings
          </dt>
          <dd
            style={{
              margin: 0,
              color: COLORS.bronzeLight,
              fontWeight: "var(--fw-semibold)",
            }}
          >
            <MonoLabel>{earnings.earnings}</MonoLabel>
          </dd>
        </dl>
      )}
      <div className={formRowClassName}>
        <Button
          variant="secondary"
          disabled={isWithdrawPending || withdrawStatus === "pending"}
          onClick={onWithdrawRequest}
          style={{ minWidth: "140px" }}
        >
          {withdrawStatus === "pending" ? <Spinner size={16} /> : "Withdraw"}
        </Button>
      </div>
      <Modal
        open={showWithdrawConfirm}
        onClose={onWithdrawCancel}
        title="Confirm Withdrawal"
      >
        <p style={{ marginBottom: "16px" }}>
          Withdraw all agent earnings? This will send funds to your wallet.
        </p>
        <div
          style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}
        >
          <Button variant="secondary" onClick={onWithdrawCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onWithdrawConfirm}
            disabled={isWithdrawPending || withdrawStatus === "pending"}
          >
            Confirm
          </Button>
        </div>
      </Modal>
      {withdrawStatus === "success" && (
        <Alert variant="success">Withdrawal submitted.</Alert>
      )}
      {withdrawStatus === "error" && (
        <Alert variant="error">
          {withdrawActionError ?? "Withdrawal failed."}
        </Alert>
      )}
    </>
  );
}

function RoyaltySection({
  isRoyaltyLoading,
  royaltyBps,
  royaltyStatus,
  royaltyError,
  royaltyBpsError,
  onRoyaltyBpsChange,
  onSetRoyalty,
}: {
  isRoyaltyLoading: boolean;
  royaltyBps: string;
  royaltyStatus: ActionStatus;
  royaltyError: string | null;
  royaltyBpsError: string | null;
  onRoyaltyBpsChange: (value: string) => void;
  onSetRoyalty: () => void;
}): ReactElement {
  return (
    <>
      <h3>Royalty</h3>
      <p className="text-xs text-muted">
        Basis points (0\u201310000). 250 = 2.5%. Only the agent creator may set
        this on-chain.
      </p>
      <div className={formRowClassName}>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          max={10000}
          maxLength={5}
          placeholder="bps (0\u201310000)"
          value={royaltyBps}
          onChange={(e): void => {
            onRoyaltyBpsChange(e.target.value);
          }}
          style={{ flex: 1 }}
          aria-invalid={royaltyBpsError !== null}
          aria-describedby="royalty-bps-error"
        />
        <Button
          variant="primary"
          disabled={
            isRoyaltyLoading ||
            royaltyStatus === "pending" ||
            royaltyBps === "" ||
            royaltyBpsError !== null
          }
          onClick={onSetRoyalty}
          style={{ minWidth: "140px" }}
        >
          {royaltyStatus === "pending" ? <Spinner size={16} /> : "Set Royalty"}
        </Button>
      </div>
      {royaltyBpsError !== null && (
        <p id="royalty-bps-error" className="field-error">
          {royaltyBpsError}
        </p>
      )}
      {royaltyStatus === "success" && (
        <Alert variant="success">Royalty updated.</Alert>
      )}
      {royaltyStatus === "error" && (
        <Alert variant="error">
          {royaltyError ?? "Royalty update failed."}
        </Alert>
      )}
    </>
  );
}

export type PaymentPanelProps = {
  tokenId: bigint;
};

export function PaymentPanel({ tokenId }: PaymentPanelProps): ReactElement {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const {
    payForAgent,
    getEarnings,
    setRoyalty,
    getPaymentConfig,
    isPayLoading,
    isRoyaltyLoading,
    earningsError,
    fetchError,
  } = usePayment();

  // On-chain withdraw — backend has no route, so the connected
  // wallet signs `withdrawAgentEarnings()` directly. This mirrors
  // `useTransfer`'s on-chain submit pattern.
  const {
    writeContractAsync,
    isPending: isWithdrawPending,
    error: withdrawError,
  } = useWriteContract();

  const { sendTransactionAsync } = useSendTransaction();

  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [earnings, setEarnings] = useState<EarningsInfo | null>(null);

  const [payAmount, setPayAmount] = useState("");
  const [payStatus, setPayStatus] = useState<ActionStatus>("idle");
  const [payError, setPayError] = useState<string | null>(null);

  const payAmountError = useMemo(() => {
    const err = validateNumericInput(payAmount, {
      label: "Amount",
      min: 0,
      allowDecimals: true,
      maxDecimals: 18,
    });
    if (err !== null) return err;
    if (payAmount !== "" && Number(payAmount) === 0)
      return "Amount must be greater than zero.";
    return null;
  }, [payAmount]);

  const [royaltyBps, setRoyaltyBps] = useState("");
  const [royaltyStatus, setRoyaltyStatus] = useState<ActionStatus>("idle");
  const [royaltyError, setRoyaltyError] = useState<string | null>(null);

  const royaltyBpsError = useMemo(
    () =>
      validateNumericInput(royaltyBps, {
        label: "Royalty",
        min: 0,
        max: 10000,
        allowDecimals: false,
      }),
    [royaltyBps],
  );

  const [withdrawStatus, setWithdrawStatus] = useState<ActionStatus>("idle");
  const [withdrawActionError, setWithdrawActionError] = useState<string | null>(
    null,
  );
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  const isCreator =
    !earnings ||
    (!!address && address.toLowerCase() === earnings.creator.toLowerCase());

  useAutoClear(payStatus, setPayStatus);
  useAutoClear(royaltyStatus, setRoyaltyStatus);
  useAutoClear(withdrawStatus, setWithdrawStatus);

  useEffect(() => {
    let cancelled = false;
    setInitError(null);
    Promise.all([getPaymentConfig(), getEarnings(tokenId)])
      .then(([cfg, earn]) => {
        if (cancelled) return;
        setConfig(cfg);
        setEarnings(earn);
      })
      .catch((err) => {
        if (cancelled) return;
        setInitError(humanizeError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [tokenId, getPaymentConfig, getEarnings]);

  const refreshEarnings = useCallback(async (): Promise<void> => {
    try {
      const earn = await getEarnings(tokenId);
      setEarnings(earn);
    } catch (err) {
      console.warn("[PaymentPanel] Failed to refresh earnings:", err);
    }
  }, [tokenId, getEarnings]);

  const handlePay = useCallback(async (): Promise<void> => {
    if (payAmount === "" || !config || !address || !publicClient) return;
    setPayStatus("pending");
    try {
      const decimals = (await publicClient.readContract({
        address: config.paymentToken,
        abi: erc20Abi,
        functionName: "decimals",
      })) as number;

      const scaledAmount = parseUnits(payAmount, decimals);

      const allowance = (await publicClient.readContract({
        address: config.paymentToken,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, getAxiomPaymentProcessorAddress()],
      })) as bigint;

      if (allowance < scaledAmount) {
        toast.info("Approving token allowance...");
        const approveTx = await writeContractAsync({
          address: config.paymentToken,
          abi: erc20Abi,
          functionName: "approve",
          args: [getAxiomPaymentProcessorAddress(), scaledAmount],
        });
        toast.info("Waiting for approval confirmation...");
        await publicClient.waitForTransactionReceipt({ hash: approveTx });
        toast.success("Allowance approved");
      }

      await payForAgent(tokenId, scaledAmount.toString());
      toast.success("Payment processed");
      await refreshEarnings();
      setPayStatus("success");
    } catch (err) {
      setPayStatus("error");
      setPayError(humanizeError(err));
    }
  }, [
    payAmount,
    payForAgent,
    tokenId,
    refreshEarnings,
    config,
    address,
    publicClient,
    writeContractAsync,
  ]);

  const handleSetRoyalty = useCallback(async (): Promise<void> => {
    const parsed = Number.parseInt(royaltyBps, 10);
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 10_000) {
      setRoyaltyStatus("error");
      return;
    }
    setRoyaltyStatus("pending");
    try {
      const result = await setRoyalty(tokenId, parsed);
      if (result?.to && result?.data) {
        await sendTransactionAsync({
          to: result.to,
          data: result.data,
          value: BigInt(result.value ?? "0"),
        });
      }
      setRoyaltyStatus("success");
      toast.success("Royalty updated");
    } catch (err) {
      setRoyaltyStatus("error");
      setRoyaltyError(humanizeError(err));
    }
  }, [royaltyBps, setRoyalty, tokenId, sendTransactionAsync]);

  const handleWithdraw = useCallback(async (): Promise<void> => {
    setShowWithdrawConfirm(false);
    setWithdrawStatus("pending");
    try {
      await writeContractAsync({
        address: getAxiomPaymentProcessorAddress(),
        abi: paymentProcessorAbi,
        functionName: "withdrawAgentEarnings",
        args: [],
      });
      setWithdrawStatus("success");
      toast.success("Withdrawal submitted");
      await refreshEarnings();
    } catch (err) {
      setWithdrawStatus("error");
      setWithdrawActionError(humanizeError(err));
    }
  }, [writeContractAsync, refreshEarnings]);

  return (
    <Card>
      <ConnectedGuard>
        <SectionTitle>Payments</SectionTitle>

        <PaymentConfigDisplay config={config} initError={initError} />

        <PaymentForm
          isPayLoading={isPayLoading}
          payAmount={payAmount}
          payStatus={payStatus}
          payError={payError}
          payAmountError={payAmountError}
          onPayAmountChange={(v): void => {
            setPayAmount(v);
            setPayStatus("idle");
            setPayError(null);
          }}
          onPay={(): void => {
            void handlePay();
          }}
        />

        {isCreator && (
          <>
            <hr
              style={{
                border: 0,
                borderTop: `1px solid ${COLORS.border}`,
                margin: "var(--space-xl) 0",
              }}
            />
            <EarningsSection
              earnings={earnings}
              isWithdrawPending={isWithdrawPending}
              withdrawStatus={withdrawStatus}
              showWithdrawConfirm={showWithdrawConfirm}
              withdrawActionError={withdrawActionError}
              onWithdrawRequest={(): void => {
                setShowWithdrawConfirm(true);
              }}
              onWithdrawCancel={(): void => {
                setShowWithdrawConfirm(false);
              }}
              onWithdrawConfirm={(): void => {
                void handleWithdraw();
              }}
            />

            <hr
              style={{
                border: 0,
                borderTop: `1px solid ${COLORS.border}`,
                margin: "var(--space-xl) 0",
              }}
            />
            <RoyaltySection
              isRoyaltyLoading={isRoyaltyLoading}
              royaltyBps={royaltyBps}
              royaltyStatus={royaltyStatus}
              royaltyError={royaltyError}
              royaltyBpsError={royaltyBpsError}
              onRoyaltyBpsChange={(v): void => {
                setRoyaltyBps(v);
                setRoyaltyStatus("idle");
                setRoyaltyError(null);
              }}
              onSetRoyalty={(): void => {
                void handleSetRoyalty();
              }}
            />
          </>
        )}

        {fetchError !== null && (
          <Alert variant="error">{humanizeError(fetchError)}</Alert>
        )}
        {earningsError !== null && (
          <Alert variant="error">{humanizeError(earningsError)}</Alert>
        )}
        {withdrawError !== null && (
          <Alert variant="error">{humanizeError(withdrawError)}</Alert>
        )}
      </ConnectedGuard>
    </Card>
  );
}

const ethersZero: Address = "0x0000000000000000000000000000000000000000";

export default PaymentPanel;
