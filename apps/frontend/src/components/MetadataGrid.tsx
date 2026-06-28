import type { ReactElement, ReactNode } from 'react';
import { COLORS } from './ui.js';

interface MetadataGridProps {
  children: ReactNode;
}

/** Standardized definition list grid for metadata display. */
export function MetadataGrid({ children }: MetadataGridProps): ReactElement {
  return (
    <dl
      className="stack-on-mobile"
      style={{
        margin: 0,
        display: 'grid',
        gridTemplateColumns: '8.75rem 1fr',
        gap: 'var(--space-md) var(--space-lg)',
        fontSize: 'var(--text-sm)',
        minWidth: 0,
      }}
    >
      {children}
    </dl>
  );
}

export function MetadataLabel({ children }: { children: ReactNode }): ReactElement {
  return (
    <dt style={{ color: COLORS.textDim, fontWeight: 'var(--fw-medium)' }}>
      {children}
    </dt>
  );
}

export function MetadataValue({ children, overflow = true }: { children: ReactNode; overflow?: boolean }): ReactElement {
  return (
    <dd style={{ margin: 0, overflow: overflow ? 'hidden' : undefined, overflowWrap: overflow ? 'break-word' : undefined }}>
      {children}
    </dd>
  );
}
