/*
  v2 AppShell (ported from the mockup; live values). Sidebar + Topbar +
  MobileNavigationDrawer + AppShell. Rail resize/collapse/hide, theme/density
  and direction come from the uiStore settings; network + account are live
  (wagmi account, useHealth chain head).
*/
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  Bot,
  ChevronLeft,
  CreditCard,
  Database,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Network,
  Play,
  ReceiptText,
  Settings2,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
} from "./icons.js";
import { AxiomBrandMark } from "./BrandMark.js";
import { Status } from "./Controls.js";
import { CommandCenter } from "../CommandCenter.js";
import { PriorityActionStrip } from "../PriorityActionStrip.js";
import type { AppState, Route, Session, UiSettings } from "../../lib/models.js";
import type { PrototypeAction } from "../../lib/prototypeStore.js";
import type { FundTarget } from "../../lib/nextSafeAction.js";
import { useHealth } from "../../hooks/useHealth.js";
import { APP_CHAIN, APP_CHAIN_ID } from "../../config/wagmi.js";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand-compact" : ""}`}>
      <AxiomBrandMark />
      <span>AXIOM</span>
    </div>
  );
}

function shortAddress(address: string): string {
  return address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : "not connected";
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
  dispatch: React.Dispatch<PrototypeAction>;
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
  // The agent register lives on the Overview surface; the "Agents" item stays
  // lit on deep agent pages (live agents are /agents/:tokenId — /agents alone
  // is the public SEO hub, never the console register).
  const items = [
    {
      path: "/app",
      label: "Overview",
      icon: <LayoutDashboard size={15} />,
      active: route === "dashboard",
    },
    {
      path: "/app",
      label: "Agents",
      icon: <Bot size={15} />,
      active: route === "agent",
    },
    {
      path: "/chat",
      label: "Chat",
      icon: <MessageSquare size={15} />,
      active: route === "chat",
    },
    {
      path: "/transactions",
      label: "Transactions",
      icon: <ReceiptText size={15} />,
      active: route === "transactions",
    },
    {
      path: "/storage",
      label: "Storage",
      icon: <Database size={15} />,
      active: route === "storage",
    },
  ];
  const flows = [
    { path: "/mint", label: "Mint", icon: <Sparkles size={14} /> },
    { path: "/payment", label: "Payment", icon: <CreditCard size={14} /> },
    { path: "/transfer", label: "Transfer", icon: <ShieldCheck size={14} /> },
    { path: "/tick", label: "Tick", icon: <Play size={14} /> },
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
    dispatch({
      type: "settings",
      patch: { railWidth: clampRailWidth(value), railCollapsed: false },
    });
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
        dispatch({
          type: "settings",
          patch: { railWidth: pendingWidth.current, railCollapsed: false },
        });
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
        dispatch({
          type: "settings",
          patch: { railWidth: pendingWidth.current, railCollapsed: false },
        });
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
              dispatch({
                type: "settings",
                patch: { railCollapsed: !settings.railCollapsed },
              })
            }
            aria-label="Collapse sidebar"
          >
            <ChevronLeft size={15} />
          </button>
          <button
            className="icon-button rail-hide"
            onClick={() =>
              dispatch({ type: "settings", patch: { railHidden: true } })
            }
            aria-label="Hide sidebar"
          >
            <Menu size={15} />
          </button>
        </div>
      </div>
      <div className="rail-caption">
        <span className="eyebrow">AXIOM / COMMAND DECK</span>
        <span className="mono">0G</span>
      </div>
      <nav className="side-nav" aria-label="Primary navigation">
        {items.map((item) => (
          <button
            key={item.label}
            className={`nav-item ${item.active ? "active" : ""}`}
            onClick={() => go(item.path)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
        <div className="nav-section-label">
          <span>EXECUTION</span>
        </div>
        {flows.map((item) => (
          <button
            key={item.path}
            className={`nav-item nav-flow ${route === item.path.slice(1) ? "active" : ""}`}
            onClick={() => go(item.path)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="network-card">
        <div>
          <span className="eyebrow">NETWORK</span>
          <strong>
            <i />
            {APP_CHAIN.name}
          </strong>
          <small className="mono">
            chain {APP_CHAIN_ID}
            {health?.ok ? ` · oracle live` : health ? " · oracle down" : ""}
          </small>
        </div>
        <Network size={16} />
      </div>
      <button className="account" onClick={() => go("/settings")}>
        <span className="avatar">
          {(session.profile || "AM").slice(0, 2).toUpperCase()}
        </span>
        <div>
          <strong>{session.profile || "operator"}</strong>
          <small>{shortAddress(session.address)}</small>
        </div>
        <Settings2 size={14} />
      </button>
      <div
        className="rail-resize"
        role="separator"
        tabIndex={0}
        aria-label="Resize sidebar"
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
  dispatch: React.Dispatch<PrototypeAction>;
  session: Session;
  onClose: () => void;
}) {
  const drawerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const priorFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const focusFirst = () =>
      drawerRef.current
        ?.querySelector<HTMLElement>(
          "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
        )
        ?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
        ) ?? [],
      );
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
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
        aria-label="Close navigation"
        onClick={onClose}
      />
      <div
        className="mobile-nav-drawer"
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Primary navigation"
      >
        <button
          className="icon-button mobile-nav-close"
          onClick={onClose}
          aria-label="Close navigation"
        >
          <X size={18} />
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

function Topbar({
  route,
  path,
  state,
  session,
  go,
  onLock,
  onOpenMobileNav,
  fundTarget,
}: {
  route: Route;
  path: string;
  state: AppState;
  session: Session;
  go: (path: string) => void;
  onLock: () => void;
  onOpenMobileNav: () => void;
  fundTarget?: FundTarget;
}) {
  return (
    <header className="topbar">
      <div className="topbar-route">
        <button
          className="icon-button mobile-nav-trigger"
          onClick={onOpenMobileNav}
          aria-label="Open primary navigation"
          aria-haspopup="dialog"
        >
          <Menu size={18} />
        </button>
        <span className="eyebrow">{route.toUpperCase()} / AXIOM</span>
      </div>
      <div className="topbar-actions">
        <CommandCenter
          state={state}
          route={route}
          path={path}
          go={go}
          fundTarget={fundTarget}
        />
        <button className="session-top" onClick={() => go("/settings")}>
          <Wallet size={14} />
          <span>{session.profile || shortAddress(session.address)}</span>
          <Status label="connected" tone="success" />
        </button>
        <button
          className="icon-button"
          onClick={onLock}
          aria-label="Lock console"
        >
          <LogOut size={15} />
        </button>
      </div>
    </header>
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
  dispatch: React.Dispatch<PrototypeAction>;
  go: (path: string) => void;
  onLock: () => void;
  fundTarget?: FundTarget;
  children: ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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
              onClick={() =>
                dispatch({ type: "settings", patch: { railHidden: false } })
              }
            >
              <Menu size={14} /> Open rail
            </button>
          )}
        </div>
        <main className="main">
          <Topbar
            route={route}
            path={path}
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
