import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  ReactElement,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";

// Only keys with render-site consumers; status/danger/success/warning colors live in CSS classes.
export const COLORS = {
  bg: "var(--c-bg)",
  surface: "var(--c-surface)",

  border: "var(--c-border)",

  text: "var(--c-text)",
  textMuted: "var(--c-text-muted)",
  textDim: "var(--c-text-dim)",

  bronze: "var(--c-bronze)",
  bronzeLight: "var(--c-bronze-light)",
  bronzeBg: "var(--c-bronze-bg)",
  bronzeBorder: "var(--c-bronze-border)",
} as const;

const formFieldBase: CSSProperties = {
  padding: "0.625rem 0.875rem",
  borderRadius: "var(--radius-md)",
  // No inline border: .axiom-field owns it so the :focus border change + focus ring actually apply.
  background: COLORS.bg,
  color: COLORS.text,
  fontSize: "var(--text-sm)",
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
        fontSize: "var(--text-xs)",
        color: COLORS.textDim,
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
