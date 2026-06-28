import React, { forwardRef, useCallback, useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  InputHTMLAttributes,
  ReactElement,
  ReactNode,
} from 'react';

export const COLORS = {
  // Backgrounds — warm-tinted near-blacks
  bg: '#10100e',           // obsidian
  surface: '#1c1a17',      // dark-carbon
  surfaceLight: '#f0ebe3', // parchment (for reading contexts)

  // Borders — warm-tinted
  border: '#2d2a25',       // warm-iron
  borderStrong: '#3d3932', // aged-steel

  // Text — warm-tinted near-whites
  text: '#f5f0e8',         // bright-nickel
  textPrimary: '#e5dfd6',  // polished-silver
  textMuted: '#9a9288',    // warm-pewter
  textDim: '#736b62',      // tarnished-lead

  // Accent — warm bronze / muted gold
  bronze: '#b8976e',
  bronzeLight: '#c5a880',
  bronzeBg: 'rgba(184, 151, 110, 0.08)',
  bronzeBorder: 'rgba(184, 151, 110, 0.25)',

  // Secondary accent — oxidized teal
  teal: '#5a8a8a',
  tealLight: '#7aa8a8',
  tealBg: 'rgba(90, 138, 138, 0.15)',
  tealBorder: 'rgba(90, 138, 138, 0.2)',

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

const transition = 'color 0.18s cubic-bezier(0.4, 0, 0.2, 1), background 0.18s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.18s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.18s cubic-bezier(0.4, 0, 0.2, 1)';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

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
    color: '#10100e',
    borderColor: COLORS.bronze,
  },
  secondary: {
    ...buttonBase,
    background: 'transparent',
    color: COLORS.textPrimary,
    borderColor: COLORS.borderStrong,
  },
  ghost: {
    ...buttonBase,
    background: 'transparent',
    color: COLORS.textMuted,
    borderColor: 'transparent',
    padding: '0.5rem 0.75rem',
  },
};

export const Button = React.memo(function Button({
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
      role={hover ? 'button' : undefined}
      tabIndex={hover ? 0 : undefined}
      onKeyDown={
        hover
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.currentTarget.click();
              }
            }
          : undefined
      }
      style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 'var(--radius-xl)',
        padding: 'var(--space-xl)',
        transition,
        overflow: 'hidden',
        contain: 'layout style',
        ...(hover ? { cursor: 'pointer' } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
});

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { style, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      {...rest}
      style={{
        padding: '0.625rem 0.875rem',
        borderRadius: 'var(--radius-md)',
        border: `1px solid ${COLORS.borderStrong}`,
        background: COLORS.bg,
        color: COLORS.text,
        fontSize: 'var(--text-sm)',
        fontFamily: 'inherit',
        minWidth: '0',
        transition,
        ...style,
      }}
    />
  );
});

type AlertVariant = 'error' | 'success' | 'info';

const alertStyles: Record<AlertVariant, CSSProperties> = {
  error: {
    padding: 'var(--space-md) var(--space-lg)',
    background: 'rgba(200, 90, 90, 0.05)',
    border: `1px solid ${COLORS.dangerBorder}`,
    color: COLORS.danger,
    borderRadius: 'var(--radius-lg)',
    fontSize: 'var(--text-sm)',
    lineHeight: 'var(--lh-snug)',
    overflowWrap: 'break-word',
  },
  success: {
    padding: 'var(--space-md) var(--space-lg)',
    background: 'rgba(107, 158, 107, 0.05)',
    border: `1px solid ${COLORS.successBorder}`,
    color: COLORS.success,
    borderRadius: 'var(--radius-lg)',
    fontSize: 'var(--text-sm)',
    lineHeight: 'var(--lh-snug)',
    overflowWrap: 'break-word',
  },
  info: {
    padding: 'var(--space-md) var(--space-lg)',
    background: 'rgba(90, 138, 138, 0.10)',
    border: `1px solid ${COLORS.tealBorder}`,
    color: COLORS.teal,
    borderRadius: 'var(--radius-lg)',
    fontSize: 'var(--text-sm)',
    lineHeight: 'var(--lh-snug)',
    overflowWrap: 'break-word',
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

interface ErrorAlertProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorAlert({ message, onRetry }: ErrorAlertProps): ReactElement {
  return (
    <Alert variant="error">
      <p>{message ?? 'An unexpected error occurred'}</p>
      {onRetry !== undefined && (
        <Button variant="secondary" onClick={onRetry} className="text-xs" style={{ flexShrink: 0, minHeight: 44 }}>
          Retry
        </Button>
      )}
    </Alert>
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
      role="status"
      aria-label="Loading content"
      style={{
        width,
        height,
        background: COLORS.border,
        borderRadius: 'var(--radius-sm)',
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
    <div className="flex items-baseline justify-between mb-2xl flex-wrap gap-md">
      <div style={{ minWidth: 0, overflow: 'hidden' }}>
        <h1
          className="text-xl fw-semibold lh-tight"
          style={{
            margin: '0 0 0.375rem',
            color: COLORS.text,
            letterSpacing: '-0.02em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
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
  spacing = 'compact',
}: {
  children: ReactNode;
  style?: CSSProperties;
  spacing?: 'compact' | 'spaced';
}): ReactElement {
  return (
    <h2
      className="text-sm fw-semibold text-dim lh-snug m-0 mb-lg"
      style={{
        letterSpacing: '0.02em',
        marginTop: spacing === 'spaced' ? 'var(--space-2xl)' : undefined,
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
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-sm)',
        color: COLORS.bronzeLight,
        background: 'rgba(184, 151, 110, 0.05)',
        padding: '0.125rem 0.5rem',
        borderRadius: 'var(--radius-sm)',
        display: 'inline-block',
        maxWidth: '100%',
        overflow: 'hidden',
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
      role="status"
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

export const Modal = React.memo(function Modal({ open, onClose, title, children, style }: ModalProps): ReactElement | null {
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
      aria-labelledby={title ? 'modal-title' : undefined}
      style={{
        padding: 28,
        border: `1px solid ${COLORS.borderStrong}`,
        borderRadius: 'var(--radius-xl)',
        maxWidth: 500,
        width: '90vw',
        maxHeight: '90vh',
        overflow: 'auto',
        background: COLORS.surface,
        color: COLORS.text,
        boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        ...style,
      }}
    >
      {title !== undefined && (
        <h2 id="modal-title" className="mt-0 text-xl fw-bold" style={{ color: COLORS.text, letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </h2>
      )}
      {children}
    </dialog>
  );
});

export function ConnectedGuard({ children }: { children: React.ReactNode }): React.ReactElement | null {
  const { isConnected } = useAccount();
  if (!isConnected) {
    return (
      <Card style={{ textAlign: 'center', padding: 'var(--space-3xl) var(--space-xl)' }}>
        <p className="text-muted text-sm fw-regular">
          Connect your wallet to view agents, manage vaults, and execute strategies.
        </p>
      </Card>
    );
  }
  return <>{children}</>;
}

export function HelpTip({ tip, children }: { tip: string; children?: ReactNode }): ReactElement {
  return (
    <span className="helptip" style={{ position: 'relative', cursor: 'help', borderBottom: `1px dotted ${COLORS.textDim}` }}>
      {children}
      <span
        role="tooltip"
        className="helptip-content"
        style={{
          position: 'absolute',
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 'var(--radius-md)',
          padding: '6px 10px',
          fontSize: 'var(--text-xs)',
          color: COLORS.text,
          pointerEvents: 'none',
          opacity: 0,
          transition: 'opacity 0.15s ease',
          zIndex: 100,
          maxWidth: 280,
          whiteSpace: 'normal',
          lineHeight: 'var(--lh-snug)',
        }}
      >
        {tip}
      </span>
    </span>
  );
}


