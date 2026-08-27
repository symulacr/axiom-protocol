/*
  Shared transaction state primitive. CONFIRMED renders quiet; pending/
  failed/stale carry the copper/warning pill tone. role=status contract
  unchanged. R2 S3: the decorative dot is gone — state carries in the
  pill's tone color + text (redundant with the status word, and the dot
  glow shaded every row it sat on).
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
      {labels[state]}
    </span>
  );
}
