export const PLACEHOLDER = "\u2014";
const ELLIPSIS = "\u2026";

export function truncateHex(value: string, head = 10, tail = 6): string {
  if (value.length <= head + tail + 2) {
    return value;
  }
  return `${value.slice(0, head)}${ELLIPSIS}${value.slice(-tail)}`;
}

export function parseTokenId(raw: string | undefined): bigint | null {
  if (raw === undefined || raw === "") return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

export function humanizeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  if (
    lower.includes("user rejected") ||
    lower.includes("user denied") ||
    lower.includes("rejected the request")
  ) {
    return "Transaction cancelled — you rejected the request in your wallet.";
  }

  if (
    lower.includes("insufficient_balance") ||
    lower.includes("compute account has no balance") ||
    (lower.includes("insufficient balance") && lower.includes("compute"))
  ) {
    return "0G Compute is out of credits. Fund the compute account for AXIOM_COMPUTE_API_KEY, then retry.";
  }

  if (
    lower.includes("insufficient funds") ||
    lower.includes("exceeds the balance")
  ) {
    return "Insufficient balance to complete this transaction. Please add funds and try again.";
  }

  if (lower.includes("compute upstream")) {
    return "Compute is unavailable right now. Check backend compute keys and balance.";
  }

  if (
    lower.includes("gas required exceeds") ||
    lower.includes("cannot estimate gas")
  ) {
    return "Transaction would fail on-chain. Check your inputs and wallet balance.";
  }

  if (lower.includes("execution reverted") || lower.includes("revert")) {
    const reasonMatch =
      raw.match(/reason:\s*(.+?)(?:\n|$)/i) ??
      raw.match(/reverted with reason string '(.+?)'/i) ??
      raw.match(/error=\{[^}]*"message":"([^"]+)"/i);
    const reason = reasonMatch?.[1]?.trim();
    return reason
      ? `Transaction reverted: ${reason}`
      : "Transaction reverted by the contract. Check your inputs and permissions.";
  }

  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("econnrefused") ||
    lower.includes("network request failed") ||
    lower.includes("load failed")
  ) {
    return "Network error — check your internet connection and try again.";
  }

  if (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("aborterror")
  ) {
    return "Request timed out. The network may be congested — please try again.";
  }

  if (lower.includes("nonce") && lower.includes("too low")) {
    return "Transaction nonce conflict. Please wait for pending transactions to confirm.";
  }

  const capped = raw.length > 200 ? `${raw.slice(0, 200)}…` : raw;
  return capped;
}

export function validateNumericInput(
  value: string,
  opts: {
    label?: string;
    min?: number;
    max?: number;
    allowDecimals?: boolean;
    maxDecimals?: number;
  } = {},
): string | null {
  const {
    label = "Value",
    min = 0,
    max,
    allowDecimals = true,
    maxDecimals = 18,
  } = opts;
  const trimmed = value.trim();
  if (trimmed === "") return null; // empty is not an error (handled by required)

  if (/[eE]/.test(trimmed)) {
    return `${label} cannot use scientific notation.`;
  }

  const num = Number(trimmed);
  if (Number.isNaN(num)) {
    return `${label} must be a valid number.`;
  }
  if (!Number.isFinite(num)) {
    return `${label} must be a finite number.`;
  }
  if (num < min) {
    return `${label} must be at least ${min}.`;
  }
  if (max !== undefined && num > max) {
    return `${label} must be at most ${max}.`;
  }

  if (!allowDecimals && trimmed.includes(".")) {
    return `${label} must be a whole number.`;
  }

  if (allowDecimals && trimmed.includes(".")) {
    const decimals = trimmed.split(".")[1]?.length ?? 0;
    if (decimals > maxDecimals) {
      return `${label} has too many decimal places (max ${maxDecimals}).`;
    }
  }

  return null;
}
