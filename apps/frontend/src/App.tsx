// Axiom Protocol — top-level App component.
//
// Sets up the React Router v6+ route table and the top header
// (logo + nav + wallet connect button) for the dApp. The route
// components live in `apps/frontend/src/pages/`:
//
//   - HomePage        (`/`)
//   - VaultDashboard  (`/vaults/:vaultId`)
//   - AgentsBrowser   (`/agents`)
//   - MintAgentPage   (`/agents/new`)         — before :tokenId (route order)
//   - ExecuteStrategyPage (`/agents/:tokenId/execute`)
//   - AgentDetail     (`/agents/:tokenId`)
//   - MarketPage      (`/market`)
//   - HistoryPage     (`/history`)
//   - SettingsPage    (`/settings`)
//
// The route table is the React Router v6+ JSX <Route> API:
//   https://reactrouter.com/en/main/routers/create-browser-router
//   https://reactrouter.com/en/main/route/route
//
// RainbowKit ConnectButton (the open-modal entry point used in the
// header):
//   https://www.rainbowkit.com/docs/connect-button

import type { CSSProperties, ReactElement } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { ConnectButton } from '@rainbow-me/rainbowkit';

import { ErrorBoundary } from './components/ErrorBoundary.js';
import { HealthBadge } from './components/HealthBadge.js';
import { HomePage } from './pages/HomePage.js';
import { VaultDashboard } from './pages/VaultDashboard.js';
import { AgentDetail } from './pages/AgentDetail.js';
import { MarketPage } from './pages/MarketPage.js';
import { HistoryPage } from './pages/HistoryPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { MintAgentPage } from './pages/MintAgentPage.js';
import { ExecuteStrategyPage } from './pages/ExecuteStrategyPage.js';
import { NotFound } from './pages/NotFound.js';

// ---------------------------------------------------------------------------
// Top-level App.
// ---------------------------------------------------------------------------

export function App(): ReactElement {
  const navLinkStyle = ({ isActive }: { isActive: boolean }): CSSProperties => ({
    textDecoration: 'none',
    fontSize: 'var(--text-sm)',
    fontWeight: isActive ? 'var(--fw-semibold)' : 'var(--fw-regular)',
    color: isActive ? 'var(--c-bronze-light)' : 'var(--c-text-muted)',
    padding: '0.375rem 0',
    borderBottom: isActive ? '2px solid var(--c-bronze)' : '2px solid transparent',
    transition: 'color 0.15s ease, border-color 0.15s ease',
  });

  return (
    <>
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
          <NavLink to="/agents" style={navLinkStyle}>
            Agents
          </NavLink>
          <NavLink to="/agents/new" style={navLinkStyle}>
            Mint
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
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
          <HealthBadge />
          <ConnectButton />
        </div>
      </header>
      <main style={{ padding: 'var(--space-2xl) var(--space-xl)', maxWidth: '68rem', margin: '0 auto' }}>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/agents/new" element={<MintAgentPage />} />
            <Route path="/agents/:tokenId/execute" element={<ExecuteStrategyPage />} />
            <Route path="/agents/:tokenId" element={<AgentDetail />} />
            <Route path="/vaults/:vaultId" element={<VaultDashboard />} />
            <Route path="/market" element={<MarketPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ErrorBoundary>
      </main>
    </>
  );
}

export default App;
