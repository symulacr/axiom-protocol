interface TickPayload {
	tokenId: string;
	action: string;
	amount: number | null;
	reason: string;
	durationMs: number | null;
	executionSuccess: boolean | null;
	vaultBalance: string;
}

interface TransferPayload {
	tokenId: string;
	from: string;
	to: string;
}

interface DepositedPayload {
	tokenId: string;
	from: string;
	amount: string;
}

interface WithdrawnPayload {
	tokenId: string;
	to: string;
	amount: string;
}

interface StrategySetPayload {
	tokenId: string;
	strategyRoot: string;
	dailyLimit: string;
}

interface ExecutedPayload {
	tokenId: string;
	actionHash: string;
	target: string;
	value: string;
}

type EventPayload =
	| TickPayload
	| TransferPayload
	| DepositedPayload
	| WithdrawnPayload
	| StrategySetPayload
	| ExecutedPayload
	| Record<string, unknown>;

export type StoredEventPayload = EventPayload;

export function payloadField(
	payload: unknown,
	key: string,
): string | undefined {
	if (payload && typeof payload === "object" && key in payload) {
		return String((payload as Record<string, unknown>)[key]);
	}
	return undefined;
}

export function payloadNumber(
	payload: unknown,
	key: string,
): number | undefined {
	if (payload && typeof payload === "object" && key in payload) {
		const val = (payload as Record<string, unknown>)[key];
		if (val === undefined || val === null) return undefined;
		const n = Number(val);
		return Number.isFinite(n) ? n : undefined;
	}
	return undefined;
}
