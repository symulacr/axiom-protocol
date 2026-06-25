import type { ReactElement } from 'react';
import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAccount, useWriteContract } from 'wagmi';
import { formatEther, parseAbi, parseEther } from 'viem';
import { getAxiomStrategyVaultAddress } from '../abi/addresses.js';
import { axiomStrategyVaultAbi } from '../abi/axiomStrategyVault.js';

const axiomStrategyVaultAbiParsed = parseAbi(axiomStrategyVaultAbi);
import { useVaultData } from '../hooks/useVaultData.js';
import { COLORS, Card, SectionTitle, MonoLabel, Alert, ErrorAlert, PageHeader, Skeleton, Button, Input, Spinner, Modal } from '../components/ui.js';
import { PLACEHOLDER } from '../utils/format.js';

export function VaultDashboard(): ReactElement {
  const { vaultId } = useParams<{ vaultId: string }>();
  const { isConnected } = useAccount();
  const tokenId = vaultId ? BigInt(vaultId) : 0n;

  const vd = useVaultData(tokenId);
  const depositsWei = vd.isLoading ? undefined : vd.depositsWei;
  const root = vd.isLoading ? undefined : (vd.strategyRoot || undefined);
  const dailyLimitWei = vd.isLoading ? undefined : vd.dailyLimitWei;
  const isLoading = vd.isLoading;
  const error = vd.error;

  const [depositAmount, setDepositAmount] = useState('');
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');

  const vaultAddr = getAxiomStrategyVaultAddress();
  const { writeContract: doDeposit, isPending: isDepositing, error: depositError } = useWriteContract();
  const { writeContract: doWithdraw, isPending: isWithdrawing, error: withdrawError } = useWriteContract();

  const handleDeposit = useCallback(() => {
    if (!depositAmount) return;
    doDeposit({
      address: vaultAddr,
      abi: axiomStrategyVaultAbiParsed,
      functionName: 'deposit',
      args: [tokenId],
      value: parseEther(depositAmount),
    });
  }, [depositAmount, vaultAddr, tokenId, doDeposit]);

  const handleWithdraw = useCallback(() => {
    setWithdrawAmount('');
    setShowWithdrawModal(true);
  }, []);

  const handleWithdrawConfirm = useCallback(() => {
    if (!withdrawAmount) return;
    doWithdraw({
      address: vaultAddr,
      abi: axiomStrategyVaultAbiParsed,
      functionName: 'withdraw',
      args: [tokenId, BigInt(withdrawAmount)],
    });
    setShowWithdrawModal(false);
  }, [withdrawAmount, vaultAddr, tokenId, doWithdraw]);

  return (
    <main>
      <p style={{ margin: 0, marginBottom: 'var(--space-md)' }}>
        <Link to="/" style={{ color: COLORS.textDim, textDecoration: 'none', fontSize: '0.875rem' }}>
          ← Back
        </Link>
      </p>
      <PageHeader
        title="Vault Dashboard"
        subtitle="Live on-chain state of every AxiomStrategyVault"
      />



      <SectionTitle>Vaults</SectionTitle>
      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)', minHeight: 120 }}>
          <Skeleton height={56} />
          <Skeleton height={56} />
        </div>
      )}
      {error !== null && (
        <ErrorAlert message="Couldn't read vault data from the chain. Check your connection and try again." />
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

      {isConnected && (
        <Card style={{ marginTop: 'var(--space-xl)' }}>
          <SectionTitle>Deposit / Withdraw</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
            <div>
              <p style={{ margin: '0 0 var(--space-sm)', fontSize: 'var(--text-sm)', color: COLORS.textDim }}>
                Deposit OG (ETH)
              </p>
              <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                <Input
                  type="text"
                  placeholder="0.0"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  style={{ flex: 1 }}
                />
                <Button onClick={handleDeposit} disabled={isDepositing || !depositAmount}>
                  {isDepositing ? <Spinner size={16} /> : 'Deposit'}
                </Button>
              </div>
              {depositError && <Alert variant="error">{depositError.message}</Alert>}
            </div>
            <div>
              <Button variant="secondary" onClick={handleWithdraw} disabled={isWithdrawing}>
                {isWithdrawing ? <Spinner size={16} /> : 'Withdraw'}
              </Button>
              {withdrawError && <Alert variant="error">{withdrawError.message}</Alert>}
            </div>
          </div>
        </Card>
      )}

      <Modal open={showWithdrawModal} onClose={() => setShowWithdrawModal(false)} title="Withdraw">
        <p style={{ margin: '0 0 var(--space-md)', fontSize: 'var(--text-sm)', color: COLORS.textDim }}>
          Enter the amount to withdraw (in wei).
        </p>
        <Input
          type="text"
          placeholder="e.g. 1000000000000000000"
          value={withdrawAmount}
          onChange={(e) => setWithdrawAmount(e.target.value)}
          style={{ width: '100%', marginBottom: 'var(--space-md)', boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={() => setShowWithdrawModal(false)}>
            Cancel
          </Button>
          <Button onClick={handleWithdrawConfirm} disabled={!withdrawAmount}>
            Confirm
          </Button>
        </div>
      </Modal>
    </main>
  );
}

export default VaultDashboard;
