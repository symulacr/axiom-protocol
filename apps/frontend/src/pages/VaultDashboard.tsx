// Axiom Protocol — vault dashboard (`/vaults/:vaultId` route).
//
// Renders a table of the on-chain `AxiomStrategyVault` contracts the dApp
// knows about. For every vault address the dashboard multicalls three
// read-only getters in one batched `useReadContracts` request:
//
//   - `vaults(uint256 vaultId)`    — returns the per-token Vault struct
//                                    fields: asset, totalDeposited,
//                                    strategyRoot, dailyLimit.
//   - `totalDeposits()`            — aggregate deposits across the vault.
//   - `getStrategy(uint256 vaultId)` — returns the current strategy root
//                                    + daily limit + valid-until timestamp.
//
// wagmi v2's `useReadContracts` collapses these into a single JSON-RPC
// multicall (one round-trip per chain), which is the recommended pattern
// for dApp dashboards that show many cells at once. The hook also surfaces
// a per-call result so we can render partial UI as data arrives.
//
// The vault list is hard-coded for now (the assignment scope). A future
// micro-wave will replace this with a `useVaults()` hook that reads the
// on-chain registry; the table shape here won't change.
//
// Source URLs (cited at the call sites that use them):
//   - wagmi v2 useReadContracts (batched reads, args, allowFailure, chainId):
//     https://wagmi.sh/react/hooks/useReadContracts
//   - wagmi v2 useAccount (connected address, isConnected, status):
//     https://wagmi.sh/react/hooks/useAccount
//   - wagmi v2 useChainId (active chain id for chain-aware reads):
//     https://wagmi.sh/react/hooks/useChainId
//   - wagmi v2 useConfig (read the active Config, e.g. for transport/chains):
//     https://wagmi.sh/react/hooks/useConfig
//   - viem `formatEther` (wei → ETH display):
//     https://viem.sh/docs/utilities/formatEther
//   - 0G chain id 16602 (Galileo) and 16661 (Aristotle):
//     https://docs.0g.ai/ai-context
//   - Solidity ABI JSON spec (the contract ABI in `abi/AxiomStrategyVault.json`):
//     https://docs.soliditylang.org/en/latest/abi-spec.html

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

      <Card style={{ marginBottom: 24 }}>
        <SectionTitle>Connection</SectionTitle>
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px 16px', fontSize: 14 }}>
          <dt style={{ color: COLORS.textDim, fontWeight: 500 }}>Status</dt>
          <dd style={{ margin: 0, color: isConnected ? COLORS.success : COLORS.textMuted }}>
            {isConnected ? 'Connected' : 'Not connected'}
          </dd>
          <dt style={{ color: COLORS.textDim, fontWeight: 500 }}>Address</dt>
          <dd style={{ margin: 0 }}>
            {address !== undefined ? <MonoLabel>{address}</MonoLabel> : <span style={{ color: COLORS.textDim }}>{PLACEHOLDER}</span>}
          </dd>
          <dt style={{ color: COLORS.textDim, fontWeight: 500 }}>Chain ID</dt>
          <dd style={{ margin: 0, color: COLORS.text }}>{chainId}</dd>
        </dl>
      </Card>

      <SectionTitle>Vaults</SectionTitle>
      {vaultQuery.isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Skeleton height={56} />
          <Skeleton height={56} />
        </div>
      )}
      {vaultQuery.error !== null && (
        <Alert variant="error">
          Couldn't read vault data from the chain. Check your connection and try again.
        </Alert>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: COLORS.bronzeBg,
                    border: `1px solid ${COLORS.bronzeBorder}`,
                    color: COLORS.bronzeLight,
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {index}
                </span>
                <MonoLabel style={{ fontSize: 12 }}>{vaultAddress}</MonoLabel>
              </div>
              <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div>
                  <dt style={{ fontSize: 11, color: COLORS.textDim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, fontWeight: 600 }}>
                    Total Deposits
                  </dt>
                  <dd style={{ margin: 0, fontSize: 18, fontWeight: 600, color: COLORS.bronzeLight }}>
                    {depositsWei === undefined ? PLACEHOLDER : `${formatEther(depositsWei)} OG`}
                  </dd>
                </div>
                <div>
                  <dt style={{ fontSize: 11, color: COLORS.textDim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, fontWeight: 600 }}>
                    Strategy Root
                  </dt>
                  <dd style={{ margin: 0 }}>
                    {root !== undefined ? <MonoLabel style={{ fontSize: 12 }}>{`${root.slice(0, 10)}\u2026`}</MonoLabel> : <span style={{ color: COLORS.textDim }}>{PLACEHOLDER}</span>}
                  </dd>
                </div>
                <div>
                  <dt style={{ fontSize: 11, color: COLORS.textDim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, fontWeight: 600 }}>
                    Daily Limit
                  </dt>
                  <dd style={{ margin: 0, fontSize: 16, fontWeight: 500, color: COLORS.text }}>
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
