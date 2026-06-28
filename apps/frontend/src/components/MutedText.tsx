import type { ReactElement, ReactNode } from 'react';
import { COLORS } from './ui.js';

interface MutedTextProps {
  children: ReactNode;
  style?: React.CSSProperties;
}

/** Standardized muted text paragraph. */
export function MutedText({ children, style }: MutedTextProps): ReactElement {
  return (
    <p style={{ color: COLORS.textMuted, fontSize: 'var(--text-sm)', margin: 0, ...style }}>
      {children}
    </p>
  );
}
