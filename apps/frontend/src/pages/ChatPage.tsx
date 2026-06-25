import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import { parseEther } from 'viem';
import { toast } from 'sonner';
import { apiFetch } from '../utils/apiFetch.js';
import { BACKEND_URL } from '../config/env.js';
import { getAxiomAgentNftAddress, getAxiomStrategyVaultAddress } from '../abi/addresses.js';
import { axiomAgentNftAbi } from '../abi/axiomAgentNft.js';
import { axiomStrategyVaultAbi } from '../abi/axiomStrategyVault.js';
import {
  COLORS,
  Card,
  Button,
  SectionTitle,
  PageHeader,
  ConnectedGuard,
  Skeleton,
  Alert,
} from '../components/ui.js';

// ── Types ──
type Message = {
  role: 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
};

type ToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

type ToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

type SSEChunk = {
  choices?: Array<{
    delta: {
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: 'function';
        function?: { name?: string; arguments?: string };
      }>;
      role?: string;
    };
    finish_reason?: string | null;
  }>;
};

type ToolHandler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>;

type ToolContext = {
  address: string | undefined;
  writeContractAsync: (args: {
    address: `0x${string}`;
    abi: readonly unknown[];
    functionName: string;
    args: unknown[];
    value?: bigint;
  }) => Promise<`0x${string}`>;
  publicClient: ReturnType<typeof usePublicClient>;
};

// ── Tool Definitions ──
const TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'list_my_agents',
      description: 'List all agent NFTs owned by the connected wallet address',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'vault_balance',
      description: 'Get vault balance (in wei) for a given agent token ID',
      parameters: {
        type: 'object',
        properties: { tokenId: { type: 'string', description: 'Agent token ID (numeric)' } },
        required: ['tokenId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'agent_metadata',
      description: 'Get on-chain metadata for an agent (name, owner, data hash, description)',
      parameters: {
        type: 'object',
        properties: { tokenId: { type: 'string', description: 'Agent token ID (numeric)' } },
        required: ['tokenId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'event_history',
      description: 'Query recent on-chain events (Tick, Transfer, etc.)',
      parameters: {
        type: 'object',
        properties: {
          eventName: { type: 'string', description: 'Filter by event name (Tick, Transfer)' },
          limit: { type: 'number', description: 'Max events (default 20)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_tick',
      description: 'Execute a strategy tick for an agent (simulation via orchestrator)',
      parameters: {
        type: 'object',
        properties: { tokenId: { type: 'string', description: 'Agent token ID' } },
        required: ['tokenId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mint_agent',
      description: 'Mint a new agent NFT. Opens MetaMask for the transaction.',
      parameters: {
        type: 'object',
        properties: {
          dataDescription: { type: 'string', description: 'Human-readable agent name' },
          dataHash: { type: 'string', description: 'Hex hash of the agent data' },
        },
        required: ['dataDescription', 'dataHash'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'deposit',
      description: 'Deposit 0G into an agent vault. Opens MetaMask.',
      parameters: {
        type: 'object',
        properties: {
          tokenId: { type: 'string', description: 'Agent token ID' },
          amount: { type: 'string', description: 'Amount in 0G (e.g. 1.5)' },
        },
        required: ['tokenId', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'withdraw',
      description: 'Withdraw 0G from an agent vault. Opens MetaMask.',
      parameters: {
        type: 'object',
        properties: {
          tokenId: { type: 'string', description: 'Agent token ID' },
          amount: { type: 'string', description: 'Amount in wei' },
        },
        required: ['tokenId', 'amount'],
      },
    },
  },
];

// ── Tool Handlers ──
function useToolHandlers(ctx: ToolContext): Record<string, ToolHandler> {
  return useMemo(() => ({
    list_my_agents: async (_args, c) => {
      if (!c.address) return JSON.stringify({ error: 'Wallet not connected' });
      const data = await apiFetch<{ agents: unknown[] }>(`/v1/agents?owner=${c.address}`, { timeout: 10_000 });
      return JSON.stringify({ agents: data.agents ?? [] });
    },
    vault_balance: async (args, c) => {
      const { tokenId } = args;
      if (!c.publicClient) return JSON.stringify({ error: 'No chain connection' });
      const balance = await c.publicClient.readContract({
        address: getAxiomStrategyVaultAddress(),
        abi: axiomStrategyVaultAbi,
        functionName: 'balanceOf',
        args: [BigInt(String(tokenId))],
      }) as bigint;
      return JSON.stringify({ tokenId, balance: balance.toString() });
    },
    agent_metadata: async (args, c) => {
      const { tokenId } = args;
      if (!c.publicClient) return JSON.stringify({ error: 'No chain connection' });
      const nftAddr = getAxiomAgentNftAddress();
      const [nameRes, symbolRes, ownerRes, datasRes, uriRes] = await c.publicClient.multicall({
        contracts: [
          { address: nftAddr, abi: axiomAgentNftAbi, functionName: 'name' },
          { address: nftAddr, abi: axiomAgentNftAbi, functionName: 'symbol' },
          { address: nftAddr, abi: axiomAgentNftAbi, functionName: 'ownerOf', args: [BigInt(String(tokenId))] },
          { address: nftAddr, abi: axiomAgentNftAbi, functionName: 'intelligentDatasOf', args: [BigInt(String(tokenId))] },
          { address: nftAddr, abi: axiomAgentNftAbi, functionName: 'tokenURI', args: [BigInt(String(tokenId))] },
        ],
      }) as Array<{ result: unknown; error?: Error }>;
      return JSON.stringify({
        tokenId,
        name: String(nameRes?.result ?? ''),
        symbol: String(symbolRes?.result ?? ''),
        owner: String(ownerRes?.result ?? ''),
        dataDescription: ((datasRes?.result ?? []) as Array<{ dataDescription: string }>)?.[0]?.dataDescription ?? '',
        dataHash: ((datasRes?.result ?? []) as Array<{ dataHash: string }>)?.[0]?.dataHash ?? '',
        tokenUri: String(uriRes?.result ?? ''),
      });
    },
    event_history: async (args) => {
      const { eventName, limit } = args;
      let path = `/v1/events?limit=${limit ?? 20}`;
      if (eventName) path += `&eventName=${encodeURIComponent(String(eventName))}`;
      const data = await apiFetch<{ events: unknown[] }>(path, { timeout: 10_000 });
      return JSON.stringify({ events: data.events ?? [] });
    },
    execute_tick: async (args) => {
      const tokenId = String(args.tokenId ?? '');
      if (!tokenId) return JSON.stringify({ error: 'tokenId required' });
      const data = await apiFetch<Record<string, unknown>>('/v1/orchestrator/tick', {
        method: 'POST',
        body: JSON.stringify({
          vault: getAxiomStrategyVaultAddress(),
          agentNft: getAxiomAgentNftAddress(),
          agentTokenId: tokenId,
        }),
        timeout: 30_000,
      });
      return JSON.stringify(data);
    },
    mint_agent: async (args, c) => {
      if (!c.address) return JSON.stringify({ error: 'Wallet not connected' });
      if (!c.writeContractAsync) return JSON.stringify({ error: 'Wallet not available' });
      try {
        const txHash = await c.writeContractAsync({
          address: getAxiomAgentNftAddress(),
          abi: axiomAgentNftAbi,
          functionName: 'mint',
          args: [[{ dataDescription: String(args.dataDescription ?? ''), dataHash: String(args.dataHash ?? '0x') }], c.address],
        });
        return JSON.stringify({ ok: true, txHash });
      } catch (err: unknown) {
        return JSON.stringify({ error: err instanceof Error ? err.message : 'Transaction failed' });
      }
    },
    deposit: async (args, c) => {
      if (!c.address) return JSON.stringify({ error: 'Wallet not connected' });
      if (!c.writeContractAsync) return JSON.stringify({ error: 'Wallet not available' });
      try {
        const txHash = await c.writeContractAsync({
          address: getAxiomStrategyVaultAddress(),
          abi: axiomStrategyVaultAbi,
          functionName: 'deposit',
          args: [BigInt(String(args.tokenId ?? '0'))],
          value: parseEther(String(args.amount ?? '0')),
        });
        return JSON.stringify({ ok: true, txHash });
      } catch (err: unknown) {
        return JSON.stringify({ error: err instanceof Error ? err.message : 'Transaction failed' });
      }
    },
    withdraw: async (args, c) => {
      if (!c.address) return JSON.stringify({ error: 'Wallet not connected' });
      if (!c.writeContractAsync) return JSON.stringify({ error: 'Wallet not available' });
      try {
        const txHash = await c.writeContractAsync({
          address: getAxiomStrategyVaultAddress(),
          abi: axiomStrategyVaultAbi,
          functionName: 'withdraw',
          args: [BigInt(String(args.tokenId ?? '0')), BigInt(String(args.amount ?? '0'))],
        });
        return JSON.stringify({ ok: true, txHash });
      } catch (err: unknown) {
        return JSON.stringify({ error: err instanceof Error ? err.message : 'Transaction failed' });
      }
    },
  }), [ctx.address, ctx.writeContractAsync, ctx.publicClient]);
}

// ── SSE Parser ──
function parseSSEChunks(raw: string): SSEChunk[] {
  const chunks: SSEChunk[] = [];
  for (const line of raw.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const payload = line.slice(6).trim();
    if (payload === '[DONE]') break;
    try {
      chunks.push(JSON.parse(payload) as SSEChunk);
    } catch {
      // skip malformed lines
    }
  }
  return chunks;
}

// ── ChatPage Component ──
export function ChatPage(): ReactElement {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const toolCtx: ToolContext = useMemo(
    () => ({
      address,
      writeContractAsync: (writeContractAsync ?? (async () => { throw new Error('Wallet not connected'); })) as ToolContext['writeContractAsync'],
      publicClient,
    }),
    [address, writeContractAsync, publicClient],
  );
  const handlers = useToolHandlers(toolCtx);

  // Auto-scroll to bottom
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, streamText]);

  const sendMessage = useCallback(async (userText: string) => {
    if (!userText.trim() || isStreaming) return;
    setInput('');

    const userMsg: Message = { role: 'user', content: userText };
    let currentMessages = [...messages, userMsg];
    setMessages(currentMessages);
    setIsStreaming(true);
    setStreamText('');

    const controller = new AbortController();
    abortRef.current = controller;

    // Multi-turn tool loop
    let loopCount = 0;
    const MAX_TOOL_LOOPS = 5;

    try {
      while (loopCount < MAX_TOOL_LOOPS) {
        loopCount++;

        // Call backend proxy
        const response = await fetch(`${BACKEND_URL}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'qwen/qwen2.5-omni-7b',
            messages: currentMessages,
            tools: TOOLS,
            stream: true,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Chat service error (${response.status}): ${errText}`);
        }

        // Read SSE stream
        const body = response.body;
        if (!body) throw new Error('No response body from chat service');
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let assistantContent = '';
        const pendingToolCalls: ToolCall[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = parseSSEChunks(buffer);

          for (const chunk of chunks) {
            const delta = chunk.choices?.[0]?.delta;
            if (!delta) continue;

            if (delta.content) {
              assistantContent += delta.content;
              setStreamText(assistantContent);
            }

            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const existing = pendingToolCalls[tc.index];
                if (!existing) {
                  pendingToolCalls[tc.index] = {
                    id: tc.id ?? '',
                    type: 'function',
                    function: { name: '', arguments: '' },
                  };
                }
                const entry = pendingToolCalls[tc.index];
                if (entry) {
                  if (tc.id) entry.id = tc.id;
                  if (tc.function?.name) entry.function.name += tc.function.name;
                  if (tc.function?.arguments) entry.function.arguments += tc.function.arguments;
                }
              }
            }
          }
        }

        const toolCallList = pendingToolCalls.filter(tc => tc.function.name);

        if (toolCallList.length === 0) {
          // No tool calls — assistant response is final
          const assistantMsg: Message = { role: 'assistant', content: assistantContent };
          currentMessages = [...currentMessages, assistantMsg];
          setMessages(currentMessages);
          setStreamText('');
          break;
        }

        // Add assistant message with tool calls
        const assistantMsg: Message = {
          role: 'assistant',
          content: assistantContent || null,
          tool_calls: toolCallList,
        };
        currentMessages = [...currentMessages, assistantMsg];
        setMessages(currentMessages);
        setStreamText('');

        // Execute each tool call
        for (const tc of toolCallList) {
          const handler = handlers[tc.function.name];
          let result: string;
          if (!handler) {
            result = JSON.stringify({ error: `Unknown tool: ${tc.function.name}` });
          } else {
            try {
              const args = JSON.parse(tc.function.arguments);
              result = await handler(args, toolCtx);
            } catch (err: unknown) {
              result = JSON.stringify({ error: err instanceof Error ? err.message : 'Tool execution failed' });
            }
          }
          const toolMsg: Message = {
            role: 'tool',
            tool_call_id: tc.id,
            name: tc.function.name,
            content: result,
          };
          currentMessages = [...currentMessages, toolMsg];
        }
        setMessages(currentMessages);
        // Loop continues to next LLM call with tool results appended
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User cancelled
      } else {
        toast.error(err instanceof Error ? err.message : 'Chat error');
        setMessages([...currentMessages, { role: 'assistant', content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` }]);
      }
    } finally {
      setIsStreaming(false);
      setStreamText('');
      abortRef.current = null;
    }
  }, [messages, isStreaming, handlers, toolCtx]);

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // ── Render ──
  return (
    <main>
      <ConnectedGuard>
        <PageHeader title="AI Chat" subtitle="Ask about your agents, vaults, or the protocol" />

        {/* Welcome / empty state */}
        {messages.length === 0 && !isStreaming && (
          <Card style={{ marginBottom: 'var(--space-lg)', padding: 'var(--space-2xl)', textAlign: 'center' }}>
            <p style={{ color: COLORS.textMuted, fontSize: 'var(--text-sm)', lineHeight: 'var(--lh-normal)', margin: '0 0 var(--space-md)' }}>
              Ask me anything about your agents, vaults, or the protocol.
            </p>
            <p style={{ color: COLORS.textDim, fontSize: 'var(--text-xs)', margin: 0 }}>
              Try: <em>"list my agents"</em>, <em>"what's the vault balance for agent 1?"</em>, or <em>"mint an agent named Test"</em>
            </p>
          </Card>
        )}

        {/* Message list */}
        <div
          ref={listRef}
          style={{
            maxHeight: 'calc(100vh - 22rem)',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-sm)',
            marginBottom: 'var(--space-md)',
            paddingRight: 'var(--space-sm)',
          }}
        >
          {messages.map((msg, i) => (
            <Card key={i} style={{ padding: 'var(--space-md) var(--space-lg)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-xs)' }}>
                <span style={{
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: msg.role === 'user' ? COLORS.bronzeLight : msg.role === 'tool' ? COLORS.textDim : COLORS.text,
                }} />
                <span style={{ fontWeight: 'var(--fw-semibold)', fontSize: 'var(--text-xs)', color: COLORS.textDim, textTransform: 'uppercase' }}>
                  {msg.role === 'user' ? 'You' : msg.role === 'tool' ? `Tool: ${msg.name ?? ''}` : 'Assistant'}
                </span>
              </div>
              {msg.role === 'tool' ? (
                <pre style={{ fontSize: 'var(--text-xs)', color: COLORS.textMuted, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {msg.content}
                </pre>
              ) : msg.tool_calls ? (
                <div style={{ fontSize: 'var(--text-sm)', color: COLORS.textMuted }}>
                  {msg.tool_calls.map(tc => (
                    <div key={tc.id}>
                      <strong style={{ color: COLORS.bronzeLight }}>🔧 {tc.function.name}</strong>
                      {' '}{tc.function.arguments.slice(0, 80)}...
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 'var(--text-sm)', color: COLORS.text, margin: 0, lineHeight: 'var(--lh-normal)', whiteSpace: 'pre-wrap' }}>
                  {msg.content}
                </p>
              )}
            </Card>
          ))}

          {/* Streaming in-progress indicator */}
          {isStreaming && (
            <Card style={{ padding: 'var(--space-md) var(--space-lg)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-xs)' }}>
                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: COLORS.text }} />
                <span style={{ fontWeight: 'var(--fw-semibold)', fontSize: 'var(--text-xs)', color: COLORS.textDim, textTransform: 'uppercase' }}>Assistant</span>
              </div>
              <p style={{ fontSize: 'var(--text-sm)', color: COLORS.text, margin: 0, lineHeight: 'var(--lh-normal)', whiteSpace: 'pre-wrap' }}>
                {streamText || (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{
                      display: 'inline-block', width: 14, height: 14, borderRadius: '50%',
                      border: '2px solid rgba(180,160,120,0.3)', borderTopColor: '#b4a078',
                      animation: 'axiom-spin 0.8s linear infinite',
                    }} />
                    Thinking...
                  </span>
                )}
              </p>
            </Card>
          )}
        </div>

        {/* Input bar */}
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
            placeholder={isStreaming ? 'Waiting for response...' : 'Ask something...'}
            disabled={isStreaming}
            style={{
              flex: 1,
              background: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 'var(--radius-lg)',
              padding: '0.625rem 1rem',
              fontSize: 'var(--text-sm)',
              color: COLORS.text,
              outline: 'none',
            }}
          />
          {isStreaming ? (
            <Button variant="secondary" onClick={cancelStream}>Stop</Button>
          ) : (
            <Button variant="primary" onClick={() => sendMessage(input)} disabled={!input.trim()}>
              Send
            </Button>
          )}
        </div>
      </ConnectedGuard>
    </main>
  );
}

export default ChatPage;
