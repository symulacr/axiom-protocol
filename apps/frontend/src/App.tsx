/*
  Axiom UI-v2 App — the mockup's App composition over react-router:
    · resolver-based routing (lib/routeRegistry) with v1 compat redirects
      (/dashboard, /market → /app; ?mint=1 → /mint flow page)
    · AppShell (rail + topbar + Command Center + priority strip + mobile drawer)
    · live WalletGate: wagmi connect / chain check / SIWE-lite session sign
    · internal routes are held behind LockedRoute until the session is
      authenticated (24h session freshness, persisted in axiom-session)
    · chat keeps the v1 live stack: ChatPage (SSE + tools + providers) mounts
      in the shell with its thread rail portaled into #sidebar-threads-slot
  Data: every screen is the v2 markup fed by the v1 hooks (usePortfolio,
  useEventHistory/useEventStream, useMintWizard/usePayment/useTransfer/
  useOrchestratorTick, useHealth).
*/
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useState,
  type ReactElement,
} from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useAccount } from "wagmi";
import { AppShell } from "./components/axiom/AppShell.js";
import { WalletGate, isSessionFresh } from "./components/axiom/WalletGate.js";
import { LockedRoute } from "./components/LockedRoute.js";
import { Button } from "./components/axiom/Controls.js";
import { ArrowRight, CircleCheck, X } from "./components/axiom/icons.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { Spinner } from "./components/ui.js";
import { ShellSidebarProvider } from "./hooks/useShellSidebar.js";
import { useReceiptReconcile } from "./hooks/useReceiptReconcile.js";
import { useModalDismiss } from "./hooks/useModalDismiss.js";
import { useUiStore } from "./lib/uiStore.js";
import {
  KNOWN_PATHS,
  resolvePublicSeoSlug,
  resolveRoute,
} from "./lib/routeRegistry.js";
import { MEDIA } from "./lib/media.js";
import { getCopy } from "./lib/copy.js";
import type { FlowKind } from "./lib/models.js";
import { APP_CHAIN_ID } from "./config/wagmi.js";

const ChatPage = lazy(() => import("./pages/ChatPage.js"));
const Landing = lazy(() =>
  import("./pages/LandingPage.js").then((m) => ({ default: m.Landing })),
);
const DashboardPage = lazy(() =>
  import("./pages/DashboardPage.js").then((m) => ({
    default: m.DashboardPage,
  })),
);
const AgentPage = lazy(() =>
  import("./pages/AgentPage.js").then((m) => ({ default: m.AgentPage })),
);
const TransactionsPage = lazy(() =>
  import("./pages/TransactionsPage.js").then((m) => ({
    default: m.TransactionsPage,
  })),
);
const StoragePage = lazy(() =>
  import("./pages/StoragePage.js").then((m) => ({ default: m.StoragePage })),
);
const SettingsPage = lazy(() =>
  import("./pages/SettingsPage.js").then((m) => ({ default: m.SettingsPage })),
);
const StakingPage = lazy(() =>
  import("./pages/StakingPage.js").then((m) => ({ default: m.StakingPage })),
);
const FlowPage = lazy(() =>
  import("./pages/FlowPage.js").then((m) => ({ default: m.FlowPage })),
);
const CoSignPage = lazy(() =>
  import("./pages/CoSignPage.js").then((m) => ({ default: m.CoSignPage })),
);
const PublicSeoPage = lazy(() =>
  import("./pages/PublicSeoPage.js").then((m) => ({
    default: m.PublicSeoPage,
  })),
);
const Recovery404 = lazy(() => import("./pages/NotFound.js"));

const pageFallback = (
  <div className="app-fallback">
    <Spinner size={32} />
  </div>
);

function Notice({
  text,
  onClose,
  locale,
}: {
  text: string | null;
  onClose: () => void;
  locale: "en" | "fr" | "de";
}) {
  if (!text) return null;
  return (
    <div className="notice-toast" role="status" aria-live="polite">
      <CircleCheck size={15} />
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
  // C-14 dismiss trio: Esc + focus restore here; backdrop via layer onMouseDown
  // below; explicit close via the X and the skip affordance.
  useModalDismiss(onClose);
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
      title: copy.guide.step3Title,
      copy: copy.guide.step3Body,
      path: "/storage",
      label: copy.guide.openStorage,
      image: MEDIA.mint,
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
            <X size={17} />
          </button>
          <span className="eyebrow copper">ORIENTATION</span>
          <h2>{item.title}</h2>
          <p>{item.copy}</p>
          <div className="guide-actions">
            <Button
              onClick={() => {
                go(item.path);
                onClose();
              }}
              icon={<ArrowRight size={15} />}
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
  // Mobile rail dismiss: the ☰ toggle sits under the fixed rail overlay once
  // open, so closing needs its own affordances — backdrop tap + Esc (the
  // shell modal-dismiss contract), both only meaningful ≤760px where the
  // rail is an overlay. C-14: focus returns to the pre-open element (the ☰
  // toggle) on close, matching the shell drawer contract.
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
    return BigInt(raw.split("?")[0] ?? raw);
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

  // v1 compat redirects: old IA entry points fold into the v2 surfaces.
  useEffect(() => {
    if (
      location.pathname === "/dashboard" ||
      location.pathname === "/market" ||
      location.pathname === "/agents/list"
    ) {
      navigate("/app", { replace: true });
    }
    if (
      location.pathname === "/app" &&
      new URLSearchParams(location.search).get("mint") === "1"
    ) {
      navigate("/mint", { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  // ---- Session bridge: wagmi ↔ uiStore session ------------------------------
  useEffect(() => {
    // C3-FE2: wagmi rehydrates its persisted connection asynchronously — during
    // that window isConnected is briefly false and dispatching "disconnected"
    // would void a valid stored session (locked routes until a full gate
    // re-walk). Hold off until wagmi settles (connected or truly disconnected).
    if (accountStatus === "reconnecting" || accountStatus === "connecting")
      return;
    if (!isConnected || !address) {
      if (state.session.status !== "disconnected") {
        // 03 FINDING-010: disconnect clears the whole identity — a stored
        // profile/address must never outlive the session it belonged to.
        dispatch({
          type: "session",
          session: {
            status: "disconnected",
            address: "",
            profile: "",
            signedAt: null,
          },
        });
      }
      return;
    }
    const sameWallet =
      state.session.address.toLowerCase() === address.toLowerCase();
    if (
      !sameWallet &&
      ["authenticated", "profile"].includes(state.session.status)
    ) {
      // A different wallet took over: the stored session proof is void.
      dispatch({
        type: "session",
        session: {
          status: "signing",
          address,
          wallet: connector?.name ?? "",
          chain: chainId ?? 0,
          signedAt: null,
          profile: "",
        },
      });
      return;
    }
    if (
      state.session.status === "authenticated" &&
      !isSessionFresh(state.session)
    ) {
      dispatch({
        type: "session",
        session: { status: "signing", signedAt: null },
      });
      return;
    }
    if (
      chainId !== undefined &&
      chainId !== APP_CHAIN_ID &&
      state.session.status !== "wrong-network"
    ) {
      dispatch({
        type: "session",
        session: {
          status: "wrong-network",
          address,
          wallet: connector?.name ?? "",
          chain: chainId,
        },
      });
      return;
    }
    if (
      state.session.address !== address ||
      (connector?.name && state.session.wallet !== connector.name)
    ) {
      dispatch({
        type: "session",
        session: {
          address,
          wallet: connector?.name ?? state.session.wallet,
          chain: chainId ?? APP_CHAIN_ID,
        },
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

  // ---- Theme bridge: v2 settings.theme → html data-theme. Single storage
  // owner is axiom-ui-settings (uiStore persists it; the index.html boot
  // script reads it) — the legacy axiom-theme mirror is removed, and any
  // orphaned copy from an older build is cleaned up here (C-SETTINGS).
  useEffect(() => {
    document.documentElement.dataset.theme = state.settings.theme;
    document.documentElement.style.colorScheme = state.settings.theme;
    try {
      localStorage.removeItem("axiom-theme");
    } catch {
      // storage unavailable in privacy-restricted contexts
    }
  }, [state.settings.theme]);

  // Notice auto-dismiss (4s, mockup semantics).
  useEffect(() => {
    if (!state.notice) return;
    const timer = window.setTimeout(
      () => dispatch({ type: "notice", notice: null }),
      4000,
    );
    return () => window.clearTimeout(timer);
  }, [state.notice, dispatch]);

  // C-15: settle persisted receipts that were mid-confirmation at reload
  // (mined → confirmed/reverted; timeout → stale/check-explorer).
  useReceiptReconcile(state.transactions, dispatch);

  const go = useCallback(
    (next: string) => {
      navigate(next);
      window.scrollTo({ top: 0, behavior: "auto" });
    },
    [navigate],
  );

  const [walletOpen, setWalletOpen] = useState(false);
  const openWallet = (
    source:
      | "wallet"
      | "dashboard"
      | "agent"
      | "chat"
      | "command-center"
      | "receipt"
      | "route",
    requestedPath = path,
  ) => {
    void source;
    dispatch({
      type: "set-pending-intent",
      intent: { path: requestedPath, source, createdAt: Date.now() },
    });
    setWalletOpen(true);
  };
  const resumeAfterAuth = () => {
    const destination = state.pendingIntent?.path || "/app";
    dispatch({ type: "clear-pending-intent" });
    setWalletOpen(false);
    go(destination);
  };
  const lockConsole = () => {
    dispatch({
      type: "session",
      session: {
        status: "disconnected",
        address: "",
        profile: "",
        signedAt: null,
      },
    });
    go("/");
  };

  const locale = state.settings.locale;
  const publicSeoSlug = resolvePublicSeoSlug(path);
  const isNotFound =
    !publicSeoSlug &&
    !KNOWN_PATHS.has(location.pathname) &&
    !location.pathname.startsWith("/agents/");
  // /chat stays public (anonymous live chat; history keys to the wallet only
  // when a session exists) and /staking is a public status notice (03
  // FINDING-015 — gating an honest "not integrated" page sent anonymous
  // users two disclosures deep into a dead end) — and /transfer/co-sign is
  // the P4 public receiver path (the acceptance signature is the only gate;
  // a receiver must NOT need an Axiom session to accept) — every other
  // internal route is wallet-gated.
  const internal =
    !publicSeoSlug &&
    !isNotFound &&
    location.pathname !== "/" &&
    location.pathname !== "/chat" &&
    location.pathname !== "/staking" &&
    location.pathname !== "/transfer/co-sign";
  const authenticated =
    state.session.status === "authenticated" && isSessionFresh(state.session);

  // 05 FINDING-012: one tab/history title per route ("<name> — Axiom"),
  // localized via copy (nav labels are the canonical route names). Public
  // hubs own their SEO title (PublicSeoPage); landing keeps the static
  // index.html brand title.
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
            "/staking": copy.landing.stakeTitle,
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
              ) : location.pathname === "/" ? (
                <Landing
                  locale={locale}
                  go={go}
                  onConnect={() => openWallet("wallet", "/app")}
                  onGuide={() => dispatch({ type: "guide" })}
                />
              ) : location.pathname === "/transfer/co-sign" ? (
                <CoSignPage go={go} />
              ) : internal && !authenticated ? (
                <LockedRoute
                  requested={path}
                  locale={locale}
                  onConnect={() => openWallet("route", path)}
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
                  {location.pathname === "/app" ? (
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
                    />
                  ) : location.pathname === "/storage" ? (
                    <StoragePage state={state} dispatch={dispatch} go={go} />
                  ) : location.pathname === "/settings" ? (
                    <SettingsPage
                      state={state}
                      dispatch={dispatch}
                      go={go}
                      onLock={lockConsole}
                    />
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
    // /agents/<slug> that is not a tokenId → the register lives on Overview.
    return (
      <div className="ops-page">
        <div className="empty-state">
          <strong>Agent not addressable</strong>
          <span>
            Agent pages use /agents/&lt;tokenId&gt;. Open the register on the
            overview.
          </span>
        </div>
        <Button onClick={() => go("/app")}>Open the register</Button>
      </div>
    );
  }
  return <AgentPage tokenId={tokenId} go={go} locale={locale} />;
}
