import {
  lazy,
  Suspense,
  useCallback,
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
  useSearchParams,
} from "react-router-dom";
import { useAccount } from "wagmi";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { HealthBadge } from "./components/HealthBadge.js";
import {
  COLORS,
  ConnectedGuard,
  Kbd,
  Modal,
  Spinner,
} from "./components/ui.js";
import { useMediaQuery } from "./hooks/useMediaQuery.js";
import { useFocusTrap } from "./hooks/useFocusTrap.js";
import { useTheme } from "./hooks/useTheme.js";
import {
  APP_CHAT,
  APP_HOME,
  PRIMARY_NAV,
  isMintOpen,
  withMintOpen,
} from "./navigation/ia.js";

const AgentDetail = lazy(() => import("./pages/AgentDetail.js"));
const MintForm = lazy(() =>
  import("./components/MintForm.js").then((m) => ({ default: m.MintForm })),
);
const ChatPage = lazy(() => import("./pages/ChatPage.js"));
const NotFound = lazy(() => import("./pages/NotFound.js"));
const HomePage = lazy(() => import("./pages/HomePage.js"));
const LandingPage = lazy(() => import("./features/landing/LandingPage.js"));

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

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return ["shell-nav__link", isActive ? "is-active" : ""].filter(Boolean).join(" ");
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
    { key: "H", label: "Home — portfolio + agents" },
    { key: "A", label: "Chat with Axiom" },
    { key: "N", label: "Mint agent (modal)" },
    { key: "⌘K", label: "Search agents on Home" },
    { key: "?", label: "Show this help" },
    { key: "Esc", label: "Close dialogs" },
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
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isLanding = location.pathname === "/";
  const isChat = location.pathname === "/chat" || location.pathname.startsWith("/chat/");
  const mintOpen = isMintOpen(searchParams);
  const mintProvider = searchParams.get("provider") ?? undefined;
  const { isConnected } = useAccount();
  const { theme, toggle: toggleTheme } = useTheme();
  const wasConnected = useRef(false);
  const mobileNavRef = useRef<HTMLDivElement>(null);
  useFocusTrap(mobileNavRef, isMobile && menuOpen);

  const openMint = useCallback(() => {
    setMenuOpen(false);
    // Stay on shell when possible; open mint modal in place
    if (isLanding) {
      navigate(`${APP_HOME}?mint=1`);
      return;
    }
    setSearchParams(withMintOpen(searchParams, true), { replace: false });
  }, [isLanding, navigate, searchParams, setSearchParams]);

  const closeMint = useCallback(() => {
    const next = withMintOpen(searchParams, false);
    next.delete("provider");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Auto-redirect to the app when the wallet connects on the landing page.
  // Only fires on the disconnected → connected transition so a connected user
  // who manually visits "/" can still see the landing page.
  useEffect(() => {
    if (isConnected && !wasConnected.current && isLanding) {
      navigate("/app", { replace: true });
    }
    wasConnected.current = isConnected;
  }, [isConnected, isLanding, navigate]);

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
        case "h":
        case "d":
        case "g":
          e.preventDefault();
          setMenuOpen(false);
          navigate(APP_HOME);
          break;
        case "a":
        case "c":
          e.preventDefault();
          setMenuOpen(false);
          navigate(APP_CHAT);
          break;
        case "n":
        case "m":
          e.preventDefault();
          openMint();
          break;
        case "?":
          e.preventDefault();
          document.dispatchEvent(new CustomEvent("axiom:show-shortcuts"));
          break;
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [navigate, openMint]);

  return (
    <div className="shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <header className="shell-header">
        <div className="shell-header__inner">
          <nav className="shell-nav" aria-label="Primary">
            <Link to="/" className="shell-brand" aria-label="Axiom home">
              <img
                src="/brand/chat-avatar-128.jpg"
                alt=""
                width={28}
                height={28}
                className="shell-brand__mark"
              />
              <span className="shell-brand__text">
                Axiom
                <span className="shell-brand__sub">Protocol</span>
              </span>
            </Link>

            {!isLanding && !isMobile && (
              <div className="shell-nav__pill" role="list">
                {PRIMARY_NAV.filter((item) => item.kind === "link").map(
                  (item) => (
                    <NavLink
                      key={item.id}
                      to={item.path!}
                      className={navLinkClass}
                      end={item.id === "home"}
                      role="listitem"
                    >
                      {item.label}
                      <Kbd className="shell-nav__kbd">{item.shortcut}</Kbd>
                    </NavLink>
                  ),
                )}
              </div>
            )}

            {isLanding && (
              <div className="shell-nav__landing">
                <Link to="/app" className="shell-nav__text-link">
                  Home
                </Link>
                <Link to="/chat" className="shell-nav__text-link">
                  Chat
                </Link>
              </div>
            )}
          </nav>

          <div className="shell-header__actions">
            {!isLanding && isMobile && (
              <button
                type="button"
                className="shell-icon-btn"
                onClick={() => setMenuOpen(!menuOpen)}
                aria-label="Menu"
                aria-expanded={menuOpen}
                aria-controls="mobile-nav-menu"
              >
                {menuOpen ? "✕" : "☰"}
              </button>
            )}
            <button
              type="button"
              className="shell-icon-btn"
              onClick={toggleTheme}
              aria-label={
                theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
              }
              title={theme === "dark" ? "Light" : "Dark"}
            >
              {theme === "dark" ? (
                <span aria-hidden className="shell-icon">
                  ☀
                </span>
              ) : (
                <span aria-hidden className="shell-icon">
                  ◐
                </span>
              )}
            </button>
            {!isLanding && !isMobile && (
              <button
                type="button"
                className="shell-icon-btn"
                title="Shortcuts (?)"
                aria-label="Keyboard shortcuts"
                onClick={() =>
                  document.dispatchEvent(new CustomEvent("axiom:show-shortcuts"))
                }
              >
                <span aria-hidden className="shell-icon">
                  ?
                </span>
              </button>
            )}
            {!isLanding && <HealthBadge />}
            {(isLanding || !isMobile) && (
              <button
                type="button"
                onClick={openMint}
                className="shell-mint-btn"
                data-axiom-btn=""
              >
                Mint
              </button>
            )}
            <div className="shell-wallet">
              <WalletButton />
            </div>
          </div>
        </div>
      </header>

      {!isLanding && isMobile && (
        <div
          id="mobile-nav-menu"
          ref={mobileNavRef}
          className={`shell-drawer${menuOpen ? " is-open" : ""}`}
        >
          {PRIMARY_NAV.filter((item) => item.kind === "link").map((item) => (
            <NavLink
              key={item.id}
              to={item.path!}
              className={navLinkClass}
              onClick={() => setMenuOpen(false)}
            >
              {item.label}
            </NavLink>
          ))}
          <button
            type="button"
            className="shell-mint-btn shell-mint-btn--block"
            onClick={openMint}
            data-axiom-btn=""
          >
            Mint agent
          </button>
        </div>
      )}

      <main
        id="main-content"
        className={
          isLanding
            ? "shell-main shell-main--landing"
            : isChat
              ? "shell-main shell-main--chat"
              : "shell-main"
        }
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
              <Route path="/" element={<LandingPage />} />
              <Route path={APP_HOME} element={<HomePage />} />
              {/* List peers fold into Home; mint is modal-only */}
              <Route path="/agents" element={<Navigate to={APP_HOME} replace />} />
              <Route
                path="/agents/new"
                element={<Navigate to={`${APP_HOME}?mint=1`} replace />}
              />
              <Route path="/market" element={<Navigate to={APP_HOME} replace />} />
              <Route path="/dashboard" element={<Navigate to={APP_HOME} replace />} />
              <Route
                path="/agents/:tokenId"
                element={
                  <WalletRoute>
                    <AgentDetail />
                  </WalletRoute>
                }
              />
              <Route
                path={APP_CHAT}
                element={
                  <WalletRoute>
                    <ChatPage />
                  </WalletRoute>
                }
              />
              <Route path="/settings" element={<Navigate to={APP_HOME} replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </div>
          </Suspense>
        </ErrorBoundary>
      </main>

      {/* Mint stays in context — modal, not a 5th app section */}
      <Modal
        open={mintOpen}
        onClose={closeMint}
        title="Mint agent"
        style={{ maxWidth: 520 }}
      >
        {isConnected ? (
          <Suspense fallback={<Spinner />}>
            <MintForm
              compact
              onClose={closeMint}
              provider={
                mintProvider && /^0x[a-fA-F0-9]{40}$/.test(mintProvider)
                  ? (mintProvider as `0x${string}`)
                  : undefined
              }
            />
          </Suspense>
        ) : (
          <ConnectedGuard>
            <p style={{ margin: 0, color: "var(--c-text-muted)", fontSize: "var(--text-sm)" }}>
              Connect wallet to mint.
            </p>
          </ConnectedGuard>
        )}
      </Modal>

      <footer className={`shell-footer${isChat ? " shell-footer--hidden" : ""}`}>
        <div className="shell-footer__inner">
          <div className="shell-footer__brand-block">
            <span className="shell-footer__brand">Axiom</span>
            <p className="shell-footer__tag">
              Mint, fund, tick, transfer · software oracle on 0G
            </p>
          </div>
          <nav className="shell-footer__links" aria-label="Footer">
            <Link to="/app">Home</Link>
            <Link to="/chat">Chat</Link>
            <button type="button" onClick={openMint} className="shell-footer__mint">
              Mint
            </button>
            <Link to="/">About</Link>
          </nav>
        </div>
      </footer>
      <ShortcutHelp />
    </div>
  );
}

export default App;
