import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { useAccount, useChainId } from "wagmi";
import {
  applyToolResult,
  createSession,
  type ChatSessionContext,
  type ToolResult,
} from "@axiom/chat-runtime";
import {
  getAxiomAgentNftAddress,
  getAxiomPaymentProcessorAddress,
  getAxiomStrategyVaultAddress,
} from "../abi/addresses.js";

const STORAGE_KEY = "axiom:chat-session";
/** 03: the routing preference is a user-level operational
 * preference — it persists in localStorage (survives new tabs/devices on
 * this machine), while lastTokenId stays session-scoped per tab. */
const PREF_STORAGE_KEY = "axiom:chat-provider-pref";

/** Router routing preference, persisted per chat session and sent as the
 * `provider` request field (backend maps it to X-0G-Provider-* headers). */
export type ProviderPref = {
  sort?: "latency" | "price";
  address?: string;
  allowFallbacks?: boolean;
  trustMode?: "standard" | "verified" | "private";
};

type StoredSession = { lastTokenId?: string; providerPref?: ProviderPref };

/** Cache-friendly default routing. Latency-sort makes the 0G router stick to
 * a single provider (measured in the cache deep-dive), so the prompt-cache
 * prefix stays on the same provider by default. `allowFallbacks: true` only
 * kicks in when that provider is unavailable. No provider address is
 * hardcoded — the catalog changes; sort:latency follows it. */
export const DEFAULT_PROVIDER_PREF: ProviderPref = {
  sort: "latency",
  allowFallbacks: true,
};

type ChatSessionValue = {
  session: ChatSessionContext;
  recordToolResult: (name: string, content: string) => void;
  /** Register the active numbered plan (matched tool names), or [] to clear.
   *  Drives the hidden REMAINING PLAN block; in-memory only, thread-scoped by
   *  the page (cleared on new/open thread). */
  recordPlan: (steps: string[]) => void;
  providerPref: ProviderPref | undefined;
  setProviderPref: (pref: ProviderPref | undefined) => void;
};

const ChatSessionContextReact = createContext<ChatSessionValue | null>(null);

/** Best-effort JSON read from web storage (undefined on miss/corruption). */
function readJson(storage: Storage, key: string): unknown {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : undefined;
  } catch {
    return undefined;
  }
}

function loadStoredSession(): StoredSession {
  const parsed = readJson(sessionStorage, STORAGE_KEY) as
    StoredSession | undefined;
  return {
    lastTokenId:
      typeof parsed?.lastTokenId === "string" ? parsed.lastTokenId : undefined,
    providerPref: parsed?.providerPref,
  };
}

function loadStoredPref(): ProviderPref | undefined {
  return readJson(localStorage, PREF_STORAGE_KEY) as ProviderPref | undefined;
}

function persistPref(pref: ProviderPref | undefined): void {
  try {
    if (pref) localStorage.setItem(PREF_STORAGE_KEY, JSON.stringify(pref));
    else localStorage.removeItem(PREF_STORAGE_KEY);
  } catch {
    void 0;
  }
}

function persistSession(payload: StoredSession): void {
  try {
    if (payload.lastTokenId || payload.providerPref) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    void 0;
  }
}

export function ChatSessionProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const { address } = useAccount();
  const chainId = useChainId();
  const [stored] = useState(loadStoredSession);
  const [lastTokenId, setLastTokenId] = useState<string | undefined>(
    stored.lastTokenId,
  );
  const [lastPlan, setLastPlan] = useState<string[]>([]);
  // Backward compat: legacy `{ lastTokenId }` payloads fall back to the cache-friendly DEFAULT_PROVIDER_PREF.
  // Durable pref wins over tab-scoped copy (legacy sessionStorage) and default; changes write localStorage.
  const [providerPref, setProviderPrefState] = useState<
    ProviderPref | undefined
  >(loadStoredPref() ?? stored.providerPref ?? DEFAULT_PROVIDER_PREF);

  const session = useMemo(
    () =>
      createSession({
        chainId,
        walletAddress: address?.toLowerCase() as `0x${string}` | undefined,
        lastTokenId,
        // Copy: applyToolResult shifts this array in place, and it must never
        // alias the React state it syncs back into.
        lastPlan: lastPlan.length ? [...lastPlan] : undefined,
        addresses: {
          vault: getAxiomStrategyVaultAddress(chainId),
          agentNft: getAxiomAgentNftAddress(chainId),
          paymentProcessor: getAxiomPaymentProcessorAddress(chainId),
        },
      }),
    [address, chainId, lastTokenId, lastPlan],
  );

  const recordToolResult = useCallback(
    (name: string, content: string) => {
      const result: ToolResult = { ok: true, content };
      applyToolResult(session, name, result);
      // Sync plan consumption (head shift / stale-plan clear) back to state.
      setLastPlan(session.lastPlan ? [...session.lastPlan] : []);
      if (session.lastTokenId && session.lastTokenId !== lastTokenId) {
        setLastTokenId(session.lastTokenId);
        persistSession({ lastTokenId: session.lastTokenId, providerPref });
      }
    },
    [session, lastTokenId, providerPref],
  );

  const recordPlan = useCallback(
    (steps: string[]) => {
      session.lastPlan = steps.length ? [...steps] : undefined;
      setLastPlan(steps);
    },
    [session],
  );

  const setProviderPref = useCallback(
    (pref: ProviderPref | undefined) => {
      setProviderPrefState(pref);
      persistPref(pref);
      persistSession({ lastTokenId, providerPref: pref });
    },
    [lastTokenId],
  );

  const value = useMemo(
    () => ({
      session,
      recordToolResult,
      recordPlan,
      providerPref,
      setProviderPref,
    }),
    [session, recordToolResult, recordPlan, providerPref, setProviderPref],
  );

  return (
    <ChatSessionContextReact.Provider value={value}>
      {children}
    </ChatSessionContextReact.Provider>
  );
}

export function useChatSession(): ChatSessionValue {
  const ctx = useContext(ChatSessionContextReact);
  if (!ctx) {
    throw new Error("useChatSession must be used within ChatSessionProvider");
  }
  return ctx;
}
