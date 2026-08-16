import type { ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  children,
  variant = "primary",
  onClick,
  icon,
  type = "button",
  disabled = false,
  busy = false,
  className = "",
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  onClick?: () => void;
  icon?: ReactNode;
  type?: "button" | "submit";
  disabled?: boolean;
  busy?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`button button-${variant} ${busy ? "is-busy" : ""} ${className}`.trim()}
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  );
}

export function Status({
  label,
  tone = "live",
}: {
  label: string;
  tone?: "live" | "warning" | "muted" | "success";
}) {
  return (
    <span
      className={`status status-${tone}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <i />
      {label}
    </span>
  );
}

export function Field({
  id,
  label,
  value,
  placeholder,
  hint,
  error,
  onChange,
  suffix,
  required = false,
  maxLength = 180,
}: {
  id?: string;
  label: string;
  value?: string;
  placeholder?: string;
  hint?: string;
  error?: string;
  onChange?: (value: string) => void;
  suffix?: string;
  required?: boolean;
  maxLength?: number;
}) {
  const fieldId =
    id || `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const messageId = `${fieldId}-message`;
  return (
    <label className={`field ${error ? "field-error" : ""}`} htmlFor={fieldId}>
      <span className="field-label">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </span>
      <span className="field-control">
        <input
          id={fieldId}
          value={value ?? ""}
          onChange={(event) => onChange?.(event.target.value)}
          placeholder={placeholder}
          required={required}
          maxLength={maxLength}
          aria-invalid={Boolean(error)}
          aria-describedby={error || hint ? messageId : undefined}
        />
        {suffix && <em aria-hidden="true">{suffix}</em>}
      </span>
      {error ? (
        <span id={messageId} className="field-message" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span id={messageId} className="field-hint">
          {hint}
        </span>
      ) : null}
    </label>
  );
}
