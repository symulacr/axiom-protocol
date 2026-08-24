/*
  Dismiss contract: shared Esc leg + focus restore for every modal layer; backdrop leg lives in
  markup (layer onMouseDown + stopPropagation); focus returns to the pre-open element.
*/
import { useEffect, useRef } from "react";

export function useModalDismiss(onClose: () => void): void {
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
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Deferred one tick: wins over the backdrop mousedown's default focus shift, so focus lands on the trigger.
      window.setTimeout(() => priorFocus?.focus(), 0);
    };
  }, []);
}
