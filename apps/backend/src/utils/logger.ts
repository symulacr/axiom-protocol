type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  level: LogLevel;
  message: string;
  component?: string;
  [key: string]: unknown;
}

function safeSerialize(v: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(v, (_key, value) => {
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    }
    return value;
  });
}

function formatLog(entry: LogEntry): string {
  const ts = new Date().toISOString();
  const component = entry.component ? ` [${entry.component}]` : "";
  const extra = Object.entries(entry)
    .flatMap(([k, v]) => {
      if (["level", "message", "component"].includes(k)) return [];
      return [` ${k}=${typeof v === "string" ? v : safeSerialize(v)}`];
    })
    .join("");
  return `${ts} ${entry.level.toUpperCase()}${component} ${entry.message}${extra}`;
}

export function createLogger(component: string) {
  // This file IS the logging abstraction — wrapping console.* is its purpose.
  const write =
    (level: LogLevel, out: (...args: unknown[]) => void) =>
    (message: string, extra?: Record<string, unknown>) =>
      out(formatLog({ level, message, component, ...extra }));
  return {
    info: write("info", console.log),
    warn: write("warn", console.warn),
    error: write("error", console.error),
    debug: write("debug", console.debug),
  };
}
