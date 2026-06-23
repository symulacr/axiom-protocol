import type {
  ButtonHTMLAttributes,
  CSSProperties,
  InputHTMLAttributes,
  ReactElement,
  ReactNode,
} from 'react';

// ─── Design tokens ──────────────────────────────────────────────────
const COLORS = {
  bg: '#fafafa',
  surface: '#ffffff',
  border: '#e5e7eb',
  text: '#111827',
  textMuted: '#6b7280',
  primary: '#1f2937',
  primaryText: '#f9fafb',
  danger: '#b91c1c',
  dangerBg: '#fef2f2',
  dangerBorder: '#fecaca',
  success: '#16a34a',
  warning: '#b45309',
  link: '#2563eb',
} as const;

// ─── Button ─────────────────────────────────────────────────────────
type ButtonVariant = 'primary' | 'secondary' | 'danger';

const buttonBase: CSSProperties = {
  padding: '8px 16px',
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  border: '1px solid transparent',
  transition: 'opacity 0.15s',
};

const buttonVariants: Record<ButtonVariant, CSSProperties> = {
  primary: {
    ...buttonBase,
    background: COLORS.primary,
    color: COLORS.primaryText,
    borderColor: COLORS.primary,
  },
  secondary: {
    ...buttonBase,
    background: COLORS.surface,
    color: COLORS.text,
    borderColor: COLORS.border,
  },
  danger: {
    ...buttonBase,
    background: COLORS.danger,
    color: '#fff',
    borderColor: COLORS.danger,
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
        ...(disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
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
}: {
  children: ReactNode;
  style?: CSSProperties;
}): ReactElement {
  return (
    <div
      style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        padding: 20,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
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
        padding: '8px 12px',
        borderRadius: 6,
        border: `1px solid ${COLORS.border}`,
        fontSize: 14,
        outline: 'none',
        minWidth: 320,
        ...style,
      }}
    />
  );
}

// ─── Alert ──────────────────────────────────────────────────────────
type AlertVariant = 'error' | 'success' | 'warning';

const alertStyles: Record<AlertVariant, CSSProperties> = {
  error: {
    padding: '10px 14px',
    background: COLORS.dangerBg,
    border: `1px solid ${COLORS.dangerBorder}`,
    color: '#991b1b',
    borderRadius: 6,
    fontSize: 14,
  },
  success: {
    padding: '10px 14px',
    background: '#f0fdf4',
    border: '1px solid #bbf7d0',
    color: '#166534',
    borderRadius: 6,
    fontSize: 14,
  },
  warning: {
    padding: '10px 14px',
    background: '#fffbeb',
    border: '1px solid #fde68a',
    color: COLORS.warning,
    borderRadius: 6,
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
  color = COLORS.textMuted,
}: {
  children: ReactNode;
  color?: string;
}): ReactElement {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 500,
        background: color === COLORS.success ? '#dcfce7' : '#f3f4f6',
        color,
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
        background: '#e5e7eb',
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
        marginBottom: 20,
        flexWrap: 'wrap',
        gap: 12,
      }}
    >
      <div>
        <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700, color: COLORS.text }}>
          {title}
        </h1>
        {subtitle !== undefined && (
          <p style={{ margin: 0, color: COLORS.textMuted, fontSize: 14 }}>{subtitle}</p>
        )}
      </div>
      {action !== undefined && <div>{action}</div>}
    </div>
  );
}

export { COLORS };
