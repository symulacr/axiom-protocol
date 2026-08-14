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
import { ConnectedGuard, Kbd, Modal, Spinner } from "./components/ui.js";
import { ShellSidebarProvider } from "./hooks/useShellSidebar.js";

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
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark";
    }
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
      return readTheme();
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

  // Live OS-theme following: only when the user has no explicit stored choice.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      stored = null;
    }
    if (stored === "light" || stored === "dark") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = (e: MediaQueryListEvent) =>
      setThemeState(e.matches ? "light" : "dark");
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

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
  const lastTriggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      // Focus returns to whatever opened the panel (keyboard path stays intact).
      lastTriggerRef.current?.focus();
      lastTriggerRef.current = null;
      return;
    }
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    function show(e: Event) {
      lastTriggerRef.current = (e.target as HTMLElement | null) ?? null;
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

  // Shell-level sidebar state: persists the collapse choice; on ≤800px the
  // sidebar is a drawer (default closed, promoted from the chat drawer).
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem("axiom:sidebar-collapsed") !== "true";
    } catch {
      return true;
    }
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("axiom:sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });
  const sidebarToggleRef = useRef<HTMLButtonElement | null>(null);
  const sidebarFirstLinkRef = useRef<HTMLAnchorElement | null>(null);

  // Move focus into the drawer when it opens on narrow screens (≥800px the
  // sidebar is persistent and focus stays where the user put it).
  useEffect(() => {
    if (sidebarOpen && window.matchMedia("(max-width: 800px)").matches) {
      sidebarFirstLinkRef.current?.focus();
    }
  }, [sidebarOpen]);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
    sidebarToggleRef.current?.focus();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        "axiom:sidebar-collapsed",
        sidebarCollapsed ? "true" : "false",
      );
    } catch {
      void 0;
    }
  }, [sidebarCollapsed]);

  // Escape closes the mobile drawer; scroll locks while it is open.
  useEffect(() => {
    if (!sidebarOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSidebarOpen(false);
        sidebarToggleRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [sidebarOpen]);

  // Close the drawer on route change.
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

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

  const shellClass = [
    "app-shell",
    isLanding ? "app-shell--landing" : "",
    !isLanding && sidebarCollapsed && !isChat ? "app-shell--rail" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const mainClass = isLanding
    ? "shell-main shell-main--landing"
    : isChat
      ? "shell-main shell-main--chat"
      : "shell-main";
  const footerClass = `shell-footer${isChat ? " shell-footer--hidden" : ""}`;

  const pageContent = (
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
  );

  const footerInner = (
    <div className="shell-footer__inner">
      <div className="shell-footer__brand-block">
        <span className="shell-footer__brand">Axiom</span>
        <p className="shell-footer__tag">
          Mint, fund, tick, transfer · software oracle on 0G
        </p>
      </div>
      <nav className="shell-footer__links" aria-label="Footer">
        {/* Primary destinations derive from PRIMARY_NAV; the Mint action
            stays in the sidebar / top bar (single trigger set). */}
        {PRIMARY_NAV.filter((item) => item.kind === "link").map((item) => (
          <Link key={item.id} to={item.path!}>
            {item.label}
          </Link>
        ))}
        <Link to="/">About</Link>
      </nav>
    </div>
  );

  return (
    <div className="shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      {!isLanding ? (
        <ShellSidebarProvider
          value={{
            open: sidebarOpen,
            setOpen: (v) => setSidebarOpen(v),
          }}
        >
          <div className={shellClass}>
            <aside
              className={`app-sidebar${sidebarOpen ? " is-open" : ""}`}
              aria-label="Primary navigation"
            >
              <div className="app-sidebar__brand">
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
              </div>

              <nav className="app-sidebar__nav" aria-label="Primary">
                {PRIMARY_NAV.filter((item) => item.kind === "link").map(
                  (item, i) => (
                    <NavLink
                      key={item.id}
                      ref={i === 0 ? sidebarFirstLinkRef : undefined}
                      to={item.path!}
                      className={navLinkClass}
                      end={item.id === "home"}
                    >
                      <span>{item.label}</span>
                      <Kbd className="shell-nav__kbd">{item.shortcut}</Kbd>
                    </NavLink>
                  ),
                )}
                <button
                  type="button"
                  onClick={openMint}
                  className="shell-nav__link shell-nav__link--mint"
                  data-axiom-btn=""
                >
                  <span>Mint</span>
                  <Kbd className="shell-nav__kbd">N</Kbd>
                </button>
              </nav>

              {isChat && (
                <div
                  className="app-sidebar__threads"
                  id="sidebar-threads-slot"
                />
              )}

              <div className="app-sidebar__status">
                <HealthBadge />
              </div>
            </aside>

            <button
              type="button"
              className="app-sidebar__scrim"
              aria-label="Close navigation"
              tabIndex={sidebarOpen ? 0 : -1}
              onClick={closeSidebar}
            />

            <header className="app-topbar">
              <button
                type="button"
                className="shell-icon-btn app-topbar__toggle"
                aria-label={
                  sidebarOpen ? "Close navigation" : "Open navigation"
                }
                aria-expanded={sidebarOpen}
                aria-controls="app-sidebar"
                ref={sidebarToggleRef}
                onClick={() => setSidebarOpen((v) => !v)}
              >
                <span aria-hidden className="shell-icon">
                  ☰
                </span>
              </button>
              {!isChat && (
                <button
                  type="button"
                  className="shell-icon-btn app-topbar__collapse"
                  aria-label={
                    sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
                  }
                  aria-pressed={sidebarCollapsed}
                  title={sidebarCollapsed ? "Expand" : "Collapse"}
                  onClick={() => setSidebarCollapsed((v) => !v)}
                >
                  <span aria-hidden className="shell-icon">
                    {sidebarCollapsed ? "»" : "«"}
                  </span>
                </button>
              )}
              <div className="app-topbar__side">
                <button
                  type="button"
                  className="shell-icon-btn"
                  onClick={toggleTheme}
                  aria-pressed={theme === "dark"}
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
                {!isLanding && (
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
                {(isLanding || !isChat) && (
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
            </header>

            <main id="main-content" className={mainClass}>
              {pageContent}
              <footer className={footerClass}>{footerInner}</footer>
            </main>
          </div>
        </ShellSidebarProvider>
      ) : (
        <>
          <header className="app-topbar app-topbar--landing">
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
            <div className="app-topbar__side">
              <button
                type="button"
                className="shell-icon-btn"
                onClick={toggleTheme}
                aria-pressed={theme === "dark"}
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
              <div className="shell-nav__landing">
                <Link to="/app" className="shell-nav__text-link">
                  Home
                </Link>
                <Link to="/chat" className="shell-nav__text-link">
                  Chat
                </Link>
              </div>
              <button
                type="button"
                onClick={openMint}
                className="shell-mint-btn"
                data-axiom-btn=""
              >
                Mint
              </button>
              <div className="shell-wallet">
                <WalletButton />
              </div>
            </div>
          </header>

          <main id="main-content" className={mainClass}>
            {pageContent}
          </main>
          <footer className="shell-footer">{footerInner}</footer>
        </>
      )}

      <Modal
        open={mintOpen}
        onClose={closeMint}
        title="Mint agent"
        maxWidth={520}
      >
        {isConnected ? (
          <Suspense fallback={<Spinner />}>
            <MintForm
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

      <ShortcutHelp />
    </div>
  );
}
