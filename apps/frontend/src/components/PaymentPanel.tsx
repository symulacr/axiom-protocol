// Axiom Protocol — `<PaymentPanel />`.
//
// Presentational + thin-controller panel for the five backend payment
// routes (Wave 3) plus the on-chain `withdrawAgentEarnings()` call.
// It is intended to be embedded inside the agent detail page
// (`/agents/:tokenId`) — it accepts the parsed `tokenId` prop and
// renders:
//
//   1. Payment config display (payment token, protocol fee bps,
//      treasury) — pulled from `GET /v1/payment/config` on mount.
//   2. Pay-for-agent form (amount input + submit) — POSTs to
//      `/v1/agents/:id/pay` via the backend signer.
//   3. Earnings display (creator address + accumulated earnings) +
//      "Withdraw" button that calls `withdrawAgentEarnings()` on
//      `AxiomPaymentProcessor` directly through wagmi v2
//      `useWriteContract` (the backend has no withdraw route — see
//      apps/backend/src/server.ts).
//   4. Royalty setting form (bps input + submit) — POSTs to
//      `/v1/agents/:id/royalty`.
//
// All HTTP I/O flows through the `usePayment` hook so this file
// stays presentational. The on-chain withdraw is the one exception —
// there is no backend wrapper, so the connected wallet signs it
// directly via wagmi, mirroring the `useTransfer` on-chain submit.
//
// Style follows the rest of the dApp: functional component, inline
// styles, explicit `ReactElement` return type, no `!` assertions.
// See `AgentDetail.tsx` and `HealthBadge.tsx` for the convention.
//
// Canonical references:
//   - wagmi v2 `useAccount`:
//       https://wagmi.sh/react/hooks/useAccount
//   - wagmi v2 `useWriteContract`:
//       https://wagmi.sh/react/hooks/useWriteContract
//   - wagmi v2 `useReadContract`:
//       https://wagmi.sh/react/hooks/useReadContract
//   - AxiomPaymentProcessor source of truth:
//       apps/contracts/src/AxiomPaymentProcessor.sol
//   - EIP-20 (ERC-20 approve/allowance, basis for the pull payment):
//       https://eips.ethereum.org/EIPS/eip-20

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import type { Address } from 'viem';

import {
  AXIOM_PAYMENT_PROCESSOR_ADDRESS,
} from '../abi/addresses.js';
import {
  usePayment,
  type PaymentConfig,
  type EarningsInfo,
} from '../hooks/usePayment.js';

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

/** Display the em-dash for an absent value (matches AgentDetail). */
const PLACEHOLDER = '\u2014';
/** Truncate a `0x…` hex string to `head + … + tail` (matches AgentDetail). */
function truncateHex(value: string, head = 10, tail = 6): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}\u2026${value.slice(-tail)}`;
}

/** Shared panel style: a bordered card section with spacing. */
const sectionStyle: React.CSSProperties = {
  border: '1px solid #2a2a2a',
  borderRadius: 10,
  padding: 20,
  marginBottom: 16,
  background: '#1a1a1a',
};

/** Inline form row: a labeled input + submit button. */
const formRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  marginTop: 8,
};

/** Status pill colour per `ActionStatus`. */
function statusColor(status: ActionStatus): string {
  switch (status) {
    case 'success':
      return '#6b9e6b';
    case 'error':
      return '#c85a5a';
    case 'pending':
      return '#c5a25a';
    default:
      return '#8a8a8a';
  }
}

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

  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [earnings, setEarnings] = useState<EarningsInfo | null>(null);

  const [payAmount, setPayAmount] = useState('');
  const [payStatus, setPayStatus] = useState<ActionStatus>('idle');

  const [royaltyBps, setRoyaltyBps] = useState('');
  const [royaltyStatus, setRoyaltyStatus] = useState<ActionStatus>('idle');

  const [withdrawStatus, setWithdrawStatus] = useState<ActionStatus>('idle');

  // Load payment config + current earnings on mount and whenever the
  // token id changes. `cancelled` guards against state writes after
  // unmount, per the React 18 useEffect idiom.
  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const [cfg, earn] = await Promise.all([
          getPaymentConfig(),
          getEarnings(tokenId),
        ]);
        if (cancelled) return;
        setConfig(cfg);
        setEarnings(earn);
      } catch {
        // Surfaced via the hook's `error` state; no per-field render.
      }
    };
    void load();
    return (): void => {
      cancelled = true;
    };
  }, [tokenId, getPaymentConfig, getEarnings]);

  const refreshEarnings = useCallback(async (): Promise<void> => {
    try {
      const earn = await getEarnings(tokenId);
      setEarnings(earn);
    } catch {
      // Hook surfaces it.
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
      await setRoyalty(tokenId, parsed);
      setRoyaltyStatus('success');
    } catch {
      setRoyaltyStatus('error');
    }
  }, [royaltyBps, setRoyalty, tokenId]);

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
      <section style={sectionStyle}>
        <h2>Payments</h2>
        <p>Connect wallet to manage payments for this agent.</p>
      </section>
    );
  }

  return (
    <section style={sectionStyle}>
      <h2>Payments</h2>

      {/* 1. Payment config */}
      <h3>Payment Config</h3>
      {config === null ? (
        <p>Loading payment config\u2026</p>
      ) : (
        <dl>
          <dt>Payment Token</dt>
          <dd>
            <code title={config.paymentToken}>
              {truncateHex(config.paymentToken)}
            </code>
          </dd>
          <dt>Protocol Fee</dt>
          <dd>{config.protocolFeeBps} bps</dd>
          <dt>Protocol Treasury</dt>
          <dd>
            <code title={config.protocolTreasury}>
              {truncateHex(config.protocolTreasury)}
            </code>
          </dd>
        </dl>
      )}

      {/* 2. Pay-for-agent form */}
      <h3>Pay for Agent</h3>
      <p style={{ fontSize: 12, color: '#8a8a8a' }}>
        Amount is in the payment token&apos;s smallest unit (e.g. 6-decimal
        USDC micro-units).
      </p>
      <div style={formRowStyle}>
        <input
          type="text"
          inputMode="numeric"
          placeholder="amount (wei)"
          value={payAmount}
          onChange={(e): void => {
            setPayAmount(e.target.value);
            setPayStatus('idle');
          }}
          style={{ flex: 1, padding: '4px 8px' }}
        />
        <button
          type="button"
          disabled={isLoading || payAmount === ''}
          onClick={(): void => {
            void handlePay();
          }}
        >
          {payStatus === 'pending' ? 'Paying\u2026' : 'Pay'}
        </button>
      </div>
      <p style={{ color: statusColor(payStatus), fontSize: 12 }}>
        {payStatus === 'success' && 'Payment submitted.'}
        {payStatus === 'error' && 'Payment failed.'}
      </p>

      {/* 3. Earnings + withdraw */}
      <h3>Earnings</h3>
      {earnings === null ? (
        <p>Loading earnings\u2026</p>
      ) : (
        <dl>
          <dt>Creator</dt>
          <dd>
            <code title={earnings.creator}>
              {earnings.creator === ethersZero
                ? PLACEHOLDER
                : truncateHex(earnings.creator)}
            </code>
          </dd>
          <dt>Accumulated Earnings</dt>
          <dd>
            <code>{earnings.earnings}</code>
          </dd>
        </dl>
      )}
      <div style={formRowStyle}>
        <button
          type="button"
          disabled={isWithdrawPending || withdrawStatus === 'pending'}
          onClick={(): void => {
            void handleWithdraw();
          }}
        >
          {withdrawStatus === 'pending' ? 'Withdrawing\u2026' : 'Withdraw'}
        </button>
      </div>
      <p style={{ color: statusColor(withdrawStatus), fontSize: 12 }}>
        {withdrawStatus === 'success' && 'Withdrawal submitted.'}
        {withdrawStatus === 'error' && 'Withdrawal failed.'}
      </p>

      {/* 4. Royalty setting form */}
      <h3>Royalty</h3>
      <p style={{ fontSize: 12, color: '#8a8a8a' }}>
        Basis points (0\u201310000). 250 = 2.5%. Only the agent creator
        may set this on-chain.
      </p>
      <div style={formRowStyle}>
        <input
          type="number"
          min={0}
          max={10000}
          placeholder="bps (0\u201310000)"
          value={royaltyBps}
          onChange={(e): void => {
            setRoyaltyBps(e.target.value);
            setRoyaltyStatus('idle');
          }}
          style={{ flex: 1, padding: '4px 8px' }}
        />
        <button
          type="button"
          disabled={isLoading || royaltyBps === ''}
          onClick={(): void => {
            void handleSetRoyalty();
          }}
        >
          {royaltyStatus === 'pending' ? 'Setting\u2026' : 'Set Royalty'}
        </button>
      </div>
      <p style={{ color: statusColor(royaltyStatus), fontSize: 12 }}>
        {royaltyStatus === 'success' && 'Royalty updated.'}
        {royaltyStatus === 'error' && 'Royalty update failed.'}
      </p>

      {/* Shared error line for any hook-level failure. */}
      {error !== null && (
        <p role="alert" style={{ color: '#c85a5a', fontSize: 12 }}>
          {error.message}
        </p>
      )}
      {withdrawError !== null && (
        <p role="alert" style={{ color: '#c85a5a', fontSize: 12 }}>
          {withdrawError.message}
        </p>
      )}
    </section>
  );
}

/** Sentinel for the zero address so we can render the placeholder. */
const ethersZero: Address = '0x0000000000000000000000000000000000000000';

export default PaymentPanel;
