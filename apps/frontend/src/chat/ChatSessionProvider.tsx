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
  getAxiomStrategyVaultAddress,
} from "../abi/addresses.js";

const STORAGE_KEY = "axiom:chat-session";

type ChatSessionValue = {
  session: ChatSessionContext;
  recordToolResult: (name: string, content: string) => void;
};

const ChatSessionContextReact = createContext<ChatSessionValue | null>(null);

function loadStoredTokenId(): string | undefined {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { lastTokenId?: string };
    return parsed.lastTokenId;
  } catch {
    return undefined;
  }
}

function persistTokenId(lastTokenId: string | undefined): void {
  try {
    if (lastTokenId) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ lastTokenId }));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch { /* sessionStorage may be unavailable */ }
}

export function ChatSessionProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const { address } = useAccount();
  const chainId = useChainId();
  const [lastTokenId, setLastTokenId] = useState<string | undefined>(
    loadStoredTokenId,
  );

  const session = useMemo(
    () =>
      createSession({
        chainId,
        walletAddress: address?.toLowerCase() as `0x${string}` | undefined,
        lastTokenId,
        addresses: {
          vault: getAxiomStrategyVaultAddress(chainId),
          agentNft: getAxiomAgentNftAddress(chainId),
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
        persistTokenId(session.lastTokenId);
      }
    },
    [session, lastTokenId],
  );

  const value = useMemo(
    () => ({ session, recordToolResult }),
    [session, recordToolResult],
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