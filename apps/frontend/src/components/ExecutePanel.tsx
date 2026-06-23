// Axiom Protocol — `<ExecutePanel />` component.
//
// Renders the strategy-execution surface for an AxiomAgentNFT token.
// Multicalls vault read getters, then exposes an "Execute Tick" button
// that fires `useOrchestratorTick` (POST /v1/orchestrator/tick).

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
import { COLORS, Button, Card, SectionTitle, MonoLabel, Alert, Skeleton } from './ui.js';
import { PLACEHOLDER } from '../utils/format.js';

const panelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  padding: 24,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 10,
  background: COLORS.surface,
};

const actionColor: Record<string, string> = {
  buy: COLORS.success,
  sell: COLORS.danger,
  hold: COLORS.textMuted,
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
    } catch (err) {
      console.error("ExecutePanel: orchestrator tick failed", err);
    }
  }

  return (
    <section style={panelStyle} aria-label="Execute strategy tick">
      {!locked && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary }}>Agent</span>
          <select
            value={selectedId}
            onChange={(e): void => setSelectedId(e.target.value)}
            style={{
              padding: '10px 14px',
              borderRadius: 6,
              border: `1px solid ${COLORS.borderStrong}`,
              background: COLORS.bg,
              color: COLORS.text,
              fontSize: 14,
              fontFamily: 'inherit',
              outline: 'none',
            }}
          >
            <option value="">Select an owned agent…</option>
            {agents.map((a) => (
              <option key={a.tokenId.toString()} value={a.tokenId.toString()}>
                Agent #{a.tokenId.toString()}
              </option>
            ))}
          </select>
        </label>
      )}

      <div>
        <SectionTitle>Vault State</SectionTitle>
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 16px', fontSize: 14 }}>
          <dt style={{ color: COLORS.textDim, fontWeight: 500 }}>Balance</dt>
          <dd style={{ margin: 0, color: COLORS.bronzeLight, fontWeight: 600 }}>
            {depositsWei === undefined ? PLACEHOLDER : `${formatEther(depositsWei)} OG`}
          </dd>
          <dt style={{ color: COLORS.textDim, fontWeight: 500 }}>Strategy Root</dt>
          <dd style={{ margin: 0 }}>
            {strategyRoot !== undefined ? (
              <MonoLabel style={{ fontSize: 12 }}>{`${strategyRoot.slice(0, 10)}\u2026`}</MonoLabel>
            ) : <span style={{ color: COLORS.textDim }}>{PLACEHOLDER}</span>}
          </dd>
          <dt style={{ color: COLORS.textDim, fontWeight: 500 }}>Daily Limit</dt>
          <dd style={{ margin: 0, color: COLORS.text }}>
            {dailyLimitWei === undefined ? PLACEHOLDER : `${formatEther(dailyLimitWei)} OG`}
          </dd>
        </dl>
      </div>

      <div>
        <Button variant="primary" disabled={isLoading || activeId === ''} onClick={onExecute}>
          {isLoading ? 'Running tick…' : 'Execute Tick'}
        </Button>
      </div>

      {error !== null && (
        <Alert variant="error">{error.message}</Alert>
      )}

      {result !== null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <SectionTitle>Recommendation</SectionTitle>
            <p style={{ margin: 0, fontSize: 15 }}>
              <strong
                style={{
                  color: actionColor[result.recommendation.action] ?? COLORS.text,
                  fontSize: 16,
                  letterSpacing: '0.02em',
                }}
              >
                {result.recommendation.action.toUpperCase()}
              </strong>
              {result.recommendation.amount !== undefined && (
                <span style={{ color: COLORS.textMuted }}> · amount: {result.recommendation.amount}</span>
              )}
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: COLORS.textMuted, fontWeight: 300, lineHeight: 1.6 }}>
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
                color: COLORS.bronzeLight,
                padding: 0,
                fontFamily: 'inherit',
              }}
            >
              {showRaw ? '▼ Hide' : '▶ Show'} raw model output
            </button>
            {showRaw && (
              <pre
                style={{
                  marginTop: 8,
                  padding: 12,
                  background: COLORS.bg,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 8,
                  fontSize: 11,
                  overflowX: 'auto',
                  whiteSpace: 'pre-wrap',
                  color: COLORS.textMuted,
                }}
              >
                {result.rawModelOutput}
              </pre>
            )}
          </div>

          {result.execution !== undefined && (
            <div>
              <SectionTitle>On-chain Execution</SectionTitle>
              <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '100px 1fr', gap: '8px 16px', fontSize: 13 }}>
                <dt style={{ color: COLORS.textDim, fontWeight: 500 }}>Success</dt>
                <dd style={{ margin: 0 }}>
                  {result.execution.success ? (
                    <span style={{ color: COLORS.success, fontWeight: 600 }}>yes</span>
                  ) : (
                    <span style={{ color: COLORS.danger, fontWeight: 600 }}>no</span>
                  )}
                </dd>
                <dt style={{ color: COLORS.textDim, fontWeight: 500 }}>Action</dt>
                <dd style={{ margin: 0, color: COLORS.text }}>{result.execution.action}</dd>
                <dt style={{ color: COLORS.textDim, fontWeight: 500 }}>Target</dt>
                <dd style={{ margin: 0 }}><MonoLabel style={{ fontSize: 12 }}>{result.execution.target}</MonoLabel></dd>
                <dt style={{ color: COLORS.textDim, fontWeight: 500 }}>Tx Hash</dt>
                <dd style={{ margin: 0 }}><MonoLabel style={{ fontSize: 12 }}>{result.execution.txHash}</MonoLabel></dd>
                {result.execution.gasUsed !== undefined && (
                  <>
                    <dt style={{ color: COLORS.textDim, fontWeight: 500 }}>Gas Used</dt>
                    <dd style={{ margin: 0, color: COLORS.text }}>{result.execution.gasUsed}</dd>
                  </>
                )}
              </dl>
            </div>
          )}

          <p style={{ fontSize: 12, color: COLORS.textDim, margin: 0 }}>
            Completed in {result.durationMs} ms
          </p>
        </div>
      )}
    </section>
  );
}

export default ExecutePanel;
