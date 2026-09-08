import { formatUnits } from "viem";
import { resolveBlockExplorerUrl } from "@axiom/config/networks";
import { getCopy, type Locale } from "../lib/copy.js";

/** P-L6: the ladder's words live in copy.errors per locale; the locale comes
 * from the persisted settings (humanizeError runs outside React — toasts and
 * catch blocks — so the store context is unreachable here). */
function errorLocale(): Locale {
  try {
    const raw = globalThis.localStorage?.getItem("axiom-ui-settings");
    const locale = raw
      ? (JSON.parse(raw) as { locale?: string }).locale
      : undefined;
    return locale === "fr" || locale === "de" ? locale : "en";
  } catch {
    return "en";
  }
}

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

/** Shared head…tail ellipsis; returns the value untouched when short enough. */
function ellipsize(value: string, head: number, tail: number): string {
  return value.length <= head + tail + 2
    ? value
    : `${value.slice(0, head)}${ELLIPSIS}${value.slice(-tail)}`;
}

export function truncateHex(value: string, head = 10, tail = 6): string {
  return ellipsize(value, head, tail);
}

export function truncateAddress(value: string, head = 6, tail = 4): string {
  return value.startsWith("0x") ? ellipsize(value, head, tail) : value;
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
  const errors = getCopy(errorLocale()).errors;

  if (has("user rejected", "user denied", "rejected the request")) {
    return errors.userRejected;
  }

  // Oracle dataHash answer targets developers — users get state + remedy, never an HTTP instruction.
  if (lower.includes("unknown datahash")) {
    return errors.unknownDatahash;
  }

  // Backend signer check names a protocol rule — translate it into requirement + remedy (co-sign step).
  if (
    has("signer does not match recipient", "does not match recipient address")
  ) {
    return errors.signerMismatch;
  }

  // Wallet cannot expose the receiver account at all — name the blocker and the two real remedies.
  if (lower.includes("is not available in the connected wallet")) {
    return errors.receiverUnavailable;
  }

  // Non-signature or wrong-recoverer acceptance code — only remedy is a fresh receiver signature.
  if (
    has(
      "acceptance code is not a wallet signature",
      "does not recover to the receiver address",
    )
  ) {
    return errors.acceptanceNotSigned;
  }

  if (
    has("insufficient_balance", "compute account has no balance") ||
    (lower.includes("insufficient balance") && lower.includes("compute"))
  ) {
    return errors.computeOutOfCredits;
  }

  if (has("insufficient funds", "exceeds the balance")) {
    return errors.insufficientFunds;
  }

  if (has("rate_limit_exceeded", "rate-limiting requests")) {
    return errors.rateLimited;
  }

  // GasTank (V3 W5-B): distinguish user-side remedy (deposit/refill) from the
  // operator-side one (reserve funding) and the throttle (just wait).
  if (has("gas tank exhausted", "tank_exhausted")) {
    return errors.tankExhausted;
  }
  if (has("reserve exhausted", "reserve_depleted")) {
    return errors.reserveExhausted;
  }
  if (has("sponsor_rate_limited", "sponsor rate limit")) {
    return errors.sponsorRateLimited;
  }

  if (lower.includes("compute upstream")) {
    return errors.computeUpstream;
  }

  if (has("gas required exceeds", "cannot estimate gas")) {
    return errors.gasEstimate;
  }

  if (lower.includes("execution reverted") || lower.includes("revert")) {
    const reasonMatch =
      raw.match(/reason:\s*(.+?)(?:\n|$)/i) ??
      raw.match(/reverted with reason string '(.+?)'/i) ??
      raw.match(/error=\{[^}]*"message":"([^"]+)"/i);
    const reason = reasonMatch?.[1]?.trim();
    return reason ? errors.revertedWithReason(reason) : errors.reverted;
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
    return errors.networkError;
  }

  if (has("timeout", "timed out", "aborterror")) {
    return errors.timeout;
  }

  if (has("nonce") && lower.includes("too low")) {
    return errors.nonceTooLow;
  }

  return raw.length > 200 ? `${raw.slice(0, 200)}…` : raw;
}

/** L1-M10: prettify a raw tool identifier for user-facing rows — strip
 * underscores, title-case ("evm_wallet" → "Evm Wallet"). */
export function humanizeToolName(name: string): string {
  const spaced = name.replace(/[_\-\s]+/g, " ").trim();
  if (!spaced) return name;
  return spaced
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
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
