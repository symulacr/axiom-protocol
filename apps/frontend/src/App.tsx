import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type RefObject,
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
import { BACKEND_URL } from "./config/env.js";
import { useAccount } from "wagmi";
import { useHealth } from "./hooks/useHealth.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { BRAND } from "./brand/assets.js";
import {
  COLORS,
  ConnectedGuard,
  Kbd,
  Modal,
  Spinner,
} from "./components/ui.js";
import { useMediaQuery } from "./hooks/useMediaQuery.js";

/** IA source of truth: Home · Chat · Mint (modal action); deep page: Agent Detail. */
const APP_HOME = "/app" as const;
const APP_CHAT = "/chat" as const;

const MINT_QUERY = "mint" as const;
const MINT_OPEN_VALUE = "1" as const;

type PrimaryNavId = "home" | "chat" | "mint";
type PrimaryNavItem = {
  id: PrimaryNavId;
  label: string;
  path?: string;
  kind: "link" | "action";
  shortcut: string;
};

const PRIMARY_NAV: readonly PrimaryNavItem[] = [
  { id: "home", label: "Home", path: APP_HOME, kind: "link", shortcut: "H" },
  { id: "chat", label: "Chat", path: APP_CHAT, kind: "link", shortcut: "A" },
  { id: "mint", label: "Mint", kind: "action", shortcut: "N" },
] as const;

function isMintOpen(search: string | URLSearchParams): boolean {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search;
  return params.get(MINT_QUERY) === MINT_OPEN_VALUE;
}

function withMintOpen(
  search: string | URLSearchParams,
  open: boolean,
): URLSearchParams {
  const params =
    typeof search === "string"
      ? new URLSearchParams(search)
      : new URLSearchParams(search);
  if (open) params.set(MINT_QUERY, MINT_OPEN_VALUE);
  else params.delete(MINT_QUERY);
  return params;
}

type ThemeMode = "dark" | "light";
const STORAGE_KEY = "axiom-theme";

function readTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    void 0;
  }
  return "dark";
}

function applyTheme(mode: ThemeMode): void {
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
}

function useTheme(): {
  theme: ThemeMode;
  toggle: () => void;
  setTheme: (m: ThemeMode) => void;
} {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof document !== "undefined") {
      const t = readTheme();
      applyTheme(t);
      return t;
    }
    return "dark";
  });

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      void 0;
    }
  }, [theme]);

  const setTheme = useCallback((m: ThemeMode) => setThemeState(m), []);
  const toggle = useCallback(() => {
    setThemeState((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  return { theme, toggle, setTheme };
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
}

function firstFocusable(container: HTMLElement): HTMLElement | null {
  return (
    getFocusable(container)[0] ?? container.querySelector<HTMLElement>("h2")
  );
}

function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
): void {
  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    firstFocusable(container)?.focus();

    const el = container;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const items = getFocusable(el);
      const first = items[0] ?? el.querySelector<HTMLElement>("h2");
      const last =
        items[items.length - 1] ?? el.querySelector<HTMLElement>("h2");
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    el.addEventListener("keydown", onKeyDown);
    return () => el.removeEventListener("keydown", onKeyDown);
  }, [ref, active]);
}

/** Compact header pill — detail lives in the title tooltip, not a second status bar. */
function HealthBadge(): ReactElement {
  const { data, isLoading } = useHealth();

  const isLocalhost =
    BACKEND_URL.includes("127.0.0.1") || BACKEND_URL.includes("localhost");

  if (isLocalhost) {
    return (
      <span
        className="shell-status shell-status--local"
        role="status"
        title={`Local · ${BACKEND_URL}`}
        aria-label="Local development"
      >
        <span className="shell-status__dot" aria-hidden />
        <span className="shell-status__label">Local</span>
      </span>
    );
  }

  let status: "ok" | "down" | "unknown";
  if (!data) {
    status = isLoading ? "unknown" : "down";
  } else {
    status = data.ok ? "ok" : "down";
  }

  let label: string;
  if (status === "ok") {
    label = "Online";
  } else if (status === "down") {
    label = "Offline";
  } else {
    label = "…";
  }

  const title = data
    ? `API ${label} · oracle ${data.oracle} · block #${data.chainHead}`
    : label;

  return (
    <span
      className={`shell-status shell-status--${status}`}
      role="status"
      aria-live="polite"
      aria-label={title}
      title={title}
    >
      <span className="shell-status__dot" aria-hidden />
      <span className="shell-status__label">{label}</span>
    </span>
  );
}

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
  return ["shell-nav__link", isActive ? "is-active" : ""]
    .filter(Boolean)
    .join(" ");
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
    { key: "H", label: "Home — portfolio + agents (H, D, G)" },
    { key: "A", label: "Chat with Axiom (A, C)" },
    { key: "N", label: "Mint agent — modal (N, M)" },
    { key: "⌘K", label: "Search agents on Home" },
    { key: "?", label: "Show this help" },
    { key: "Esc", label: "Close dialogs" },
  ];

  return (
    <div
      role="dialog"
      aria-label="Keyboard shortcuts"
      onClick={() => setOpen(false)}
      className="shortcut-overlay"
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        className={`shortcut-panel${entered ? " shortcut-panel--entered" : ""}`}
      >
        <h2 tabIndex={-1} className="shortcut-title">
          Keyboard Shortcuts
        </h2>
        <dl className="shortcut-list">
          {shortcuts.map((s) => (
            <div key={s.key} className="shortcut-row">
              <dt className="shortcut-dt">{s.label}</dt>
              <dd className="shortcut-dd">
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
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isLanding = location.pathname === "/";
  const isChat =
    location.pathname === "/chat" || location.pathname.startsWith("/chat/");
  const mintOpen = isMintOpen(searchParams);
  const mintProvider = searchParams.get("provider") ?? undefined;
  const { isConnected } = useAccount();
  const { theme, toggle: toggleTheme } = useTheme();
  const wasConnected = useRef(false);

  const openMint = useCallback(() => {
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

  // Auto-redirect to the app on the disconnected→connected transition; a connected user may still view "/"
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
          navigate(APP_HOME);
          break;
        case "a":
        case "c":
          e.preventDefault();
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
                src={BRAND.chatAvatar}
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
            <button
              type="button"
              className="shell-icon-btn"
              onClick={toggleTheme}
              aria-label={
                theme === "dark"
                  ? "Switch to light theme"
                  : "Switch to dark theme"
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
                  document.dispatchEvent(
                    new CustomEvent("axiom:show-shortcuts"),
                  )
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
        <nav
          aria-label="Primary"
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 40,
            display: "flex",
            gap: "var(--space-sm)",
            padding: "var(--space-xs) var(--space-sm)",
            borderTop: `1px solid ${COLORS.borderStrong}`,
            background: COLORS.surface,
            boxShadow: "0 -8px 24px rgba(0, 0, 0, 0.25)",
          }}
        >
          {PRIMARY_NAV.map((item) =>
            item.kind === "link" ? (
              <NavLink
                key={item.id}
                to={item.path!}
                end={item.id === "home"}
                style={({ isActive }) => ({
                  flex: 1,
                  textAlign: "center",
                  textDecoration: "none",
                  borderRadius: "var(--radius-md)",
                  padding: "0.6rem 0.5rem",
                  fontSize: "var(--text-sm)",
                  fontWeight: "var(--fw-medium)",
                  color: isActive ? COLORS.textPrimary : COLORS.textMuted,
                  background: isActive ? COLORS.surfaceRaised : "transparent",
                  border: `1px solid ${
                    isActive ? COLORS.borderStrong : "transparent"
                  }`,
                })}
              >
                {item.label}
              </NavLink>
            ) : (
              <button
                key={item.id}
                type="button"
                onClick={openMint}
                data-axiom-btn=""
                style={{
                  flex: 1,
                  textAlign: "center",
                  borderRadius: "var(--radius-md)",
                  padding: "0.6rem 0.5rem",
                  fontSize: "var(--text-sm)",
                  fontWeight: "var(--fw-semibold)",
                  color: COLORS.bronzeLight,
                  background: COLORS.surfaceRaised,
                  border: `1px solid ${COLORS.borderStrong}`,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {item.label}
              </button>
            ),
          )}
        </nav>
      )}

      <main
        id="main-content"
        style={
          !isLanding && isMobile
            ? {
                paddingBottom: "calc(5rem + env(safe-area-inset-bottom))",
              }
            : undefined
        }
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
              <div className="app-fallback">
                <Spinner size={32} />
              </div>
            }
          >
            <div key={location.pathname} className="fade-enter">
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path={APP_HOME} element={<HomePage />} />
                {/* List peers fold into Home; mint is modal-only, never a separate page */}
                <Route
                  path="/agents"
                  element={<Navigate to={APP_HOME} replace />}
                />
                <Route
                  path="/market"
                  element={<Navigate to={APP_HOME} replace />}
                />
                <Route
                  path="/dashboard"
                  element={<Navigate to={APP_HOME} replace />}
                />
                <Route
                  path="/agents/:tokenId"
                  element={
                    <WalletRoute>
                      <AgentDetail />
                    </WalletRoute>
                  }
                />
                <Route path={APP_CHAT} element={<ChatPage />} />
                <Route
                  path="/settings"
                  element={<Navigate to={APP_HOME} replace />}
                />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </div>
          </Suspense>
        </ErrorBoundary>
      </main>

      <Modal
        open={mintOpen}
        onClose={closeMint}
        title="Mint agent"
        maxWidth={520}
      >
        {isConnected ? (
          <Suspense fallback={<Spinner />}>
            <MintForm
              compact
              onClose={() => {
                closeMint();
                // MintForm calls onClose only once the tx confirms, so this
                // fires exactly on a successful mint. HomePage listens and
                // shows an optimistic pending row until the agents poll lands.
                window.dispatchEvent(new CustomEvent("axiom:mint-complete"));
              }}
              provider={
                mintProvider && /^0x[a-fA-F0-9]{40}$/.test(mintProvider)
                  ? (mintProvider as `0x${string}`)
                  : undefined
              }
            />
          </Suspense>
        ) : (
          <ConnectedGuard>
            <p className="muted-note">Connect wallet to mint.</p>
          </ConnectedGuard>
        )}
      </Modal>

      <footer
        className={`shell-footer${isChat ? " shell-footer--hidden" : ""}`}
        style={!isLanding && isMobile ? { display: "none" } : undefined}
      >
        <div className="shell-footer__inner">
          <div className="shell-footer__brand-block">
            <span className="shell-footer__brand">Axiom</span>
            <p className="shell-footer__tag">
              Mint, fund, tick, transfer · software oracle on 0G
            </p>
          </div>
          <nav className="shell-footer__links" aria-label="Footer">
            {/* Primary destinations derive from PRIMARY_NAV; the Mint action
                stays in the header / bottom bar (single trigger set). */}
            {PRIMARY_NAV.filter((item) => item.kind === "link").map((item) => (
              <Link key={item.id} to={item.path!}>
                {item.label}
              </Link>
            ))}
            <Link to="/">About</Link>
          </nav>
        </div>
      </footer>
      <ShortcutHelp />
    </div>
  );
}
