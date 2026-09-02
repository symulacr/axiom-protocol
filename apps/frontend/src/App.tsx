/*
  Axiom UI-v2 App composition over react-router:
    · resolver-based routing (lib/routeRegistry) with compat redirects
      (/dashboard, /market → /app; ?mint=1 → /mint)
    · internal routes held behind LockedRoute (24h session TTL renewed silently
      while connected, persisted in axiom-session)
    · chat mounts ChatPage (SSE + tools + providers) inside AppShell with its
      thread rail portaled into #sidebar-threads-slot
  Data: every screen is the v2 markup fed by the v1 hooks (usePortfolio,
  useEventHistory/useEventStream, useMintWizard/usePayment/useTransfer/
  useOrchestratorTick, useHealth).
*/
import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ErrorInfo,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useAccount, useSwitchChain } from "wagmi";
import { AppShell, Logo } from "./components/axiom/AppShell.js";
import { WalletGate, isSessionFresh } from "./components/axiom/WalletGate.js";
import { Button, Status } from "./components/axiom/Controls.js";
import {
  ArrowLeft,
  ArrowRight,
  CircleCheck,
  Network,
  Wallet,
  X,
} from "./components/axiom/icons.js";
import { Spinner } from "./components/ui.js";
import { ShellSidebarProvider } from "./hooks/useShellSidebar.js";
import { useReceiptReconcile } from "./hooks/useReceiptReconcile.js";
import { useModalDismiss } from "./hooks/useModalDismiss.js";
import { useUiStore } from "./lib/uiStore.js";
import { humanizeError } from "./utils/format.js";
import {
  KNOWN_PATHS,
  redirectHubTarget,
  resolvePublicSeoSlug,
  resolveRoute,
} from "./lib/routeRegistry.js";
import { lockedGateFor } from "./lib/consoleCatalog.js";
import { MEDIA } from "./lib/media.js";
import { getCopy, interpolate, type Locale } from "./lib/copy.js";
import type { FlowKind, NoticeSeverity } from "./lib/models.js";
import { APP_CHAIN, APP_CHAIN_ID } from "./config/wagmi.js";

/** Every page module exposes one named component; this collapses the repeated
 * lazy(...then pick default) boilerplate. The module member is known to be a
 * component; the any-cast only bridges the generic pick to React.lazy. */
function lazyNamed<
  M extends Record<string, unknown>,
  K extends string & keyof M,
>(load: () => Promise<M>, key: K) {
  return lazy(() =>
    load().then((m) => ({ default: m[key] as ComponentType<any> })),
  );
}

const ChatPage = lazy(() => import("./pages/ChatPage.js"));
const Landing = lazyNamed(() => import("./pages/LandingPage.js"), "Landing");
const DashboardPage = lazyNamed(
  () => import("./pages/DashboardPage.js"),
  "DashboardPage",
);
const AgentPage = lazyNamed(() => import("./pages/AgentPage.js"), "AgentPage");
const TransactionsPage = lazyNamed(
  () => import("./pages/TransactionsPage.js"),
  "TransactionsPage",
);
const StoragePage = lazyNamed(
  () => import("./pages/StoragePage.js"),
  "StoragePage",
);
const SettingsPage = lazyNamed(
  () => import("./pages/SettingsPage.js"),
  "SettingsPage",
);
const StakingPage = lazyNamed(
  () => import("./pages/StakingPage.js"),
  "StakingPage",
);
const FlowPage = lazyNamed(() => import("./pages/FlowPage.js"), "FlowPage");
const CoSignPage = lazyNamed(
  () => import("./pages/CoSignPage.js"),
  "CoSignPage",
);
const PublicSeoPage = lazyNamed(
  () => import("./pages/PublicSeoPage.js"),
  "PublicSeoPage",
);
const Recovery404 = lazy(() => import("./pages/NotFound.js"));

const pageFallback = (
  <div className="app-fallback">
    <Spinner size={32} />
  </div>
);

/** Disconnect clears all identity — a stored profile must never outlive its session. */
const DISCONNECTED_SESSION = {
  status: "disconnected",
  address: "",
  profile: "",
  signedAt: null,
} as const;

/** Shared stop-screen chrome for the public blockers (wrong-network,
 * wallet-required): logo + warning status bar over the main content column;
 * only the slug class and status label differ between surfaces. */
function LockedShell({
  statusLabel,
  shellClass = "",
  children,
}: {
  statusLabel: string;
  shellClass?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div
      className={`locked-route-shell public-locked${shellClass && ` ${shellClass}`}`}
    >
      <div className="locked-route-main">
        <header className="locked-topbar">
          <Logo compact />
          <div>
            <Status label={statusLabel} tone="warning" />
          </div>
        </header>
        <main className="locked-route-content">{children}</main>
      </div>
    </div>
  );
}

const ReturnToLanding = ({
  go,
  locale,
}: {
  go: (path: string) => void;
  locale: Locale;
}): ReactElement => (
  <Button
    variant="ghost"
    onClick={() => go("/")}
    icon={<ArrowLeft size={14} />}
  >
    {getCopy(locale).notFound.returnToLanding}
  </Button>
);

function Notice({
  text,
  severity,
  onClose,
  locale,
}: {
  text: string | null;
  severity: NoticeSeverity;
  onClose: () => void;
  locale: "en" | "fr" | "de";
}) {
  if (!text) return null;
  // U24: errors persist (manual ✕ only, role=alert); successes keep the 4s toast.
  const isError = severity === "error";
  return (
    <div
      className="notice-toast"
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
    >
      <CircleCheck size={16} />
      <span>{text}</span>
      <button
        onClick={onClose}
        aria-label={getCopy(locale).a11y.closeNotification}
      >
        <X size={14} />
      </button>
    </div>
  );
}

function Guide({
  onClose,
  go,
  locale,
}: {
  onClose: () => void;
  go: (path: string) => void;
  locale: "en" | "fr" | "de";
}) {
  const copy = getCopy(locale);
  // Dismiss contract: Esc + Tab trap + initial focus + focus restore here; backdrop onMouseDown
  // below; explicit close via X/skip.
  const cardRef = useRef<HTMLElement>(null);
  useModalDismiss(onClose, cardRef);
  const [step, setStep] = useState(0);
  const steps = [
    {
      title: copy.guide.step1Title,
      copy: copy.guide.step1Body,
      path: "/app",
      label: copy.guide.openOverview,
      image: MEDIA.onboarding,
    },
    {
      title: copy.guide.step2Title,
      copy: copy.guide.step2Body,
      path: "/transactions",
      label: copy.guide.openTransactions,
      image: MEDIA.proof,
    },
    {
      title: copy.guide.step4Title,
      copy: copy.guide.step4Body,
      path: "/settings",
      label: copy.guide.openSettings,
      image: MEDIA.recovery,
    },
  ];
  const item = steps[step] ?? steps[0];
  if (!item) return null;
  return (
    <div className="guide-layer" onMouseDown={onClose}>
      <section
        ref={cardRef}
        className="guide-card"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="guide-media">
          <img src={item.image} alt="Axiom onboarding illustration" />
        </div>
        <div className="guide-copy">
          <button
            className="icon-button guide-close"
            onClick={onClose}
            aria-label={copy.a11y.closeOnboarding}
          >
            <X size={16} />
          </button>
          <h2>{item.title}</h2>
          <p>{item.copy}</p>
          <div className="guide-actions">
            <Button
              onClick={() => {
                go(item.path);
                onClose();
              }}
              icon={<ArrowRight size={16} />}
            >
              {item.label}
            </Button>
            {step < steps.length - 1 ? (
              <Button variant="ghost" onClick={() => setStep(step + 1)}>
                {copy.guide.nextStep}
              </Button>
            ) : (
              <Button variant="ghost" onClick={onClose}>
                {copy.guide.finish}
              </Button>
            )}
          </div>
          <button className="guide-skip" onClick={onClose}>
            {copy.guide.skip}
          </button>
        </div>
      </section>
    </div>
  );
}

/**
 * Chat surface host: renders the v2 thread rail (slot) synchronously and
 * mounts the LIVE v1 ChatPage (SSE loop, client tools, provider selector,
 * runEpoch guard, TransferModal bridge) lazily — the lazy boundary guarantees
 * #sidebar-threads-slot exists in the DOM before ChatPage portals into it.
 */
function ChatSurface(): ReactElement {
  const [threadsOpen, setThreadsOpen] = useState(false);
  const { state: chatUiState } = useUiStore();
  // Mobile rail dismiss: backdrop tap + Esc per the shell contract; overlay only ≤760px; focus returns to ☰.
  useEffect(() => {
    if (!threadsOpen) return;
    const priorFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setThreadsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.setTimeout(() => priorFocus?.focus(), 0);
    };
  }, [threadsOpen]);
  return (
    <ShellSidebarProvider
      value={{
        open: threadsOpen,
        setOpen: (v) => setThreadsOpen(v),
      }}
    >
      <div className={`chat-surface${threadsOpen ? " threads-open" : ""}`}>
        {threadsOpen ? (
          <div
            className="chat-rail-backdrop"
            onClick={() => setThreadsOpen(false)}
          />
        ) : null}
        <aside
          className="panel thread-list chat-thread-rail"
          aria-label={getCopy(chatUiState.settings.locale).a11y.chatThreads}
        >
          <div id="sidebar-threads-slot" />
        </aside>
        <Suspense fallback={pageFallback}>
          <ChatPage />
        </Suspense>
      </div>
    </ShellSidebarProvider>
  );
}

function shortTokenId(pathname: string): bigint | null {
  const raw = pathname.split("/")[2];
  if (!raw) return null;
  try {
    // location.pathname never carries a query (react-router splits it into location.search)
    return BigInt(raw);
  } catch {
    return null;
  }
}

export function App(): ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const path = `${location.pathname}${location.search}`;
  const { state, dispatch } = useUiStore();
  const {
    address,
    isConnected,
    chainId,
    connector,
    status: accountStatus,
  } = useAccount();
  // One wrapper for the five session-bridge/lifecycle dispatch sites.
  const setSession = (session: Partial<typeof state.session>) =>
    dispatch({ type: "session", session });

  // v1 compat redirects: /dashboard and /market are handled declaratively in
  // Routes; /agents/list is NOT bounced here anymore — disconnected visitors
  // get its own "Browse agents" gate (LockedRoute resolves the path), and
  // settled sessions jump to the overview from the authed branch below.
  useEffect(() => {
    if (
      location.pathname === "/app" &&
      new URLSearchParams(location.search).get("mint") === "1"
    ) {
      navigate("/mint", { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  // ---- Session bridge: wagmi ↔ uiStore session ------------------------------
  useEffect(() => {
    // C3-FE2: wagmi rehydrates async — mid-window "disconnected" would void a stored session; wait for settle.
    if (accountStatus === "reconnecting" || accountStatus === "connecting")
      return;
    if (!isConnected || !address) {
      if (state.session.status !== "disconnected") {
        setSession(DISCONNECTED_SESSION);
      }
      return;
    }
    const sameWallet =
      state.session.address.toLowerCase() === address.toLowerCase();
    if (
      !sameWallet &&
      ["authenticated", "profile"].includes(state.session.status)
    ) {
      // A different wallet took over: stored identity is void — the gate re-authenticates from scratch.
      setSession({
        status: "disconnected",
        address,
        wallet: connector?.name ?? "",
        chain: chainId ?? 0,
        signedAt: null,
        profile: "",
      });
      return;
    }
    if (
      state.session.status === "authenticated" &&
      !isSessionFresh(state.session) &&
      chainId === APP_CHAIN_ID
    ) {
      // TTL expired while the wallet stayed connected: renew silently — the connection itself is the proof.
      setSession({ signedAt: new Date().toISOString() });
      return;
    }
    if (
      chainId !== undefined &&
      chainId !== APP_CHAIN_ID &&
      state.session.status !== "wrong-network"
    ) {
      setSession({
        status: "wrong-network",
        address,
        wallet: connector?.name ?? "",
        chain: chainId,
      });
      return;
    }
    if (
      state.session.address !== address ||
      (connector?.name && state.session.wallet !== connector.name)
    ) {
      setSession({
        address,
        wallet: connector?.name ?? state.session.wallet,
        chain: chainId ?? APP_CHAIN_ID,
      });
    }
    // bridge reads the whole session snapshot
  }, [
    accountStatus,
    isConnected,
    address,
    chainId,
    connector?.name,
    state.session,
  ]);

  // Theme bridge: settings.theme → html data-theme + body.light class.
  // Single CSS mechanism is the .light class chain (L3-B12); html[data-theme]
  // stays for the index.html pre-paint boot and colorScheme only. body.light
  // lets portaled chrome on document.body (filters popover) resolve light
  // tokens outside .app-shell.
  useEffect(() => {
    document.documentElement.dataset.theme = state.settings.theme;
    document.documentElement.style.colorScheme = state.settings.theme;
    document.body.classList.toggle("light", state.settings.theme === "light");
    try {
      localStorage.removeItem("axiom-theme");
    } catch {
      // storage unavailable in privacy-restricted contexts
    }
  }, [state.settings.theme]);

  // Notice auto-dismiss (4s) — U24: error notices persist until manually closed.
  useEffect(() => {
    if (!state.notice || state.noticeSeverity === "error") return;
    const timer = window.setTimeout(
      () => dispatch({ type: "notice", notice: null }),
      4000,
    );
    return () => window.clearTimeout(timer);
  }, [state.notice, state.noticeSeverity, dispatch]);

  // Settle persisted receipts mid-confirmation at reload (mined → confirmed/reverted; timeout → stale).
  useReceiptReconcile(state.transactions, dispatch);

  const go = useCallback(
    (next: string) => {
      navigate(next);
      window.scrollTo({ top: 0, behavior: "auto" });
    },
    [navigate],
  );

  const [walletOpen, setWalletOpen] = useState(false);
  const openWallet = (requestedPath = path) => {
    dispatch({
      type: "set-pending-intent",
      intent: { path: requestedPath, createdAt: Date.now() },
    });
    setWalletOpen(true);
  };
  const resumeAfterAuth = () => {
    const destination = state.pendingIntent?.path || "/app";
    dispatch({ type: "clear-pending-intent" });
    setWalletOpen(false);
    // T1: a first run that isn't done yet re-enters at /app with the
    // activation checklist open (the card self-collapses once all 3 steps
    // are done; dismissal persists in settings).
    if (!state.settings.firstRunDismissed && destination === "/app")
      dispatch({ type: "first-run-open" });
    go(destination);
  };
  const lockConsole = () => {
    setSession(DISCONNECTED_SESSION);
    go("/");
  };

  const locale = state.settings.locale;
  const hubRedirect = redirectHubTarget(location.pathname);
  const publicSeoSlug = resolvePublicSeoSlug(path);
  const isNotFound =
    !publicSeoSlug &&
    !hubRedirect &&
    !KNOWN_PATHS.has(location.pathname) &&
    !location.pathname.startsWith("/agents/");
  // Public by design: /chat (anonymous live chat), /staking (honest not-integrated notice),
  // /transfer/co-sign (receiver needs no Axiom session) — every other internal route is wallet-gated.
  const internal =
    !publicSeoSlug &&
    !isNotFound &&
    !hubRedirect &&
    location.pathname !== "/" &&
    location.pathname !== "/chat" &&
    location.pathname !== "/staking" &&
    location.pathname !== "/transfer/co-sign" &&
    // /transactions + /storage render their own /chat-pattern demo state when
    // disconnected (real layout, inert controls, skeletons) instead of the
    // standalone lock (audit §4.9).
    location.pathname !== "/transactions" &&
    location.pathname !== "/storage";
  // Route-guard truth = persisted session AND the live wallet still being
  // connected. The stored session alone is not proof: wagmi rehydrates async,
  // and a persisted "authenticated" row must never paint the shell on top of
  // a disconnected wallet (audit: browser-2 auth-state leak).
  const authenticated =
    state.session.status === "authenticated" &&
    isSessionFresh(state.session) &&
    isConnected;

  // wagmi is still settling its persisted connection (connecting/reconnecting):
  // hold internal routes on a settling screen instead of guessing between the
  // authed shell, the gate, and a redirect. Public routes stay live — they
  // never depended on wallet state.
  const sessionSettling =
    internal &&
    !authenticated &&
    (accountStatus === "connecting" || accountStatus === "reconnecting");

  // One localized tab title per route ("<name> — Axiom"); public hubs own their SEO title.
  useEffect(() => {
    if (publicSeoSlug) return;
    const copy = getCopy(locale);
    const clean = location.pathname;
    if (clean === "/") {
      document.title = "Axiom — Own an AI Agent On-Chain";
      return;
    }
    const agentMatch = clean.match(/^\/agents\/(\d+)/);
    const name = agentMatch
      ? `Agent #${agentMatch[1]}`
      : isNotFound
        ? copy.notFound.title
        : {
            "/app": copy.nav.overview,
            "/chat": copy.nav.chat,
            "/transactions": copy.nav.transactions,
            "/storage": copy.nav.storage,
            "/mint": copy.nav.mint,
            "/payment": copy.nav.payment,
            "/transfer": copy.nav.transfer,
            "/tick": copy.nav.tick,
            "/deposit": copy.nav.deposit,
            "/withdraw": copy.nav.withdraw,
            "/settings": copy.settings.pageTitle,
            "/staking": "0G Stake",
            "/transfer/co-sign": copy.flowUi.receiveTitle,
          }[clean];
    if (name) document.title = `${name} — Axiom`;
  }, [location.pathname, locale, publicSeoSlug, isNotFound]);

  const gate = walletOpen ? (
    <WalletGate
      session={state.session}
      dispatch={dispatch}
      locale={locale}
      onClose={() => setWalletOpen(false)}
      onAuthenticated={resumeAfterAuth}
    />
  ) : null;
  const guide = state.guideOpen ? (
    <Guide
      onClose={() => dispatch({ type: "guide" })}
      go={go}
      locale={locale}
    />
  ) : null;
  const notice = (
    <Notice
      text={state.notice}
      severity={state.noticeSeverity ?? "success"}
      onClose={() => dispatch({ type: "notice", notice: null })}
      locale={locale}
    />
  );

  const surface = (
    <ErrorBoundary>
      <Suspense fallback={pageFallback}>
        <Routes>
          <Route path="/dashboard" element={<Navigate to="/app" replace />} />
          <Route path="/market" element={<Navigate to="/app" replace />} />
          <Route
            path="/*"
            element={
              publicSeoSlug ? (
                <PublicSeoPage slug={publicSeoSlug} />
              ) : isNotFound ? (
                <Recovery404 go={go} locale={locale} />
              ) : hubRedirect ? (
                // L1-M7: legacy hub spellings (/public-*, /features/*) are
                // permanent redirects to the canonical short hub path — never
                // 200-rendered alongside it (SEO duplicate-content guard).
                <Navigate to={hubRedirect} replace />
              ) : location.pathname === "/" ? (
                <Landing
                  locale={locale}
                  go={go}
                  onConnect={() => openWallet("/app")}
                  onGuide={() => dispatch({ type: "guide" })}
                />
              ) : location.pathname === "/transfer/co-sign" ? (
                <CoSignPage go={go} />
              ) : internal && state.session.status === "wrong-network" ? (
                // U12: a connected wrong-chain wallet gets the one-click remedy,
                // not the full wallet-required lock screen.
                <WrongNetworkNotice go={go} locale={locale} />
              ) : sessionSettling ? (
                // Guard settle screen: wagmi is restoring its persisted
                // connection — render neutral chrome, never the authed shell
                // or a premature gate (audit: browser-2 redirect roulette).
                <div className="session-settling" aria-busy="true">
                  <Spinner size={28} />
                </div>
              ) : internal && !authenticated ? (
                <LockedRoute
                  requested={path}
                  locale={locale}
                  onConnect={() => openWallet(path)}
                  go={go}
                />
              ) : (
                <AppShell
                  route={resolveRoute(location.pathname)}
                  path={path}
                  state={state}
                  dispatch={dispatch}
                  go={go}
                  onLock={lockConsole}
                >
                  {location.pathname === "/agents/list" ? (
                    // Legacy roster spelling: a settled session jumps to the
                    // overview during render (no post-paint bounce); the
                    // disconnected path never reaches this branch — LockedRoute
                    // renders its own "Browse agents" gate for it above.
                    <Navigate to="/app" replace />
                  ) : location.pathname === "/app" ? (
                    <DashboardPage go={go} state={state} dispatch={dispatch} />
                  ) : location.pathname.startsWith("/agents/") ? (
                    <AgentRoute go={go} locale={locale} />
                  ) : location.pathname === "/chat" ? (
                    <ChatSurface />
                  ) : location.pathname === "/transactions" ? (
                    <TransactionsPage
                      go={go}
                      state={state}
                      dispatch={dispatch}
                      onConnect={() => openWallet(path)}
                    />
                  ) : location.pathname === "/storage" ? (
                    <StoragePage state={state} go={go} />
                  ) : location.pathname === "/settings" ? (
                    <SettingsPage state={state} dispatch={dispatch} />
                  ) : location.pathname === "/staking" ? (
                    <StakingPage go={go} locale={locale} />
                  ) : [
                      "/mint",
                      "/payment",
                      "/transfer",
                      "/tick",
                      "/deposit",
                      "/withdraw",
                    ].includes(location.pathname) ? (
                    <FlowPage
                      kind={location.pathname.slice(1) as FlowKind}
                      state={state}
                      dispatch={dispatch}
                      go={go}
                      locale={locale}
                    />
                  ) : null}
                </AppShell>
              )
            }
          />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );

  return (
    <>
      {surface}
      {gate}
      {guide}
      {notice}
    </>
  );
}

function AgentRoute({
  go,
  locale,
}: {
  go: (path: string) => void;
  locale: "en" | "fr" | "de";
}) {
  const location = useLocation();
  const tokenId = shortTokenId(location.pathname);
  if (tokenId === null) {
    // F1: /agents/<slug> that is not a tokenId is a dead link, not a gate —
    // render the same 404 surface as any other unknown route.
    return <Recovery404 go={go} locale={locale} />;
  }
  return <AgentPage tokenId={tokenId} go={go} locale={locale} />;
}

/*
  U12: wrong-network stop for connected wallets. The switch button mirrors
  WalletGate's silent sign-in semantics — once the wallet sits on the app
  chain, the connection itself re-opens the session.
*/
function WrongNetworkNotice({
  go,
  locale,
}: {
  go: (path: string) => void;
  locale: Locale;
}) {
  const { dispatch } = useUiStore();
  const copy = getCopy(locale);
  const { switchChainAsync } = useSwitchChain();
  const [error, setError] = useState<string | null>(null);
  const chainVars = { chainName: APP_CHAIN.name, chainId: APP_CHAIN_ID };
  const switchBack = async () => {
    setError(null);
    try {
      await switchChainAsync({ chainId: APP_CHAIN_ID });
      dispatch({
        type: "session",
        session: {
          status: "authenticated",
          chain: APP_CHAIN_ID,
          signedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      setError(humanizeError(err));
    }
  };
  return (
    <LockedShell statusLabel="network mismatch">
      <section className="locked-route-copy" role="alert">
        <h1>{interpolate(copy.wallet.wrongNetworkTitle, chainVars)}</h1>
        <p>{copy.wallet.wrongNetworkDescription}</p>
        <div className="button-row">
          <Button
            onClick={() => void switchBack()}
            icon={<Network size={16} />}
          >
            {interpolate(copy.wallet.switchNetwork, chainVars)}
          </Button>
          <ReturnToLanding go={go} locale={locale} />
        </div>
        {error ? <p>{error}</p> : null}
      </section>
    </LockedShell>
  );
}

/*
  LockedRoute — THE one pre-auth gate for every internal route (console pages,
  agent detail, flow routes, /agents/list): one shell, one copy owner
  (copy.lockedHero), one visual-slot table (consoleCatalog.lockedGates that
  also carries the per-route schematic rows under the preview card). The CTA
  opens the live WalletGate.
*/
function LockedRoute({
  requested,
  locale,
  onConnect,
  go,
}: {
  requested: string;
  locale: Locale;
  onConnect: () => void;
  go: (path: string) => void;
}) {
  const copy = getCopy(locale);
  const pathname = requested.split("?", 1)[0] ?? requested;
  const gate = lockedGateFor(pathname);
  if (!gate) return null;
  const hero = copy.lockedHero[gate.hero];

  return (
    <LockedShell
      statusLabel="wallet not connected"
      shellClass={`locked-${gate.slug}`}
    >
      <section className="locked-route-copy">
        <h1>
          {hero.titleLead}
          <br />
          <i>{hero.titleEmphasis}</i>
        </h1>
        <p>{hero.copy}</p>
        <div className="button-row">
          <Button onClick={onConnect} icon={<Wallet size={16} />}>
            {copy.nav.connectWallet}
          </Button>
          <ReturnToLanding go={go} locale={locale} />
        </div>
      </section>
      <aside className="locked-evidence">
        <div className="locked-preview">
          <img src={gate.media} alt={`${gate.label} preview`} />
          <div>
            <small>Preview — connect a wallet for live data.</small>
          </div>
        </div>
        {/* Schematic mock, not data: masked values only (the gate never fakes
            live state) — per-route rows give every gate its own product shape. */}
        <div className="locked-schematic" aria-hidden="true">
          {gate.rows.map((row) => (
            <div className="locked-schematic-row" key={row.label}>
              {row.icon}
              <span>{row.label}</span>
              <em>{row.value}</em>
            </div>
          ))}
        </div>
      </aside>
    </LockedShell>
  );
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/** Fallback chrome routes through copy.ts + the Controls kit; the raw error
 * sentence still flows through humanizeError (central, en — known residual). */
function ErrorFallback({
  error,
  onRetry,
}: {
  error: Error | null;
  onRetry: () => void;
}) {
  const { state } = useUiStore();
  const copy = getCopy(state.settings.locale).errorBoundary;
  const isNetworkError =
    error?.name === "NetworkError" ||
    error?.message.toLowerCase().includes("failed to fetch") ||
    error?.message.toLowerCase().includes("load failed");
  return (
    <div className="ops-page cosign-panel" role="alert">
      <div className="review-error">
        <div>
          <strong>
            {isNetworkError ? copy.networkTitle : copy.genericTitle}
          </strong>
          <p>
            {isNetworkError
              ? copy.networkBody
              : error
                ? humanizeError(error)
                : copy.networkBody}
          </p>
        </div>
      </div>
      <div className="review-handoff-actions">
        <Button variant="secondary" onClick={onRetry}>
          {copy.retry}
        </Button>
        <Button variant="ghost" onClick={() => window.location.reload()}>
          {copy.reload}
        </Button>
      </div>
    </div>
  );
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  private resetErrorBoundary = (): void => {
    this.setState({ hasError: false, error: null });
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          onRetry={this.resetErrorBoundary}
        />
      );
    }
    return this.props.children;
  }
}
