/*
  Axiom UI store (ported from the v2 mockup prototypeStore). The wallet session
  is bridged to wagmi in App.tsx; transactions here are LOCAL receipts added by
  the live flow pages (real hashes) — the transaction center merges them with
  on-chain/indexer events from useEventStream/useEventHistory.
*/
import type {
  AppState,
  FlowKind,
  OperationDraft,
  OperationState,
  PendingIntent,
  Session,
  StoragePhase,
  Transaction,
  TxState,
  UiSettings,
} from "./models";

export type PrototypeAction =
  | { type: "settings"; patch: Partial<UiSettings> }
  | { type: "session"; session: Partial<Session> }
  | { type: "add-tx"; tx: Transaction }
  | { type: "tx-state"; txId: string; txState: TxState }
  | { type: "set-pending-intent"; intent: PendingIntent }
  | { type: "clear-pending-intent" }
  | { type: "save-draft"; draft: OperationDraft }
  | {
      type: "set-draft-phase";
      flow: FlowKind;
      phase: OperationDraft["phase"];
      error?: string | null;
      receiptId?: string | null;
    }
  | { type: "clear-draft"; flow: FlowKind }
  | { type: "storage"; storage: StoragePhase }
  | { type: "guide" }
  | { type: "notice"; notice: string | null }
  | { type: "reset" };

export const defaultSettings: UiSettings = {
  railCollapsed: false,
  railHidden: false,
  railWidth: 248,
  reducedMotion: false,
  guideCompleted: false,
  density: "calm",
  theme: "dark",
  fixtureWallet: "MetaMask",
  direction: "ltr",
  locale: "en",
};

export const defaultSession: Session = {
  status: "disconnected",
  wallet: "",
  address: "",
  profile: "",
  chain: 16661,
  signedAt: null,
};

export function readStored<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value
      ? ({ ...(fallback as object), ...JSON.parse(value) } as T)
      : fallback;
  } catch {
    return fallback;
  }
}

export function persist<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable in privacy-restricted contexts.
  }
}

const draftValue = (kind: FlowKind) =>
  kind === "payment"
    ? ""
    : kind === "transfer"
      ? ""
      : kind === "mint"
        ? ""
        : "";

export const defaultOperationState: OperationState = {
  pendingIntent: null,
  operationDrafts: Object.fromEntries(
    (["mint", "payment", "transfer", "tick"] as FlowKind[]).map((kind) => [
      kind,
      {
        kind,
        value: draftValue(kind),
        extra: "",
        agent: "",
        intent: null,
        phase: "draft",
        error: null,
        receiptId: null,
        updatedAt: 0,
      },
    ]),
  ) as Record<FlowKind, OperationDraft>,
};

export function sanitizeOperationState(value: OperationState): OperationState {
  const now = Date.now();
  const pendingIntent =
    value.pendingIntent &&
    now - value.pendingIntent.createdAt < 1000 * 60 * 60 * 24
      ? value.pendingIntent
      : null;
  const operationDrafts = { ...defaultOperationState.operationDrafts };
  (Object.keys(operationDrafts) as FlowKind[]).forEach((kind) => {
    const draft = value.operationDrafts?.[kind];
    if (draft && now - draft.updatedAt < 1000 * 60 * 60 * 24 * 7)
      operationDrafts[kind] = { ...operationDrafts[kind], ...draft, kind };
  });
  return { pendingIntent, operationDrafts };
}

export function createInitialPrototypeState(
  settings = defaultSettings,
  session = defaultSession,
  operationState = defaultOperationState,
): AppState {
  const safeOperationState = sanitizeOperationState(operationState);
  return {
    settings,
    session,
    transactions: [],
    storage: "ready",
    guideOpen: false,
    notice: null,
    ...safeOperationState,
  };
}

export function prototypeReducer(
  state: AppState,
  action: PrototypeAction,
): AppState {
  if (action.type === "settings")
    return { ...state, settings: { ...state.settings, ...action.patch } };
  if (action.type === "session")
    return { ...state, session: { ...state.session, ...action.session } };
  if (action.type === "add-tx") {
    const flow = action.tx.route.slice(1) as FlowKind;
    return {
      ...state,
      transactions: [action.tx, ...state.transactions],
      operationDrafts:
        flow in state.operationDrafts
          ? {
              ...state.operationDrafts,
              [flow]: {
                ...state.operationDrafts[flow],
                phase: "receipt",
                error: null,
                receiptId: action.tx.id,
                updatedAt: Date.now(),
              },
            }
          : state.operationDrafts,
    };
  }
  if (action.type === "tx-state") {
    return {
      ...state,
      transactions: state.transactions.map((tx) =>
        tx.id === action.txId ? { ...tx, state: action.txState } : tx,
      ),
    };
  }
  if (action.type === "set-pending-intent")
    return { ...state, pendingIntent: action.intent };
  if (action.type === "clear-pending-intent")
    return { ...state, pendingIntent: null };
  if (action.type === "save-draft")
    return {
      ...state,
      operationDrafts: {
        ...state.operationDrafts,
        [action.draft.kind]: { ...action.draft, updatedAt: Date.now() },
      },
    };
  if (action.type === "set-draft-phase")
    return {
      ...state,
      operationDrafts: {
        ...state.operationDrafts,
        [action.flow]: {
          ...state.operationDrafts[action.flow],
          phase: action.phase,
          error: action.error ?? null,
          receiptId:
            action.receiptId ?? state.operationDrafts[action.flow].receiptId,
          updatedAt: Date.now(),
        },
      },
    };
  if (action.type === "clear-draft")
    return {
      ...state,
      operationDrafts: {
        ...state.operationDrafts,
        [action.flow]: {
          ...defaultOperationState.operationDrafts[action.flow],
          updatedAt: Date.now(),
        },
      },
    };
  if (action.type === "storage") return { ...state, storage: action.storage };
  if (action.type === "guide") return { ...state, guideOpen: !state.guideOpen };
  if (action.type === "notice") return { ...state, notice: action.notice };
  if (action.type === "reset")
    return {
      ...createInitialPrototypeState(state.settings),
      notice: "Surface reset. Wallet access remains locked.",
    };
  return state;
}
