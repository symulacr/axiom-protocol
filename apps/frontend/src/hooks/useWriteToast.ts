import { useCallback } from "react";
import { toast } from "sonner";
import { errorRefString, humanizeError } from "../utils/format.js";

/** Shared write-flow toasts: success on submit + canonical humanized error toast for every write path. */
export function useWriteToast(): {
  success: (msg: string) => void;
  error: (err: unknown) => void;
} {
  const success = useCallback((msg: string): void => {
    toast.success(msg);
  }, []);

  const error = useCallback((err: unknown): void => {
    const refStr = errorRefString(err);
    toast.error(
      humanizeError(err),
      refStr ? { description: refStr } : undefined,
    );
  }, []);

  return { success, error };
}
