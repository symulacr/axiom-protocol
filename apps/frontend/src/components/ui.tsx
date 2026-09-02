import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  ReactElement,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";

const formFieldBase: CSSProperties = {
  padding: "0.625rem 0.875rem",
  borderRadius: "var(--radius-md)",
  // No inline border: .axiom-field owns it so the :focus border change + focus ring actually apply.
  background: "var(--bg-2)",
  color: "var(--text)",
  fontSize: "var(--fs-body)",
  fontFamily: "inherit",
  minWidth: "0",
  transition: "var(--transition)",
  // focus ring comes from a CSS class on inputs, not inline styles
};

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
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
        color: "var(--copper-bright)",
        border: `1px solid ${"color-mix(in srgb, var(--copper) 40%, transparent)"}`,
        borderRadius: "var(--radius-sm)",
        padding: "2px 6px",
        fontFamily: "inherit",
        fontSize: "var(--fs-small)",
        lineHeight: 1,
        minWidth: "4ch",
        textAlign: "center",
        cursor: "pointer",
        ...style,
      }}
    >
      {/* Single node with label swap (a11y: one announcement). */}
      {copied ? "✓" : "Copy"}
    </button>
  );
}

export function MonoLabel({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}): ReactElement {
  return (
    <code
      style={{
        fontFamily: "var(--font-data)",
        fontSize: "var(--fs-small)",
        fontVariantNumeric: "var(--tabular)",
        color: "var(--copper-bright)",
        background: "color-mix(in srgb, var(--copper) 12%, transparent)",
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
}

export function ErrorRef({
  code,
  requestId,
}: {
  code?: string;
  requestId?: string;
}): ReactElement {
  if (code === undefined && requestId === undefined) return <></>;
  const ref = [requestId, code].filter(Boolean).join(", ");
  return (
    <span
      style={{
        display: "block",
        marginTop: "var(--space-xs)",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--fs-small)",
        color: "var(--dim)",
      }}
    >
      Ref {ref}
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
    // One aria-live node (was 9 spans per instance); CSS paints the dots, so reduced-motion overrides apply.
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
        border: "2px solid var(--line)",
        borderTopColor: "var(--copper)",
        borderRadius: "50%",
        animation: "axiom-spin var(--dur-spin) linear infinite",
        ...style,
      }}
      aria-label="Loading"
    />
  );
}

/**
 * Shared skeleton primitive (audit §3.10: "no skeleton or spinner was ever
 * observed on gated routes; content pops in"). ONE system for every async
 * surface: an aria-busy container of geometry-matched aria-hidden placeholder
 * rows, each carrying the T8 poll-gap churn cue (.spinner--churn dots) —
 * no bespoke per-page skeletons, no new CSS.
 */
export function SkeletonRows({
  count = 3,
  className,
  rowClassName,
  row,
}: {
  count?: number;
  /** Wrapper class (the real list container, when one exists). */
  className?: string;
  /** The real row class, so placeholder geometry matches live rows exactly. */
  rowClassName?: string;
  /** Per-row placeholder cells. Default: the churn cue alone. */
  row?: ReactNode;
}): ReactElement {
  return (
    <div className={className} aria-busy="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={rowClassName} aria-hidden="true">
          {row ?? <i className="spinner--churn" />}
        </div>
      ))}
    </div>
  );
}

/** Shared panel placeholder: title + optional hint line (+ trailing control). */
export function EmptyState({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {hint !== undefined && <span>{hint}</span>}
      {children}
    </div>
  );
}
