import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';

export function NotFound(): ReactElement {
  return (
    <main
      style={{
        padding: 80,
        textAlign: 'center',
        animation: 'axiom-fade-in 0.4s cubic-bezier(0.25, 1, 0.5, 1)',
      }}
    >
      <h1
        style={{
          fontSize: 56,
          fontWeight: 800,
          color: '#b8976e',
          marginBottom: 12,
          letterSpacing: '-0.03em',
        }}
      >
        404
      </h1>
      <p style={{ color: '#8a8a8a', fontSize: 16, marginBottom: 28, fontWeight: 300 }}>
        This page doesn't exist or may have been moved.
      </p>
      <Link
        to="/"
        style={{
          display: 'inline-block',
          padding: '10px 24px',
          borderRadius: 8,
          background: '#b8976e',
          color: '#0f0f0f',
          textDecoration: 'none',
          fontSize: 14,
          fontWeight: 600,
          transition: 'all 0.18s ease',
        }}
      >
        Back to home
      </Link>
    </main>
  );
}

export default NotFound;
