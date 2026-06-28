import { lazy, Suspense, useEffect, useState, type ReactElement } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { ConnectButton } from '@rainbow-me/rainbowkit';

import { ErrorBoundary } from './components/ErrorBoundary.js';
import { HealthBadge } from './components/HealthBadge.js';
import { COLORS } from './components/ui.js';
import { useMediaQuery } from './hooks/useMediaQuery.js';

const AgentDetail = lazy(() => import('./pages/AgentDetail.js'));
const MarketPage = lazy(() => import('./pages/MarketPage.js'));
const AgentsBrowser = lazy(() => import('./pages/AgentsBrowser.js'));
const MintAgentPage = lazy(() => import('./pages/MintAgentPage.js'));
const ChatPage = lazy(() => import('./pages/ChatPage.js'));
const NotFound = lazy(() => import('./pages/NotFound.js'));


function navLinkStyle({ isActive }: { isActive: boolean }): React.CSSProperties {
  return {
    color: isActive ? COLORS.bronzeLight : COLORS.textMuted,
    textDecoration: 'none',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--fw-medium)',
    padding: '0.75rem 0.5rem',
    transition: 'color 0.18s ease',
  };
}

function ShortcutHelp(): ReactElement | null {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function show() { setOpen(true); }
    document.addEventListener('axiom:show-shortcuts', show);
    return () => document.removeEventListener('axiom:show-shortcuts', show);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  if (!open) return null;

  const shortcuts = [
    { key: 'G', label: 'Go to Agents' },
    { key: 'M', label: 'Go to Market' },
    { key: 'C', label: 'Go to Chat' },
    { key: 'N', label: 'Mint new agent' },
    { key: '⌘K', label: 'Focus search (on Agents page)' },
    { key: '?', label: 'Show this help' },
    { key: 'Esc', label: 'Close dialogs / this help' },
  ];

  return (
    <div
      role="dialog"
      aria-label="Keyboard shortcuts"
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: COLORS.surface, border: `1px solid ${COLORS.border}`,
          borderRadius: 'var(--radius-xl)', padding: 'var(--space-2xl)',
          maxWidth: 380, width: '90vw',
        }}
      >
        <h2 style={{ margin: '0 0 var(--space-lg)', fontSize: 'var(--text-lg)', color: COLORS.text }}>
          Keyboard Shortcuts
        </h2>
        <dl style={{ margin: 0 }}>
          {shortcuts.map((s) => (
            <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${COLORS.border}` }}>
              <dt style={{ color: COLORS.textMuted, fontSize: 'var(--text-sm)' }}>{s.label}</dt>
              <dd style={{ margin: 0 }}>
                <kbd style={{ fontSize: 'var(--text-xs)', padding: '2px 6px', borderRadius: 3, border: `1px solid ${COLORS.borderStrong}`, color: COLORS.text, fontFamily: 'var(--font-mono)' }}>{s.key}</kbd>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

export function App(): ReactElement {
  const isMobile = useMediaQuery('(max-width: 640px)');
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement).isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key.toLowerCase()) {
        case 'g': e.preventDefault(); navigate('/agents'); break;
        case 'm': e.preventDefault(); navigate('/market'); break;
        case 'c': e.preventDefault(); navigate('/chat'); break;
        case 'n': e.preventDefault(); navigate('/agents/new'); break;
        case '?':
          e.preventDefault();
          // Toggle shortcut help — show a brief overlay
          document.dispatchEvent(new CustomEvent('axiom:show-shortcuts'));
          break;
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

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
                Agents <kbd style={{ fontSize: '0.625rem', opacity: 0.5, marginLeft: 4, padding: '1px 4px', borderRadius: 3, border: `1px solid ${COLORS.border}`, lineHeight: 1 }}>G</kbd>
              </NavLink>
              <NavLink to="/market" style={navLinkStyle}>
                Market <kbd style={{ fontSize: '0.625rem', opacity: 0.5, marginLeft: 4, padding: '1px 4px', borderRadius: 3, border: `1px solid ${COLORS.border}`, lineHeight: 1 }}>M</kbd>
              </NavLink>
              <NavLink to="/chat" style={navLinkStyle}>
                Chat <kbd style={{ fontSize: '0.625rem', opacity: 0.5, marginLeft: 4, padding: '1px 4px', borderRadius: 3, border: `1px solid ${COLORS.border}`, lineHeight: 1 }}>C</kbd>
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
          {!isMobile && <span style={{ fontSize: 'var(--text-xs)', color: COLORS.textDim, cursor: 'help' }} title="Press ? for keyboard shortcuts">? shortcuts</span>}

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
          <NavLink to="/market" style={navLinkStyle} onClick={() => setMenuOpen(false)}>
            Market
          </NavLink>
          <NavLink to="/chat" style={navLinkStyle} onClick={() => setMenuOpen(false)}>
            Chat
          </NavLink>
        </div>
      )}
      <main id="main-content" style={{ padding: 'var(--space-2xl) var(--space-xl)', maxWidth: '68rem', margin: '0 auto', minHeight: 'calc(100vh - 3.25rem)', contain: 'layout style' }}>
        <ErrorBoundary>
          <Suspense fallback={
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '4rem' }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                border: `3px solid ${COLORS.border}`, borderTopColor: COLORS.bronze,
                animation: 'axiom-spin 0.8s linear infinite',
              }} />
            </div>
          }>
            <Routes>
              <Route path="/" element={<Navigate to="/agents" replace />} />
              <Route path="/agents" element={<AgentsBrowser />} />
              <Route path="/agents/new" element={<MintAgentPage />} />
              <Route path="/agents/:tokenId" element={<AgentDetail />} />
              <Route path="/market" element={<MarketPage />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/settings" element={<Navigate to="/" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
      <footer style={{ maxWidth: '68rem', margin: '0 auto', padding: 'var(--space-xl)', borderTop: `1px solid ${COLORS.border}` }}>
        <details style={{ fontSize: 'var(--text-xs)', color: COLORS.textDim }}>
          <summary style={{ cursor: 'pointer', color: COLORS.textMuted, marginBottom: 'var(--space-sm)' }}>
            Key Terms
          </summary>
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px var(--space-lg)' }}>
            <dt style={{ color: COLORS.textMuted, fontWeight: 'var(--fw-medium)' }}>iNFT</dt>
            <dd style={{ margin: 0 }}>Intelligent NFT — an ERC-7857 token tied to encrypted AI agent metadata</dd>
            <dt style={{ color: COLORS.textMuted, fontWeight: 'var(--fw-medium)' }}>TEE</dt>
            <dd style={{ margin: 0 }}>Trusted Execution Environment — hardware-isolated secure enclave for signing proofs</dd>
            <dt style={{ color: COLORS.textMuted, fontWeight: 'var(--fw-medium)' }}>Strategy Root</dt>
            <dd style={{ margin: 0 }}>Merkle root that cryptographically verifies which strategies an agent can execute</dd>
            <dt style={{ color: COLORS.textMuted, fontWeight: 'var(--fw-medium)' }}>Daily Limit</dt>
            <dd style={{ margin: 0 }}>Maximum 0G an agent can spend per day, resets at midnight UTC</dd>
            <dt style={{ color: COLORS.textMuted, fontWeight: 'var(--fw-medium)' }}>0G Storage</dt>
            <dd style={{ margin: 0 }}>Decentralized storage where encrypted agent data is persisted with Merkle proof verification</dd>
            <dt style={{ color: COLORS.textMuted, fontWeight: 'var(--fw-medium)' }}>0G Compute</dt>
            <dd style={{ margin: 0 }}>Decentralized inference network where agents run trading strategies via TEE-attested LLMs</dd>
          </dl>
        </details>
      </footer>
      <ShortcutHelp />
    </>
  );

}

export default App;
