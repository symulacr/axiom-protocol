import { lazy, Suspense, useState, type ReactElement } from 'react';
import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { ConnectButton } from '@rainbow-me/rainbowkit';

import { ErrorBoundary } from './components/ErrorBoundary.js';
import { HealthBadge } from './components/HealthBadge.js';
import { COLORS } from './components/ui.js';
import { useMediaQuery } from './hooks/useMediaQuery.js';
import { HomePage } from './pages/HomePage.js';

const VaultDashboard = lazy(() => import('./pages/VaultDashboard.js'));
const AgentDetail = lazy(() => import('./pages/AgentDetail.js'));
const MarketPage = lazy(() => import('./pages/MarketPage.js'));
const HistoryPage = lazy(() => import('./pages/HistoryPage.js'));
const SettingsPage = lazy(() => import('./pages/SettingsPage.js'));
const AgentsBrowser = lazy(() => import('./pages/AgentsBrowser.js'));
const MintAgentPage = lazy(() => import('./pages/MintAgentPage.js'));
const ExecuteStrategyPage = lazy(() => import('./pages/ExecuteStrategyPage.js'));
const AgentPaymentsPage = lazy(() => import('./pages/AgentPaymentsPage.js').then(m => ({ default: m.AgentPaymentsPage })));
const NotFound = lazy(() => import('./pages/NotFound.js'));

function navLinkStyle({ isActive }: { isActive: boolean }): React.CSSProperties {
  return {
    color: isActive ? COLORS.bronzeLight : COLORS.textMuted,
    textDecoration: 'none',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--fw-medium)',
    padding: '0.375rem 0',
    transition: 'color 0.18s ease',
  };
}

export function App(): ReactElement {
  const isMobile = useMediaQuery('(max-width: 640px)');
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.875rem 2rem',
          borderBottom: '1px solid var(--c-border)',
          background: 'var(--c-bg)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          backdropFilter: 'blur(12px)',
        }}
      >
        <nav
          aria-label="Primary"
          style={{ display: 'flex', gap: '1.75rem', alignItems: 'center' }}
        >
          <Link
            to="/"
            style={{
              fontWeight: 'var(--fw-bold)',
              textDecoration: 'none',
              fontSize: 'var(--text-lg)',
              color: 'var(--c-text)',
              letterSpacing: '-0.01em',
            }}
          >
            Axiom Protocol
          </Link>
          {!isMobile && (
            <>
              <NavLink to="/agents" style={navLinkStyle}>
                Agents
              </NavLink>
              <NavLink to="/agents/new" style={navLinkStyle}>
                Mint
              </NavLink>
              <NavLink to="/vaults/0" style={navLinkStyle}>
                Vault
              </NavLink>
              <NavLink to="/market" style={navLinkStyle}>
                Market
              </NavLink>
              <NavLink to="/history" style={navLinkStyle}>
                History
              </NavLink>
              <NavLink to="/settings" style={navLinkStyle}>
                Settings
              </NavLink>
            </>
          )}
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
          {isMobile && (
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Toggle navigation menu"
              aria-expanded={menuOpen}
              aria-controls="mobile-nav-menu"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--c-text-muted)',
                fontSize: '1.5rem',
                cursor: 'pointer',
                padding: '0.25rem',
                lineHeight: 1,
              }}
            >
              {menuOpen ? '✕' : '☰'}
            </button>
          )}
          <HealthBadge />
          <ConnectButton />
        </div>
      </header>
      {isMobile && menuOpen && (
        <div
          id="mobile-nav-menu"
          onKeyDown={(e) => {
            if (e.key !== 'Tab') return;
            const focusable = e.currentTarget.querySelectorAll('a[href], button:not([disabled])');
            const first = focusable[0] as HTMLElement;
            const last = focusable[focusable.length - 1] as HTMLElement;
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault(); last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault(); first.focus();
            }
          }}
          style={{
            position: 'fixed',
            top: '3.25rem',
            left: 0,
            right: 0,
            background: 'var(--c-bg)',
            borderBottom: '1px solid var(--c-border)',
            padding: 'var(--space-md) var(--space-xl)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            zIndex: 99,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}
        >
          <NavLink to="/agents" style={navLinkStyle} onClick={() => setMenuOpen(false)}>
            Agents
          </NavLink>
          <NavLink to="/agents/new" style={navLinkStyle} onClick={() => setMenuOpen(false)}>
            Mint
          </NavLink>
          <NavLink to="/vaults/0" style={navLinkStyle} onClick={() => setMenuOpen(false)}>
            Vault
          </NavLink>
          <NavLink to="/market" style={navLinkStyle} onClick={() => setMenuOpen(false)}>
            Market
          </NavLink>
          <NavLink to="/history" style={navLinkStyle} onClick={() => setMenuOpen(false)}>
            History
          </NavLink>
          <NavLink to="/settings" style={navLinkStyle} onClick={() => setMenuOpen(false)}>
            Settings
          </NavLink>
        </div>
      )}
      <div id="main-content" style={{ padding: 'var(--space-2xl) var(--space-xl)', maxWidth: '68rem', margin: '0 auto', minHeight: 'calc(100vh - 3.25rem)' }}>
        <ErrorBoundary>
          <Suspense fallback={
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '4rem' }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                border: '3px solid rgba(180,160,120,0.2)', borderTopColor: '#b4a078',
                animation: 'spin 0.8s linear infinite',
              }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          }>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/agents" element={<AgentsBrowser />} />
              <Route path="/agents/new" element={<MintAgentPage />} />
              <Route path="/agents/:tokenId/execute" element={<ExecuteStrategyPage />} />
              <Route path="/agents/:tokenId/payments" element={<AgentPaymentsPage />} />
              <Route path="/agents/:tokenId" element={<AgentDetail />} />
              <Route path="/vaults" element={<Navigate to="/vaults/0" replace />} />
              <Route path="/vaults/:vaultId" element={<VaultDashboard />} />
              <Route path="/market" element={<MarketPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </div>
    </>
  );
}

export default App;
