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

import type { ReactElement } from 'react';
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
  const navLinkStyle = ({ isActive }: { isActive: boolean }): Record<string, string | number> => ({
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: isActive ? 600 : 400,
    color: isActive ? '#111827' : '#6b7280',
    padding: '4px 0',
    borderBottom: isActive ? '2px solid #111827' : '2px solid transparent',
  });

  return (
    <>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px',
          borderBottom: '1px solid #e5e7eb',
          background: '#fff',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <nav
          aria-label="Primary"
          style={{ display: 'flex', gap: 20, alignItems: 'center' }}
        >
          <Link
            to="/"
            style={{ fontWeight: 700, textDecoration: 'none', fontSize: 16, color: '#111827' }}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <HealthBadge />
          <ConnectButton />
        </div>
      </header>
      <main style={{ padding: '24px', maxWidth: 1080, margin: '0 auto' }}>
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
