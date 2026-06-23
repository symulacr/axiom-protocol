import type {
  ButtonHTMLAttributes,
  CSSProperties,
  InputHTMLAttributes,
  ReactElement,
  ReactNode,
} from 'react';

// ─── Design tokens — dark, grounded, spiritual-tech ─────────────────
// Deep charcoal base, warm bronze accent, off-white text.
// Never bright neon. Never light backgrounds.
export const COLORS = {
  // Backgrounds
  bg: '#0f0f0f',
  surface: '#1a1a1a',
  surfaceHover: '#222222',
  elevated: '#1e1e1e',

  // Borders
  border: '#2a2a2a',
  borderStrong: '#3a3a3a',

  // Text
  text: '#f5f5f5',
  textPrimary: '#e5e5e5',
  textMuted: '#8a8a8a',
  textDim: '#6a6a6a',

  // Accent — warm bronze / muted gold
  bronze: '#b8976e',
  bronzeLight: '#c5a880',
  bronzeDim: '#8a7050',
  bronzeBg: 'rgba(184, 151, 110, 0.08)',
  bronzeBorder: 'rgba(184, 151, 110, 0.25)',

  // Semantic — restrained, never neon
  danger: '#c85a5a',
  dangerBg: 'rgba(200, 90, 90, 0.08)',
  dangerBorder: 'rgba(200, 90, 90, 0.2)',
  success: '#6b9e6b',
  successBg: 'rgba(107, 158, 107, 0.08)',
  successBorder: 'rgba(107, 158, 107, 0.2)',
  warning: '#c5a25a',
  warningBg: 'rgba(197, 162, 90, 0.08)',
  warningBorder: 'rgba(197, 162, 90, 0.2)',

  // Links
  link: '#c5a880',
} as const;

// ─── Shared transitions ─────────────────────────────────────────────
const transition = 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)';

// ─── Button ─────────────────────────────────────────────────────────
type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const buttonBase: CSSProperties = {
  padding: '10px 20px',
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  border: '1px solid transparent',
  transition,
  fontFamily: 'inherit',
  letterSpacing: '0.01em',
};

const buttonVariants: Record<ButtonVariant, CSSProperties> = {
  primary: {
    ...buttonBase,
    background: COLORS.bronze,
    color: '#0f0f0f',
    borderColor: COLORS.bronze,
  },
  secondary: {
    ...buttonBase,
    background: 'transparent',
    color: COLORS.textPrimary,
    borderColor: COLORS.borderStrong,
  },
  danger: {
    ...buttonBase,
    background: 'transparent',
    color: COLORS.danger,
    borderColor: COLORS.dangerBorder,
  },
  ghost: {
    ...buttonBase,
    background: 'transparent',
    color: COLORS.textMuted,
    borderColor: 'transparent',
    padding: '8px 12px',
  },
};

export function Button({
  variant = 'primary',
  style,
  disabled,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
}): ReactElement {
  return (
    <button
      {...rest}
      disabled={disabled}
      style={{
        ...buttonVariants[variant],
        ...(disabled ? { opacity: 0.4, cursor: 'not-allowed' } : {}),
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ─── Card ───────────────────────────────────────────────────────────
export function Card({
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
      style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 10,
        padding: 24,
        transition,
        ...(hover ? { cursor: 'pointer' } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── Input ──────────────────────────────────────────────────────────
export function Input({
  style,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>): ReactElement {
  return (
    <input
      {...rest}
      style={{
        padding: '10px 14px',
        borderRadius: 6,
        border: `1px solid ${COLORS.borderStrong}`,
        background: COLORS.bg,
        color: COLORS.text,
        fontSize: 14,
        fontFamily: 'inherit',
        outline: 'none',
        minWidth: 320,
        transition,
        ...style,
      }}
    />
  );
}

// ─── Alert ──────────────────────────────────────────────────────────
type AlertVariant = 'error' | 'success' | 'warning';

const alertStyles: Record<AlertVariant, CSSProperties> = {
  error: {
    padding: '12px 16px',
    background: COLORS.dangerBg,
    border: `1px solid ${COLORS.dangerBorder}`,
    color: COLORS.danger,
    borderRadius: 8,
    fontSize: 14,
  },
  success: {
    padding: '12px 16px',
    background: COLORS.successBg,
    border: `1px solid ${COLORS.successBorder}`,
    color: COLORS.success,
    borderRadius: 8,
    fontSize: 14,
  },
  warning: {
    padding: '12px 16px',
    background: COLORS.warningBg,
    border: `1px solid ${COLORS.warningBorder}`,
    color: COLORS.warning,
    borderRadius: 8,
    fontSize: 14,
  },
};

export function Alert({
  variant = 'error',
  children,
  style,
}: {
  variant?: AlertVariant;
  children: ReactNode;
  style?: CSSProperties;
}): ReactElement {
  return (
    <div role={variant === 'error' ? 'alert' : 'status'} style={{ ...alertStyles[variant], ...style }}>
      {children}
    </div>
  );
}

// ─── Badge ──────────────────────────────────────────────────────────
export function Badge({
  children,
  variant = 'neutral',
}: {
  children: ReactNode;
  variant?: 'neutral' | 'bronze' | 'success' | 'danger';
}): ReactElement {
  const variants: Record<string, CSSProperties> = {
    neutral: { background: 'rgba(255,255,255,0.06)', color: COLORS.textMuted },
    bronze: { background: COLORS.bronzeBg, color: COLORS.bronzeLight },
    success: { background: COLORS.successBg, color: COLORS.success },
    danger: { background: COLORS.dangerBg, color: COLORS.danger },
  };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
        ...variants[variant],
      }}
    >
      {children}
    </span>
  );
}

// ─── Skeleton (loading placeholder) ─────────────────────────────────
export function Skeleton({
  width = '100%',
  height = 20,
  style,
}: {
  width?: string | number;
  height?: string | number;
  style?: CSSProperties;
}): ReactElement {
  return (
    <div
      style={{
        width,
        height,
        background: COLORS.border,
        borderRadius: 4,
        animation: 'axiom-pulse 1.5s ease-in-out infinite',
        ...style,
      }}
    />
  );
}

// ─── PageHeader ─────────────────────────────────────────────────────
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
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        marginBottom: 28,
        flexWrap: 'wrap',
        gap: 12,
      }}
    >
      <div>
        <h1
          style={{
            margin: '0 0 6px',
            fontSize: 28,
            fontWeight: 700,
            color: COLORS.text,
            letterSpacing: '-0.02em',
          }}
        >
          {title}
        </h1>
        {subtitle !== undefined && (
          <p style={{ margin: 0, color: COLORS.textMuted, fontSize: 15 }}>{subtitle}</p>
        )}
      </div>
      {action !== undefined && <div>{action}</div>}
    </div>
  );
}

// ─── SectionTitle ───────────────────────────────────────────────────
export function SectionTitle({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}): ReactElement {
  return (
    <h2
      style={{
        fontSize: 13,
        fontWeight: 600,
        color: COLORS.textDim,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        margin: '0 0 16px',
        ...style,
      }}
    >
      {children}
    </h2>
  );
}

// ─── Divider ────────────────────────────────────────────────────────
export function Divider({ style }: { style?: CSSProperties }): ReactElement {
  return (
    <hr
      style={{
        border: 'none',
        borderTop: `1px solid ${COLORS.border}`,
        margin: '24px 0',
        ...style,
      }}
    />
  );
}

// ─── MonoLabel (for hex / addresses) ────────────────────────────────
export function MonoLabel({
  children,
  title,
  style,
}: {
  children: ReactNode;
  title?: string;
  style?: CSSProperties;
}): ReactElement {
  return (
    <code
      title={title}
      style={{
        fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', monospace",
        fontSize: 13,
        color: COLORS.bronzeLight,
        background: COLORS.bronzeBg,
        padding: '2px 8px',
        borderRadius: 4,
        wordBreak: 'break-all',
        ...style,
      }}
    >
      {children}
    </code>
  );
}
