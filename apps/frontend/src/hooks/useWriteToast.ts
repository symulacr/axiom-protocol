import { useCallback } from "react";
import { toast } from "sonner";
import { errorRefString, humanizeError } from "../utils/format.js";

/**
 * Shared write-flow toasts: success message on tx submit, and the canonical
 * error toast (humanized message + optional Ref · requestId/code description)
 * used by every deposit/withdraw/mint/transfer write path.
 */
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
