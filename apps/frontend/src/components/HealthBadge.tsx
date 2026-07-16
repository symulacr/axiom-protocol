import { type ReactElement } from "react";
import { BACKEND_URL } from "../config/env.js";
import { useHealth } from "../hooks/useHealth.js";

/**
 * Compact status pill for the shell header.
 * Detail lives in title tooltip — not a second status bar.
 */
export function HealthBadge(): ReactElement {
  const { data, isLoading } = useHealth();

  const isLocalhost =
    BACKEND_URL.includes("127.0.0.1") || BACKEND_URL.includes("localhost");

  if (isLocalhost) {
    return (
      <span
        className="shell-status shell-status--local"
        role="status"
        title={`Local · ${BACKEND_URL}`}
        aria-label="Local development"
      >
        <span className="shell-status__dot" aria-hidden />
        <span className="shell-status__label">Local</span>
      </span>
    );
  }

  const status = !data
    ? isLoading
      ? "unknown"
      : "down"
    : data.ok
      ? "ok"
      : "down";

  const label =
    status === "ok"
      ? "Online"
      : status === "down"
        ? "Offline"
        : "…";

  const title = data
    ? `API ${label} · oracle ${data.oracle} · block #${data.chainHead}`
    : label;

  return (
    <span
      className={`shell-status shell-status--${status}`}
      role="status"
      aria-live="polite"
      aria-label={title}
      title={title}
    >
      <span className="shell-status__dot" aria-hidden />
      <span className="shell-status__label">{label}</span>
    </span>
  );
}

export default HealthBadge;
