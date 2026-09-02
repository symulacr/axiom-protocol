/*
  Shared page-level helpers promoted from byte-identical per-page copies
  (Wave-3 merge-dedup). Only helpers consumed by ≥2 pages belong here;
  single-page helpers stay local to their page.
*/
import { toast } from "sonner";
import { errorRefString, humanizeError } from "../utils/format.js";

/** Shared write-flow toasts: success on submit + canonical humanized error toast for every write path. */
export const toastSuccess = (msg: string): void => {
  toast.success(msg);
};
export const toastError = (err: unknown): void => {
  const refStr = errorRefString(err);
  // U24: error toasts persist until dismissed — same regime as the Notice rail.
  // The 3s Toaster default stays for success/info toasts only (main.tsx).
  toast.error(
    humanizeError(err),
    refStr
      ? { duration: Infinity, description: refStr }
      : { duration: Infinity },
  );
};
