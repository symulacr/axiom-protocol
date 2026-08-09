import {
	useCallback,
	useEffect,
	useState,
	type ChangeEvent,
	type FormEvent,
	type ReactElement,
} from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
	useAccount,
	useChainId,
	useReadContracts,
	useWaitForTransactionReceipt,
	useWalletClient,
} from "wagmi";
import { formatTokenAmount, humanizeError } from "../utils/format.js";
import { AGENT_NFT_ABI } from "@axiom/config/abis";
import { TRANSFER_TOPIC, ZERO_DATA_ROOT } from "@axiom/config/constants";
import { getAxiomAgentNftAddress } from "../abi/addresses.js";
import { useMintWizard } from "../hooks/useMintWizard.js";
import { COLORS, Card, Button, Alert, PageHeader, Input } from "./ui.js";

const agentNftAbi = AGENT_NFT_ABI;

type MintFormProps = {
	provider?: `0x${string}` | undefined;
	/** Hide page chrome when embedded in a modal */
	compact?: boolean;
	onClose?: () => void;
};

/**
 * One-field mint: name only.
 * Auto-builds strategy payload → registers dataHash with oracle → wallet signs mint fee.
 */
export function MintForm({
	provider,
	compact = false,
	onClose,
}: MintFormProps): ReactElement {
	const { address, isConnected } = useAccount();
	const chainId = useChainId();
	const navigate = useNavigate();
	const { data: walletClient } = useWalletClient();
	const wizard = useMintWizard();
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [mintPending, setMintPending] = useState(false);
	const [pendingHash, setPendingHash] = useState<`0x${string}` | null>(null);
	const [phase, setPhase] = useState<"idle" | "oracle" | "chain" | "confirm">(
		"idle",
	);

	const feeQuery = useReadContracts({
		allowFailure: false,
		contracts: [
			{
				address: getAxiomAgentNftAddress(chainId),
				abi: agentNftAbi,
				functionName: "mintFee",
				args: undefined,
			},
		],
		query: {
			enabled: Boolean(getAxiomAgentNftAddress(chainId)),
		},
	});

	const mintFeeWei: bigint | undefined = feeQuery.data?.[0] as
		| bigint
		| undefined;
	const feeError = (feeQuery.error as Error | null) ?? null;
	const owner = address;

	const receiptQuery = useWaitForTransactionReceipt({
		hash: pendingHash ?? undefined,
		query: { enabled: pendingHash !== null },
	});

	useEffect(() => {
		if (receiptQuery.data && pendingHash) {
			const mintLog = receiptQuery.data.logs.find(
				(log) =>
					log.topics[0] === TRANSFER_TOPIC && log.topics[1] === ZERO_DATA_ROOT,
			);
			setPendingHash(null);
			setPhase("idle");
			if (mintLog?.topics[3]) {
				const tokenId = BigInt(mintLog.topics[3]).toString();
				toast.success(`Agent #${tokenId} minted`);
				onClose?.();
				navigate(`/agents/${tokenId}`);
			} else {
				onClose?.();
				navigate("/app");
			}
		}
	}, [receiptQuery.data, pendingHash, navigate, onClose]);

	const onMintChain = useCallback(
		async (dataHash: `0x${string}`): Promise<void> => {
			setPhase("chain");
			const hash = await wizard.chainMint(dataHash);
			setPhase("confirm");
			toast.success("Mint submitted — confirming on-chain…");
			setPendingHash(hash);
		},
		[wizard],
	);

	/** Single path: name → auto payload → oracle → wallet mint */
	const onCompleteMint = useCallback(
		async (e?: FormEvent): Promise<void> => {
			e?.preventDefault();
			if (!wizard.agentName.trim()) return;
			if (!isConnected || !owner || !walletClient) {
				setSubmitError("Connect a wallet to mint.");
				return;
			}
			if (mintFeeWei === undefined) {
				setSubmitError("Mint fee still loading — try again in a moment.");
				return;
			}
			setSubmitError(null);
			setMintPending(true);
			try {
				setPhase("oracle");
				const hash = await wizard.registerOracle(wizard.agentName);
				await onMintChain(hash);
			} catch (err) {
				setSubmitError(humanizeError(err));
				setPhase("idle");
			} finally {
				setMintPending(false);
			}
		},
		[wizard, isConnected, owner, walletClient, mintFeeWei, onMintChain],
	);

	const onNameChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>): void => {
			wizard.setAgentName(event.target.value);
			setSubmitError(null);
		},
		[wizard],
	);

	const busy =
		mintPending ||
		wizard.busy ||
		pendingHash !== null ||
		phase === "oracle" ||
		phase === "chain" ||
		phase === "confirm";

	const phaseLabel =
		phase === "oracle"
			? "Registering with oracle…"
			: phase === "chain"
				? "Preparing mint transaction…"
				: phase === "confirm" || pendingHash
					? "Confirm in wallet / on-chain…"
					: null;

	return (
		<div
			style={{
				maxWidth: compact ? "100%" : "36rem",
				margin: compact ? 0 : "0 auto",
			}}
		>
			{!compact && <PageHeader title="Mint agent" />}
			{compact && (
				<p
					style={{
						margin: "0 0 var(--space-md)",
						fontSize: "var(--text-sm)",
						color: COLORS.textMuted,
					}}
				>
					Name only — default payload + oracle, then wallet pays the 0G mint
					fee.
				</p>
			)}

			<Card>
				<form onSubmit={(e) => void onCompleteMint(e)}>
					<label
						htmlFor="agent-name"
						style={{
							display: "block",
							fontWeight: "var(--fw-medium)",
							fontSize: "var(--text-sm)",
							color: COLORS.textPrimary,
						}}
					>
						Agent name
					</label>
					<Input
						id="agent-name"
						value={wizard.agentName}
						onChange={onNameChange}
						placeholder="e.g. Scout"
						maxLength={100}
						autoFocus
						disabled={busy}
						style={{ width: "100%", marginTop: 8 }}
						required
						aria-describedby="mint-name-help"
					/>
					<p
						id="mint-name-help"
						style={{
							margin: "8px 0 0",
							fontSize: "var(--text-xs)",
							color: COLORS.textMuted,
							lineHeight: 1.5,
						}}
					>
						No JSON to paste. Connect wallet, then mint.
					</p>

					<div
						className="surface-lcd"
						style={{
							marginTop: "var(--space-lg)",
							padding: "var(--space-md)",
							fontSize: "var(--text-xs)",
						}}
					>
						<div style={{ opacity: 0.75, marginBottom: 4 }}>Mint fee</div>
						<div
							style={{ fontSize: "var(--text-sm)", color: "var(--c-phosphor)" }}
						>
							{mintFeeWei === undefined ? (
								"Loading…"
							) : (
								<>
									{formatTokenAmount(mintFeeWei)} 0G
									{feeError ? (
										<span style={{ color: COLORS.warning }}>
											{" "}
											({humanizeError(feeError)})
										</span>
									) : null}
								</>
							)}
						</div>
					</div>

					{phaseLabel ? (
						<Alert variant="info" style={{ marginTop: "var(--space-md)" }}>
							{phaseLabel}
						</Alert>
					) : null}

					{wizard.error || submitError ? (
						<Alert
							variant="error"
							className="axiom-error-shake"
							style={{ marginTop: "var(--space-md)" }}
						>
							{submitError ?? wizard.error}
						</Alert>
					) : null}

					<Button
						variant="primary"
						type="submit"
						disabled={
							busy ||
							wizard.agentName.trim().length === 0 ||
							!isConnected ||
							mintFeeWei === undefined
						}
						style={{ width: "100%", marginTop: "var(--space-xl)" }}
					>
						{busy
							? (phaseLabel ?? "Working…")
							: !isConnected
								? "Connect wallet to mint"
								: "Mint agent"}
					</Button>

					{provider !== undefined && (
						<p
							style={{
								fontSize: "var(--text-xs)",
								color: COLORS.textDim,
								marginTop: 12,
								marginBottom: 0,
							}}
						>
							Provider hint: {provider.slice(0, 10)}…
						</p>
					)}
				</form>
			</Card>
		</div>
	);
}

export default MintForm;
