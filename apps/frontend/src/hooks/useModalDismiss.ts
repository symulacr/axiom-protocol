/*
   modal dismiss contract — shared Esc leg + focus restore for every
  conditionally-mounted modal/overlay layer (OperationReviewSheet,
  ReceiptDrawer, WalletGate, guide overlay). The backdrop leg stays in markup
  (layer onMouseDown + stopPropagation on the dialog, mirroring the canonical
  CommandCenter/mobile-drawer trio) and each dialog keeps an explicit close
  control. Focus returns to the pre-open element (the trigger in practice),
  matching the mobile drawer's behavior in AppShell.
*/
import { useEffect, useRef } from "react";

export function useModalDismiss(onClose: () => void): void {
  // Latest-callback ref: the Esc listener binds once on mount, so parents may
  // pass inline closures without re-capturing focus on every re-render.
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
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Deferred: a backdrop mousedown's default action shifts focus to the
      // clicked backdrop AFTER the React handler runs — restoring on the next
      // tick wins over that default, so focus lands on the trigger for both
      // the Esc leg and the backdrop leg.
      window.setTimeout(() => priorFocus?.focus(), 0);
    };
  }, []);
}
