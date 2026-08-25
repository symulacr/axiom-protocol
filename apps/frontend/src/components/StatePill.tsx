/*
  Axiom Copper Command Deck — shared transaction state primitive.
  Style reminder: compact mono-facing status, factual language, phosphor for live states and copper warning states.
   CONFIRMED is the calm default — rendered as a
  quiet text state, not a saturated pill. The pill (color + glow dot) is
  reserved for states that need attention: pending (copper) and
  failed/stale (warning). The a11y contract is unchanged (role=status,
  localized "Status: <state>" label).
*/
import { getCopy } from "../lib/copy";
import type { TxState } from "../lib/models";
import { useUiStore } from "../lib/uiStore";

export function StatePill({ state }: { state: TxState }) {
  // U27: locale comes from the live UI store — the raw localStorage read went
  // stale the moment the user switched language without a reload.
  const { state: uiState } = useUiStore();
  const labels = getCopy(uiState.settings.locale).status;
  const statusLabel = uiState.settings.locale === "fr" ? "Statut" : "Status";
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
