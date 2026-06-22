export type ComputeJourney =
  | { step: "idle" }
  | { step: "requesting"; startedAt: number; model: string }
  | { step: "streaming"; model: string; tokens: number }
  | { step: "completed"; result: string }
  | { step: "failed"; error: Error };

export function assertNever(x: never): never {
  throw new Error(`Unexpected variant: ${x}`);
}
