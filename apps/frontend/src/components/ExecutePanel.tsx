import { useMemo, useState, type ReactElement } from 'react';
import { useAccount } from 'wagmi';
import { formatEther } from 'viem';
import {
  getAxiomAgentNftAddress,
  getAxiomStrategyVaultAddress,
} from '../abi/addresses.js';
import { useVaultData } from '../hooks/useVaultData.js';
import { useAgents } from '../hooks/useAgents.js';
import {
  useOrchestratorTick,
  type TickResult,
} from '../hooks/useOrchestratorTick.js';
import { COLORS, Button, Card, SectionTitle, MonoLabel, Alert } from './ui.js';
import { PLACEHOLDER } from '../utils/format.js';

const actionColor: Record<string, string> = {
  buy: COLORS.success,
  sell: COLORS.danger,
  hold: COLORS.textMuted,
};

export type ExecutePanelProps = {
  /** Route token id; when provided the agent dropdown is hidden. */
  tokenId?: bigint;
};

export function ExecutePanel({ tokenId: tokenIdProp }: ExecutePanelProps): ReactElement {
  const { isConnected } = useAccount();
  const { agents, isLoading: agentsLoading } = useAgents();
  const { tick, tickStream, isLoading, isStreaming, streamedTokens, streamingError, error, resetStream } = useOrchestratorTick();
  const [selectedId, setSelectedId] = useState<string>(tokenIdProp?.toString() ?? '');
  const [result, setResult] = useState<TickResult | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [streamMode, setStreamMode] = useState(false);

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

  const vd = useVaultData(activeBigint);
  const isReady = !vd.isLoading && activeId !== '';
  const depositsWei = isReady ? vd.depositsWei : undefined;
  const strategyRoot = isReady ? vd.strategyRoot : undefined;
  const dailyLimitWei = isReady ? vd.dailyLimitWei : undefined;

  if (!isConnected) {
    return (
      <Card style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p>Connect wallet to execute a strategy tick.</p>
      </Card>
    );
  }

  async function onExecute(): Promise<void> {
    if (!activeId) return;
    setResult(null);
    setShowRaw(false);
    resetStream();
    try {
      if (streamMode) {
        // Strategy tick uses WSS streaming (via useOrchestratorTick's tickStream — SSE→WSS is transparent)
        const res = await tickStream(
          {
            vault: getAxiomStrategyVaultAddress(),
            agentNft: getAxiomAgentNftAddress(),
            agentTokenId: activeId,
          },
          {},
        );
        setResult(res);
      } else {
        const res = await tick({
          vault: getAxiomStrategyVaultAddress(),
          agentNft: getAxiomAgentNftAddress(),
          agentTokenId: activeId,
        });
        setResult(res);
      }
    } catch (err) {
      console.error("ExecutePanel: orchestrator tick failed", err);
    }
  }

  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 16 }} aria-label="Execute strategy tick">
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
          {!agentsLoading && agents.length === 0 && (
            <p style={{ margin: 0, fontSize: 13, color: COLORS.textDim }}>
              No agents found for the connected wallet.
            </p>
          )}
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

      <div style={{ display: 'flex', alignItems: 'flex-start', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button variant="primary" disabled={isLoading || activeId === ''} onClick={onExecute}>
            {isLoading ? (isStreaming ? 'Streaming…' : 'Running tick…') : 'Execute Tick'}
          </Button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: COLORS.textMuted, userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={streamMode}
              onChange={(e): void => setStreamMode(e.target.checked)}
              disabled={isLoading}
            />
            Stream
          </label>
        </div>
        {isStreaming && (
          <span style={{ fontSize: 12, color: COLORS.bronzeLight, fontStyle: 'italic' }}>
            Receiving live output...
          </span>
        )}
      </div>

      {error !== null && (
        <Alert variant="error">{error.message}</Alert>
      )}

      {streamingError !== null && (
        <Alert variant="error">{streamingError}</Alert>
      )}

      {streamedTokens !== '' && (
        <div>
          <SectionTitle>Live Stream Output</SectionTitle>
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
              maxHeight: 200,
              opacity: isStreaming ? 0.9 : 0.7,
            }}
          >
            {streamedTokens}
            {isStreaming && <span style={{ display: 'inline-block', marginLeft: 2, color: COLORS.bronzeLight }}>|</span>}
          </pre>
        </div>
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
            <Button variant="ghost" onClick={(): void => setShowRaw((v) => !v)} style={{ fontSize: 12, color: COLORS.bronzeLight, padding: 0 }}>
              {showRaw ? '▼ Hide' : '▶ Show'} raw model output
            </Button>
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
    </Card>
  );
}

export default ExecutePanel;
