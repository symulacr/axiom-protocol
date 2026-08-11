import {
	useCallback,
	useEffect,
	useMemo,
	useState,
	type ReactElement,
} from "react";
import { useChainId } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	getAxiomAgentNftAddress,
	getAxiomStrategyVaultAddress,
} from "../abi/addresses.js";
import { useVaultData } from "../hooks/useVaultData.js";
import { useAgents } from "../hooks/useAgents.js";
import {
	useOrchestratorTick,
	type TickResult,
} from "../hooks/useOrchestratorTick.js";
import {
	COLORS,
	Button,
	Card,
	SectionTitle,
	MonoLabel,
	Alert,
	getActionColor,
	DefinitionList,
	ConnectedGuard,
	Spinner,
} from "./ui.js";
import {
	PLACEHOLDER,
	humanizeError,
	formatTokenAmount,
} from "../utils/format.js";

function RawOutput({ raw }: { raw: string }): ReactElement {
	const [shown, setShown] = useState(false);
	useEffect(() => {
		const id = requestAnimationFrame(() => setShown(true));
		return () => cancelAnimationFrame(id);
	}, []);
	return (
		<div
			style={{
				display: "grid",
				gridTemplateRows: shown ? "1fr" : "0fr",
				opacity: shown ? 1 : 0,
				marginTop: 8,
				transition:
					"grid-template-rows 200ms var(--ease-out), opacity 200ms var(--ease-out)",
			}}
		>
			<pre
				style={{
					minHeight: 0,
					overflow: "hidden",
					padding: 12,
					background: COLORS.bg,
					border: `1px solid ${COLORS.border}`,
					borderRadius: "var(--radius-lg)",
					fontSize: "var(--text-xs)",
					whiteSpace: "pre-wrap",
					color: COLORS.textMuted,
				}}
			>
				{raw}
			</pre>
		</div>
	);
}

type ExecutePanelProps = {
	tokenId?: bigint;
};

export function ExecutePanel({
	tokenId: tokenIdProp,
}: ExecutePanelProps): ReactElement {
	const chainId = useChainId();
	const { agents, isLoading: agentsLoading } = useAgents();
	const {
		tick,
		tickStream,
		cancelTick,
		isLoading,
		isStreaming,
		streamedTokens,
		streamingError,
		error,
		resetStream,
	} = useOrchestratorTick();
	const [selectedId, setSelectedId] = useState<string>(() => {
		if (tokenIdProp) return tokenIdProp.toString();
		try {
			return localStorage.getItem("axiom:lastAgent") ?? "";
		} catch {
			return "";
		}
	});
	const [result, setResult] = useState<TickResult | null>(null);
	const [showRaw, setShowRaw] = useState(false);
	const [streamMode, setStreamMode] = useState(false);
	const [elapsedMs, setElapsedMs] = useState(0);
	const queryClient = useQueryClient();

	useEffect(() => {
		if (selectedId && !tokenIdProp) {
			try {
				localStorage.setItem("axiom:lastAgent", selectedId);
			} catch {
				void 0;
			}
		}
	}, [selectedId, tokenIdProp]);

	// Real progress: elapsed time since the tick request went out — no invented steps
	useEffect(() => {
		if (!isLoading) {
			setElapsedMs(0);
			return;
		}
		const start = Date.now();
		const interval = setInterval(() => {
			setElapsedMs(Date.now() - start);
		}, 500);
		return () => clearInterval(interval);
	}, [isLoading]);

	const locked = tokenIdProp !== undefined;
	const activeId = locked ? tokenIdProp.toString() : selectedId;
	const activeBigint = useMemo(() => {
		try {
			return activeId ? BigInt(activeId) : 0n;
		} catch (err) {
			console.warn("[ExecutePanel] Operation failed:", err);
			return 0n;
		}
	}, [activeId]);

	const vd = useVaultData(activeBigint);
	const isReady = !vd.isLoading && activeId !== "";
	const depositsWei = isReady ? vd.depositsWei : undefined;
	const hasFunds = (depositsWei ?? 0n) > 0n;

	const onExecute = useCallback(async (): Promise<void> => {
		if (!activeId) return;
		setResult(null);
		setShowRaw(false);
		resetStream();
		try {
			let res: TickResult;
			if (streamMode) {
				res = await tickStream(
					{
						vault: getAxiomStrategyVaultAddress(chainId),
						agentNft: getAxiomAgentNftAddress(chainId),
						agentTokenId: activeId,
					},
					{},
				);
			} else {
				res = await tick({
					vault: getAxiomStrategyVaultAddress(chainId),
					agentNft: getAxiomAgentNftAddress(chainId),
					agentTokenId: activeId,
				});
			}
			setResult(res);
			toast.success("Tick executed successfully");
			vd.refetch();
			// F13: keep the Stats tab from showing 30s-old numbers after a tick
			queryClient.invalidateQueries({ queryKey: ["performance", activeId] });
		} catch (err) {
			const msg = humanizeError(err);
			toast.error(`Strategy execution failed: ${msg}`);
		}
	}, [
		activeId,
		chainId,
		streamMode,
		tick,
		tickStream,
		resetStream,
		vd,
		queryClient,
	]);

	return (
		<ConnectedGuard>
			<Card
				style={{
					display: "flex",
					flexDirection: "column",
					gap: 16,
					position: "relative",
				}}
				aria-label="Execute strategy tick"
			>
				{!locked && (
					<label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
						<span
							style={{
								fontSize: "var(--text-sm)",
								fontWeight: "var(--fw-semibold)",
								color: COLORS.textPrimary,
							}}
						>
							Agent
						</span>
						<select
							value={selectedId}
							onChange={(e): void => setSelectedId(e.target.value)}
							style={{
								padding: "10px 14px",
								borderRadius: "var(--radius-md)",
								border: `1px solid ${COLORS.borderStrong}`,
								background: COLORS.bg,
								color: COLORS.text,
								fontSize: "var(--text-sm)",
								fontFamily: "inherit",
							}}
						>
							<option value="">Select an owned agent…</option>
							{agents.map((a) => (
								<option key={a.tokenId.toString()} value={a.tokenId.toString()}>
									Agent #{a.tokenId.toString()}
								</option>
							))}
						</select>
						{!agentsLoading && agents.length === 0 && (
							<p
								style={{
									margin: 0,
									fontSize: "var(--text-sm)",
									color: COLORS.textDim,
								}}
							>
								No agents found for the connected wallet.
							</p>
						)}
					</label>
				)}

				<p
					style={{
						margin: 0,
						fontSize: "var(--text-sm)",
						color: COLORS.textMuted,
					}}
				>
					Vault:{" "}
					<strong
						style={{
									color: COLORS.bronzeLight,
									fontWeight: "var(--fw-semibold)",
						}}
					>
						{depositsWei === undefined
										? PLACEHOLDER
							: `${formatTokenAmount(depositsWei)} 0G`}
					</strong>
				</p>

				<div
					style={{
						display: "flex",
						alignItems: "flex-start",
						flexDirection: "column",
						gap: 8,
					}}
				>
					<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
						<Button
							variant="primary"
							disabled={
								isLoading || activeId === "" || vd.isLoading || !hasFunds
							}
							title="This will consume gas to execute the strategy tick on-chain"
							onClick={(): void => {
								void onExecute();
							}}
						>
							{isLoading
								? isStreaming
									? "Streaming…"
									: "Running tick…"
								: "Execute Tick"}
						</Button>
						<label
							style={{
								display: "flex",
								alignItems: "center",
								gap: 6,
								fontSize: "var(--text-sm)",
								cursor: "pointer",
								color: COLORS.textMuted,
								userSelect: "none",
							}}
						>
							<input
								type="checkbox"
								checked={streamMode}
								onChange={(e): void => setStreamMode(e.target.checked)}
								disabled={isLoading}
								title="Stream live model output as it executes, instead of waiting for the full response"
							/>
							Stream
						</label>
					</div>
					{activeId !== "" &&
						!vd.isLoading &&
						vd.error === null &&
						!hasFunds && (
							<p
							style={{
									margin: 0,
								fontSize: "var(--text-xs)",
									color: COLORS.textDim,
							}}
						>
								Vault balance is 0 — fund it before running a tick.
							</p>
					)}
					{isStreaming && (
						<Button variant="secondary" onClick={cancelTick}>
							Cancel
						</Button>
					)}
				</div>

				{isLoading && (
					<div
						style={{
							padding: "12px",
							background: COLORS.bg,
							border: `1px solid ${COLORS.border}`,
							borderRadius: "var(--radius-lg)",
							display: "flex",
							flexDirection: "column",
							gap: "8px",
							animation: "axiom-fade-in 200ms var(--ease-out)",
						}}
					>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: "8px",
								marginBottom: "4px",
							}}
						>
							<Spinner
								size={12}
								style={{
									borderTopColor: COLORS.bronzeLight,
									animation: "axiom-spin 0.6s linear infinite",
								}}
							/>
							<span
								style={{
									fontSize: "var(--text-xs)",
									fontWeight: "var(--fw-semibold)",
									color: COLORS.textMuted,
									textTransform: "uppercase",
									letterSpacing: "0.05em",
								}}
							>
								Enclave Pipeline Execution
							</span>
						</div>
								<div
									style={{
										display: "flex",
										alignItems: "center",
										gap: "8px",
										fontSize: "var(--text-sm)",
									}}
								>
							<span style={{ color: COLORS.bronzeLight }}>
								{isStreaming ? "Receiving live output…" : "Executing tick…"}
							</span>
									<span
										style={{
									color: COLORS.textDim,
									fontVariantNumeric: "tabular-nums",
										}}
									>
								{(elapsedMs / 1000).toFixed(1)}s
									</span>
								</div>
					</div>
				)}

				{error !== null && (
					<Alert variant="error">{humanizeError(error)}</Alert>
				)}

				{streamingError !== null && (
					<Alert variant="error">{humanizeError(streamingError)}</Alert>
				)}

				{streamedTokens !== "" && (
					<div>
						<SectionTitle>Live Stream Output</SectionTitle>
						<pre
							style={{
								marginTop: 8,
								padding: 12,
								background: COLORS.bg,
								border: `1px solid ${COLORS.border}`,
								borderRadius: "var(--radius-lg)",
								fontSize: "var(--text-xs)",
								overflowX: "auto",
								whiteSpace: "pre-wrap",
								color: COLORS.textMuted,
								maxHeight: 200,
								opacity: isStreaming ? 0.9 : 0.7,
							}}
						>
							{streamedTokens}
							{isStreaming && (
								<span
									style={{
										display: "inline-block",
										marginLeft: 2,
										color: COLORS.bronzeLight,
									}}
								>
									|
								</span>
							)}
						</pre>
					</div>
				)}

				{result !== null && (
					<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
						<div>
							<SectionTitle>Recommendation</SectionTitle>
							<p style={{ margin: 0, fontSize: "var(--text-base)" }}>
								<strong
									style={{
										color: getActionColor(result.recommendation.action),
										fontSize: "var(--text-base)",
										letterSpacing: "0.02em",
									}}
								>
									{result.recommendation.action.toUpperCase()}
								</strong>
								{result.recommendation.amount !== undefined && (
									<span style={{ color: COLORS.textMuted }}>
										{" "}
										· amount: {result.recommendation.amount}
									</span>
								)}
							</p>
							<p
								style={{
									margin: "6px 0 0",
									fontSize: "var(--text-sm)",
									color: COLORS.textMuted,
									fontWeight: "var(--fw-light)",
									lineHeight: 1.6,
								}}
							>
								{result.recommendation.reason}
							</p>
						</div>

						<div>
							<Button
								variant="ghost"
								onClick={(): void => setShowRaw((v) => !v)}
								style={{
									fontSize: "var(--text-xs)",
									color: COLORS.bronzeLight,
									padding: 0,
								}}
							>
								{showRaw ? "▼ Hide" : "▶ Show"} raw model output
							</Button>
							{showRaw && <RawOutput raw={result.rawModelOutput} />}
						</div>

						{result.execution !== undefined && (
							<div>
								<SectionTitle>On-chain Execution</SectionTitle>
								<DefinitionList
									labelWidth="100px"
									items={[
										{
											term: "Success",
											detail: result.execution.success ? (
												<span
													style={{
														color: COLORS.success,
														fontWeight: "var(--fw-semibold)",
													}}
												>
													yes
												</span>
											) : (
												<span
													style={{
														color: COLORS.danger,
														fontWeight: "var(--fw-semibold)",
													}}
												>
													no
												</span>
											),
										},
										{
											term: "Action",
											detail: result.execution.action,
											detailStyle: { color: COLORS.text },
										},
										{
											term: "Target",
											detail: (
												<MonoLabel style={{ fontSize: "var(--text-xs)" }}>
													{result.execution.target}
												</MonoLabel>
											),
										},
										{
											term: "Tx Hash",
											detail: (
												<MonoLabel style={{ fontSize: "var(--text-xs)" }}>
													{result.execution.txHash}
												</MonoLabel>
											),
										},
										...(result.execution.gasUsed !== undefined
											? [
													{
														term: "Gas Used",
														detail: String(result.execution.gasUsed),
														detailStyle: { color: COLORS.text },
													},
												]
											: []),
									]}
								/>
							</div>
						)}

						<p
							style={{
								fontSize: "var(--text-xs)",
								color: COLORS.textDim,
								margin: 0,
							}}
						>
							Completed in {result.durationMs} ms
						</p>
					</div>
				)}
			</Card>
		</ConnectedGuard>
	);
}
