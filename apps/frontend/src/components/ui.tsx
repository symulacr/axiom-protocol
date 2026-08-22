import React, {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  ButtonHTMLAttributes,
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
  // No inline border: the .axiom-field class owns it so the :focus
  // border-color change (and the focus-visible ring) actually applies
  // (04 FINDING-007 — an inline border silently defeated both).
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

// P4 (audit §4 row 15): the generated-but-unused `Skeleton` export was dead
// code — deleted. Loading states use `Spinner` (this kit) or the live-data
// honest states on the v2 pages.

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
        background: "transparent",
        color: COLORS.bronzeLight,
        border: `1px solid ${COLORS.bronzeBorder}`,
        borderRadius: "var(--radius-sm)",
        padding: "2px 6px",
        fontFamily: "inherit",
        fontSize: "var(--text-xs)",
        lineHeight: 1,
        minWidth: "4ch",
        textAlign: "center",
        cursor: "pointer",
        ...style,
      }}
    >
      {/* S1 (audit 06 FINDING-014): single node with a label swap — the old
          two-span stack kept an opacity:0 "✓" twin in the DOM at all times
          (announced twice, one span too many per button). Matches
          MsgCopyAction's inline-confirm contract. */}
      {copied ? "✓" : "Copy"}
    </button>
  );
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
    // S1 (audit 06 FINDING-014): the churn was 9 empty animation-cell spans
    // per instance. One aria-live node now — the dots are painted by CSS
    // (.spinner--churn in chat-compat.css), which also puts the animation
    // under the reduced-motion overrides for the first time (inline styles
    // were immune to them).
    return (
      <span
        role="status"
        aria-label="Loading"
        className="spinner--churn"
        style={style}
      />
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

  // C-14 dismiss trio for the v1 modal: native Esc (cancel → onClose) already
  // existed; a click that lands on the <dialog> element itself is a ::backdrop
  // click (native-dialog semantics) — route it through dialog.close() so it
  // shares the single onClose path; the X below is the explicit control.
  // Focus restore is native <dialog> behavior on close.
  const handleBackdropClick = (event: React.MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) {
      event.currentTarget.close();
    }
  };

  return (
    <>
      <style>{MODAL_CSS}</style>
      <dialog
        ref={dialogRef}
        onClose={onClose}
        onClick={handleBackdropClick}
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
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label="Close dialog"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            display: "grid",
            placeItems: "center",
            width: 32,
            height: 32,
            padding: 0,
            border: `1px solid transparent`,
            borderRadius: "var(--radius-md)",
            background: "transparent",
            color: COLORS.textMuted,
            cursor: "pointer",
            fontSize: "var(--fs-body)",
            lineHeight: 1,
          }}
        >
          ✕
        </button>
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
