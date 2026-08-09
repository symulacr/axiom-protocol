import { useCallback, useState } from "react";
import { useChainId, useWalletClient } from "wagmi";
import { toast } from "sonner";
import { apiFetch, type EncodeResponse } from "../utils/apiFetch.js";
import {
	errorRefString,
	humanizeError,
	validateNumericInput,
} from "../utils/format.js";
import { useVaultData } from "./useVaultData.js";

export function useWithdraw(tokenId: bigint, onSuccess?: () => void) {
	const chainId = useChainId();
	const vd = useVaultData(tokenId);
	const { data: walletClient } = useWalletClient();
	const [withdrawAmount, setWithdrawAmount] = useState("");
	const [isWithdrawing, setIsWithdrawing] = useState(false);

	const withdrawError = validateNumericInput(withdrawAmount, {
		label: "Withdraw",
		min: 0,
		allowDecimals: true,
		maxDecimals: 18,
		max: 1e12,
	});

	const handleWithdraw = useCallback(async () => {
		if (!withdrawAmount.trim() || withdrawError || !walletClient) return;
		setIsWithdrawing(true);
		try {
			const encoded = await apiFetch<EncodeResponse>(
				`/v1/agents/${tokenId.toString()}/withdraw`,
				{
					method: "POST",
					body: JSON.stringify({ amount: withdrawAmount.trim() }),
				},
			);
			const hash = await walletClient.sendTransaction({
				to: encoded.to,
				data: encoded.data,
				value: BigInt(encoded.value || "0"),
				chain: walletClient.chain,
			});
			toast.success(`Withdraw submitted (${hash.slice(0, 10)}…)`);
			setWithdrawAmount("");
			await vd.refetch();
			onSuccess?.();
		} catch (err) {
			const refStr = errorRefString(err);
			toast.error(
				humanizeError(err),
				refStr ? { description: refStr } : undefined,
			);
		} finally {
			setIsWithdrawing(false);
		}
	}, [
		withdrawAmount,
		withdrawError,
		walletClient,
		tokenId,
		vd,
		onSuccess,
		chainId,
	]);

	const isValidWithdraw =
		withdrawAmount.trim() !== "" &&
		!withdrawError &&
		Number(withdrawAmount) > 0;

	return {
		withdrawAmount,
		setWithdrawAmount,
		isWithdrawing,
		isValidWithdraw,
		withdrawError,
		handleWithdraw,
		vaultData: vd,
	};
}
