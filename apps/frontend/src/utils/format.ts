import { formatUnits, toHex } from "viem";
import { resolveBlockExplorerUrl } from "@axiom/config/networks";

const ELLIPSIS = "\u2026";

/** Canonical block-explorer tx URL for the active chain. */
export function explorerTxUrl(chainId: number, hash: string): string {
  return `${resolveBlockExplorerUrl(chainId)}/tx/${hash}`;
}

/** Keep Tab/Shift+Tab keyboard focus inside `focusable` (first↔last wrap). */
export function trapTabFocus(
  event: { key: string; shiftKey: boolean; preventDefault(): void },
  focusable: HTMLElement[],
): void {
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  }
  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function truncateHex(value: string, head = 10, tail = 6): string {
  if (value.length <= head + tail + 2) return value;
  return `${value.slice(0, head)}${ELLIPSIS}${value.slice(-tail)}`;
}

export function truncateAddress(value: string, head = 6, tail = 4): string {
  if (!value.startsWith("0x") || value.length <= head + tail + 2) return value;
  return `${value.slice(0, head)}${ELLIPSIS}${value.slice(-tail)}`;
}

/** Cryptographically random tx nonce/tag (e.g. transfer linkage). Single
 * owner — FlowPage and TransferModal previously carried divergent copies. */
export function freshNonceHex(byteLength = 32): `0x${string}` {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

/** Readable token string with trailing zeros trimmed — never raw 18-decimal noise. */
export function formatTokenAmount(
  wei: bigint,
  decimals = 18,
  maxFractionDigits = 6,
): string {
  const value = Number(formatUnits(wei, decimals));
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString(undefined, {
    maximumFractionDigits: maxFractionDigits,
  });
}

export function humanizeError(err: unknown): string {
  const full = err instanceof Error ? err.message : String(err);
  // viem/backend dumps append calldata noise after the real message; known-message matching uses the head.
  const noiseAt = full.search(
    /\n?\s*(Request Arguments|Contract Call|Details|Version|Docs):/,
  );
  const raw = (noiseAt > 0 ? full.slice(0, noiseAt) : full).trim();
  const lower = raw.toLowerCase();
  // Known-message ladders all test "lower contains any of these heads".
  const has = (...needles: string[]) =>
    needles.some((needle) => lower.includes(needle));

  if (has("user rejected", "user denied", "rejected the request")) {
    return "Transaction cancelled — you rejected the request in your wallet.";
  }

  // Oracle dataHash answer targets developers — users get state + remedy, never an HTTP instruction.
  if (lower.includes("unknown datahash")) {
    return "This agent's metadata is not registered with the oracle yet. Re-register it from the mint flow (or pick another agent), then retry the transfer.";
  }

  // Backend signer check names a protocol rule — translate it into requirement + remedy (co-sign step).
  if (
    has("signer does not match recipient", "does not match recipient address")
  ) {
    return "The transfer acceptance must be signed by the recipient's own wallet. Go back and use the \u201cSign as receiver\u201d step with the recipient account selected.";
  }

  // Wallet cannot expose the receiver account at all — name the blocker and the two real remedies.
  if (lower.includes("is not available in the connected wallet")) {
    return "The receiving account is not available in the connected wallet. Add the receiver account to this wallet, or let the receiver accept the transfer from their own session.";
  }

  // Non-signature or wrong-recoverer acceptance code — only remedy is a fresh receiver signature.
  if (
    has(
      "acceptance code is not a wallet signature",
      "does not recover to the receiver address",
    )
  ) {
    return "This acceptance code was not signed by the receiver's wallet. Ask the receiver to sign the acceptance link again with the receiving account, then paste the new code.";
  }

  if (
    lower.includes("insufficient_balance") ||
    lower.includes("compute account has no balance") ||
    (lower.includes("insufficient balance") && lower.includes("compute"))
  ) {
    return "0G Compute is out of credits. Fund the compute account for AXIOM_COMPUTE_API_KEY, then retry.";
  }

  if (has("insufficient funds", "exceeds the balance")) {
    return "Insufficient balance to complete this transaction. Please add funds and try again.";
  }

  if (lower.includes("compute upstream")) {
    return "Compute is unavailable right now. Check backend compute keys and balance.";
  }

  if (has("gas required exceeds", "cannot estimate gas")) {
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
    has(
      "failed to fetch",
      "networkerror",
      "econnrefused",
      "network request failed",
      "load failed",
    )
  ) {
    return "Network error — check your internet connection and try again.";
  }

  if (has("timeout", "timed out", "aborterror")) {
    return "Request timed out. The network may be congested — please try again.";
  }

  if (has("nonce") && lower.includes("too low")) {
    return "Transaction nonce conflict. Please wait for pending transactions to confirm.";
  }

  return raw.length > 200 ? `${raw.slice(0, 200)}…` : raw;
}

export function errorRefString(err: unknown): string | null {
  const ref = err as { code?: string; requestId?: string } | null;
  return ref && (ref.code !== undefined || ref.requestId !== undefined)
    ? `Ref · ${[ref.requestId, ref.code].filter((x): x is string => x !== undefined).join(" · ")}`
    : null;
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
  if (trimmed === "") return null; // empty is not an error — the required-field check handles it separately

  if (/[eE]/.test(trimmed)) {
    return `${label} cannot use scientific notation.`;
  }

  const num = Number(trimmed);
  if (Number.isNaN(num)) return `${label} must be a valid number.`;
  if (!Number.isFinite(num)) return `${label} must be a finite number.`;
  if (num < min) return `${label} must be at least ${min}.`;
  if (max !== undefined && num > max) {
    return `${label} must be at most ${max}.`;
  }
  if (!allowDecimals && trimmed.includes(".")) {
    return `${label} must be a whole number.`;
  }

  if (allowDecimals && trimmed.includes(".")) {
    const [, decimalsPart] = trimmed.split(".");
    const decimals = decimalsPart?.length ?? 0;
    if (decimals > maxDecimals) {
      return `${label} has too many decimal places (max ${maxDecimals}).`;
    }
  }

  return null;
}
