import React, { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import type {
  ButtonHTMLAttributes,
  ChangeEvent,
  CSSProperties,
  InputHTMLAttributes,
  ReactElement,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

export const COLORS = {
  bg: "var(--c-bg)",
  surface: "var(--c-surface)",
  surfaceLight: "var(--c-surface-light)",

  border: "var(--c-border)",
  borderStrong: "var(--c-border-strong)",

  text: "var(--c-text)",
  textPrimary: "var(--c-text-primary)",
  textMuted: "var(--c-text-muted)",
  textDim: "var(--c-text-dim)",

  bronze: "var(--c-bronze)",
  bronzeLight: "var(--c-bronze-light)",
  bronzeBg: "rgba(184, 151, 110, 0.08)",
  bronzeBorder: "var(--c-bronze-border)",

  teal: "var(--c-teal)",
  tealLight: "var(--c-teal-light)",
  tealBg: "rgba(90, 138, 138, 0.15)",
  tealBorder: "var(--c-teal-border)",

  danger: "var(--c-danger)",
  dangerBg: "rgba(200, 90, 90, 0.08)",
  dangerBorder: "rgba(200, 90, 90, 0.2)",
  success: "var(--c-success)",
  successBg: "rgba(107, 158, 107, 0.08)",
  successBorder: "rgba(107, 158, 107, 0.2)",
  warning: "var(--c-warning)",
  warningBg: "rgba(197, 162, 90, 0.08)",
  warningBorder: "rgba(197, 162, 90, 0.2)",
} as const;

export function getActionColor(action: string): string {
  switch (action) {
    case "buy":
      return COLORS.success;
    case "sell":
      return COLORS.danger;
    case "hold":
      return COLORS.textMuted;
    default:
      return COLORS.textMuted;
  }
}

const transition =
  "color 0.18s var(--ease-out), background 0.18s var(--ease-out), border-color 0.18s var(--ease-out), opacity 0.18s var(--ease-out)";

const formFieldBase: CSSProperties = {
  padding: "0.625rem 0.875rem",
  borderRadius: "var(--radius-md)",
  border: `1px solid ${COLORS.borderStrong}`,
  background: COLORS.bg,
  color: COLORS.text,
  fontSize: "var(--text-sm)",
  fontFamily: "inherit",
  minWidth: "0",
  transition,
};

type ButtonVariant = "primary" | "secondary" | "ghost" | "teal";

export const Button = React.memo(function Button({
  variant = "primary",
  style,
  className,
  disabled,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
}): ReactElement {
  return (
    <button
      {...rest}
      data-axiom-btn=""
      disabled={disabled}
      className={
        ["btn", `btn-${variant}`, className].filter(Boolean).join(" ") ||
        undefined
      }
      style={style}
    >
      {children}
    </button>
  );
});

export const Card = React.memo(function Card({
  children,
  style,
  hover = false,
}: {
  children: ReactNode;
  style?: CSSProperties;
  hover?: boolean;
}): ReactElement {
  return (
    <div
      role={hover ? "button" : undefined}
      tabIndex={hover ? 0 : undefined}
      onKeyDown={
        hover
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.currentTarget.click();
              }
            }
          : undefined
      }
      style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: "var(--radius-xl)",
        padding: "var(--space-xl)",
        transition,
        overflow: "hidden",
        contain: "layout style",
        ...(hover ? { cursor: "pointer" } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
});

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ style, ...rest }, ref) {
  return (
    <input
      ref={ref}
      {...rest}
      style={{
        ...formFieldBase,
        ...style,
      }}
    />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ style, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      {...rest}
      style={{
        ...formFieldBase,
        width: "100%",
        boxSizing: "border-box",
        resize: "vertical",
        ...style,
      }}
    />
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ style, ...rest }, ref) {
  return (
    <select
      ref={ref}
      {...rest}
      style={{
        ...formFieldBase,
        ...style,
      }}
    />
  );
});

export type DefinitionListItem = {
  term: ReactNode;
  detail: ReactNode;
  detailStyle?: CSSProperties;
};

export type DefinitionListProps = {
  items: DefinitionListItem[];
  labelWidth?: string;
  className?: string;
  style?: CSSProperties;
};

export function DefinitionList({
  items,
  labelWidth = "120px",
  className,
  style,
}: DefinitionListProps): ReactElement {
  return (
    <dl
      className={["stack-on-mobile", className].filter(Boolean).join(" ") || undefined}
      style={{
        margin: 0,
        display: "grid",
        gridTemplateColumns: `${labelWidth} 1fr`,
        gap: "8px 16px",
        fontSize: "var(--text-sm)",
        ...style,
      }}
    >
      {items.map((item, index) => (
        <React.Fragment key={index}>
          <dt
            className="text-dim"
            style={{ fontWeight: "var(--fw-medium)" }}
          >
            {item.term}
          </dt>
          <dd style={{ margin: 0, ...item.detailStyle }}>{item.detail}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

export type KeyValueGridItem = {
  label: ReactNode;
  value: ReactNode;
  valueStyle?: CSSProperties;
  labelStyle?: CSSProperties;
};

export type KeyValueGridProps = {
  items: KeyValueGridItem[];
  className?: string;
  style?: CSSProperties;
};

export function KeyValueGrid({
  items,
  className,
  style,
}: KeyValueGridProps): ReactElement {
  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "var(--space-lg)",
        ...style,
      }}
    >
      {items.map((item, index) => (
        <div key={index} style={{ minWidth: "8rem" }}>
          <div
            className="text-dim"
            style={{
              fontSize: "var(--text-xs)",
              marginBottom: "var(--space-xs)",
              fontWeight: "var(--fw-medium)",
              ...item.labelStyle,
            }}
          >
            {item.label}
          </div>
          <div style={item.valueStyle}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

export type NumericActionRowProps = {
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: () => void;
  placeholder?: string;
  buttonLabel: string;
  loading?: boolean;
  disabled?: boolean;
  error?: string | null;
  errorId?: string;
  className?: string;
  style?: CSSProperties;
  inputStyle?: CSSProperties;
  buttonStyle?: CSSProperties;
} & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "placeholder"
>;

export function NumericActionRow({
  value,
  onChange,
  onSubmit,
  placeholder,
  buttonLabel,
  loading = false,
  disabled = false,
  error,
  errorId,
  className,
  style,
  inputStyle,
  buttonStyle,
  ...inputProps
}: NumericActionRowProps): ReactElement {
  const hasError = error != null && error !== "";
  const describedBy =
    inputProps["aria-describedby"] ??
    (hasError && errorId !== undefined ? errorId : undefined);

  return (
    <>
      <div
        className={["flex items-center gap-sm", className]
          .filter(Boolean)
          .join(" ")}
        style={style}
      >
        <Input
          {...inputProps}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled || loading}
          aria-invalid={hasError || inputProps["aria-invalid"]}
          aria-describedby={describedBy}
          style={{ flex: 1, ...inputStyle }}
        />
        <Button
          variant="primary"
          disabled={disabled || loading}
          onClick={onSubmit}
          style={{ minWidth: "140px", ...buttonStyle }}
        >
          {loading ? <Spinner size={16} /> : buttonLabel}
        </Button>
      </div>
      {hasError && errorId !== undefined && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
    </>
  );
}

type AlertVariant = "error" | "success" | "info";

const alertStyles: Record<AlertVariant, CSSProperties> = {
  error: {
    padding: "var(--space-md) var(--space-lg)",
    background: COLORS.dangerBg,
    border: `1px solid ${COLORS.dangerBorder}`,
    color: COLORS.danger,
    borderRadius: "var(--radius-lg)",
    fontSize: "var(--text-sm)",
    lineHeight: "var(--lh-snug)",
    overflowWrap: "break-word",
  },
  success: {
    padding: "var(--space-md) var(--space-lg)",
    background: COLORS.successBg,
    border: `1px solid ${COLORS.successBorder}`,
    color: COLORS.success,
    borderRadius: "var(--radius-lg)",
    fontSize: "var(--text-sm)",
    lineHeight: "var(--lh-snug)",
    overflowWrap: "break-word",
  },
  info: {
    padding: "var(--space-md) var(--space-lg)",
    background: COLORS.tealBg,
    border: `1px solid ${COLORS.tealBorder}`,
    color: COLORS.teal,
    borderRadius: "var(--radius-lg)",
    fontSize: "var(--text-sm)",
    lineHeight: "var(--lh-snug)",
    overflowWrap: "break-word",
  },
};

export function Alert({
  variant = "error",
  children,
  style,
}: {
  variant?: AlertVariant;
  children: ReactNode;
  style?: CSSProperties;
}): ReactElement {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      style={{ ...alertStyles[variant], ...style }}
    >
      {children}
    </div>
  );
}

interface ErrorAlertProps {
  message?: string;
  error?: unknown;
  onRetry?: () => void;
}

export function ErrorAlert({
  message,
  error,
  onRetry,
}: ErrorAlertProps): ReactElement {
  const err = error as { code?: string; requestId?: string } | undefined;
  return (
    <Alert variant="error">
      <p>{message ?? "An unexpected error occurred"}</p>
      {err?.code !== undefined || err?.requestId !== undefined ? (
        <ErrorRef code={err?.code} requestId={err?.requestId} />
      ) : null}
      {onRetry !== undefined && (
        <Button
          variant="secondary"
          onClick={onRetry}
          className="text-xs"
          style={{ flexShrink: 0, minHeight: 44 }}
        >
          Retry
        </Button>
      )}
    </Alert>
  );
}

export function ErrorRef({
  code,
  requestId,
}: {
  code?: string;
  requestId?: string;
}): ReactElement {
  if (code === undefined && requestId === undefined) return <></>;
  const ref = [requestId, code].filter(Boolean).join(" · ");
  return (
    <span
      style={{
        display: "block",
        marginTop: "var(--space-xs)",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-xs)",
        color: COLORS.textDim,
      }}
    >
      Ref · {ref}
    </span>
  );
}

export function Skeleton({
  width = "100%",
  height = 20,
  style,
}: {
  width?: string | number;
  height?: string | number;
  style?: CSSProperties;
}): ReactElement {
  return (
    <div
      role="status"
      aria-label="Loading content"
      style={{
        width,
        height,
        background: COLORS.border,
        borderRadius: "var(--radius-sm)",
        animation: "axiom-pulse 1.5s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}): ReactElement {
  return (
    <div className="flex items-baseline justify-between mb-2xl flex-wrap gap-md">
      <div style={{ minWidth: 0, overflow: "hidden" }}>
        <h1
          className="text-xl fw-bold lh-tight"
          style={{
            margin: "0 0 0.375rem",
            color: COLORS.text,
            letterSpacing: "-0.02em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </h1>
        {subtitle !== undefined && (
          <p className="m-0 text-muted text-sm lh-snug">{subtitle}</p>
        )}
      </div>
      {action !== undefined && <div aria-label="Page actions">{action}</div>}
    </div>
  );
}

export function SectionTitle({
  children,
  style,
  spacing = "compact",
}: {
  children: ReactNode;
  style?: CSSProperties;
  spacing?: "compact" | "spaced";
}): ReactElement {
  return (
    <h2
      className="text-sm fw-semibold text-dim lh-snug m-0 mb-lg uppercase"
      style={{
        letterSpacing: "0.08em",
        marginTop: spacing === "spaced" ? "var(--space-2xl)" : undefined,
        ...style,
      }}
    >
      {children}
    </h2>
  );
}

export function CopyButton({
  text,
  style,
}: {
  text: string;
  style?: CSSProperties;
}): ReactElement {
  const [copied, setCopied] = useState(false);
  const [pulse, setPulse] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const pulseRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => {
      if (timerRef.current !== undefined) clearTimeout(timerRef.current);
      if (pulseRef.current !== undefined) clearTimeout(pulseRef.current);
    };
  }, []);

  const copy = useCallback(async () => {
    try {
      const clipboard = navigator.clipboard;
      if (clipboard?.writeText) {
        await clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setPulse(true);
      if (timerRef.current !== undefined) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1200);
      if (pulseRef.current !== undefined) clearTimeout(pulseRef.current);
      pulseRef.current = setTimeout(() => setPulse(false), 130);
    } catch {
      void 0;
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={copied ? "Copied to clipboard" : "Copy to clipboard"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        background: "transparent",
        color: COLORS.bronzeLight,
        border: `1px solid ${COLORS.bronzeBorder}`,
        borderRadius: "var(--radius-sm)",
        padding: "2px 6px",
        fontFamily: "inherit",
        fontSize: "var(--text-xs)",
        lineHeight: 1,
        cursor: "pointer",
        transform: pulse ? "scale(0.97)" : "scale(1)",
        transition: "transform 120ms var(--ease-out)",
        ...style,
      }}
    >
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}

export function withViewTransition(update: () => void): void {
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canViewTransition =
    typeof document !== "undefined" && "startViewTransition" in document;
  if (prefersReducedMotion || !canViewTransition) {
    update();
    return;
  }
  const doc = document as Document & {
    startViewTransition: (cb: () => void) => { finished: Promise<void> };
  };
  doc.startViewTransition(update);
}

export function MonoLabel({
  children,
  title,
  style,
  copyable,
  text,
}: {
  children: ReactNode;
  title?: string;
  style?: CSSProperties;
  copyable?: boolean;
  text?: string;
}): ReactElement {
  const label = (
    <code
      title={title}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-sm)",
        color: COLORS.bronzeLight,
        background: COLORS.bronzeBg,
        padding: "0.125rem 0.5rem",
        borderRadius: "var(--radius-sm)",
        display: "inline-block",
        maxWidth: "100%",
        overflow: "hidden",
        wordBreak: "break-all",
        ...style,
      }}
    >
      {children}
    </code>
  );
  if (!copyable) return label;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        maxWidth: "100%",
      }}
    >
      {label}
      <CopyButton text={text ?? String(children)} />
    </span>
  );
}

export function Kbd({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}): ReactElement {
  return (
    <kbd
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-xs)",
        padding: "2px 6px",
        borderRadius: 3,
        border: `1px solid ${COLORS.borderStrong}`,
        color: COLORS.text,
        ...style,
      }}
    >
      {children}
    </kbd>
  );
}

export function Spinner({
  size = 20,
  style,
}: {
  size?: number;
  style?: CSSProperties;
}): ReactElement {
  return (
    <span
      role="status"
      style={{
        display: "inline-block",
        width: size,
        height: size,
        border: `2px solid ${COLORS.border}`,
        borderTopColor: COLORS.bronze,
        borderRadius: "50%",
        animation: "axiom-spin 0.8s linear infinite",
        ...style,
      }}
      aria-label="Loading"
    />
  );
}

const MODAL_CSS = `
  [data-axiom-modal] {
    opacity: 0;
    transform: scale(0.96);
    transform-origin: center;
    transition: opacity 240ms var(--ease-out), transform 240ms var(--ease-out);
  }
  [data-axiom-modal][open] {
    opacity: 1;
    transform: scale(1);
  }
  [data-axiom-modal]::backdrop {
    opacity: 0;
    transition: opacity 240ms var(--ease-out);
  }
  [data-axiom-modal][open]::backdrop {
    opacity: 1;
  }
  @starting-style {
    [data-axiom-modal][open] {
      opacity: 0;
      transform: scale(0.96);
    }
    [data-axiom-modal][open]::backdrop {
      opacity: 0;
    }
  }
`;

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  style?: CSSProperties;
}

export const Modal = React.memo(function Modal({
  open,
  onClose,
  title,
  children,
  style,
}: ModalProps): ReactElement | null {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleClose = useCallback(() => onClose(), [onClose]);

  return (
    <>
      <style>{MODAL_CSS}</style>
      <dialog
        ref={dialogRef}
        onClose={handleClose}
        aria-labelledby={title ? "modal-title" : undefined}
        data-axiom-modal=""
        style={{
        padding: 28,
        border: `1px solid ${COLORS.borderStrong}`,
        borderRadius: "var(--radius-xl)",
        maxWidth: 500,
        width: "90vw",
        maxHeight: "90vh",
        overflow: "auto",
        background: COLORS.surface,
        color: COLORS.text,
        boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
        ...style,
      }}
    >
      {title !== undefined && (
        <h2
          id="modal-title"
          className="mt-0 text-xl fw-bold"
          style={{
            color: COLORS.text,
            letterSpacing: "-0.02em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </h2>
      )}
      {children}
      </dialog>
    </>
  );
});

export function ConnectedGuard({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement | null {
  const { isConnected } = useAccount();
  if (!isConnected) {
    return (
      <Card
        style={{
          textAlign: "center",
          padding: "var(--space-3xl) var(--space-xl)",
        }}
      >
        <p className="text-muted text-sm fw-regular">
          Connect your wallet to view agents, manage vaults, and execute
          strategies.
        </p>
      </Card>
    );
  }
  return <>{children}</>;
}

export function HelpTip({
  tip,
  children,
}: {
  tip: string;
  children?: ReactNode;
}): ReactElement {
  return (
    <span
      className="helptip"
      style={{
        position: "relative",
        cursor: "help",
        borderBottom: `1px dotted ${COLORS.textDim}`,
      }}
    >
      {children}
      <span
        role="tooltip"
        className="helptip-content"
        style={{
          position: "absolute",
          bottom: "100%",
          left: "50%",
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: "var(--radius-md)",
          padding: "6px 10px",
          fontSize: "var(--text-xs)",
          color: COLORS.text,
          pointerEvents: "none",
          zIndex: 100,
          maxWidth: 280,
          whiteSpace: "normal",
          lineHeight: "var(--lh-snug)",
        }}
      >
        {tip}
      </span>
    </span>
  );
}
