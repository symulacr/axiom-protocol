export const NEUTRAL_WAITING_MESSAGES = [
  "Connecting to 0G Compute…",
  "Loading agent context…",
  "Running inference…",
  "Calling protocol tools…",
  "Waiting for model response…",
  "Processing your request…",
];

export function waitingMessageForElapsed(elapsedSec: number): string {
  const idx = Math.min(
    Math.floor(elapsedSec / 3),
    NEUTRAL_WAITING_MESSAGES.length - 1,
  );
  return NEUTRAL_WAITING_MESSAGES[idx] ?? "Thinking…";
}