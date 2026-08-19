import React, {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAccount } from "wagmi";
import type {
  ButtonHTMLAttributes,
  ChangeEvent,
  CSSProperties,
  InputHTMLAttributes,
  ReactElement,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";

export const COLORS = {
  bg: "var(--c-bg)",
  surface: "var(--c-surface)",
  surfaceRaised: "var(--c-surface-raised)",

  border: "var(--c-border)",
  borderStrong: "var(--c-border-strong)",

  text: "var(--c-text)",
  textPrimary: "var(--c-text-primary)",
  textMuted: "var(--c-text-muted)",
  textDim: "var(--c-text-dim)",

  bronze: "var(--c-bronze)",
  bronzeLight: "var(--c-bronze-light)",
  bronzeBg: "var(--c-bronze-bg)",
  bronzeBorder: "var(--c-bronze-border)",

  teal: "var(--c-teal)",
  tealBg: "var(--c-teal-bg)",
  tealBorder: "var(--c-teal-border)",

  danger: "var(--c-danger)",
  dangerBg: "var(--c-danger-bg)",
  dangerBorder: "var(--c-danger-border)",
  success: "var(--c-success)",
  successBg: "var(--c-success-bg)",
  successBorder: "var(--c-success-border)",
  warning: "var(--c-warning)",
  warningBg: "var(--c-warning-bg)",
  warningBorder: "var(--c-warning-border)",
} as const;

const emptyCardStyle = {
  textAlign: "center",
  padding: "var(--space-3xl) var(--space-xl)",
} as const;

const ellipsisTitleStyle: CSSProperties = {
  color: COLORS.text,
  letterSpacing: "-0.02em",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const formFieldBase: CSSProperties = {
  padding: "0.625rem 0.875rem",
  borderRadius: "var(--radius-md)",
  border: `1px solid ${COLORS.borderStrong}`,
  background: COLORS.bg,
  color: COLORS.text,
  fontSize: "var(--text-sm)",
  fontFamily: "inherit",
  minWidth: "0",
  transition: "var(--transition)",
  // focus ring comes from a CSS class on inputs, not inline styles
};

type ButtonVariant = "primary" | "secondary" | "ghost";

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
  className,
}: {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}): ReactElement {
  return (
    <div
      className={
        ["surface-glass", className].filter(Boolean).join(" ") || undefined
      }
      style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: "var(--radius-xl)",
        padding: "var(--space-xl)",
        boxShadow: "var(--shadow-1)",
        transition: `border-color var(--dur-card-hover) var(--ease-out), transform var(--dur-card-hover) var(--ease-out), background var(--dur-card-hover) var(--ease-out)`,
        overflow: "hidden",
        contain: "layout style",
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
      className={["axiom-field", rest.className].filter(Boolean).join(" ")}
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
      className={["axiom-field", rest.className].filter(Boolean).join(" ")}
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

type DefinitionListItem = {
  term: ReactNode;
  detail: ReactNode;
  detailStyle?: CSSProperties;
};

type DefinitionListProps = {
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
      className={
        ["stack-on-mobile", className].filter(Boolean).join(" ") || undefined
      }
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
          <dt className="text-dim" style={{ fontWeight: "var(--fw-medium)" }}>
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

type KeyValueGridProps = {
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

type NumericActionRowProps = {
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

type AlertVariant = "error" | "success";

const alertBase: CSSProperties = {
  padding: "var(--space-md) var(--space-lg)",
  borderRadius: "var(--radius-lg)",
  fontSize: "var(--text-sm)",
  lineHeight: "var(--lh-snug)",
  overflowWrap: "break-word",
};

const alertStyles: Record<AlertVariant, CSSProperties> = {
  error: {
    ...alertBase,
    background: COLORS.dangerBg,
    border: `1px solid ${COLORS.dangerBorder}`,
    color: COLORS.danger,
  },
  success: {
    ...alertBase,
    background: COLORS.successBg,
    border: `1px solid ${COLORS.successBorder}`,
    color: COLORS.success,
  },
};

export function Alert({
  variant = "error",
  children,
  style,
  className,
}: {
  variant?: AlertVariant;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}): ReactElement {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={className}
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
      data-axiom-skeleton=""
      className="skeleton"
      style={{
        width,
        height,
        borderRadius: "var(--radius-sm)",
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
          className="text-2xl fw-bold lh-tight"
          style={{ ...ellipsisTitleStyle, margin: "0 0 0.375rem" }}
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
}: {
  children: ReactNode;
  style?: CSSProperties;
}): ReactElement {
  return (
    <h2
      className="text-sm fw-semibold text-dim lh-snug m-0 mb-lg uppercase"
      style={{ letterSpacing: "0.1em", ...style }}
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
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => {
      if (timerRef.current !== undefined) clearTimeout(timerRef.current);
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
      if (timerRef.current !== undefined) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1200);
    } catch {
      void 0;
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied to clipboard" : "Copy to clipboard"}
      style={{
        display: "inline-grid",
        gridTemplateColumns: "4ch",
        placeItems: "center",
        background: "transparent",
        color: COLORS.bronzeLight,
        border: `1px solid ${COLORS.bronzeBorder}`,
        borderRadius: "var(--radius-sm)",
        padding: "2px 6px",
        fontFamily: "inherit",
        fontSize: "var(--text-xs)",
        lineHeight: 1,
        cursor: "pointer",
        ...style,
      }}
    >
      <span
        style={{
          gridArea: "1 / 1",
          transition:
            "opacity 120ms var(--ease-out), transform 120ms var(--ease-out)",
          opacity: copied ? 0 : 1,
          transform: copied ? "scale(0.8)" : "scale(1)",
        }}
      >
        Copy
      </span>
      <span
        style={{
          gridArea: "1 / 1",
          transition:
            "opacity 120ms var(--ease-out), transform 120ms var(--ease-out)",
          opacity: copied ? 1 : 0,
          transform: copied ? "scale(1)" : "scale(0.8)",
        }}
      >
        ✓
      </span>
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
        fontFamily: "var(--font-data)",
        fontSize: "var(--text-data-sm)",
        fontVariantNumeric: "var(--tabular)",
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
  className,
}: {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}): ReactElement {
  return (
    <kbd
      className={className}
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
  variant = "spin",
  style,
}: {
  size?: number;
  variant?: "spin" | "churn";
  style?: CSSProperties;
}): ReactElement {
  if (variant === "churn") {
    return (
      <span
        role="status"
        aria-label="Loading"
        className="spinner--churn"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 4px)",
          gap: 2,
          ...style,
        }}
      >
        {[0, 90, 180, 270, 0, 90, 180, 270, 0].map((delay, index) => (
          <span
            key={index}
            className="churn-cell"
            style={{
              width: 4,
              height: 4,
              borderRadius: 1,
              animation: "axiom-pixel-on 650ms var(--ease-out) infinite",
              animationDelay: `${delay}ms`,
            }}
          />
        ))}
      </span>
    );
  }
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
        animation: "axiom-spin var(--dur-spin) linear infinite",
        ...style,
      }}
      aria-label="Loading"
    />
  );
}

const MODAL_CSS = `
  [data-axiom-modal] {
    opacity: 0;
    transform: scale(0.98) translateX(32px);
    transform-origin: center right;
    pointer-events: none;
    transition: opacity var(--dur-modal) var(--ease-out),
      transform var(--dur-modal) var(--ease-out),
      display var(--dur-modal) allow-discrete, overlay var(--dur-modal) allow-discrete;
  }
  [data-axiom-modal][open] {
    opacity: 1;
    transform: scale(1) translateX(0);
    pointer-events: auto;
  }
  [data-axiom-modal]::backdrop {
    opacity: 0;
    transition: opacity var(--dur-modal) var(--ease-out),
      overlay var(--dur-modal) allow-discrete;
  }
  [data-axiom-modal][open]::backdrop {
    opacity: 1;
  }
  @starting-style {
    [data-axiom-modal][open] {
      opacity: 0;
      transform: scale(0.98) translateX(32px);
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
  maxWidth?: number;
  style?: CSSProperties;
}

export const Modal = React.memo(function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth,
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

  return (
    <>
      <style>{MODAL_CSS}</style>
      <dialog
        ref={dialogRef}
        onClose={onClose}
        aria-labelledby={title ? "modal-title" : undefined}
        data-axiom-modal=""
        style={{
          padding: 28,
          border: `1px solid ${COLORS.borderStrong}`,
          borderRadius: "var(--radius-xl)",
          maxWidth: maxWidth ?? 500,
          width: "90vw",
          maxHeight: "90vh",
          overflow: "auto",
          background: COLORS.surface,
          color: COLORS.text,
          boxShadow: "var(--shadow-modal)",
          ...style,
        }}
      >
        {title !== undefined && (
          <h2
            id="modal-title"
            className="mt-0 text-xl fw-bold"
            style={ellipsisTitleStyle}
          >
            {title}
          </h2>
        )}
        {children}
      </dialog>
    </>
  );
});

const LazyConnectButton = React.lazy(() =>
  import("@rainbow-me/rainbowkit").then((m) => ({ default: m.ConnectButton })),
);

export function ConnectedGuard({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement | null {
  const { isConnected } = useAccount();
  if (!isConnected) {
    return (
      <Card className="surface-glass" style={emptyCardStyle}>
        <p
          style={{
            margin: "0 0 var(--space-lg)",
            color: COLORS.textMuted,
            fontSize: "var(--text-sm)",
          }}
        >
          Connect wallet (0G Aristotle) to mint, fund, and tick.
        </p>
        <React.Suspense fallback={<Spinner />}>
          <LazyConnectButton />
        </React.Suspense>
      </Card>
    );
  }
  return <>{children}</>;
}

// First hover on a tip waits 200ms (transition-delay); once warmed, later hovers are instant.
const warmedHelpTips = new WeakSet<HTMLElement>();

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
      tabIndex={0}
      role="note"
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        const content = el.querySelector<HTMLElement>(".helptip-content");
        if (!content) return;
        if (!warmedHelpTips.has(el)) warmedHelpTips.add(el);
        content.style.transitionDelay = warmedHelpTips.has(el)
          ? "0ms"
          : "200ms";
      }}
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
