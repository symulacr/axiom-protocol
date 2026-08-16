/*
  UI store bridge — the v2 mockup's useReducer(prototypeReducer) lifted into a
  React context so route-level screens can dispatch without prop drilling
  through react-router. Persistence keys are unchanged from the mockup
  (axiom-ui-settings / axiom-session / axiom-operation-state-v1).
*/
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import {
  createInitialPrototypeState,
  defaultOperationState,
  defaultSession,
  defaultSettings,
  persist,
  prototypeReducer,
  readStored,
  type PrototypeAction,
} from "./prototypeStore";
import type { AppState, Session } from "./models";

type UiStoreValue = {
  state: AppState;
  dispatch: React.Dispatch<PrototypeAction>;
};

const UiStoreContext = createContext<UiStoreValue | null>(null);

export function UiStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(prototypeReducer, undefined, () =>
    createInitialPrototypeState(
      readStored("axiom-ui-settings", defaultSettings),
      readStored<Session>("axiom-session", defaultSession),
      readStored("axiom-operation-state-v1", defaultOperationState),
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
