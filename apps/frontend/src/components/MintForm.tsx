import {
  useCallback,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAccount, useReadContracts } from 'wagmi';
import { formatEther, keccak256, parseAbi, toBytes, encodeFunctionData } from 'viem';
import { AGENT_NFT_ABI } from '@axiom/config/abis';

const agentNftAbi = parseAbi(AGENT_NFT_ABI);
import { getAxiomAgentNftAddress } from '../abi/addresses.js';
import { COLORS, Card, Button, Alert, PageHeader, Input, ConnectedGuard } from './ui.js';

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginTop: 16,
  fontWeight: 'var(--fw-medium)',
  fontSize: 'var(--text-sm)',
  color: COLORS.textPrimary,
};

export type MintFormProps = {
  provider?: `0x${string}` | undefined;
};

export function MintForm({ provider }: MintFormProps): ReactElement {
  const { address, isConnected } = useAccount();
  const navigate = useNavigate();
  const [agentName, setAgentName] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const feeQuery = useReadContracts({
    allowFailure: false,
    contracts: [
      {
        address: getAxiomAgentNftAddress(),
        abi: agentNftAbi,
        functionName: 'mintFee',
        args: undefined,
      },
    ],
    query: {
      enabled: Boolean(getAxiomAgentNftAddress()),
    },
  });

  const mintFeeWei: bigint | undefined = feeQuery.data?.[0] as bigint | undefined;
  const feeError = (feeQuery.error as Error | null) ?? null;

  const owner = address;
  const canSubmit = isConnected && owner !== undefined && agentName.length > 0;

  const onSubmit = useCallback(async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!canSubmit || !owner || !mintFeeWei || isBusy) return;
    setSubmitError(null);
    setIsBusy(true);
    try {
      const dataHash = keccak256(toBytes(`axiom:agent:${agentName}:${owner.toLowerCase()}`));
      const data = encodeFunctionData({
        abi: agentNftAbi,
        functionName: 'mint',
        args: [[{ dataDescription: agentName, dataHash }], owner],
      });
      const hash = await window.ethereum!.request({
        method: 'eth_sendTransaction',
        params: [{
          from: owner,
          to: getAxiomAgentNftAddress(),
          data,
          value: `0x${mintFeeWei.toString(16)}`,
        }],
      });
      toast.success(`Agent "${agentName}" minted!`);
      setAgentName('');
      navigate('/agents');
    } catch (err) {
      setIsBusy(false);
      setSubmitError(err instanceof Error ? err.message : String(err));
    }
  }, [canSubmit, agentName, owner, mintFeeWei, isBusy]);

  const onNameChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      setAgentName(event.target.value);
    },
    [],
  );

  return (
    <main style={{ maxWidth: '36rem' }}>
      <ConnectedGuard>
      <PageHeader title="Mint Agent" />

      <Card>
        <form onSubmit={onSubmit}>
          <label htmlFor="agent-name" style={labelStyle}>
            Agent name
          </label>
          <Input
            id="agent-name"
            name="agentName"
            type="text"
            value={agentName}
            onChange={onNameChange}
            placeholder="My AI strategy"
            autoComplete="off"
            style={{ width: '100%', marginTop: 6, boxSizing: 'border-box' }}
            required
          />

          <div style={{ marginTop: 'var(--space-lg)', padding: 'var(--space-md) var(--space-lg)', background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 'var(--radius-lg)', fontSize: 'var(--text-sm)' }}>
            <span style={{ fontWeight: 'var(--fw-medium)', color: COLORS.textPrimary }}>Fee: </span>
            {feeError !== null ? (
              <span style={{ color: COLORS.danger }}>
                unavailable ({feeError.message})
              </span>
            ) : mintFeeWei === undefined ? (
              <span style={{ color: COLORS.textMuted }}>loading…</span>
            ) : (
              <span style={{ fontFamily: "'SF Mono', monospace", color: COLORS.bronzeLight, fontWeight: 'var(--fw-semibold)' }}>
                {formatEther(mintFeeWei)} 0G
              </span>
            )}
            {provider !== undefined && (
              <span style={{ color: COLORS.textDim, marginLeft: 'var(--space-md)', fontSize: 'var(--text-xs)' }}>
                {provider.slice(0, 10)}…
              </span>
            )}
          </div>

          {submitError !== null && (
            <Alert variant="error" style={{ marginTop: 'var(--space-md)' }}>
              {submitError}
            </Alert>
          )}

          <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end', marginTop: 'var(--space-xl)' }}>
            <Button variant="primary" type="submit" disabled={!canSubmit || isBusy}>
              {isBusy ? 'Confirming…' : 'Mint agent'}
            </Button>
          </div>
        </form>
      </Card>
      </ConnectedGuard>
    </main>
  );
}

export default MintForm;
