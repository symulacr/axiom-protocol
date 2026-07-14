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
    .filter(([k]) => !["level", "message", "component"].includes(k))
    .map(([k, v]) => ` ${k}=${typeof v === "string" ? v : safeSerialize(v)}`)
    .join("");
  return `${ts} ${entry.level.toUpperCase()}${component} ${entry.message}${extra}`;
}

export function createLogger(component: string) {
  return {
    info: (message: string, extra?: Record<string, unknown>) =>
      console.log(formatLog({ level: "info", message, component, ...extra })),
    warn: (message: string, extra?: Record<string, unknown>) =>
      console.warn(formatLog({ level: "warn", message, component, ...extra })),
    error: (message: string, extra?: Record<string, unknown>) =>
      console.error(
        formatLog({ level: "error", message, component, ...extra }),
      ),
    debug: (message: string, extra?: Record<string, unknown>) =>
      console.debug(
        formatLog({ level: "debug", message, component, ...extra }),
      ),
  };
}
