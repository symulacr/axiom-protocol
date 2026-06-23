import { Component, type ErrorInfo, type ReactNode } from 'react';
import { COLORS } from './ui.js';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{
          padding: 24, margin: 24,
          border: `1px solid ${COLORS.dangerBorder}`,
          borderRadius: 8, background: COLORS.dangerBg,
          color: COLORS.danger, fontSize: 14,
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>Something went wrong</h2>
          <p style={{ margin: 0 }}>{this.state.error?.message ?? 'Unknown error'}</p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 12, padding: '6px 16px',
              background: COLORS.danger, color: '#fff',
              border: 'none', borderRadius: 4, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
