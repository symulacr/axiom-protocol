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

function navLinkStyle({
  isActive,
}: {
  isActive: boolean;
}): React.CSSProperties {
  return {
    color: isActive ? COLORS.bronzeLight : COLORS.textMuted,
    textDecoration: "none",
    fontSize: "var(--text-sm)",
    fontWeight: isActive ? "var(--fw-semibold)" : "var(--fw-medium)",
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
  const mintOpen = isMintOpen(searchParams);
  const mintProvider = searchParams.get("provider") ?? undefined;
  const { isConnected } = useAccount();
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
          style={{ display: "flex", gap: "var(--space-xl)", alignItems: "center" }}
        >
          <Link
            to="/"
            style={{
              fontWeight: "var(--fw-bold)",
              textDecoration: "none",
              fontSize: "var(--text-lg)",
              color: "var(--c-text-primary)",
              letterSpacing: "-0.01em",
            }}
          >
            Axiom Protocol
          </Link>
          {/* Primary IA: Home · Chat · Mint (action) — no Market/Agents peers */}
          {!isLanding && !isMobile && (
            <>
              {PRIMARY_NAV.filter((item) => item.kind === "link").map((item) => (
                <NavLink
                  key={item.id}
                  to={item.path!}
                  style={navLinkStyle}
                  end={item.id === "home"}
                >
                  {item.label}{" "}
                  <Kbd
                    style={{
                      fontSize: "var(--text-xs)",
                      opacity: 0.5,
                      marginLeft: 4,
                      padding: "1px 4px",
                      borderRadius: "var(--radius-sm)",
                      border: `1px solid ${COLORS.border}`,
                      lineHeight: 1,
                    }}
                  >
                    {item.shortcut}
                  </Kbd>
                </NavLink>
              ))}
              <button
                type="button"
                onClick={openMint}
                className="nav-mint-cta"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "0.35rem 0.75rem",
                  borderRadius: "var(--radius-md)",
                  background: "var(--c-bronze)",
                  color: "#fff",
                  fontSize: "var(--text-sm)",
                  fontWeight: "var(--fw-semibold)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Mint
              </button>
            </>
          )}
          {/* Marketing CTA on the landing page only */}
          {isLanding && (
            <Link
              to="/app"
              style={{
                fontSize: "var(--text-sm)",
                fontWeight: "var(--fw-semibold)",
                color: "var(--c-bronze)",
                textDecoration: "none",
                marginLeft: "var(--space-sm)",
              }}
            >
              Launch app →
            </Link>
          )}
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
          {/* Mobile menu toggle — app routes only, not on the landing page */}
          {!isLanding && isMobile && (
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
          {/* Keyboard shortcuts hint — app routes only */}
          {!isLanding && !isMobile && (
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

          {/* Health indicator — app routes only (meaningless on a public page) */}
          {!isLanding && <HealthBadge />}
          <WalletButton />
        </div>
      </header>
      {/* Mobile nav menu — app routes only */}
      {!isLanding && isMobile && (
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
          {PRIMARY_NAV.filter((item) => item.kind === "link").map((item) => (
            <NavLink
              key={item.id}
              to={item.path!}
              style={navLinkStyle}
              onClick={() => setMenuOpen(false)}
            >
              {item.label}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={openMint}
            style={{
              textAlign: "left",
              background: "none",
              border: "none",
              color: "var(--c-bronze-light)",
              fontWeight: "var(--fw-semibold)",
              fontSize: "var(--text-sm)",
              padding: "0.5rem 0",
              cursor: "pointer",
            }}
          >
            Mint agent
          </button>
        </div>
      )}
      <main
        id="main-content"
        style={
          isLanding
            ? {
                minHeight: "calc(100vh - var(--nav-h))",
                contain: "layout style",
              }
            : {
                padding: "var(--space-2xl) var(--space-xl)",
                maxWidth: "var(--content-max)",
                margin: "0 auto",
                minHeight: "calc(100vh - var(--nav-h))",
                contain: "layout style",
              }
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
        title="Mint agent — name only"
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
              Connect a wallet to mint an iNFT agent.
            </p>
          </ConnectedGuard>
        )}
      </Modal>

      <footer
        style={{
          background: "var(--c-bronze)",
          color: "#ffffff",
          marginTop: "var(--space-5xl)",
        }}
      >
        <div
          style={{
            maxWidth: "var(--content-max)",
            margin: "0 auto",
            padding: "var(--space-3xl) var(--space-xl)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "var(--space-md)",
              marginBottom: "var(--space-2xl)",
            }}
          >
            <span
              style={{
                fontWeight: "var(--fw-bold)",
                fontSize: "var(--text-lg)",
                letterSpacing: "-0.01em",
              }}
            >
              Axiom Protocol
            </span>
            <span style={{ fontSize: "var(--text-xs)", opacity: 0.7 }}>
              Intelligent NFTs · software TEE oracle · 0G network
            </span>
          </div>
          <details style={{ fontSize: "var(--text-xs)", color: "#ffffff" }}>
            <summary
              style={{
                cursor: "pointer",
                color: "#ffffff",
                opacity: 0.85,
                marginBottom: "var(--space-sm)",
                fontWeight: "var(--fw-medium)",
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
                  color: "#ffffff",
                  opacity: 0.7,
                  fontWeight: "var(--fw-medium)",
                }}
              >
                iNFT
              </dt>
              <dd style={{ margin: 0, opacity: 0.9 }}>
                Intelligent NFT — an ERC-7857 token tied to encrypted AI agent
                metadata
              </dd>
              <dt
                style={{
                  color: "#ffffff",
                  opacity: 0.7,
                  fontWeight: "var(--fw-medium)",
                }}
              >
                TEE
              </dt>
              <dd style={{ margin: 0, opacity: 0.9 }}>
                Oracle TEE signer — software-simulated enclave (Node secp256k1)
                that signs ownership proofs; not Intel TDX/SEV hardware
              </dd>
              <dt
                style={{
                  color: "#ffffff",
                  opacity: 0.7,
                  fontWeight: "var(--fw-medium)",
                }}
              >
                Strategy Root
              </dt>
              <dd style={{ margin: 0, opacity: 0.9 }}>
                Merkle root that cryptographically verifies which strategies an
                agent can execute
              </dd>
              <dt
                style={{
                  color: "#ffffff",
                  opacity: 0.7,
                  fontWeight: "var(--fw-medium)",
                }}
              >
                Daily Limit
              </dt>
              <dd style={{ margin: 0, opacity: 0.9 }}>
                Maximum 0G an agent can spend per day, resets at midnight UTC
              </dd>
              <dt
                style={{
                  color: "#ffffff",
                  opacity: 0.7,
                  fontWeight: "var(--fw-medium)",
                }}
              >
                0G Storage
              </dt>
              <dd style={{ margin: 0, opacity: 0.9 }}>
                Decentralized storage where encrypted agent data is persisted
                with Merkle proof verification
              </dd>
              <dt
                style={{
                  color: "#ffffff",
                  opacity: 0.7,
                  fontWeight: "var(--fw-medium)",
                }}
              >
                0G Compute
              </dt>
              <dd style={{ margin: 0, opacity: 0.9 }}>
                Decentralized inference network where agents run trading
                strategies via 0G Compute (Axiom assistant)
              </dd>
            </dl>
          </details>
        </div>
      </footer>
      <ShortcutHelp />
    </>
  );
}

export default App;
