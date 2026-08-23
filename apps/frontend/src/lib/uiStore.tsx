/*
  UI store bridge — the useReducer(consoleReducer) lifted into a
  React context so route-level screens can dispatch without prop drilling
  through react-router. Persistence keys are unchanged */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import {
  createInitialConsoleState,
  defaultOperationState,
  defaultSession,
  defaultSettings,
  defaultTheme,
  MAX_PERSISTED_TRANSACTIONS,
  persist,
  consoleReducer,
  readStored,
  readStoredList,
  sanitizeTransactions,
  type PersistedTransaction,
  type ConsoleAction,
} from "./consoleStore";
import { flowMeta } from "./consoleCatalog";
import type { AppState, FlowKind, Session, Transaction } from "./models";

type UiStoreValue = {
  state: AppState;
  dispatch: React.Dispatch<ConsoleAction>;
};

const UiStoreContext = createContext<UiStoreValue | null>(null);

/** Rehydrate persisted receipt stubs: the icon is derived (never stored) from
 * the same flowMeta source addReceipt uses at creation time. */
function hydrateTransactions(): Transaction[] {
  return sanitizeTransactions(
    readStoredList<PersistedTransaction>("axiom-transactions-v1", []),
  ).map((tx) => ({
    ...tx,
    icon: flowMeta[tx.route.slice(1) as FlowKind]?.icon ?? null,
  }));
}

export function UiStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(consoleReducer, undefined, () =>
    createInitialConsoleState(
      // Unset theme follows the OS (defaultTheme) so store and boot script
      // agree on first visit; a stored choice always wins.
      readStored("axiom-ui-settings", {
        ...defaultSettings,
        theme: defaultTheme(),
      }),
      readStored<Session>("axiom-session", defaultSession),
      readStored("axiom-operation-state-v1", defaultOperationState),
      hydrateTransactions(),
    ),
  );

  useEffect(
    () => persist("axiom-ui-settings", state.settings),
    [state.settings],
  );
  useEffect(() => persist("axiom-session", state.session), [state.session]);
  useEffect(
    () =>
      persist("axiom-operation-state-v1", {
        pendingIntent: state.pendingIntent,
        operationDrafts: state.operationDrafts,
      }),
    [state.pendingIntent, state.operationDrafts],
  );
  // Local receipts persist as icon-less stubs (newest-first, capped); the
  // reconciler (useReceiptReconcile, mounted in App) settles any row still
  // "confirming" at load against the chain with a confirmation timeout.
  useEffect(() => {
    const stubs: PersistedTransaction[] = state.transactions
      .slice(0, MAX_PERSISTED_TRANSACTIONS)
      .map(({ icon: _icon, ...stub }) => stub);
    persist("axiom-transactions-v1", stubs);
  }, [state.transactions]);
  useEffect(() => {
    document.documentElement.dataset.axiomReady = "true";
    return () => {
      delete document.documentElement.dataset.axiomReady;
    };
  }, []);

  const value = useMemo<UiStoreValue>(() => ({ state, dispatch }), [state]);

  return (
    <UiStoreContext.Provider value={value}>{children}</UiStoreContext.Provider>
  );
}

export function useUiStore(): UiStoreValue {
  const ctx = useContext(UiStoreContext);
  if (!ctx) throw new Error("useUiStore must be used within UiStoreProvider");
  return ctx;
}
