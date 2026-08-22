/*
  Axiom UI store . The wallet session
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

/** Serializable form of a local receipt row (icon is a ReactNode and is
 *  rehydrated from flowMeta by route in uiStore). */
export type PersistedTransaction = Omit<Transaction, "icon">;

export const MAX_PERSISTED_TRANSACTIONS = 50;
const TRANSACTION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

const KNOWN_TX_STATES: ReadonlySet<TxState> = new Set([
  "ready",
  "approval",
  "signing",
  "submitted",
  "confirming",
  "confirmed",
  "reverted",
  "rejected",
  "stale",
]);

/** Validate persisted receipt rows: shape-checked, TTL'd (7d like drafts),
 *  capped; an unrecognized state coerces to "stale" (unknown — check
 *  explorer) rather than resurrecting a lie. */
export function sanitizeTransactions(value: unknown): PersistedTransaction[] {
  if (!Array.isArray(value)) return [];
  const now = Date.now();
  const out: PersistedTransaction[] = [];
  for (const raw of value) {
    const tx = raw as Partial<PersistedTransaction> | null;
    if (
      !tx ||
      typeof tx.id !== "string" ||
      typeof tx.hash !== "string" ||
      typeof tx.kind !== "string" ||
      typeof tx.route !== "string"
    )
      continue;
    if (
      typeof tx.createdAt === "number" &&
      now - tx.createdAt > TRANSACTION_TTL_MS
    )
      continue;
    const state: TxState = KNOWN_TX_STATES.has(tx.state as TxState)
      ? (tx.state as TxState)
      : "stale";
    out.push({
      id: tx.id,
      kind: tx.kind,
      detail: typeof tx.detail === "string" ? tx.detail : "",
      hash: tx.hash,
      age: typeof tx.age === "string" ? tx.age : "",
      state,
      route: tx.route,
      agent: typeof tx.agent === "string" ? tx.agent : "",
      ...(typeof tx.createdAt === "number" ? { createdAt: tx.createdAt } : {}),
      ...(tx.opensReceipt === false ? { opensReceipt: false } : {}),
    });
    if (out.length >= MAX_PERSISTED_TRANSACTIONS) break;
  }
  return out;
}

export type ConsoleAction =
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

/** Unset-theme default (C-SETTINGS): follow the OS, matching the index.html
 *  boot script — before this, the store hardcoded "dark" while the boot
 *  script honored prefers-color-scheme, so light-OS first visits flipped
 *  post-hydration. Falls back to "dark" when matchMedia is unavailable. */
export function defaultTheme(): UiSettings["theme"] {
  try {
    return typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  } catch {
    return "dark";
  }
}

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

/** Array variant of readStored (the object merge above cannot hydrate lists). */
export function readStoredList<T>(key: string, fallback: T[]): T[] {
  try {
    const value = localStorage.getItem(key);
    if (!value) return fallback;
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
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
    (
      [
        "mint",
        "payment",
        "transfer",
        "tick",
        "deposit",
        "withdraw",
      ] as FlowKind[]
    ).map((kind) => [
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

export function createInitialConsoleState(
  settings = defaultSettings,
  session = defaultSession,
  operationState = defaultOperationState,
  transactions: Transaction[] = [],
): AppState {
  const safeOperationState = sanitizeOperationState(operationState);
  return {
    settings,
    session,
    transactions,
    storage: "ready",
    guideOpen: false,
    notice: null,
    ...safeOperationState,
  };
}

export function consoleReducer(
  state: AppState,
  action: ConsoleAction,
): AppState {
  if (action.type === "settings")
    return { ...state, settings: { ...state.settings, ...action.patch } };
  if (action.type === "session")
    return { ...state, session: { ...state.session, ...action.session } };
  if (action.type === "add-tx") {
    const flow = action.tx.route.slice(1) as FlowKind;
    // Boundary-1 approve receipts (opensReceipt === false) must not flip the
    // flow draft into its receipt phase — the sheet still has boundary 2.
    const advanceDraft =
      action.tx.opensReceipt !== false && flow in state.operationDrafts;
    return {
      ...state,
      transactions: [action.tx, ...state.transactions],
      operationDrafts: advanceDraft
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
      ...createInitialConsoleState(state.settings),
      notice: "Surface reset. Wallet access remains locked.",
    };
  return state;
}
