/*
  Axiom UI-v2 shared types .
*/
import type { ReactNode } from "react";
import type { Locale } from "./copy";

export type { Locale } from "./copy";

export type Route =
  | "landing"
  | "public-agents"
  | "public-payments"
  | "public-proofs"
  | "public-storage"
  | "public-developers"
  | "dashboard"
  | "agent"
  | "chat"
  | "transactions"
  | "storage"
  | "settings"
  | "staking"
  | "transfer-co-sign"
  | "mint"
  | "payment"
  | "transfer"
  | "tick"
  | "deposit"
  | "withdraw"
  | "not-found";
export type FlowKind =
  "mint" | "payment" | "transfer" | "tick" | "deposit" | "withdraw";
export type TxState =
  | "ready"
  | "approval"
  | "signing"
  | "submitted"
  | "confirming"
  | "confirmed"
  | "reverted"
  | "rejected"
  | "stale";
/** Receipt-state buckets shared by dashboard/receipt-center/next-action logic. */
export const isRecoverableTx = (state: TxState) =>
  state === "reverted" || state === "rejected" || state === "stale";
export const isInFlightTx = (state: TxState) =>
  state === "submitted" || state === "confirming";
/** A vault is strategy-bound when its root is set and non-zero. */
export const hasStrategyRoot = (root: string | null | undefined) =>
  Boolean(root) && root !== ZERO_STRATEGY_ROOT;
const ZERO_STRATEGY_ROOT =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
export type SessionState =
  "disconnected" | "wrong-network" | "profile" | "authenticated";
export type StoragePhase =
  | "ready"
  | "encrypted"
  | "root-hashed"
  | "published"
  | "verified"
  | "available"
  | "failed";
export type UiSettings = {
  railCollapsed: boolean;
  railHidden: boolean;
  railWidth: number;
  reducedMotion: boolean;
  guideCompleted: boolean;
  density: "calm" | "dense";
  theme: "dark" | "light";
  fixtureWallet: string;
  direction: "ltr" | "rtl";
  locale: Locale;
};
export type Session = {
  status: SessionState;
  wallet: string;
  address: string;
  profile: string;
  chain: number;
  signedAt: string | null;
};
export type Transaction = {
  id: string;
  kind: string;
  detail: string;
  hash: string;
  age: string;
  state: TxState;
  route: string;
  agent: string;
  icon: ReactNode;
  /** Wall-clock ms at local receipt creation; persisted so the receipt center
   * can render an honest age after reload (chain-event rows derive their own). */
  createdAt?: number;
  /** Default true: adding this receipt flips the owning flow draft to the
   * receipt phase. Boundary-1 approve receipts set false so the payment
   * sheet can advance to boundary 2 instead. */
  opensReceipt?: boolean;
};
export type PendingIntent = {
  path: string;
  source:
    | "wallet"
    | "dashboard"
    | "agent"
    | "chat"
    | "command-center"
    | "receipt"
    | "route";
  createdAt: number;
};
export type OperationDraftPhase =
  | "draft"
  | "review"
  | "approval-required"
  | "payment-required"
  | "submitting"
  | "receipt"
  | "recoverable-error";
export type OperationDraft = {
  kind: FlowKind;
  value: string;
  extra: string;
  agent: string;
  intent: string | null;
  phase: OperationDraftPhase;
  error: string | null;
  receiptId: string | null;
  updatedAt: number;
};
export type OperationState = {
  pendingIntent: PendingIntent | null;
  operationDrafts: Record<FlowKind, OperationDraft>;
};
export type AppState = {
  settings: UiSettings;
  session: Session;
  transactions: Transaction[];
  storage: StoragePhase;
  guideOpen: boolean;
  notice: string | null;
} & OperationState;
