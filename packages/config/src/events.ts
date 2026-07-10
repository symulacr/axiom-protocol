export const EVENT_NAMES = {
  Tick: "Tick",
  Transfer: "Transfer",
  Executed: "Executed",
  StrategySet: "StrategySet",
  Deposited: "Deposited",
  Withdrawn: "Withdrawn",
  Minted: "Minted",
  Unknown: "Unknown",
} as const;
export type EventName = (typeof EVENT_NAMES)[keyof typeof EVENT_NAMES];
