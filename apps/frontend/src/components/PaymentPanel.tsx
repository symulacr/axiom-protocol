import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { useSendTransaction, useWriteContract } from 'wagmi';
import type { Address } from 'viem';

import { PAYMENT_PROCESSOR_ABI } from '@axiom/config/abis';
import { getAxiomPaymentProcessorAddress } from '../abi/addresses.js';
import { PLACEHOLDER, truncateHex } from '../utils/format.js';
import {
  usePayment,
  type PaymentConfig,
  type EarningsInfo,
} from '../hooks/usePayment.js';
import { toast } from 'sonner';
import {
  COLORS,
  Card,
  Button,
  Input,
  Alert,
  SectionTitle,
  MonoLabel,
  Modal,
  Spinner,
  ConnectedGuard,
} from './ui.js';

type ActionStatus = 'idle' | 'pending' | 'success' | 'error';

function useAutoClear(
  status: ActionStatus,
  setStatus: (s: ActionStatus) => void,
  ms = 6000,
): void {
  useEffect(() => {
    if (status === 'success' || status === 'error') {
      const timer = setTimeout(() => setStatus('idle'), ms);
      return () => clearTimeout(timer);
    }
  }, [status, setStatus, ms]);
}

const formRowClassName = "flex items-center gap-sm mt-sm";

function PaymentConfigDisplay({
  config,
  initError,
}: {
  config: PaymentConfig | null;
  initError: string | null;
}): ReactElement {
  return (
    <>
      {initError !== null && (
        <Alert variant="error" style={{ marginBottom: 'var(--space-lg)' }}>
          {initError}
        </Alert>
      )}
      <h3>Payment Config</h3>
      {config === null ? (
        <Spinner size={16} />
      ) : (
        <dl>
          <dt>Payment Token</dt>
          <dd>
            <MonoLabel title={config.paymentToken}>
              {truncateHex(config.paymentToken)}
            </MonoLabel>
          </dd>
          <dt>Protocol Fee</dt>
          <dd>{config.protocolFeeBps} bps</dd>
          <dt>Protocol Treasury</dt>
          <dd>
            <MonoLabel title={config.protocolTreasury}>
              {truncateHex(config.protocolTreasury)}
            </MonoLabel>
          </dd>
        </dl>
      )}
    </>
  );
}

function PaymentForm({
  isPayLoading,
  payAmount,
  payStatus,
  payError,
  onPayAmountChange,
  onPay,
}: {
  isPayLoading: boolean;
  payAmount: string;
  payStatus: ActionStatus;
  payError: string | null;
  onPayAmountChange: (value: string) => void;
  onPay: () => void;
}): ReactElement {
  return (
    <>
      <h3>Pay for Agent</h3>
      <p className="text-xs text-muted">
        Amount is in the payment token&apos;s smallest unit (e.g. 6-decimal
        USDC micro-units).
      </p>
      <div className={formRowClassName}>
        <Input
          type="number"
          inputMode="numeric"
          min="0"
          step="1"
          placeholder="amount (wei)"
          value={payAmount}
          onChange={(e): void => {
            onPayAmountChange(e.target.value);
          }}
          style={{ flex: 1 }}
        />
        <Button
          variant="primary"
          disabled={isPayLoading || payAmount === ''}
          onClick={onPay}
          style={{ minWidth: '140px' }}
        >
          {payStatus === 'pending' ? <Spinner size={16} /> : 'Pay'}
        </Button>
      </div>
      {payStatus === 'success' && <Alert variant="success">Payment submitted.</Alert>}
      {payStatus === 'error' && (
        <Alert variant="error">{payError ?? 'Payment failed.'}</Alert>
      )}
    </>
  );
}

function EarningsSection({
  earnings,
  isWithdrawPending,
  withdrawStatus,
  showWithdrawConfirm,
  withdrawActionError,
  onWithdrawRequest,
  onWithdrawCancel,
  onWithdrawConfirm,
}: {
  earnings: EarningsInfo | null;
  isWithdrawPending: boolean;
  withdrawStatus: ActionStatus;
  showWithdrawConfirm: boolean;
  withdrawActionError: string | null;
  onWithdrawRequest: () => void;
  onWithdrawCancel: () => void;
  onWithdrawConfirm: () => void;
}): ReactElement {
  return (
    <>
      <h3>Earnings</h3>
      {earnings === null ? (
        <Spinner size={16} />
      ) : (
        <dl>
          <dt>Creator</dt>
          <dd>
            <MonoLabel title={earnings.creator}>
              {earnings.creator === ethersZero
                ? PLACEHOLDER
                : truncateHex(earnings.creator)}
            </MonoLabel>
          </dd>
          <dt>Accumulated Earnings</dt>
          <dd>
            <MonoLabel>{earnings.earnings}</MonoLabel>
          </dd>
        </dl>
      )}
      <div className={formRowClassName}>
        <Button
          variant="secondary"
          disabled={isWithdrawPending || withdrawStatus === 'pending'}
          onClick={onWithdrawRequest}
          style={{ minWidth: '140px' }}
        >
          {withdrawStatus === 'pending' ? <Spinner size={16} /> : 'Withdraw'}
        </Button>
      </div>
      <Modal
        open={showWithdrawConfirm}
        onClose={onWithdrawCancel}
        title="Confirm Withdrawal"
      >
        <p>Withdraw all agent earnings? This will send funds to your wallet.</p>
        <div className="flex justify-end" style={{ gap: 10, marginTop: 20 }}>
          <Button variant="secondary" onClick={onWithdrawCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onWithdrawConfirm}>
            Confirm
          </Button>
        </div>
      </Modal>
      {withdrawStatus === 'success' && (
        <Alert variant="success">Withdrawal submitted.</Alert>
      )}
      {withdrawStatus === 'error' && (
        <Alert variant="error">
          {withdrawActionError ?? 'Withdrawal failed.'}
        </Alert>
      )}
    </>
  );
}

function RoyaltySection({
  isRoyaltyLoading,
  royaltyBps,
  royaltyStatus,
  royaltyError,
  onRoyaltyBpsChange,
  onSetRoyalty,
}: {
  isRoyaltyLoading: boolean;
  royaltyBps: string;
  royaltyStatus: ActionStatus;
  royaltyError: string | null;
  onRoyaltyBpsChange: (value: string) => void;
  onSetRoyalty: () => void;
}): ReactElement {
  return (
    <>
      <h3>Royalty</h3>
      <p className="text-xs text-muted">
        Basis points (0\u201310000). 250 = 2.5%. Only the agent creator
        may set this on-chain.
      </p>
      <div className={formRowClassName}>
        <Input
          type="number"
          min={0}
          max={10000}
          placeholder="bps (0\u201310000)"
          value={royaltyBps}
          onChange={(e): void => {
            onRoyaltyBpsChange(e.target.value);
          }}
          style={{ flex: 1 }}
        />
        <Button
          variant="primary"
          disabled={isRoyaltyLoading || royaltyBps === ''}
          onClick={onSetRoyalty}
          style={{ minWidth: '140px' }}
        >
          {royaltyStatus === 'pending' ? <Spinner size={16} /> : 'Set Royalty'}
        </Button>
      </div>
      {royaltyStatus === 'success' && (
        <Alert variant="success">Royalty updated.</Alert>
      )}
      {royaltyStatus === 'error' && (
        <Alert variant="error">
          {royaltyError ?? 'Royalty update failed.'}
        </Alert>
      )}
    </>
  );
}



export type PaymentPanelProps = {
  tokenId: bigint;
};

export function PaymentPanel({ tokenId }: PaymentPanelProps): ReactElement {
  const {
    payForAgent,
    getEarnings,
    setRoyalty,
    getPaymentConfig,
    isPayLoading,
    isRoyaltyLoading,
    isEarningsLoading,
    earningsError,
    fetchError,
  } = usePayment();

  // On-chain withdraw — backend has no route, so the connected
  // wallet signs `withdrawAgentEarnings()` directly. This mirrors
  // `useTransfer`'s on-chain submit pattern.
  const {
    writeContractAsync,
    isPending: isWithdrawPending,
    error: withdrawError,
  } = useWriteContract();

  const { sendTransactionAsync } = useSendTransaction();

  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [earnings, setEarnings] = useState<EarningsInfo | null>(null);

  const [payAmount, setPayAmount] = useState('');
  const [payStatus, setPayStatus] = useState<ActionStatus>('idle');
  const [payError, setPayError] = useState<string | null>(null);

  const [royaltyBps, setRoyaltyBps] = useState('');
  const [royaltyStatus, setRoyaltyStatus] = useState<ActionStatus>('idle');
  const [royaltyError, setRoyaltyError] = useState<string | null>(null);

  const [withdrawStatus, setWithdrawStatus] = useState<ActionStatus>('idle');
  const [withdrawActionError, setWithdrawActionError] = useState<string | null>(null);
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  useAutoClear(payStatus, setPayStatus);
  useAutoClear(royaltyStatus, setRoyaltyStatus);
  useAutoClear(withdrawStatus, setWithdrawStatus);

  useEffect(() => {
    let cancelled = false;
    setInitError(null);
    Promise.all([getPaymentConfig(), getEarnings(tokenId)])
      .then(([cfg, earn]) => {
        if (cancelled) return;
        setConfig(cfg);
        setEarnings(earn);
      })
      .catch(err => {
        if (cancelled) return;
        setInitError(err instanceof Error ? err.message : String(err));
      });
    return () => { cancelled = true; };
  }, [tokenId, getPaymentConfig, getEarnings]);

  const refreshEarnings = useCallback(async (): Promise<void> => {
    try {
      const earn = await getEarnings(tokenId);
      setEarnings(earn);
    } catch (err) {
      console.warn('[PaymentPanel] Failed to refresh earnings:', err);
    }
  }, [tokenId, getEarnings]);

  const handlePay = useCallback(async (): Promise<void> => {
    if (payAmount === '') return;
    setPayStatus('pending');
    try {
      await payForAgent(tokenId, payAmount);
      setPayStatus('success');
      toast.success('Payment processed');
      await refreshEarnings();
    } catch (err) {
      setPayStatus('error');
      setPayError(err instanceof Error ? err.message : String(err));
    }
  }, [payAmount, payForAgent, tokenId, refreshEarnings]);

  const handleSetRoyalty = useCallback(async (): Promise<void> => {
    const parsed = Number.parseInt(royaltyBps, 10);
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 10_000) {
      setRoyaltyStatus('error');
      return;
    }
    setRoyaltyStatus('pending');
    try {
      const result = await setRoyalty(tokenId, parsed);
      if (result?.to && result?.data) {
        await sendTransactionAsync({
          to: result.to,
          data: result.data,
          value: BigInt(result.value ?? '0'),
        });
      }
      setRoyaltyStatus('success');
      toast.success('Royalty updated');
    } catch (err) {
      setRoyaltyStatus('error');
      setRoyaltyError(err instanceof Error ? err.message : String(err));
    }
  }, [royaltyBps, setRoyalty, tokenId, sendTransactionAsync]);

  const handleWithdraw = useCallback(async (): Promise<void> => {
    setShowWithdrawConfirm(false);
    setWithdrawStatus('pending');
    try {
      await writeContractAsync({
        address: getAxiomPaymentProcessorAddress(),
        abi: PAYMENT_PROCESSOR_ABI,
        functionName: 'withdrawAgentEarnings',
        args: [],
      });
      setWithdrawStatus('success');
      toast.success('Withdrawal submitted');
      await refreshEarnings();
    } catch (err) {
      setWithdrawStatus('error');
      setWithdrawActionError(err instanceof Error ? err.message : String(err));
    }
  }, [writeContractAsync, refreshEarnings]);

  return (
    <Card>
      <ConnectedGuard>
      <SectionTitle>Payments</SectionTitle>

      <PaymentConfigDisplay config={config} initError={initError} />

      <PaymentForm
        isPayLoading={isPayLoading}
        payAmount={payAmount}
        payStatus={payStatus}
        payError={payError}
        onPayAmountChange={(v): void => {
          setPayAmount(v);
          setPayStatus('idle');
          setPayError(null);
        }}
        onPay={(): void => { void handlePay(); }}
      />

      <EarningsSection
        earnings={earnings}
        isWithdrawPending={isWithdrawPending}
        withdrawStatus={withdrawStatus}
        showWithdrawConfirm={showWithdrawConfirm}
        withdrawActionError={withdrawActionError}
        onWithdrawRequest={(): void => { setShowWithdrawConfirm(true); }}
        onWithdrawCancel={(): void => { setShowWithdrawConfirm(false); }}
        onWithdrawConfirm={(): void => { void handleWithdraw(); }}
      />

      <RoyaltySection
        isRoyaltyLoading={isRoyaltyLoading}
        royaltyBps={royaltyBps}
        royaltyStatus={royaltyStatus}
        royaltyError={royaltyError}
        onRoyaltyBpsChange={(v): void => {
          setRoyaltyBps(v);
          setRoyaltyStatus('idle');
          setRoyaltyError(null);
        }}
        onSetRoyalty={(): void => { void handleSetRoyalty(); }}
      />

      {fetchError !== null && (
        <Alert variant="error">{fetchError.message}</Alert>
      )}
      {earningsError !== null && (
        <Alert variant="error">{earningsError.message}</Alert>
      )}
      {withdrawError !== null && (
        <Alert variant="error">{withdrawError.message}</Alert>
      )}
      </ConnectedGuard>
    </Card>
  );
}

const ethersZero: Address = '0x0000000000000000000000000000000000000000';

export default PaymentPanel;
