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
      <h1>Vault Dashboard</h1>
      <p>
        Live view of every <code>AxiomStrategyVault</code> the dApp tracks.
        Values are read on-chain via wagmi v2 <code>useReadContracts</code>{' '}
        multicalls. (
        <a
          href="https://wagmi.sh/react/hooks/useReadContracts"
          rel="noreferrer noopener"
          target="_blank"
        >
          wagmi docs
        </a>
        )
      </p>

      <section>
        <h2>Connection</h2>
        <dl>
          <dt>Connected</dt>
          <dd>{isConnected ? 'yes' : 'no'}</dd>
          <dt>Address</dt>
          <dd>{address ?? PLACEHOLDER}</dd>
          <dt>Chain id</dt>
          <dd>{chainId}</dd>
        </dl>
      </section>

      <section>
        <h2>Vaults</h2>
        <table>
          <thead>
            <tr>
              <th>Vault #</th>
              <th>Address</th>
              <th>Total Deposits (OG)</th>
              <th>Strategy Merkle Root</th>
              <th>Daily Limit</th>
            </tr>
          </thead>
          <tbody>
            {AXIOM_VAULT_ADDRESSES.map((vaultAddress, index) => {
              // Each vault occupies 3 slots in the flat multicall array.
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

              const depositsWei =
                vaultsResult?.[1] ?? totalDepositsResult;
              const root = vaultsResult?.[2] ?? getStrategyResult?.[0];
              const dailyLimitWei =
                vaultsResult?.[3] ?? getStrategyResult?.[1];

              return (
                <tr key={vaultAddress}>
                  <td>{index}</td>
                  <td>
                    <code>{vaultAddress}</code>
                  </td>
                  <td>
                    {depositsWei === undefined
                      ? PLACEHOLDER
                      : `${formatEther(depositsWei)} OG`}
                  </td>
                  <td>
                    <code>
                      {root === undefined
                        ? PLACEHOLDER
                        : `${root.slice(0, 8)}\u2026`}
                    </code>
                  </td>
                  <td>
                    {dailyLimitWei === undefined
                      ? PLACEHOLDER
                      : `${formatEther(dailyLimitWei)} OG`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {vaultQuery.isLoading && <p>Loading\u2026</p>}
        {vaultQuery.error !== null && (
          <p role="alert">
            Failed to read one or more vaults. Check the console for the
            underlying wagmi error.
          </p>
        )}
      </section>
    </main>
  );
}

export default VaultDashboard;
