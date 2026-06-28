import { type ReactElement } from 'react';
import { formatEther } from 'viem';
import { useDeposit } from '../hooks/useDeposit.js';
import { COLORS, Button, Input, Spinner, MonoLabel } from './ui.js';

interface DepositFormProps {
  tokenId: bigint;
  onSuccess?: () => void;
  variant?: 'default' | 'warning';
}

/**
 * Compact inline deposit form. Shows vault balance + input + deposit button.
 * Uses the shared useDeposit hook internally.
 *
 * variant='warning' highlights the bar when balance is 0 (for Execute tab).
 * variant='default' is the plain version (for Overview tab).
 */
export function DepositForm({ tokenId, onSuccess, variant = 'default' }: DepositFormProps): ReactElement | null {
  const { depositAmount, setDepositAmount, isDepositing, isValidDeposit, handleDeposit, vaultData: vd } = useDeposit(tokenId, onSuccess);

  if (vd.isLoading || vd.depositsWei === undefined) return null;

  const isWarning = variant === 'warning' && vd.depositsWei === 0n;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-sm)',
      marginBottom: 'var(--space-lg)',
      fontSize: 'var(--text-sm)',
      flexWrap: 'wrap',
      padding: isWarning ? 'var(--space-sm) var(--space-md)' : undefined,
      background: isWarning ? COLORS.warningBg : 'transparent',
      borderRadius: isWarning ? 'var(--radius-md)' : undefined,
      border: isWarning ? `1px solid ${COLORS.warningBorder}` : 'none',
    }}>
      <span style={{ color: COLORS.textDim, fontWeight: 'var(--fw-medium)', whiteSpace: 'nowrap' }}>
        Vault: <MonoLabel>{formatEther(vd.depositsWei)} 0G</MonoLabel>
      </span>
      <Input
        type="text"
        inputMode="decimal"
        placeholder="0.0"
        value={depositAmount}
        onChange={(e) => setDepositAmount(e.target.value)}
        disabled={isDepositing}
        aria-label="Deposit amount in 0G"
        style={{ flex: '0 1 10rem', fontSize: 'var(--text-sm)' }}
      />
      <Button
        variant="primary"
        disabled={!isValidDeposit || isDepositing}
        onClick={handleDeposit}
        style={{ fontSize: 'var(--text-sm)', padding: '0.375rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-xs)' }}
      >
        {isDepositing ? <><Spinner size={14} /> Depositing…</> : 'Deposit'}
      </Button>
    </div>
  );
}
