// Predictive guard lives in @axiom/config (shared with the backend orchestrator
// so display and skip logic can never drift); re-exported here so
// useVaultDataBatch's existing import path keeps working unchanged.
export {
  currentUtcDay,
  utcDayDateLabel,
  strategyGuardError,
  type StrategyLimits,
} from "@axiom/config";
