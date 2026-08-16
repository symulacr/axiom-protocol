type UxEvent = {
  name: string;
  surface: string;
  at: string;
};

const STORAGE_KEY = "axiom-ux-events";
const MAX_EVENTS = 100;

export function trackUxEvent(name: string, surface: string) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const existing = raw ? JSON.parse(raw) : [];
    const events = Array.isArray(existing)
      ? existing.slice(-MAX_EVENTS + 1)
      : [];
    events.push({
      name,
      surface,
      at: new Date().toISOString(),
    } satisfies UxEvent);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    // Local, non-sensitive prototype telemetry is intentionally best-effort.
  }
}
