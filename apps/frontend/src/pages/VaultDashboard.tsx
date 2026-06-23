// Axiom Protocol — vault dashboard (`/vaults/:vaultId` route).
//
// Renders AxiomStrategyVault contract state by multicalling three read
// getters per vault address in a single `useReadContracts` request.

import type { ReactElement } from 'react';
import { useAccount, useChainId, useReadContracts } from 'wagmi';
import { formatEther } from 'viem';
import { AXIOM_VAULT_ADDRESSES } from '../abi/addresses.js';
import { axiomStrategyVaultAbi } from '../abi/axiomStrategyVault.js';
import { COLORS, Card, SectionTitle, MonoLabel, Alert, PageHeader, Skeleton } from '../components/ui.js';

/** Display the em-dash for an absent value. */
const PLACEHOLDER = '\u2014';

export function VaultDashboard(): ReactElement {
  const { isConnected, address } = useAccount();
  const chainId = useChainId();

  // Single multicall covering all vaults × 3 getters. Hooks-safe: one
  // unconditional useReadContracts call whose contracts array length is
  // fixed at module load (AXIOM_VAULT_ADDRESSES is a const tuple).
  // Ref: https://wagmi.sh/react/hooks/useReadContracts
  const vaultContracts = AXIOM_VAULT_ADDRESSES.flatMap((vaultAddress) => [
    {
      address: vaultAddress,
      abi: axiomStrategyVaultAbi,
      functionName: 'vaults',
      args: [0n],
    },
    {
      address: vaultAddress,
      abi: axiomStrategyVaultAbi,
      functionName: 'totalDeposits',
    },
    {
      address: vaultAddress,
      abi: axiomStrategyVaultAbi,
      functionName: 'getStrategy',
      args: [0n],
    },
  ] as const);

  const vaultQuery = useReadContracts({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contracts: vaultContracts as readonly any[],
  });

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
      {vaultQuery.isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
          <Skeleton height={56} />
          <Skeleton height={56} />
        </div>
      )}
      {vaultQuery.error !== null && (
        <Alert variant="error">
          Couldn't read vault data from the chain. Check your connection and try again.
        </Alert>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
        {AXIOM_VAULT_ADDRESSES.map((vaultAddress, index) => {
          const base = index * 3;
          const vaultsResult = vaultQuery.data?.[base]?.result as
            | readonly [string, bigint, `0x${string}`, bigint]
            | undefined;
          const totalDepositsResult = vaultQuery.data?.[base + 1]?.result as
            | bigint
            | undefined;
          const getStrategyResult = vaultQuery.data?.[base + 2]?.result as
            | readonly [`0x${string}`, bigint, bigint]
            | undefined;

          const depositsWei = vaultsResult?.[1] ?? totalDepositsResult;
          const root = vaultsResult?.[2] ?? getStrategyResult?.[0];
          const dailyLimitWei = vaultsResult?.[3] ?? getStrategyResult?.[1];

          return (
            <Card key={vaultAddress}>
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
                  {index}
                </span>
                <MonoLabel style={{ fontSize: 'var(--text-xs)' }}>{vaultAddress}</MonoLabel>
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
          );
        })}
      </div>
    </main>
  );
}

export default VaultDashboard;
