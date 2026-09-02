/*
  Dismiss contract: shared Esc leg + Tab focus trap + initial focus + focus restore for every
  modal layer; backdrop leg lives in markup (layer onMouseDown + stopPropagation); focus returns
  to the pre-open element. `surfaceRef` points at the dialog element itself (the node carrying
  role="dialog") — or its layer when a nested dialog (e.g. WalletGate → ConnectModal) must stay
  inside the same trap.
*/
import { useEffect, useRef, type RefObject } from "react";
import { trapTabFocus } from "../utils/format.js";

/** Focus candidates inside a modal surface — disabled/hidden controls never join the trap. */
export const FOCUSABLE_SELECTOR =
  "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export const listFocusables = (root: HTMLElement | null): HTMLElement[] =>
  Array.from(root?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);

export function useModalDismiss(
  onClose: () => void,
  surfaceRef: RefObject<HTMLElement | null>,
): void {
  // Latest-callback ref: the Esc listener binds once on mount, so inline closures stay safe.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const priorFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      // Focus trap: Tab/Shift+Tab wraps inside the dialog instead of walking the obscured page
      // (aria-modal="true" tells screen readers the page behind does not exist — the keyboard
      // must agree).
      const focusable = listFocusables(surfaceRef.current);
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      if (
        document.activeElement instanceof HTMLElement &&
        focusable.includes(document.activeElement)
      ) {
        trapTabFocus(event, focusable);
      } else {
        // Focus drifted off-surface (e.g. click on plain dialog text) — pull it back in.
        event.preventDefault();
        (event.shiftKey
          ? focusable[focusable.length - 1]
          : focusable[0]
        )?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    // Initial focus: the surface's first focusable (each dialog's close X or first control) —
    // dialogs no longer open with focus still sitting on the page trigger behind them.
    const focusTimer = window.setTimeout(() => {
      listFocusables(surfaceRef.current)[0]?.focus();
    }, 0);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      // Deferred one tick: wins over the backdrop mousedown's default focus shift, so focus lands on the trigger.
      window.setTimeout(() => priorFocus?.focus(), 0);
    };
  }, [surfaceRef]);
}
