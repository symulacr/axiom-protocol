import { useCallback, useEffect, useRef, type RefObject } from "react";

type TimerHandle = ReturnType<typeof setTimeout>;

export function useConfirmTimer(onSuccess?: () => void): {
  balanceRef: RefObject<HTMLSpanElement>;
  handleSuccess: () => void;
} {
  const balanceRef = useRef<HTMLSpanElement>(null);
  const confirmTimer = useRef<TimerHandle>();

  useEffect(
    () => () => {
      clearTimeout(confirmTimer.current);
    },
    [],
  );

  const handleSuccess = useCallback(() => {
    const el = balanceRef.current;
    if (el) {
      el.classList.add("axiom-confirm");
      clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(
        () => el.classList.remove("axiom-confirm"),
        1500,
      );
    }
    onSuccess?.();
  }, [onSuccess]);

  return { balanceRef, handleSuccess };
}
