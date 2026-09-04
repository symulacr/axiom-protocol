import type { ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

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
      {/* R2 S3: decorative dot removed — tone color + text carry the state. */}
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
  multiline = false,
  rows = 3,
  readOnly = false,
  mono = false,
  className,
  inputMode,
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
  /** Render a textarea instead of an input (TransferModal's pubkey field). */
  multiline?: boolean;
  rows?: number;
  readOnly?: boolean;
  /** Monospace value (addresses, keys, codes). */
  mono?: boolean;
  className?: string;
  /** e.g. "decimal" — picks the mobile keypad; ignored for multiline. */
  inputMode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal";
}) {
  const fieldId =
    id || `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const messageId = `${fieldId}-message`;
  return (
    <label
      className={`field ${error ? "field-error" : ""} ${className ?? ""}`.trim()}
      htmlFor={fieldId}
    >
      <span className="field-label">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </span>
      <span className="field-control">
        {(() => {
          // Shared control props — textarea and input differ only in `rows`.
          const shared = {
            id: fieldId,
            value: value ?? "",
            onChange: (event: { target: { value: string } }) =>
              onChange?.(event.target.value),
            placeholder,
            required,
            maxLength,
            readOnly,
            "aria-invalid": Boolean(error),
            "aria-describedby": error || hint ? messageId : undefined,
            className: mono ? "mono" : undefined,
            // Keypad hint only on the single-line input; textarea has no inputMode.
            inputMode: multiline ? undefined : inputMode,
          };
          return multiline ? (
            <textarea {...shared} rows={rows} />
          ) : (
            <input {...shared} />
          );
        })()}
        {suffix && <em aria-hidden="true">{suffix}</em>}
      </span>
      {error ? (
        // Polite, not alert: tied to the field via aria-describedby and read
        // with it on focus (assertive is reserved for untied form-level errors).
        <span id={messageId} className="field-message" role="status">
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

/** Shared ops-page header: h1 (+ optional lede) left, actions/status right.
 *  Wave-9B: optional `actions` slot renders into the existing .page-head-actions
 *  lane — same styling contract as `children`, no CSS additions needed. */
export function PageHead({
  title,
  lede,
  children,
  actions,
}: {
  title: ReactNode;
  lede?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {lede !== undefined && <p>{lede}</p>}
      </div>
      {actions !== undefined ? (
        <div className="page-head-actions">{actions}</div>
      ) : null}
      {children}
    </div>
  );
}

/** Shared panel header: h2 block left, controls right. */
export function PanelHead({
  title,
  className,
  children,
}: {
  title: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={className ? `panel-head ${className}` : "panel-head"}>
      <div>
        <h2>{title}</h2>
      </div>
      {children}
    </div>
  );
}

/** One definition row in .review-facts / .provenance-list lists. */
export function Fact({
  label,
  mono = false,
  children,
}: {
  label: ReactNode;
  mono?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={mono ? "mono" : undefined}>{children}</dd>
    </div>
  );
}

/** Shared modal error note; renders nothing without a message. */
export function ErrorNote({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p className="wallet-gate-error" role="alert">
      {message}
    </p>
  );
}
