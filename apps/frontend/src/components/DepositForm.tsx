import { useEffect, useMemo, useRef, useCallback, type ReactElement } from "react";
import { formatEther } from "viem";
import { useDeposit } from "../hooks/useDeposit.js";
import { humanizeError, validateNumericInput } from "../utils/format.js";
import { COLORS, Button, Input, Spinner, MonoLabel, ErrorAlert } from "./ui.js";

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
  const balanceRef = useRef<HTMLSpanElement>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => {
    if (confirmTimer.current !== undefined) clearTimeout(confirmTimer.current);
  }, []);

  const handleSuccess = useCallback(() => {
    const el = balanceRef.current;
    if (el) {
      el.classList.add("axiom-confirm");
      if (confirmTimer.current !== undefined) clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(
        () => el.classList.remove("axiom-confirm"),
        1500,
      );
    }
    onSuccess?.();
  }, [onSuccess]);

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

  if (vd.isLoading) return null;
  if (vd.error !== null) {
    return (
      <ErrorAlert
        message={humanizeError(vd.error)}
        onRetry={() => void vd.refetch()}
      />
    );
  }
  if (vd.depositsWei === undefined) return null;

  const isWarning = variant === "warning" && vd.depositsWei === 0n;

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
      <span
        ref={balanceRef}
        style={{
          color: COLORS.textDim,
          fontWeight: "var(--fw-medium)",
          whiteSpace: "nowrap",
        }}
      >
        Vault: <MonoLabel>{formatEther(vd.depositsWei)} 0G</MonoLabel>
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
        style={{ flex: "0 1 10rem", fontSize: "var(--text-sm)" }}
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
