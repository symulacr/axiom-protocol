// Axiom Protocol — `<ExecutePanel />` component.
//
// Renders the strategy-execution surface for a single AxiomAgentNFT token.
// The panel multicalls the AxiomStrategyVault read getters (`vaults`,
// `getStrategy`, `totalDeposits`) to show the live vault state, then exposes
// an "Execute Tick" button that fires `useOrchestratorTick` — POSTing to the
// backend `/v1/orchestrator/tick` route, which runs one 0G Compute inference
// cycle and (for buy/sell) settles on-chain via `vault.execute()`.
//
// The agent (tokenId) can be supplied as a prop (the
// `/agents/:tokenId/execute` page does this) or picked from a dropdown of the
// connected wallet's owned agents (the standalone usage). When `tokenId` is
// provided the dropdown is hidden.
//
// Data sources:
//   - wagmi v2 `useReadContracts` (batched multicall, allowFailure, isLoading):
//     https://wagmi.sh/react/hooks/useReadContracts
//   - `useOrchestratorTick` hook (apps/frontend/src/hooks/useOrchestratorTick.ts):
//     native fetch wrapper around POST /v1/orchestrator/tick.
//   - `useAgents` hook (owned-agent enumeration via balanceOf /
//     tokenOfOwnerByIndex / tokenURI).
//
// Response shape (TickResult) — the backend serializes `bigint` as decimal
// strings via `bigintReplacer`, so `vaultBalance` / `gasUsed` arrive as
// strings on the wire. Source: apps/backend/src/json/bigint.ts.

import { useMemo, useState, type ReactElement } from 'react';
import { useAccount, useReadContracts } from 'wagmi';
import { formatEther } from 'viem';
import {
  AXIOM_AGENT_NFT_ADDRESS,
  AXIOM_STRATEGY_VAULT_ADDRESS,
} from '../abi/addresses.js';
import { axiomStrategyVaultAbi } from '../abi/axiomStrategyVault.js';
import { useAgents } from '../hooks/useAgents.js';
import {
  useOrchestratorTick,
  type TickResult,
} from '../hooks/useOrchestratorTick.js';

/** Display the em-dash for an absent value. */
const PLACEHOLDER = '\u2014';

const panelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  padding: 16,
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  background: '#ffffff',
};

const buttonStyle: React.CSSProperties = {
  padding: '8px 16px',
  border: '1px solid #1f2937',
  background: '#1f2937',
  color: '#f9fafb',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 14,
};

const actionColor: Record<string, string> = {
  buy: '#16a34a',
  sell: '#dc2626',
  hold: '#6b7280',
};

export type ExecutePanelProps = {
  /** Token id from the route. When provided the agent dropdown is hidden. */
  tokenId?: bigint;
};

export function ExecutePanel({ tokenId: tokenIdProp }: ExecutePanelProps): ReactElement {
  const { isConnected } = useAccount();
  const { agents } = useAgents();
  const { tick, isLoading, error } = useOrchestratorTick();
  const [selectedId, setSelectedId] = useState<string>(tokenIdProp?.toString() ?? '');
  const [result, setResult] = useState<TickResult | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  // When tokenIdProp is given, the panel is locked to that agent.
  const locked = tokenIdProp !== undefined;
  const activeId = locked ? tokenIdProp.toString() : selectedId;
  const activeBigint = useMemo(() => {
    try {
      return activeId ? BigInt(activeId) : 0n;
    } catch {
      return 0n;
    }
  }, [activeId]);

  // Read vault state for the active agent token. Mirrors the multicall
  // pattern in VaultDashboard.tsx: `vaults(tokenId)`, `totalDeposits()`,
  // and `getStrategy(tokenId)` in one batched request.
  // Ref: https://wagmi.sh/react/hooks/useReadContracts
  const vaultQuery = useReadContracts({
    allowFailure: true,
    contracts: [
      {
        address: AXIOM_STRATEGY_VAULT_ADDRESS,
        abi: axiomStrategyVaultAbi,
        functionName: 'vaults',
        args: [activeBigint],
      },
      {
        address: AXIOM_STRATEGY_VAULT_ADDRESS,
        abi: axiomStrategyVaultAbi,
        functionName: 'totalDeposits',
      },
      {
        address: AXIOM_STRATEGY_VAULT_ADDRESS,
        abi: axiomStrategyVaultAbi,
        functionName: 'getStrategy',
        args: [activeBigint],
      },
    ],
    query: { enabled: activeId !== '' },
  });

  const vaultsResult = vaultQuery.data?.[0]?.result as
    | readonly [string, bigint, `0x${string}`, bigint]
    | undefined;
  const totalDepositsResult = vaultQuery.data?.[1]?.result as
    | bigint
    | undefined;
  const getStrategyResult = vaultQuery.data?.[2]?.result as
    | readonly [`0x${string}`, bigint, bigint]
    | undefined;

  const depositsWei = vaultsResult?.[1] ?? totalDepositsResult;
  const strategyRoot = vaultsResult?.[2] ?? getStrategyResult?.[0];
  const dailyLimitWei = vaultsResult?.[3] ?? getStrategyResult?.[1];

  if (!isConnected) {
    return (
      <section style={panelStyle}>
        <p>Connect wallet to execute a strategy tick.</p>
      </section>
    );
  }

  async function onExecute(): Promise<void> {
    if (!activeId) return;
    setResult(null);
    setShowRaw(false);
    try {
      const res = await tick({
        vault: AXIOM_STRATEGY_VAULT_ADDRESS,
        agentNft: AXIOM_AGENT_NFT_ADDRESS,
        agentTokenId: activeId,
      });
      setResult(res);
    } catch {
      // error state surfaced via `error` from the hook.
    }
  }

  return (
    <section style={panelStyle} aria-label="Execute strategy tick">
      {!locked && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Agent</span>
          <select
            value={selectedId}
            onChange={(e): void => setSelectedId(e.target.value)}
            style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid #d1d5db' }}
          >
            <option value="">Select an owned agent\u2026</option>
            {agents.map((a) => (
              <option key={a.tokenId.toString()} value={a.tokenId.toString()}>
                Agent #{a.tokenId.toString()}
              </option>
            ))}
          </select>
        </label>
      )}

      <div>
        <h3 style={{ margin: '0 0 8px' }}>Vault State</h3>
        <dl style={{ margin: 0, fontSize: 13 }}>
          <dt>Balance</dt>
          <dd>
            {depositsWei === undefined
              ? PLACEHOLDER
              : `${formatEther(depositsWei)} OG`}
          </dd>
          <dt>Strategy Root</dt>
          <dd>
            <code>
              {strategyRoot === undefined ? PLACEHOLDER : `${strategyRoot.slice(0, 10)}\u2026`}
            </code>
          </dd>
          <dt>Daily Limit</dt>
          <dd>
            {dailyLimitWei === undefined
              ? PLACEHOLDER
              : `${formatEther(dailyLimitWei)} OG`}
          </dd>
        </dl>
      </div>

      <div>
        <button
          type="button"
          style={buttonStyle}
          disabled={isLoading || activeId === ''}
          onClick={onExecute}
        >
          {isLoading ? 'Running tick\u2026' : 'Execute Tick'}
        </button>
      </div>

      {error !== null && (
        <p role="alert" style={{ color: '#dc2626', fontSize: 13 }}>
          {error.message}
        </p>
      )}

      {result !== null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <h3 style={{ margin: '0 0 4px' }}>Recommendation</h3>
            <p style={{ margin: 0, fontSize: 14 }}>
              <strong
                style={{
                  color: actionColor[result.recommendation.action] ?? '#374151',
                }}
              >
                {result.recommendation.action.toUpperCase()}
              </strong>
              {result.recommendation.amount !== undefined && (
                <> \u00b7 amount: {result.recommendation.amount}</>
              )}
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#374151' }}>
              {result.recommendation.reason}
            </p>
          </div>

          <div>
            <button
              type="button"
              onClick={(): void => setShowRaw((v) => !v)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 12,
                color: '#2563eb',
                padding: 0,
              }}
            >
              {showRaw ? '\u25bc Hide' : '\u25b6 Show'} raw model output
            </button>
            {showRaw && (
              <pre
                style={{
                  marginTop: 4,
                  padding: 8,
                  background: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: 4,
                  fontSize: 11,
                  overflowX: 'auto',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {result.rawModelOutput}
              </pre>
            )}
          </div>

          {result.execution !== undefined && (
            <div>
              <h3 style={{ margin: '0 0 4px' }}>On-chain Execution</h3>
              <dl style={{ margin: 0, fontSize: 13 }}>
                <dt>Success</dt>
                <dd>
                  {result.execution.success ? (
                    <span style={{ color: '#16a34a' }}>yes</span>
                  ) : (
                    <span style={{ color: '#dc2626' }}>no</span>
                  )}
                </dd>
                <dt>Action</dt>
                <dd>{result.execution.action}</dd>
                <dt>Target</dt>
                <dd>
                  <code>{result.execution.target}</code>
                </dd>
                <dt>Tx Hash</dt>
                <dd>
                  <code>{result.execution.txHash}</code>
                </dd>
                {result.execution.gasUsed !== undefined && (
                  <>
                    <dt>Gas Used</dt>
                    <dd>{result.execution.gasUsed}</dd>
                  </>
                )}
              </dl>
            </div>
          )}

          <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
            Completed in {result.durationMs} ms
          </p>
        </div>
      )}
    </section>
  );
}

export default ExecutePanel;
