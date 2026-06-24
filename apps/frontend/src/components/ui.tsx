import { useCallback, useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  InputHTMLAttributes,
  ReactElement,
  ReactNode,
} from 'react';

// ─── Design tokens — dark, grounded, spiritual-tech ─────────────────
export const COLORS = {
  // Backgrounds
  bg: '#0f0f0f',
  surface: '#1a1a1a',


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


} as const;

// Shared transitions
const transition = 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const buttonBase: CSSProperties = {
  padding: '0.625rem 1.25rem',
  borderRadius: 'var(--radius-md)',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--fw-semibold)',
  cursor: 'pointer',
  border: '1px solid transparent',
  transition,
  fontFamily: 'inherit',
  letterSpacing: '0.01em',
  lineHeight: 1,
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
    padding: '0.5rem 0.75rem',
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
        borderRadius: 'var(--radius-xl)',
        padding: 'var(--space-xl)',
        transition,
        ...(hover ? { cursor: 'pointer' } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Input({
  style,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>): ReactElement {
  return (
    <input
      {...rest}
      style={{
        padding: '0.625rem 0.875rem',
        borderRadius: 'var(--radius-md)',
        border: `1px solid ${COLORS.borderStrong}`,
        background: COLORS.bg,
        color: COLORS.text,
        fontSize: 'var(--text-sm)',
        fontFamily: 'inherit',
        outline: 'none',
        minWidth: '20rem',
        transition,
        ...style,
      }}
    />
  );
}

type AlertVariant = 'error' | 'success' | 'warning';

const alertStyles: Record<AlertVariant, CSSProperties> = {
  error: {
    padding: 'var(--space-md) var(--space-lg)',
    background: COLORS.dangerBg,
    border: `1px solid ${COLORS.dangerBorder}`,
    color: COLORS.danger,
    borderRadius: 'var(--radius-lg)',
    fontSize: 'var(--text-sm)',
    lineHeight: 'var(--lh-snug)',
  },
  success: {
    padding: 'var(--space-md) var(--space-lg)',
    background: COLORS.successBg,
    border: `1px solid ${COLORS.successBorder}`,
    color: COLORS.success,
    borderRadius: 'var(--radius-lg)',
    fontSize: 'var(--text-sm)',
    lineHeight: 'var(--lh-snug)',
  },
  warning: {
    padding: 'var(--space-md) var(--space-lg)',
    background: COLORS.warningBg,
    border: `1px solid ${COLORS.warningBorder}`,
    color: COLORS.warning,
    borderRadius: 'var(--radius-lg)',
    fontSize: 'var(--text-sm)',
    lineHeight: 'var(--lh-snug)',
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
        marginBottom: 'var(--space-2xl)',
        flexWrap: 'wrap',
        gap: 'var(--space-md)',
      }}
    >
      <div>
        <h1
          style={{
            margin: '0 0 0.375rem',
            fontSize: 'var(--text-xl)',
            fontWeight: 'var(--fw-bold)',
            color: COLORS.text,
            letterSpacing: '-0.02em',
            lineHeight: 'var(--lh-tight)',
          }}
        >
          {title}
        </h1>
        {subtitle !== undefined && (
          <p style={{ margin: 0, color: COLORS.textMuted, fontSize: 'var(--text-sm)', lineHeight: 'var(--lh-snug)' }}>{subtitle}</p>
        )}
      </div>
      {action !== undefined && <div>{action}</div>}
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
      style={{
        fontSize: 'var(--text-xs)',
        fontWeight: 'var(--fw-semibold)',
        color: COLORS.textDim,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        margin: '0 0 var(--space-lg)',
        lineHeight: 'var(--lh-snug)',
        ...style,
      }}
    >
      {children}
    </h2>
  );
}

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
        fontSize: 'var(--text-sm)',
        color: COLORS.bronzeLight,
        background: COLORS.bronzeBg,
        padding: '0.125rem 0.5rem',
        borderRadius: 'var(--radius-sm)',
        wordBreak: 'break-all',
        ...style,
      }}
    >
      {children}
    </code>
  );
}

export function Spinner({ size = 20, style }: { size?: number; style?: CSSProperties }): ReactElement {
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        border: `2px solid ${COLORS.border}`,
        borderTopColor: COLORS.bronze,
        borderRadius: '50%',
        animation: 'axiom-spin 0.8s linear infinite',
        ...style,
      }}
      aria-label="Loading"
    />
  );
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  style?: CSSProperties;
}

export function Modal({ open, onClose, title, children, style }: ModalProps): ReactElement | null {
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
    <dialog
      ref={dialogRef}
      onClose={handleClose}
      style={{
        padding: 28,
        border: `1px solid ${COLORS.borderStrong}`,
        borderRadius: 12,
        maxWidth: 500,
        width: '90vw',
        background: COLORS.surface,
        color: COLORS.text,
        boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        ...style,
      }}
    >
      {title !== undefined && (
        <h2 style={{ marginTop: 0, fontSize: 22, fontWeight: 700, color: COLORS.text, letterSpacing: '-0.02em' }}>
          {title}
        </h2>
      )}
      {children}
    </dialog>
  );
}

export function ConnectedGuard({ children }: { children: React.ReactNode }): React.ReactElement | null {
  const { isConnected } = useAccount();
  if (!isConnected) {
    return (
      <Card style={{ textAlign: 'center', padding: 'var(--space-3xl) var(--space-xl)' }}>
        <p style={{ color: COLORS.textMuted, fontSize: 'var(--text-sm)', margin: 0, fontWeight: 'var(--fw-regular)', lineHeight: 'var(--lh-normal)' }}>
          Connect your wallet to view this content.
        </p>
      </Card>
    );
  }
  return <>{children}</>;
}


