import type { ReactElement, ReactNode } from 'react';
import { Card } from './ui.js';

interface EmptyStateProps {
  children: ReactNode;
}

/**
 * Standardized empty state container. Consistent padding, centering, and styling
 * across all pages. Replaces the repeated Card pattern.
 */
export function EmptyState({ children }: EmptyStateProps): ReactElement {
  return (
    <Card style={{ padding: 'var(--space-3xl) var(--space-xl)', textAlign: 'center' }}>
      {children}
    </Card>
  );
}
