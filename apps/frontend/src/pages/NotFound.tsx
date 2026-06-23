import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';

export function NotFound(): ReactElement {
  return (
    <main style={{ padding: 40, textAlign: 'center' }}>
      <h1 style={{ fontSize: 48, fontWeight: 800, color: '#111827', marginBottom: 8 }}>404</h1>
      <p style={{ color: '#6b7280', fontSize: 16, marginBottom: 24 }}>
        This page doesn't exist or has been moved.
      </p>
      <Link
        to="/"
        style={{
          display: 'inline-block',
          padding: '8px 16px',
          borderRadius: 6,
          background: '#1f2937',
          color: '#f9fafb',
          textDecoration: 'none',
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        Back to home
      </Link>
    </main>
  );
}

export default NotFound;
