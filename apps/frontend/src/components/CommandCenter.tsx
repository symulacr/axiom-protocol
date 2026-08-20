/*
  Command Center (ported from the v2 mockup; lucide → local icon shim).
  ⌘K/Ctrl-K palette over routes, next-safe actions and recent receipts.
*/
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Clock3,
  CornerDownLeft,
  Keyboard,
  Search,
  Sparkles,
  X,
} from "./axiom/icons.js";
import type { AppState, Route } from "../lib/models.js";
import { getNextSafeActions, type FundTarget } from "../lib/nextSafeAction.js";
import { getCommandRouteItems } from "../lib/routeRegistry.js";
import { getCopy, type Copy } from "../lib/copy.js";
import { trackUxEvent } from "../lib/uxTelemetry.js";
import { trapTabFocus } from "../utils/format.js";

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

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest("input, textarea, select, [contenteditable='true']"))
  );
}

export function CommandCenter({
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
    // 02 FINDING-021: no "Continue in <current page>" item — a control whose
    // destination is the page you are on is an empty affordance.
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
      detail: `${transaction.state} · ${transaction.hash}`,
      path: `/transactions?tx=${encodeURIComponent(transaction.id)}`,
      keywords: `${transaction.kind} ${transaction.detail} ${transaction.hash} ${transaction.state}`,
    }));
    return [...actionItems, ...routeItems, ...recent];
  }, [path, safeActions, state.transactions, copy]);

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
    trackUxEvent(`command:${item.id}`, route);
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
    // C-14 focus leg of the dismiss contract: return focus to the trigger
    // (the pre-open focused element) on close — the mobile drawer's behavior.
    const priorFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    window.setTimeout(() => inputRef.current?.focus(), 0);
    // Deferred: wins over the backdrop mousedown's default focus shift (see
    // useModalDismiss), so focus lands on the trigger for Esc and backdrop.
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
                <span className="eyebrow">{cmd.title}</span>
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
