import type { ReactElement } from 'react';
import { useParams } from 'react-router-dom';
import { useAccount, useChainId } from 'wagmi';
import { formatEther } from 'viem';
import { getAxiomStrategyVaultAddress } from '../abi/addresses.js';
import { useVaultData } from '../hooks/useVaultData.js';
import { COLORS, Card, SectionTitle, MonoLabel, Alert, PageHeader, Skeleton } from '../components/ui.js';
import { PLACEHOLDER } from '../utils/format.js';

export function VaultDashboard(): ReactElement {
  const { vaultId } = useParams<{ vaultId: string }>();
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const tokenId = BigInt(vaultId ?? '0');

  const vd = useVaultData(tokenId);
  const depositsWei = vd.isLoading ? undefined : vd.depositsWei;
  const root = vd.isLoading ? undefined : (vd.strategyRoot || undefined);
  const dailyLimitWei = vd.isLoading ? undefined : vd.dailyLimitWei;
  const isLoading = vd.isLoading;
  const error = vd.error;

  return (
    <main>
      <PageHeader
        title="Vault Dashboard"
        subtitle="Live on-chain state of every AxiomStrategyVault"
      />

      <Card style={{ marginBottom: 'var(--space-xl)' }}>
        <SectionTitle>Connection</SectionTitle>
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '7.5rem 1fr', gap: 'var(--space-sm) var(--space-lg)', fontSize: 'var(--text-sm)' }}>
          <dt style={{ color: COLORS.textDim, fontWeight: 'var(--fw-medium)' }}>Status</dt>
          <dd style={{ margin: 0, color: isConnected ? COLORS.success : COLORS.textMuted }}>
            {isConnected ? 'Connected' : 'Not connected'}
          </dd>
          <dt style={{ color: COLORS.textDim, fontWeight: 'var(--fw-medium)' }}>Address</dt>
          <dd style={{ margin: 0 }}>
            {address !== undefined ? <MonoLabel>{address}</MonoLabel> : <span style={{ color: COLORS.textDim }}>{PLACEHOLDER}</span>}
          </dd>
          <dt style={{ color: COLORS.textDim, fontWeight: 'var(--fw-medium)' }}>Chain ID</dt>
          <dd style={{ margin: 0, color: COLORS.text }}>{chainId}</dd>
        </dl>
      </Card>

      <SectionTitle>Vaults</SectionTitle>
      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
          <Skeleton height={56} />
          <Skeleton height={56} />
        </div>
      )}
      {error !== null && (
        <Alert variant="error">
          Couldn't read vault data from the chain. Check your connection and try again.
        </Alert>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
        <Card key={getAxiomStrategyVaultAddress()}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '2rem',
                height: '2rem',
                borderRadius: 'var(--radius-lg)',
                background: COLORS.bronzeBg,
                border: `1px solid ${COLORS.bronzeBorder}`,
                color: COLORS.bronzeLight,
                fontSize: 'var(--text-sm)',
                fontWeight: 'var(--fw-bold)',
              }}
            >
              0
            </span>
            <MonoLabel style={{ fontSize: 'var(--text-xs)' }}>{getAxiomStrategyVaultAddress()}</MonoLabel>
          </div>
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))', gap: 'var(--space-lg)' }}>
            <div>
              <dt style={{ fontSize: 'var(--text-xs)', color: COLORS.textDim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem', fontWeight: 'var(--fw-semibold)' }}>
                Total Deposits
              </dt>
              <dd style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 'var(--fw-semibold)', color: COLORS.bronzeLight }}>
                {depositsWei === undefined ? PLACEHOLDER : `${formatEther(depositsWei)} OG`}
              </dd>
            </div>
            <div>
              <dt style={{ fontSize: 'var(--text-xs)', color: COLORS.textDim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem', fontWeight: 'var(--fw-semibold)' }}>
                Strategy Root
              </dt>
              <dd style={{ margin: 0 }}>
                {root !== undefined ? <MonoLabel style={{ fontSize: 'var(--text-xs)' }}>{`${root.slice(0, 10)}\u2026`}</MonoLabel> : <span style={{ color: COLORS.textDim }}>{PLACEHOLDER}</span>}
              </dd>
            </div>
            <div>
              <dt style={{ fontSize: 'var(--text-xs)', color: COLORS.textDim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem', fontWeight: 'var(--fw-semibold)' }}>
                Daily Limit
              </dt>
              <dd style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 'var(--fw-medium)', color: COLORS.text }}>
                {dailyLimitWei === undefined ? PLACEHOLDER : `${formatEther(dailyLimitWei)} OG`}
              </dd>
            </div>
          </dl>
        </Card>
      </div>
    </main>
  );
}

export default VaultDashboard;
