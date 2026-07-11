import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { HealthBadge } from "./components/HealthBadge.js";
import { COLORS, ConnectedGuard, Kbd, Spinner } from "./components/ui.js";
import { useMediaQuery } from "./hooks/useMediaQuery.js";
import { useFocusTrap } from "./hooks/useFocusTrap.js";

const AgentDetail = lazy(() => import("./pages/AgentDetail.js"));
const MarketPage = lazy(() => import("./pages/MarketPage.js"));
const AgentsBrowser = lazy(() => import("./pages/AgentsBrowser.js"));
const MintAgentPage = lazy(() => import("./pages/MintAgentPage.js"));
const ChatPage = lazy(() => import("./pages/ChatPage.js"));
const NotFound = lazy(() => import("./pages/NotFound.js"));
const HomePage = lazy(() => import("./pages/HomePage.js"));

const ConnectButton = lazy(() =>
  import("@rainbow-me/rainbowkit").then((m) => ({ default: m.ConnectButton })),
);

function WalletButton(): ReactElement {
  return (
    <Suspense fallback={null}>
      <ConnectButton />
    </Suspense>
  );
}

function navLinkStyle({
  isActive,
}: {
  isActive: boolean;
}): React.CSSProperties {
  return {
    color: isActive ? COLORS.bronzeLight : COLORS.textMuted,
    textDecoration: "none",
    fontSize: "var(--text-sm)",
    fontWeight: "var(--fw-medium)",
    padding: "0.75rem 0.5rem",
    transition: "color 0.18s var(--ease-out)",
  };
}

function WalletRoute({ children }: { children: ReactElement }) {
  return <ConnectedGuard>{children}</ConnectedGuard>;
}

function ShortcutHelp(): ReactElement | null {
  const [open, setOpen] = useState(false);
  const [entered, setEntered] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    function show() {
      setOpen(true);
    }
    document.addEventListener("axiom:show-shortcuts", show);
    return () => document.removeEventListener("axiom:show-shortcuts", show);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  useFocusTrap(panelRef, open);

  if (!open) return null;

  const shortcuts = [
    { key: "G", label: "Go to Agents" },
    { key: "M", label: "Go to Market" },
    { key: "C", label: "Go to Chat" },
    { key: "N", label: "Mint new agent" },
    { key: "⌘K", label: "Focus search (on Agents page)" },
    { key: "?", label: "Show this help" },
    { key: "Esc", label: "Close dialogs / this help" },
  ];

  return (
    <div
      role="dialog"
      aria-label="Keyboard shortcuts"
      onClick={() => setOpen(false)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "var(--c-overlay)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: "var(--radius-xl)",
          padding: "var(--space-2xl)",
          maxWidth: 380,
          width: "90vw",
          opacity: entered ? 1 : 0,
          transform: entered ? "scale(1)" : "scale(0.96)",
          transition:
            "opacity 200ms var(--ease-out), transform 200ms var(--ease-out)",
        }}
      >
        <h2
          tabIndex={-1}
          style={{
            margin: "0 0 var(--space-lg)",
            fontSize: "var(--text-lg)",
            color: COLORS.text,
            outline: "none",
          }}
        >
          Keyboard Shortcuts
        </h2>
        <dl style={{ margin: 0 }}>
          {shortcuts.map((s) => (
            <div
              key={s.key}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "6px 0",
                borderBottom: `1px solid ${COLORS.border}`,
              }}
            >
              <dt
                style={{ color: COLORS.textMuted, fontSize: "var(--text-sm)" }}
              >
                {s.label}
              </dt>
              <dd style={{ margin: 0 }}>
                <Kbd>{s.key}</Kbd>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

export function App(): ReactElement {
  const isMobile = useMediaQuery("(max-width: 640px)");
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const mobileNavRef = useRef<HTMLDivElement>(null);
  useFocusTrap(mobileNavRef, isMobile && menuOpen);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (e.target as HTMLElement).isContentEditable
      )
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key.toLowerCase()) {
        case "g":
          e.preventDefault();
          setMenuOpen(false);
          navigate("/agents");
          break;
        case "m":
          e.preventDefault();
          setMenuOpen(false);
          navigate("/market");
          break;
        case "c":
          e.preventDefault();
          setMenuOpen(false);
          navigate("/chat");
          break;
        case "n":
          e.preventDefault();
          setMenuOpen(false);
          navigate("/agents/new");
          break;
        case "?":
          e.preventDefault();
          document.dispatchEvent(new CustomEvent("axiom:show-shortcuts"));
          break;
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [navigate, setMenuOpen]);

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "var(--space-md) var(--space-2xl)",
          borderBottom: "1px solid var(--c-border)",
          background: "var(--c-bg)",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <nav
          aria-label="Primary"
          style={{ display: "flex", gap: "var(--space-2xl)", alignItems: "center" }}
        >
          <Link
            to="/"
            style={{
              fontWeight: "var(--fw-bold)",
              textDecoration: "none",
              fontSize: "var(--text-lg)",
              color: "var(--c-text)",
              letterSpacing: "-0.01em",
            }}
          >
            Axiom Protocol
          </Link>
          {!isMobile && (
            <>
              <NavLink to="/agents" style={navLinkStyle}>
                Agents{" "}
                <Kbd
                  style={{
                    fontSize: "var(--text-xs)",
                    opacity: 0.5,
                    marginLeft: 4,
                    padding: "1px 4px",
                    borderRadius: 3,
                    border: `1px solid ${COLORS.border}`,
                    lineHeight: 1,
                  }}
                >
                  G
                </Kbd>
              </NavLink>
              <NavLink to="/market" style={navLinkStyle}>
                Market{" "}
                <Kbd
                  style={{
                    fontSize: "var(--text-xs)",
                    opacity: 0.5,
                    marginLeft: 4,
                    padding: "1px 4px",
                    borderRadius: 3,
                    border: `1px solid ${COLORS.border}`,
                    lineHeight: 1,
                  }}
                >
                  M
                </Kbd>
              </NavLink>
              <NavLink to="/chat" style={navLinkStyle}>
                Chat{" "}
                <Kbd
                  style={{
                    fontSize: "var(--text-xs)",
                    opacity: 0.5,
                    marginLeft: 4,
                    padding: "1px 4px",
                    borderRadius: 3,
                    border: `1px solid ${COLORS.border}`,
                    lineHeight: 1,
                  }}
                >
                  C
                </Kbd>
              </NavLink>
            </>
          )}
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
          {isMobile && (
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Toggle navigation menu"
              aria-expanded={menuOpen}
              aria-controls="mobile-nav-menu"
              style={{
                background: "none",
                border: "none",
                color: "var(--c-text-muted)",
                fontSize: "1.5rem",
                cursor: "pointer",
                padding: "0.25rem",
                lineHeight: 1,
              }}
            >
              {menuOpen ? "✕" : "☰"}
            </button>
          )}
          {!isMobile && (
            <span
              style={{
                fontSize: "var(--text-xs)",
                color: COLORS.textDim,
                cursor: "help",
              }}
              title="Press ? for keyboard shortcuts"
            >
              ? shortcuts
            </span>
          )}

          <HealthBadge />
          <WalletButton />
        </div>
      </header>
      {isMobile && (
        <div
          id="mobile-nav-menu"
          ref={mobileNavRef}
          style={{
            position: "fixed",
            top: "var(--nav-h)",
            left: 0,
            right: 0,
            background: "var(--c-surface)",
            borderBottom: "1px solid var(--c-border)",
            padding: "var(--space-md) var(--space-xl)",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
            zIndex: 99,
            borderTop: "1px solid var(--c-border-strong)",
            transform: menuOpen ? "translateY(0)" : "translateY(-12px)",
            opacity: menuOpen ? 1 : 0,
            pointerEvents: menuOpen ? "auto" : "none",
            transition:
              "transform 250ms var(--ease-drawer, cubic-bezier(0.32, 0.72, 0, 1)), opacity 250ms var(--ease-drawer, cubic-bezier(0.32, 0.72, 0, 1))",
          }}
        >
          <NavLink
            to="/agents"
            style={navLinkStyle}
            onClick={() => setMenuOpen(false)}
          >
            Agents
          </NavLink>
          <NavLink
            to="/market"
            style={navLinkStyle}
            onClick={() => setMenuOpen(false)}
          >
            Market
          </NavLink>
          <NavLink
            to="/chat"
            style={navLinkStyle}
            onClick={() => setMenuOpen(false)}
          >
            Chat
          </NavLink>
        </div>
      )}
      <main
        id="main-content"
        style={{
          padding: "var(--space-2xl) var(--space-xl)",
          maxWidth: "var(--content-max)",
          margin: "0 auto",
          minHeight: "calc(100vh - var(--nav-h))",
          contain: "layout style",
        }}
      >
        <ErrorBoundary>
          <Suspense
            fallback={
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  padding: "4rem",
                }}
              >
                <Spinner size={32} />
              </div>
            }
          >
            <div key={location.pathname} className="fade-enter">
              <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/agents" element={<AgentsBrowser />} />
              <Route
                path="/agents/new"
                element={
                  <WalletRoute>
                    <MintAgentPage />
                  </WalletRoute>
                }
              />
              <Route
                path="/agents/:tokenId"
                element={
                  <WalletRoute>
                    <AgentDetail />
                  </WalletRoute>
                }
              />
              <Route path="/market" element={<MarketPage />} />
              <Route
                path="/chat"
                element={
                  <WalletRoute>
                    <ChatPage />
                  </WalletRoute>
                }
              />
              <Route path="/settings" element={<Navigate to="/" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </div>
          </Suspense>
        </ErrorBoundary>
      </main>
      <footer
        style={{
          maxWidth: "68rem",
          margin: "0 auto",
          padding: "var(--space-xl)",
          borderTop: `1px solid ${COLORS.border}`,
        }}
      >
        <details style={{ fontSize: "var(--text-xs)", color: COLORS.textDim }}>
          <summary
            style={{
              cursor: "pointer",
              color: COLORS.textMuted,
              marginBottom: "var(--space-sm)",
            }}
          >
            Key Terms
          </summary>
          <dl
            style={{
              margin: 0,
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: "4px var(--space-lg)",
            }}
          >
            <dt
              style={{
                color: COLORS.textMuted,
                fontWeight: "var(--fw-medium)",
              }}
            >
              iNFT
            </dt>
            <dd style={{ margin: 0 }}>
              Intelligent NFT — an ERC-7857 token tied to encrypted AI agent
              metadata
            </dd>
            <dt
              style={{
                color: COLORS.textMuted,
                fontWeight: "var(--fw-medium)",
              }}
            >
              TEE
            </dt>
            <dd style={{ margin: 0 }}>
              Trusted Execution Environment — hardware-isolated secure enclave
              for signing proofs
            </dd>
            <dt
              style={{
                color: COLORS.textMuted,
                fontWeight: "var(--fw-medium)",
              }}
            >
              Strategy Root
            </dt>
            <dd style={{ margin: 0 }}>
              Merkle root that cryptographically verifies which strategies an
              agent can execute
            </dd>
            <dt
              style={{
                color: COLORS.textMuted,
                fontWeight: "var(--fw-medium)",
              }}
            >
              Daily Limit
            </dt>
            <dd style={{ margin: 0 }}>
              Maximum 0G an agent can spend per day, resets at midnight UTC
            </dd>
            <dt
              style={{
                color: COLORS.textMuted,
                fontWeight: "var(--fw-medium)",
              }}
            >
              0G Storage
            </dt>
            <dd style={{ margin: 0 }}>
              Decentralized storage where encrypted agent data is persisted with
              Merkle proof verification
            </dd>
            <dt
              style={{
                color: COLORS.textMuted,
                fontWeight: "var(--fw-medium)",
              }}
            >
              0G Compute
            </dt>
            <dd style={{ margin: 0 }}>
              Decentralized inference network where agents run trading
              strategies via TEE-attested LLMs
            </dd>
          </dl>
        </details>
      </footer>
      <ShortcutHelp />
    </>
  );
}

export default App;
