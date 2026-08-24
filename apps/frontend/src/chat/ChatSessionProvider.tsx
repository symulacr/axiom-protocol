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
  providerPref: ProviderPref | undefined;
  setProviderPref: (pref: ProviderPref | undefined) => void;
};

const ChatSessionContextReact = createContext<ChatSessionValue | null>(null);

// Backward compat: legacy `{ lastTokenId }` payloads fall back to the cache-friendly DEFAULT_PROVIDER_PREF.
function loadStoredSession(): StoredSession {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredSession;
    return {
      lastTokenId:
        typeof parsed.lastTokenId === "string" ? parsed.lastTokenId : undefined,
      providerPref: parsed.providerPref,
    };
  } catch {
    return {};
  }
}

function loadStoredPref(): ProviderPref | undefined {
  try {
    const raw = localStorage.getItem(PREF_STORAGE_KEY);
    if (!raw) return undefined;
    return JSON.parse(raw) as ProviderPref;
  } catch {
    return undefined;
  }
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
        addresses: {
          vault: getAxiomStrategyVaultAddress(chainId),
          agentNft: getAxiomAgentNftAddress(chainId),
          paymentProcessor: getAxiomPaymentProcessorAddress(chainId),
        },
      }),
    [address, chainId, lastTokenId],
  );

  const recordToolResult = useCallback(
    (name: string, content: string) => {
      const result: ToolResult = { ok: true, content };
      applyToolResult(session, name, result);
      if (session.lastTokenId && session.lastTokenId !== lastTokenId) {
        setLastTokenId(session.lastTokenId);
        persistSession({ lastTokenId: session.lastTokenId, providerPref });
      }
    },
    [session, lastTokenId, providerPref],
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
    () => ({ session, recordToolResult, providerPref, setProviderPref }),
    [session, recordToolResult, providerPref, setProviderPref],
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
