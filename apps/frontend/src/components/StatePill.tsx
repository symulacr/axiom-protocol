/*
  Axiom Copper Command Deck — shared transaction state primitive.
  Style reminder: compact mono-facing status, factual language, phosphor for live states and copper warning states.
  S2 (audit 06 FINDING-011): CONFIRMED is the calm default — rendered as a
  quiet text state, not a saturated pill. The pill (color + glow dot) is
  reserved for states that need attention: pending (copper) and
  failed/stale (warning). The a11y contract is unchanged (role=status,
  localized "Status: <state>" label).
*/
import { getCopy, type Locale } from "../lib/copy";
import type { TxState } from "../lib/models";

export function StatePill({ state }: { state: TxState }) {
  let locale: Locale = "en";
  try {
    const raw = window.localStorage.getItem("axiom-ui-settings");
    const stored = raw ? (JSON.parse(raw) as { locale?: Locale }) : null;
    if (stored?.locale === "fr" || stored?.locale === "de")
      locale = stored.locale;
  } catch {
    // Local prototype storage can be unavailable in privacy-restricted contexts.
  }
  const labels = getCopy(locale).status;
  const statusLabel = locale === "fr" ? "Statut" : "Status";
  return (
    <span
      className={`state-pill state-${state}${state === "confirmed" ? " is-quiet" : ""}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={`${statusLabel}: ${labels[state]}`}
    >
      <i />
      {labels[state]}
    </span>
  );
}
