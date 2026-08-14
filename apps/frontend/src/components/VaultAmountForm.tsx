import {
  useCallback,
  type ReactElement,
} from "react";
import { useConfirmTimer } from "../hooks/useConfirmTimer.js";
import {
  formatTokenAmount,
  humanizeError,
} from "../utils/format.js";
import {
  Button,
  COLORS,
  ErrorAlert,
  Input,
  MonoLabel,
  Spinner,
  amountInputStyle,
  textDimMediumNoWrap,
} from "./ui.js";
import { useVaultWrite, type VaultWriteKind } from "../hooks/useVaultWrite.js";

interface VaultAmountFormProps {
  tokenId: bigint;
  onSuccess?: () => void;
  kind: VaultWriteKind;
  variant?: "default" | "warning";
}

export function VaultAmountForm({
  tokenId,
  onSuccess,
  kind,
  variant = "default",
}: VaultAmountFormProps): ReactElement | null {
  const { balanceRef, handleSuccess } = useConfirmTimer(onSuccess);
  const {
    amount,
    setAmount,
    isSubmitting,
    isValid,
    error,
    handleSubmit,
    vaultData: vd,
  } = useVaultWrite(kind, tokenId, handleSuccess);

  const isDeposit = kind === "deposit";
  const label = isDeposit ? "Deposit" : "Withdraw";

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

  const extraError = useCallback(
    (value: string) => {
      if (value.trim() !== "" && Number(value) === 0)
        return `${label} must be greater than zero.`;
      return null;
    },
    [label],
  );

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
      {isDeposit ? (
        <span ref={balanceRef} style={textDimMediumNoWrap}>
          Vault: <MonoLabel>{balanceLabel}</MonoLabel>
        </span>
      ) : (
        <span style={textDimMediumNoWrap}>Withdraw from vault</span>
      )}
      <Input
        type="text"
        inputMode="decimal"
        placeholder="0.0"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        disabled={isSubmitting || (!isDeposit && vd.isLoading)}
        aria-label={`${label} amount in 0G`}
        aria-invalid={error !== null}
        aria-describedby={error !== null ? "vault-amount-error" : undefined}
        style={amountInputStyle}
      />
      {!isDeposit && (
        <span
          ref={balanceRef}
          style={{ color: COLORS.textDim, fontSize: "var(--text-xs)" }}
        >
          available: <MonoLabel>{balanceLabel}</MonoLabel>
        </span>
      )}
      {(error ?? extraError(amount)) !== null && (
        <p
          id="vault-amount-error"
          className="field-error"
          style={{ width: "100%" }}
        >
          {error ?? extraError(amount)}
        </p>
      )}
      <Button
        variant={isDeposit ? "primary" : "secondary"}
        disabled={!isValid || isSubmitting || (!isDeposit && vd.isLoading)}
        onClick={() => void handleSubmit()}
        style={{
          fontSize: "var(--text-sm)",
          padding: "0.375rem 0.75rem",
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--space-xs)",
        }}
      >
        {isSubmitting ? (
          <>
            <Spinner size={14} /> {isDeposit ? "Depositing…" : "Withdrawing…"}
          </>
        ) : (
          label
        )}
      </Button>
    </div>
  );
}

export function DepositForm(
  props: Omit<VaultAmountFormProps, "kind">,
): ReactElement | null {
  return <VaultAmountForm {...props} kind="deposit" />;
}

export function WithdrawForm(
  props: Omit<VaultAmountFormProps, "kind">,
): ReactElement | null {
  return <VaultAmountForm {...props} kind="withdraw" />;
}
