import {
  useCallback,
  useMemo,
  useState,
  type FormEvent,
  type ReactElement,
} from "react";
import { useConfirmTimer } from "../hooks/useConfirmTimer.js";
import { useDeposit } from "../hooks/useDeposit.js";
import {
  formatTokenAmount,
  humanizeError,
  validateNumericInput,
} from "../utils/format.js";
import {
  Alert,
  Button,
  COLORS,
  Card,
  ErrorAlert,
  Input,
  MonoLabel,
  SectionTitle,
  Spinner,
  amountInputStyle,
  textDimMediumNoWrap,
} from "./ui.js";
import { useWithdraw } from "../hooks/useWithdraw.js";
import { useChainId, useWriteContract } from "wagmi";
import { toast } from "sonner";
import { AGENT_NFT_ABI, VAULT_ABI } from "@axiom/config/abis";
import {
  getAxiomAgentNftAddress,
  getAxiomStrategyVaultAddress,
} from "../abi/addresses.js";
import { isAddress } from "viem";

interface DepositFormProps {
  tokenId: bigint;
  onSuccess?: () => void;
  variant?: "default" | "warning";
}

export function DepositForm({
  tokenId,
  onSuccess,
  variant = "default",
}: DepositFormProps): ReactElement | null {
  const { balanceRef, handleSuccess } = useConfirmTimer(onSuccess);

  const {
    depositAmount,
    setDepositAmount,
    isDepositing,
    isValidDeposit,
    handleDeposit,
    vaultData: vd,
  } = useDeposit(tokenId, handleSuccess);

  const depositError = useMemo(() => {
    const err = validateNumericInput(depositAmount, {
      label: "Deposit",
      min: 0,
      allowDecimals: true,
      maxDecimals: 18,
      max: 1e12,
    });
    if (err !== null) return err;
    if (depositAmount.trim() !== "" && Number(depositAmount) === 0)
      return "Deposit must be greater than zero.";
    return null;
  }, [depositAmount]);

  if (vd.error !== null) {
    return (
      <ErrorAlert
        message={humanizeError(vd.error)}
        onRetry={() => void vd.refetch()}
      />
    );
  }

  const balanceLabel =
    vd.isLoading || vd.depositsWei === undefined
      ? "—"
      : `${formatTokenAmount(vd.depositsWei)} 0G`;
  const isWarning =
    variant === "warning" && !vd.isLoading && vd.depositsWei === 0n;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-sm)",
        marginBottom: "var(--space-lg)",
        fontSize: "var(--text-sm)",
        flexWrap: "wrap",
        padding: isWarning ? "var(--space-sm) var(--space-md)" : undefined,
        background: isWarning ? COLORS.warningBg : "transparent",
        borderRadius: isWarning ? "var(--radius-md)" : undefined,
        border: isWarning ? `1px solid ${COLORS.warningBorder}` : "none",
      }}
    >
      <span ref={balanceRef} style={textDimMediumNoWrap}>
        Vault: <MonoLabel>{balanceLabel}</MonoLabel>
      </span>
      <Input
        type="text"
        inputMode="decimal"
        placeholder="0.0"
        value={depositAmount}
        onChange={(e) => setDepositAmount(e.target.value)}
        disabled={isDepositing}
        aria-label="Deposit amount in 0G"
        aria-invalid={depositError !== null}
        aria-describedby="deposit-error"
        style={amountInputStyle}
      />
      {depositError !== null && (
        <p id="deposit-error" className="field-error" style={{ width: "100%" }}>
          {depositError}
        </p>
      )}
      <Button
        variant="primary"
        disabled={!isValidDeposit || isDepositing || depositError !== null}
        onClick={handleDeposit}
        style={{
          fontSize: "var(--text-sm)",
          padding: "0.375rem 0.75rem",
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--space-xs)",
        }}
      >
        {isDepositing ? (
          <>
            <Spinner size={14} /> Depositing…
          </>
        ) : (
          "Deposit"
        )}
      </Button>
    </div>
  );
}

interface WithdrawFormProps {
  tokenId: bigint;
  onSuccess?: () => void;
}

export function WithdrawForm({
  tokenId,
  onSuccess,
}: WithdrawFormProps): ReactElement | null {
  const { balanceRef, handleSuccess } = useConfirmTimer(onSuccess);

  const {
    withdrawAmount,
    setWithdrawAmount,
    isWithdrawing,
    isValidWithdraw,
    withdrawError,
    handleWithdraw,
    vaultData: vd,
  } = useWithdraw(tokenId, handleSuccess);

  const availableLabel =
    vd.isLoading || vd.depositsWei === undefined
      ? "—"
      : `${formatTokenAmount(vd.depositsWei)} 0G`;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-sm)",
        marginBottom: "var(--space-lg)",
        fontSize: "var(--text-sm)",
        flexWrap: "wrap",
      }}
    >
      <span style={textDimMediumNoWrap}>Withdraw from vault</span>
      <Input
        type="text"
        inputMode="decimal"
        placeholder="0.0"
        value={withdrawAmount}
        onChange={(e) => setWithdrawAmount(e.target.value)}
        disabled={isWithdrawing || vd.isLoading}
        aria-label="Withdraw amount in 0G"
        aria-invalid={withdrawError !== null}
        style={amountInputStyle}
      />
      <span
        ref={balanceRef}
        style={{ color: COLORS.textDim, fontSize: "var(--text-xs)" }}
      >
        available: <MonoLabel>{availableLabel}</MonoLabel>
      </span>
      {withdrawError !== null && (
        <p className="field-error" style={{ width: "100%" }}>
          {withdrawError}
        </p>
      )}
      <Button
        variant="secondary"
        disabled={!isValidWithdraw || isWithdrawing || vd.isLoading}
        onClick={() => void handleWithdraw()}
        style={{ fontSize: "var(--text-sm)", padding: "0.375rem 0.75rem" }}
      >
        {isWithdrawing ? (
          <>
            <Spinner size={14} /> Withdrawing…
          </>
        ) : (
          "Withdraw"
        )}
      </Button>
    </div>
  );
}

const vaultAbi = VAULT_ABI;

export function StrategyPanel({ tokenId }: { tokenId: bigint }): ReactElement {
  const chainId = useChainId();
  const vaultAddr = getAxiomStrategyVaultAddress(chainId);
  const { writeContractAsync, isPending } = useWriteContract();
  const [strategyRoot, setStrategyRoot] = useState("");
  const [dailyLimit, setDailyLimit] = useState("1000000000000000");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);
      const root = strategyRoot.trim();
      if (!root.startsWith("0x") || root.length !== 66) {
        setError("Strategy root must be a 32-byte hex string (0x…).");
        return;
      }
      try {
        await writeContractAsync({
          address: vaultAddr,
          abi: vaultAbi,
          functionName: "setStrategy",
          args: [tokenId, root as `0x${string}`, BigInt(dailyLimit), 0n],
        });
        toast.success("Strategy bound on vault");
        setStrategyRoot("");
      } catch (err) {
        setError(humanizeError(err));
      }
    },
    [strategyRoot, dailyLimit, writeContractAsync, vaultAddr, tokenId],
  );

  return (
    <Card style={{ marginBottom: "var(--space-xl)" }}>
      <SectionTitle>Bind strategy</SectionTitle>
      <p
        style={{
          fontSize: "var(--text-sm)",
          color: COLORS.textMuted,
          marginTop: 0,
        }}
      >
        Root from your 0G upload + daily spend limit (wei).
      </p>
      <form onSubmit={(e) => void onSubmit(e)}>
        <label
          style={{
            display: "block",
            fontSize: "var(--text-sm)",
            marginBottom: 6,
          }}
        >
          Strategy root (bytes32)
        </label>
        <Input
          value={strategyRoot}
          onChange={(e) => setStrategyRoot(e.target.value)}
          placeholder="0x…"
          style={{ width: "100%", marginBottom: "var(--space-md)" }}
        />
        <label
          style={{
            display: "block",
            fontSize: "var(--text-sm)",
            marginBottom: 6,
          }}
        >
          Daily limit (wei)
        </label>
        <Input
          value={dailyLimit}
          onChange={(e) => setDailyLimit(e.target.value)}
          style={{ width: "100%", marginBottom: "var(--space-md)" }}
        />
        {error ? (
          <Alert variant="error" style={{ marginBottom: "var(--space-md)" }}>
            {error}
          </Alert>
        ) : null}
        <Button variant="primary" type="submit" disabled={isPending}>
          {isPending ? "Confirming…" : "Set strategy"}
        </Button>
      </form>
    </Card>
  );
}

const agentAbi = AGENT_NFT_ABI;

export function DelegatePanel({ tokenId }: { tokenId: bigint }): ReactElement {
  const chainId = useChainId();
  const nftAddr = getAxiomAgentNftAddress(chainId);
  const { writeContractAsync, isPending } = useWriteContract();
  const [delegate, setDelegate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const authorize = useCallback(async () => {
    setError(null);
    const addr = delegate.trim();
    if (!isAddress(addr)) {
      setError("Enter a valid delegate address.");
      return;
    }
    try {
      await writeContractAsync({
        address: nftAddr,
        abi: agentAbi,
        functionName: "authorizeUsage",
        args: [tokenId, addr],
      });
      toast.success("Delegate authorized");
      setDelegate("");
    } catch (err) {
      setError(humanizeError(err));
    }
  }, [delegate, writeContractAsync, nftAddr, tokenId]);

  return (
    <Card style={{ marginBottom: "var(--space-xl)" }}>
      <SectionTitle>Delegate access</SectionTitle>
      <p
        style={{
          fontSize: "var(--text-sm)",
          color: COLORS.textMuted,
          marginTop: 0,
        }}
      >
        Allow another wallet to act on this agent.
      </p>
      <Input
        value={delegate}
        onChange={(e) => setDelegate(e.target.value)}
        placeholder="0x delegate address"
        style={{ width: "100%", marginBottom: "var(--space-sm)" }}
      />
      {error ? (
        <Alert variant="error" style={{ marginBottom: "var(--space-sm)" }}>
          {error}
        </Alert>
      ) : null}
      <Button
        variant="primary"
        disabled={isPending}
        onClick={() => void authorize()}
      >
        {isPending ? "Confirming…" : "Authorize delegate"}
      </Button>
    </Card>
  );
}
