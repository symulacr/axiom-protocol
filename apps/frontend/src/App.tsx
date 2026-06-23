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
import { Link, Route, Routes } from 'react-router-dom';
import { ConnectButton } from '@rainbow-me/rainbowkit';

import { HealthBadge } from './components/HealthBadge.js';
import { HomePage } from './pages/HomePage.js';

import { VaultDashboard } from './pages/VaultDashboard.js';

import { AgentDetail } from './pages/AgentDetail.js';
import { MarketPage } from './pages/MarketPage.js';
import { HistoryPage } from './pages/HistoryPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { MintAgentPage } from './pages/MintAgentPage.js';
import { ExecuteStrategyPage } from './pages/ExecuteStrategyPage.js';

// ---------------------------------------------------------------------------
// Top-level App.
// ---------------------------------------------------------------------------

export function App(): ReactElement {
  return (
    <>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px',
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        <nav
          aria-label="Primary"
          style={{ display: 'flex', gap: 16, alignItems: 'center' }}
        >
          <Link
            to="/"
            style={{ fontWeight: 600, textDecoration: 'none' }}
          >
            Axiom Protocol
          </Link>
          <Link to="/agents" style={{ textDecoration: 'none' }}>
            Agents
          </Link>
          <Link to="/agents/new" style={{ textDecoration: 'none' }}>
            Mint
          </Link>
          <Link to="/market" style={{ textDecoration: 'none' }}>
            Market
          </Link>
          <Link to="/history" style={{ textDecoration: 'none' }}>
            History
          </Link>
          <Link to="/settings" style={{ textDecoration: 'none' }}>
            Settings
          </Link>
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <HealthBadge />
          <ConnectButton />
        </div>
      </header>
      <main style={{ padding: '24px' }}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/agents/new" element={<MintAgentPage />} />
          <Route path="/agents/:tokenId/execute" element={<ExecuteStrategyPage />} />
          <Route path="/agents/:tokenId" element={<AgentDetail />} />
          <Route path="/vaults/:vaultId" element={<VaultDashboard />} />
          <Route path="/market" element={<MarketPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </>
  );
}

export default App;
