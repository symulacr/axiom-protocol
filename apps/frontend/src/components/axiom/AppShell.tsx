/* Shell = Sidebar + Topbar + mobile drawer + ⌘K palette; theme/density/direction from uiStore. */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  Clock3,
  CornerDownLeft,
  CreditCard,
  Database,
  Keyboard,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Network,
  ReceiptText,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
} from "./icons.js";
import { AxiomBrandMark } from "./BrandMark.js";
import { Status } from "./Controls.js";
import type { AppState, Route, Session, UiSettings } from "../../lib/models.js";
import type { ConsoleAction } from "../../lib/consoleStore.js";
import {
  getNextSafeActions,
  getRouteAction,
  type FundTarget,
} from "../../lib/nextSafeAction.js";
import {
  getCommandRouteItems,
  isOperationPath,
} from "../../lib/routeRegistry.js";
import { useHealth } from "../../hooks/useHealth.js";
import { truncateAddress, trapTabFocus } from "../../utils/format.js";
import { APP_CHAIN, APP_CHAIN_ID } from "../../config/wagmi.js";
import { getCopy, type Copy, type NavGroupKey } from "../../lib/copy.js";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand-compact" : ""}`}>
      <AxiomBrandMark />
      <span>AXIOM</span>
    </div>
  );
}

function Sidebar({
  route,
  go,
  settings,
  dispatch,
  session,
}: {
  route: Route;
  go: (path: string) => void;
  settings: UiSettings;
  dispatch: React.Dispatch<ConsoleAction>;
  session: Session;
}) {
  const resizeFrame = useRef<number | null>(null);
  const pendingWidth = useRef(settings.railWidth);
  const cleanupResize = useRef<(() => void) | null>(null);
  const clampRailWidth = (width: number) => Math.min(360, Math.max(220, width));
  useEffect(
    () => () => {
      if (resizeFrame.current !== null)
        window.cancelAnimationFrame(resizeFrame.current);
      cleanupResize.current?.();
    },
    [],
  );
  // One nav owner per destination: /app is "Overview"; labels come from copy.nav for localization.
  // Rail = 6 destinations only (T3b): agent-scoped verbs (tick/deposit/withdraw) live in
  // AgentPage's action rows + Command Center; transfer stays reachable from Payment +
  // Command Center + transaction receipts. Groups per h1-sidebardesign-plan §1.
  const copy = getCopy(settings.locale);
  const identified = session.status === "authenticated";
  const setSettings = (patch: Partial<UiSettings>) =>
    dispatch({ type: "settings", patch });
  type NavItem = {
    path: string;
    label: string;
    icon: ReactNode;
    active: boolean;
  };
  const navGroups: { labelKey: NavGroupKey; items: NavItem[] }[] = [
    {
      labelKey: "groupOverview",
      items: [
        {
          path: "/app",
          label: copy.nav.overview,
          icon: <LayoutDashboard size={16} />,
          active: route === "dashboard" || route === "agent",
        },
        {
          path: "/chat",
          label: copy.nav.chat,
          icon: <MessageSquare size={16} />,
          active: route === "chat",
        },
      ],
    },
    {
      labelKey: "groupOperations",
      items: [
        {
          path: "/transactions",
          label: copy.nav.transactions,
          icon: <ReceiptText size={16} />,
          active: route === "transactions",
        },
        {
          path: "/storage",
          label: copy.nav.storage,
          icon: <Database size={16} />,
          active: route === "storage",
        },
      ],
    },
    {
      labelKey: "groupResources",
      items: [
        {
          path: "/mint",
          label: copy.nav.mint,
          icon: <Sparkles size={16} />,
          active: route === "mint",
        },
        {
          path: "/payment",
          label: copy.nav.payment,
          icon: <CreditCard size={16} />,
          active: route === "payment",
        },
      ],
    },
  ];
  const resizeWithKeyboard = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const increment = event.shiftKey ? 24 : 12;
    const value =
      event.key === "ArrowLeft"
        ? settings.railWidth - increment
        : event.key === "ArrowRight"
          ? settings.railWidth + increment
          : event.key === "Home"
            ? 220
            : event.key === "End"
              ? 360
              : null;
    if (value === null) return;
    event.preventDefault();
    setSettings({ railWidth: clampRailWidth(value), railCollapsed: false });
  };
  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    cleanupResize.current?.();
    event.preventDefault();
    const resizeHandle = event.currentTarget;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startWidth = settings.railWidth;
    pendingWidth.current = startWidth;
    resizeHandle.setPointerCapture(pointerId);
    document.body.classList.add("is-resizing");
    const release = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      if (resizeHandle.hasPointerCapture(pointerId))
        resizeHandle.releasePointerCapture(pointerId);
      document.body.classList.remove("is-resizing");
      cleanupResize.current = null;
    };
    const schedule = () => {
      if (resizeFrame.current !== null) return;
      resizeFrame.current = window.requestAnimationFrame(() => {
        resizeFrame.current = null;
        setSettings({ railWidth: pendingWidth.current, railCollapsed: false });
      });
    };
    const move = (moveEvent: PointerEvent) => {
      pendingWidth.current = clampRailWidth(
        startWidth + moveEvent.clientX - startX,
      );
      schedule();
    };
    const finish = () => {
      if (resizeFrame.current !== null) {
        window.cancelAnimationFrame(resizeFrame.current);
        resizeFrame.current = null;
        setSettings({ railWidth: pendingWidth.current, railCollapsed: false });
      }
      release();
    };
    const cancel = () => {
      if (resizeFrame.current !== null) {
        window.cancelAnimationFrame(resizeFrame.current);
        resizeFrame.current = null;
      }
      release();
    };
    cleanupResize.current = cancel;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
  };
  const { data: health } = useHealth();
  return (
    <aside
      className={`sidebar ${settings.railCollapsed ? "is-collapsed" : ""}`}
      style={
        { "--rail-width": `${settings.railWidth}px` } as React.CSSProperties
      }
    >
      <div className="side-head">
        <Logo />
        <div className="rail-controls">
          <button
            className="icon-button rail-toggle"
            onClick={() =>
              setSettings({ railCollapsed: !settings.railCollapsed })
            }
            aria-label={copy.a11y.collapseSidebar}
          >
            <ChevronLeft size={15} />
          </button>
          <button
            className="icon-button rail-hide"
            onClick={() => setSettings({ railHidden: true })}
            aria-label={copy.a11y.hideSidebar}
          >
            <Menu size={15} />
          </button>
        </div>
      </div>
      <nav className="side-nav" aria-label={copy.a11y.primaryNav}>
        {navGroups.map((group) => (
          <div key={group.labelKey} className="nav-group">
            <span className="nav-group-label" aria-hidden="true">
              {copy.nav[group.labelKey]}
            </span>
            {group.items.map((item) => (
              <button
                key={item.path}
                className={`nav-item ${item.active ? "active" : ""}`}
                onClick={() => go(item.path)}
                data-label={item.label}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="network-card">
        <div>
          <strong>
            <i />
            {APP_CHAIN.name}
          </strong>
          {/* 02: the chain id is the one kept network readout; the
              oracle earns a mention only when it is DOWN (healthy plumbing is
              never announced). */}
          <small className="mono">
            chain {APP_CHAIN_ID}
            {health && !health.ok ? `, ${copy.topbar.oracleDown}` : ""}
          </small>
        </div>
        <Network size={16} />
      </div>
      {/* 03: identity renders only for an authenticated session —
          a stored profile/address from a previous operator never shows after
          disconnect. */}
      <button className="account" onClick={() => go("/settings")}>
        <span className="avatar">
          {(identified
            ? session.profile || copy.topbar.operator
            : copy.topbar.operator
          )
            .slice(0, 2)
            .toUpperCase()}
        </span>
        <div>
          <strong>
            {identified
              ? session.profile || copy.topbar.operator
              : copy.topbar.operator}
          </strong>
          <small>
            {identified
              ? truncateAddress(session.address)
              : copy.topbar.notConnected}
          </small>
        </div>
        <Settings2 size={14} />
      </button>
      <div
        className="rail-resize"
        role="separator"
        tabIndex={0}
        aria-label={copy.a11y.resizeSidebar}
        aria-orientation="vertical"
        aria-valuemin={220}
        aria-valuemax={360}
        aria-valuenow={settings.railWidth}
        onKeyDown={resizeWithKeyboard}
        onPointerDown={startResize}
      />
    </aside>
  );
}

function MobileNavigationDrawer({
  open,
  route,
  go,
  settings,
  dispatch,
  session,
  onClose,
}: {
  open: boolean;
  route: Route;
  go: (path: string) => void;
  settings: UiSettings;
  dispatch: React.Dispatch<ConsoleAction>;
  session: Session;
  onClose: () => void;
}) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const copy = getCopy(settings.locale);
  useEffect(() => {
    if (!open) return;
    const priorFocus = focusedElement();
    const focusFirst = () => listFocusables(drawerRef.current)[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = listFocusables(drawerRef.current);
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      trapTabFocus(event, focusable);
    };
    const restoreOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    const frame = window.requestAnimationFrame(focusFirst);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = restoreOverflow;
      priorFocus?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="mobile-nav-layer" role="presentation">
      <button
        className="mobile-nav-backdrop"
        aria-label={copy.a11y.closeNav}
        onClick={onClose}
      />
      <div
        className="mobile-nav-drawer"
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={copy.a11y.primaryNav}
      >
        <button
          className="icon-button mobile-nav-close"
          onClick={onClose}
          aria-label={copy.a11y.closeNav}
        >
          <X size={16} />
        </button>
        <Sidebar
          route={route}
          go={(next) => {
            go(next);
            onClose();
          }}
          settings={settings}
          dispatch={dispatch}
          session={session}
        />
      </div>
    </div>,
    document.body,
  );
}

/*
  Command Center.
  ⌘K/Ctrl-K palette over routes, next-safe actions and recent receipts.
*/
type CommandItem = {
  id: string;
  group: "Next safe action" | "Go to" | "Recent";
  label: string;
  detail: string;
  path: string;
  shortcut?: string;
  keywords: string;
};

/** Registry route id → localized nav label (same source as the sidebar). */
const NAV_KEY_BY_ROUTE_ID: Record<string, keyof Copy["nav"]> = {
  dashboard: "overview",
  chat: "chat",
  transactions: "transactions",
  storage: "storage",
  mint: "mint",
  payment: "payment",
  transfer: "transfer",
  tick: "tick",
  deposit: "deposit",
  withdraw: "withdraw",
};

const commandRoutes = getCommandRouteItems();

function routeItemsFor(copy: Copy): CommandItem[] {
  return commandRoutes.map(({ id, label, path, shortcut }) => ({
    id,
    group: "Go to",
    label: copy.nav[NAV_KEY_BY_ROUTE_ID[id] ?? "overview"] || label,
    detail: path,
    path,
    shortcut,
    keywords: `${id} ${label} ${path}`,
  }));
}

// Focus-trap selector shared by the mobile drawer (focus-first + tab wrap).
const FOCUSABLE_SELECTOR =
  "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

const listFocusables = (root: HTMLElement | null): HTMLElement[] =>
  Array.from(root?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);

/** Active element narrowed to HTMLElement (focus restore on dismiss). */
const focusedElement = (): HTMLElement | null =>
  document.activeElement instanceof HTMLElement ? document.activeElement : null;

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest("input, textarea, select, [contenteditable='true']"))
  );
}

function CommandCenter({
  state,
  go,
  fundTarget,
}: {
  state: AppState;
  go: (path: string) => void;
  fundTarget?: FundTarget;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const copy = getCopy(state.settings.locale);
  const cmd = copy.command;
  const safeActions = useMemo(
    () => getNextSafeActions(state, fundTarget, copy.strip),
    [state, fundTarget, copy.strip],
  );

  const items = useMemo<CommandItem[]>(() => {
    const routeItems = routeItemsFor(copy);
    // No "Continue in <current page>" item — navigating to your current page is an empty affordance.
    const actionItems = safeActions.map((action) => ({
      id: action.id,
      group: "Next safe action" as const,
      label: action.title,
      detail: action.summary,
      path: action.path,
      shortcut: action.shortcut,
      keywords: `${action.id} ${action.title} ${action.summary} ${action.proofLabel} ${action.proofValue}`,
    }));
    const recent = state.transactions.slice(0, 3).map((transaction) => ({
      id: `recent-${transaction.id}`,
      group: "Recent" as const,
      label: transaction.kind,
      detail: `${transaction.state}, ${transaction.hash}`,
      path: `/transactions?tx=${encodeURIComponent(transaction.id)}`,
      keywords: `${transaction.kind} ${transaction.detail} ${transaction.hash} ${transaction.state}`,
    }));
    return [...actionItems, ...routeItems, ...recent];
  }, [safeActions, state.transactions, copy]);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? items.filter((item) =>
          `${item.label} ${item.detail} ${item.keywords}`
            .toLowerCase()
            .includes(normalized),
        )
      : items;
  }, [items, query]);
  const current = results[activeIndex] ?? results[0];
  const groups: CommandItem["group"][] = [
    "Next safe action",
    "Go to",
    "Recent",
  ];
  const groupLabels: Record<CommandItem["group"], string> = {
    "Next safe action": cmd.groupNextSafeAction,
    "Go to": cmd.groupGoTo,
    Recent: cmd.groupRecent,
  };

  const close = () => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  };
  const execute = (item?: CommandItem) => {
    if (!item) return;
    go(item.path);
    close();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "k" &&
        !isEditableTarget(event.target)
      ) {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape" && open) close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]); // close is stable enough for the escape path

  useEffect(() => {
    if (!open) return;
    // Dismiss focus leg: return focus to the pre-open trigger on close — the mobile drawer's behavior.
    const priorFocus = focusedElement();
    window.setTimeout(() => inputRef.current?.focus(), 0);
    // Deferred one tick: wins over backdrop mousedown's default focus shift (see useModalDismiss).
    return () => {
      window.setTimeout(() => priorFocus?.focus(), 0);
    };
  }, [open]);

  useEffect(() => setActiveIndex(0), [query, open]);

  const handlePanelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) =>
        Math.min(index + 1, Math.max(results.length - 1, 0)),
      );
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    }
    if (event.key === "Enter") {
      event.preventDefault();
      execute(current);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
    if (event.key === "Tab" && panelRef.current) {
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled])",
        ),
      );
      trapTabFocus(event, focusable);
    }
  };

  return (
    <>
      <button
        className="icon-button command-center-trigger"
        onClick={() => setOpen(true)}
        aria-label={copy.a11y.openCommand}
        aria-haspopup="dialog"
      >
        <Search size={16} />
      </button>
      {open &&
        createPortal(
          <div
            className="command-palette-layer command-center-layer"
            onMouseDown={close}
          >
            <div
              ref={panelRef}
              className="command-palette command-center"
              role="dialog"
              aria-modal="true"
              aria-label={cmd.title}
              onMouseDown={(event) => event.stopPropagation()}
              onKeyDown={handlePanelKeyDown}
            >
              <div className="command-center-head">
                <strong>{cmd.title}</strong>
                <button
                  className="icon-button command-center-close"
                  onClick={close}
                  aria-label={copy.a11y.closeCommand}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="command-input">
                <Search size={16} />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={cmd.placeholder}
                  aria-controls="command-results"
                  aria-activedescendant={
                    current ? `command-${current.id}` : undefined
                  }
                />
                <kbd>
                  {navigator.platform.includes("Mac") ? "⌘ K" : "CTRL K"}
                </kbd>
              </div>
              <div className="command-center-meta" aria-live="polite">
                <span>
                  <Sparkles size={13} /> {cmd.resultsCount(results.length)}
                </span>
                <span>
                  <Keyboard size={13} /> {cmd.hintKeys}
                </span>
              </div>
              <div
                id="command-results"
                className="command-results"
                role="listbox"
              >
                {groups.map((group) => {
                  const grouped = results.filter(
                    (item) => item.group === group,
                  );
                  if (!grouped.length) return null;
                  return (
                    <section
                      key={group}
                      className="command-group"
                      aria-label={groupLabels[group]}
                    >
                      <span className="command-group-label">
                        {groupLabels[group]}
                      </span>
                      {grouped.map((item) => {
                        const index = results.indexOf(item);
                        return (
                          <button
                            id={`command-${item.id}`}
                            key={item.id}
                            role="option"
                            aria-selected={index === activeIndex}
                            className={index === activeIndex ? "is-active" : ""}
                            onMouseEnter={() => setActiveIndex(index)}
                            onClick={() => execute(item)}
                          >
                            <span className="command-item-icon">
                              {item.group === "Recent" ? (
                                <Clock3 size={14} />
                              ) : (
                                <ArrowRight size={14} />
                              )}
                            </span>
                            <span>
                              <strong>{item.label}</strong>
                              <small>{item.detail}</small>
                            </span>
                            {item.shortcut ? (
                              <kbd>{item.shortcut}</kbd>
                            ) : (
                              <CornerDownLeft size={13} />
                            )}
                          </button>
                        );
                      })}
                    </section>
                  );
                })}
                {!results.length && (
                  <div className="empty-state">
                    <strong>{cmd.emptyTitle}</strong>
                    <span>{cmd.emptyBody}</span>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function Topbar({
  state,
  session,
  go,
  onLock,
  onOpenMobileNav,
  fundTarget,
}: {
  state: AppState;
  session: Session;
  go: (path: string) => void;
  onLock: () => void;
  onOpenMobileNav: () => void;
  fundTarget?: FundTarget;
}) {
  const copy = getCopy(state.settings.locale);
  // Identity + session pill render only when authenticated — never a stale profile after disconnect.
  const identified = session.status === "authenticated";
  return (
    <header className="topbar">
      <div className="topbar-route">
        <button
          className="icon-button mobile-nav-trigger"
          onClick={onOpenMobileNav}
          aria-label={copy.a11y.openNav}
          aria-haspopup="dialog"
        >
          <Menu size={18} />
        </button>
      </div>
      <div className="topbar-actions">
        <CommandCenter state={state} go={go} fundTarget={fundTarget} />
        <button className="session-top" onClick={() => go("/settings")}>
          <Wallet size={14} />
          <span>
            {identified
              ? session.profile || truncateAddress(session.address)
              : copy.topbar.notConnected}
          </span>
          <Status
            label={
              identified ? copy.topbar.connected : copy.topbar.notConnected
            }
            tone={identified ? "success" : "muted"}
          />
        </button>
        <button
          className="icon-button"
          onClick={onLock}
          aria-label={copy.settings.lockConsole}
        >
          <LogOut size={15} />
        </button>
      </div>
    </header>
  );
}

/*
  PriorityActionStrip (lucide → local icon shim).
  The "next safe action" lane under the topbar — prefilled, never submitted.
*/
function PriorityActionStrip({
  state,
  route,
  path,
  go,
  fundTarget,
}: {
  state: AppState;
  route: Route;
  path: string;
  go: (path: string) => void;
  fundTarget?: FundTarget;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const copy = getCopy(state.settings.locale);
  const strip = copy.strip;
  const action = getRouteAction(state, path, fundTarget, strip);

  // No strip on chat (fills viewport) or flow pages — their copper primary must not compete with the payment CTA.
  if (
    !action ||
    ["settings", "staking", "chat"].includes(route) ||
    isOperationPath(path.split("?", 1)[0] ?? "")
  )
    return null;

  const actions = getNextSafeActions(state, fundTarget, strip);
  const alternatives = actions
    .filter((item) => item.id !== action.id)
    .slice(0, 2);

  const openAction = (target = action) => {
    go(target.path);
  };

  return (
    <section
      className={`priority-action-strip priority-${action.priority}`}
      aria-label={copy.landing.nextSafeAction}
    >
      <div className="priority-rail" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="priority-action-copy">
        <strong>{action.title}</strong>
        <p>{action.summary}</p>
      </div>
      <div className="priority-proof">
        <span>{action.proofLabel}</span>
        <b className="mono">{action.proofValue}</b>
        <small>
          <ShieldCheck size={12} /> {action.impact}
        </small>
      </div>
      <div className="priority-actions">
        <button className="button button-primary" onClick={() => openAction()}>
          {strip.openReview} <ArrowRight size={15} />
        </button>
        <button
          className="priority-why"
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((open) => !open)}
        >
          {strip.whyNow} <ChevronDown size={14} />
        </button>
      </div>
      {detailsOpen && (
        <div className="priority-details">
          <span className="mono">
            {action.shortcut}, {strip.prefilledNote}
          </span>
          <div>
            {alternatives.map((alternative) => (
              <button
                key={alternative.id}
                onClick={() => openAction(alternative)}
              >
                {alternative.title} <ArrowRight size={13} />
              </button>
            ))}
            <button onClick={() => go("/transactions?filter=review")}>
              {strip.seeAllQueue} <ArrowRight size={13} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export function AppShell({
  route,
  path,
  state,
  dispatch,
  go,
  onLock,
  fundTarget,
  children,
}: {
  route: Route;
  path: string;
  state: AppState;
  dispatch: React.Dispatch<ConsoleAction>;
  go: (path: string) => void;
  onLock: () => void;
  fundTarget?: FundTarget;
  children: ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const copy = getCopy(state.settings.locale);
  const setSettings = (patch: Partial<UiSettings>) =>
    dispatch({ type: "settings", patch });
  const className =
    `operator-preferences ${state.settings.reducedMotion ? "reduce-motion" : ""} ${state.settings.railHidden ? "rail-hidden" : ""}`.trim();
  return (
    <div className={className} dir={state.settings.direction}>
      <div
        className={`app-shell ${state.settings.theme} density-${state.settings.density}`}
        data-theme={state.settings.theme}
        style={
          {
            "--rail-width": `${state.settings.railCollapsed ? 72 : state.settings.railWidth}px`,
          } as React.CSSProperties
        }
      >
        {/* U27: keyboard bypass of the command rail; target is main.main below. */}
        <a className="skip-link" href="#main-content">
          {copy.a11y.skipToContent}
        </a>
        <div className="sidebar-wrap">
          {!state.settings.railHidden && (
            <Sidebar
              route={route}
              go={go}
              settings={state.settings}
              dispatch={dispatch}
              session={state.session}
            />
          )}
          {state.settings.railHidden && (
            <button
              className="rail-reopen"
              onClick={() => setSettings({ railHidden: false })}
            >
              <Menu size={14} /> {copy.topbar.openRail}
            </button>
          )}
        </div>
        <main id="main-content" className="main">
          <Topbar
            state={state}
            session={state.session}
            go={go}
            onLock={onLock}
            onOpenMobileNav={() => setMobileNavOpen(true)}
            fundTarget={fundTarget}
          />
          <PriorityActionStrip
            state={state}
            route={route}
            path={path}
            go={go}
            fundTarget={fundTarget}
          />
          {children}
        </main>
      </div>
      <MobileNavigationDrawer
        open={mobileNavOpen}
        route={route}
        go={go}
        settings={state.settings}
        dispatch={dispatch}
        session={state.session}
        onClose={() => setMobileNavOpen(false)}
      />
    </div>
  );
}
