// @fix F2-A1: Remove — zero imports across entire codebase
// @audit-ref: V1-A5 confirmed dead (no barrel re-exports, no dynamic imports, no test references)
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
