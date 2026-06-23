// Axiom Protocol — `<PaymentPanel />`.
//
// Presentational panel for the five backend payment routes plus the
// on-chain `withdrawAgentEarnings()` call. HTTP I/O flows through
// `usePayment`; the on-chain withdraw uses wagmi `useWriteContract`.

import { useCallback, useRef, useState, type ReactElement } from 'react';
import { useAccount, useSendTransaction, useWriteContract } from 'wagmi';
import type { Address } from 'viem';

import {
  AXIOM_PAYMENT_PROCESSOR_ADDRESS,
} from '../abi/addresses.js';
import { PLACEHOLDER, truncateHex } from '../utils/format.js';
import {
  usePayment,
  type PaymentConfig,
  type EarningsInfo,
  type RoyaltyResult,
} from '../hooks/usePayment.js';
import {
  COLORS,
  Card,
  Button,
  Input,
  Alert,
  SectionTitle,
  MonoLabel,
  Badge,
  Spinner,
} from './ui.js';

/**
 * Minimal ABI fragment for the on-chain withdraw call. The backend
 * has no `/withdraw` route; creators call `withdrawAgentEarnings()`
 * directly on `AxiomPaymentProcessor`. The view `royaltyBpsOf` is
 * included so the panel can render the current royalty setting next
 * to the setter form. Source of truth:
 * apps/contracts/src/AxiomPaymentProcessor.sol.
 */
const PAYMENT_PROCESSOR_FRAGMENT = [
  {
    type: 'function',
    name: 'withdrawAgentEarnings',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
] as const;

/** Per-action status surfaced to the UI. */
type ActionStatus = 'idle' | 'pending' | 'success' | 'error';

/** Inline form row: a labeled input + submit button. */
const formRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  marginTop: 8,
};

export type PaymentPanelProps = {
  /** Token id of the agent this panel is scoped to. */
  tokenId: bigint;
};

/**
 * Panel that wires the five backend payment routes + on-chain
 * `withdrawAgentEarnings` to a UI for one agent. Mounts inside
 * `AgentDetail` (a future wave will wire it; this file only
 * exports it).
 */
export function PaymentPanel({ tokenId }: PaymentPanelProps): ReactElement {
  const { isConnected } = useAccount();
  const {
    payForAgent,
    getEarnings,
    setRoyalty,
    getPaymentConfig,
    isLoading,
    error,
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

  const [royaltyBps, setRoyaltyBps] = useState('');
  const [royaltyStatus, setRoyaltyStatus] = useState<ActionStatus>('idle');

  const [withdrawStatus, setWithdrawStatus] = useState<ActionStatus>('idle');

  // Render-time data initialisation — fires once on the first connected
  // render, no `useEffect` needed.
  const initRef = useRef(false);
  if (!initRef.current && isConnected) {
    initRef.current = true;
    Promise.all([getPaymentConfig(), getEarnings(tokenId)])
      .then(([cfg, earn]) => {
        setConfig(cfg);
        setEarnings(earn);
      })
      .catch(() => {});
  }

  const refreshEarnings = useCallback(async (): Promise<void> => {
    try {
      const earn = await getEarnings(tokenId);
      setEarnings(earn);
    } catch {
    }
  }, [tokenId, getEarnings]);

  const handlePay = useCallback(async (): Promise<void> => {
    if (payAmount === '') return;
    setPayStatus('pending');
    try {
      await payForAgent(tokenId, payAmount);
      setPayStatus('success');
      await refreshEarnings();
    } catch {
      setPayStatus('error');
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
    } catch {
      setRoyaltyStatus('error');
    }
  }, [royaltyBps, setRoyalty, tokenId, sendTransactionAsync]);

  const handleWithdraw = useCallback(async (): Promise<void> => {
    setWithdrawStatus('pending');
    try {
      await writeContractAsync({
        address: AXIOM_PAYMENT_PROCESSOR_ADDRESS,
        abi: PAYMENT_PROCESSOR_FRAGMENT,
        functionName: 'withdrawAgentEarnings',
        args: [],
      });
      setWithdrawStatus('success');
      await refreshEarnings();
    } catch {
      setWithdrawStatus('error');
    }
  }, [writeContractAsync, refreshEarnings]);

  if (!isConnected) {
    return (
      <Card>
        <SectionTitle>Payments</SectionTitle>
        <p style={{ color: COLORS.textMuted, fontSize: 'var(--text-sm)', lineHeight: 'var(--lh-snug)' }}>
          Connect wallet to manage payments for this agent.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <SectionTitle>Payments</SectionTitle>

      {/* 1. Payment config */}
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

      {/* 2. Pay-for-agent form */}
      <h3>Pay for Agent</h3>
      <p style={{ fontSize: 12, color: COLORS.textMuted }}>
        Amount is in the payment token&apos;s smallest unit (e.g. 6-decimal
        USDC micro-units).
      </p>
      <div style={formRowStyle}>
        <Input
          type="text"
          inputMode="numeric"
          placeholder="amount (wei)"
          value={payAmount}
          onChange={(e): void => {
            setPayAmount(e.target.value);
            setPayStatus('idle');
          }}
          style={{ flex: 1 }}
        />
        <Button
          variant="primary"
          disabled={isLoading || payAmount === ''}
          onClick={(): void => {
            void handlePay();
          }}
        >
          {payStatus === 'pending' ? <Spinner size={16} /> : 'Pay'}
        </Button>
      </div>
      {payStatus === 'success' && <Alert variant="success">Payment submitted.</Alert>}
      {payStatus === 'error' && <Alert variant="error">Payment failed.</Alert>}

      {/* 3. Earnings + withdraw */}
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
      <div style={formRowStyle}>
        <Button
          variant="secondary"
          disabled={isWithdrawPending || withdrawStatus === 'pending'}
          onClick={(): void => {
            void handleWithdraw();
          }}
        >
          {withdrawStatus === 'pending' ? <Spinner size={16} /> : 'Withdraw'}
        </Button>
      </div>
      {withdrawStatus === 'success' && <Alert variant="success">Withdrawal submitted.</Alert>}
      {withdrawStatus === 'error' && <Alert variant="error">Withdrawal failed.</Alert>}

      {/* 4. Royalty setting form */}
      <h3>Royalty</h3>
      <p style={{ fontSize: 12, color: COLORS.textMuted }}>
        Basis points (0\u201310000). 250 = 2.5%. Only the agent creator
        may set this on-chain.
      </p>
      <div style={formRowStyle}>
        <Input
          type="number"
          min={0}
          max={10000}
          placeholder="bps (0\u201310000)"
          value={royaltyBps}
          onChange={(e): void => {
            setRoyaltyBps(e.target.value);
            setRoyaltyStatus('idle');
          }}
          style={{ flex: 1 }}
        />
        <Button
          variant="primary"
          disabled={isLoading || royaltyBps === ''}
          onClick={(): void => {
            void handleSetRoyalty();
          }}
        >
          {royaltyStatus === 'pending' ? <Spinner size={16} /> : 'Set Royalty'}
        </Button>
      </div>
      {royaltyStatus === 'success' && <Alert variant="success">Royalty updated.</Alert>}
      {royaltyStatus === 'error' && <Alert variant="error">Royalty update failed.</Alert>}

      {/* Shared error line for any hook-level failure. */}
      {error !== null && (
        <Alert variant="error">{error.message}</Alert>
      )}
      {withdrawError !== null && (
        <Alert variant="error">{withdrawError.message}</Alert>
      )}
    </Card>
  );
}

/** Sentinel for the zero address so we can render the placeholder. */
const ethersZero: Address = '0x0000000000000000000000000000000000000000';

export default PaymentPanel;
