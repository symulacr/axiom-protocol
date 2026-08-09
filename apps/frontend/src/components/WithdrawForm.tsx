import { useEffect, useRef, useCallback, type ReactElement } from "react";
import { useWithdraw } from "../hooks/useWithdraw.js";
import { formatTokenAmount } from "../utils/format.js";
import { COLORS, Button, Input, Spinner, MonoLabel } from "./ui.js";

interface WithdrawFormProps {
	tokenId: bigint;
	onSuccess?: () => void;
}

export function WithdrawForm({
	tokenId,
	onSuccess,
}: WithdrawFormProps): ReactElement | null {
	const balanceRef = useRef<HTMLSpanElement>(null);
	const confirmTimer = useRef<ReturnType<typeof setTimeout>>();

	useEffect(
		() => () => {
			if (confirmTimer.current !== undefined)
				clearTimeout(confirmTimer.current);
		},
		[],
	);

	const handleSuccess = useCallback(() => {
		const el = balanceRef.current;
		if (el) {
			el.classList.add("axiom-confirm");
			if (confirmTimer.current !== undefined)
				clearTimeout(confirmTimer.current);
			confirmTimer.current = setTimeout(
				() => el.classList.remove("axiom-confirm"),
				1500,
			);
		}
		onSuccess?.();
	}, [onSuccess]);

	const {
		withdrawAmount,
		setWithdrawAmount,
		isWithdrawing,
		isValidWithdraw,
		withdrawError,
		handleWithdraw,
		vaultData: vd,
	} = useWithdraw(tokenId, handleSuccess);

	if (vd.isLoading || vd.depositsWei === undefined) return null;

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
			<span
				style={{
					color: COLORS.textDim,
					fontWeight: "var(--fw-medium)",
					whiteSpace: "nowrap",
				}}
			>
				Withdraw from vault
			</span>
			<Input
				type="text"
				inputMode="decimal"
				placeholder="0.0"
				value={withdrawAmount}
				onChange={(e) => setWithdrawAmount(e.target.value)}
				disabled={isWithdrawing}
				aria-label="Withdraw amount in 0G"
				aria-invalid={withdrawError !== null}
				style={{ flex: "0 1 10rem", fontSize: "var(--text-sm)" }}
			/>
			<span
				ref={balanceRef}
				style={{ color: COLORS.textDim, fontSize: "var(--text-xs)" }}
			>
				available: <MonoLabel>{formatTokenAmount(vd.depositsWei)} 0G</MonoLabel>
			</span>
			{withdrawError !== null && (
				<p className="field-error" style={{ width: "100%" }}>
					{withdrawError}
				</p>
			)}
			<Button
				variant="secondary"
				disabled={!isValidWithdraw || isWithdrawing}
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
