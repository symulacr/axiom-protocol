import {
  useCallback,
  useId,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
} from 'react';
import { Link } from 'react-router-dom';
import { useAccount, useReadContracts } from 'wagmi';
import { formatEther, isHex, type Address } from 'viem';
import { AXIOM_AGENT_NFT_ADDRESS } from '../abi/addresses.js';
import { useMint } from '../hooks/useMint.js';
import { COLORS, Card, Button, Alert, PageHeader } from './ui.js';

const mintFeeAbi = [
  {
    type: 'function',
    name: 'mintFee',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  marginTop: 6,
  fontFamily: "'SF Mono', monospace",
  fontSize: 13,
  border: `1px solid ${COLORS.borderStrong}`,
  borderRadius: 6,
  background: COLORS.bg,
  color: COLORS.text,
  boxSizing: 'border-box',
  outline: 'none',
  transition: 'all 0.18s ease',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginTop: 16,
  fontWeight: 500,
  fontSize: 13,
  color: COLORS.textPrimary,
};

const fieldHintStyle: React.CSSProperties = {
  color: COLORS.textDim,
  fontSize: 11,
  margin: '4px 0 0',
  fontWeight: 300,
};

export type MintFormProps = {
  provider?: `0x${string}` | undefined;
};

function validateHex(value: string, label: string): string | null {
  if (value.length === 0) return null;
  if (!value.startsWith('0x')) {
    return `${label} must be 0x-prefixed hex.`;
  }
  if (!isHex(value)) {
    return `${label} is not valid hex.`;
  }
  return null;
}

export function MintForm({ provider }: MintFormProps): ReactElement {
  const formId = useId();
  const { address, isConnected } = useAccount();
  const { mint, isLoading, error, result, reset } = useMint();

  const [encryptedStrategyUri, setEncryptedStrategyUri] = useState('');
  const [sealedKey, setSealedKey] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const feeQuery = useReadContracts({
    allowFailure: false,
    contracts: [
      {
        address: AXIOM_AGENT_NFT_ADDRESS,
        abi: mintFeeAbi,
        functionName: 'mintFee',
        args: undefined,
      },
    ],
    query: {
      enabled: Boolean(AXIOM_AGENT_NFT_ADDRESS),
    },
  });

  const mintFeeWei: bigint | undefined = feeQuery.data?.[0];
  const feeError = (feeQuery.error as Error | null) ?? null;

  const uriError = useMemo(
    () => validateHex(encryptedStrategyUri, 'Strategy URI'),
    [encryptedStrategyUri],
  );
  const sealedKeyError = useMemo(
    () => validateHex(sealedKey, 'Sealed key'),
    [sealedKey],
  );

  const owner: Address | undefined = address;
  const canSubmit =
    isConnected &&
    owner !== undefined &&
    encryptedStrategyUri.length > 0 &&
    uriError === null &&
    sealedKey.length > 0 &&
    sealedKeyError === null &&
    !isLoading;

  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
      if (!canSubmit || !owner) return;
      setSubmitError(null);
      try {
        await mint({
          agentNft: AXIOM_AGENT_NFT_ADDRESS,
          encryptedStrategyUri: encryptedStrategyUri as `0x${string}`,
          sealedKey: sealedKey as `0x${string}`,
          owner,
        });
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : String(err));
      }
    },
    [canSubmit, encryptedStrategyUri, isLoading, mint, owner, sealedKey],
  );

  const onUriChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      setEncryptedStrategyUri(event.target.value);
      if (result !== null) reset();
    },
    [result, reset],
  );
  const onSealedKeyChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      setSealedKey(event.target.value);
      if (result !== null) reset();
    },
    [result, reset],
  );

  if (!isConnected) {
    return (
      <main>
        <PageHeader title="Mint a New Agent" />
        <Card style={{ textAlign: 'center', padding: 'var(--space-3xl) var(--space-xl)' }}>
          <p style={{ color: COLORS.textMuted, fontSize: 'var(--text-sm)', margin: 0, fontWeight: 'var(--fw-regular)', lineHeight: 'var(--lh-normal)' }}>
            Connect your wallet to mint an iNFT agent.
          </p>
        </Card>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: '36rem' }}>
      <PageHeader title="Mint a New Agent" subtitle="Upload an encrypted strategy and mint it as an ERC-7857 iNFT" />

      <Card>
        <p style={{ color: COLORS.textMuted, fontSize: 'var(--text-sm)', lineHeight: 'var(--lh-normal)', margin: '0 0 var(--space-xl)', fontWeight: 'var(--fw-regular)' }}>
          Upload your encrypted strategy bundle to the TEE oracle, then mint the
          iNFT. The backend relays the on-chain{' '}
          <code style={{ color: COLORS.bronzeLight }}>AxiomAgentNFT.mint()</code> call
          and pays the mint fee from the backend wallet.
        </p>

        <form onSubmit={onSubmit}>
          <label htmlFor={`${formId}-uri`} style={labelStyle}>
            Encrypted strategy URI / dataHash
          </label>
          <input
            id={`${formId}-uri`}
            name="encryptedStrategyUri"
            type="text"
            value={encryptedStrategyUri}
            onChange={onUriChange}
            placeholder="0x…  (0G Storage root hash)"
            autoComplete="off"
            spellCheck={false}
            style={inputStyle}
            required
          />
          {uriError !== null && (
            <p role="alert" style={{ color: COLORS.danger, fontSize: 12, margin: '4px 0 0' }}>
              {uriError}
            </p>
          )}
          <p style={fieldHintStyle}>
            The 0G Storage root hash of the encrypted strategy. Becomes the iNFT{' '}
            <code style={{ color: COLORS.bronzeLight }}>dataHash</code>.
          </p>

          <label htmlFor={`${formId}-sealed`} style={labelStyle}>
            Sealed key
          </label>
          <input
            id={`${formId}-sealed`}
            name="sealedKey"
            type="text"
            value={sealedKey}
            onChange={onSealedKeyChange}
            placeholder="0x…  (TEE-sealed encryption key)"
            autoComplete="off"
            spellCheck={false}
            style={inputStyle}
            required
          />
          {sealedKeyError !== null && (
            <p role="alert" style={{ color: COLORS.danger, fontSize: 12, margin: '4px 0 0' }}>
              {sealedKeyError}
            </p>
          )}
          <p style={fieldHintStyle}>
            The TEE-sealed encryption key from the oracle upload step.
          </p>

          <label htmlFor={`${formId}-owner`} style={labelStyle}>
            Owner <span style={{ color: COLORS.textDim, fontWeight: 400 }}>(connected wallet)</span>
          </label>
          <input
            id={`${formId}-owner`}
            name="owner"
            type="text"
            value={owner ?? ''}
            readOnly
            style={{ ...inputStyle, background: COLORS.surface, color: COLORS.bronzeLight }}
          />

          <div style={{ marginTop: 'var(--space-lg)', padding: 'var(--space-md) var(--space-lg)', background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 'var(--radius-lg)', fontSize: 'var(--text-sm)' }}>
            <span style={{ fontWeight: 'var(--fw-medium)', color: COLORS.textPrimary }}>Mint fee: </span>
            {feeError !== null ? (
              <span style={{ color: COLORS.danger }}>
                unavailable ({feeError.message})
              </span>
            ) : mintFeeWei === undefined ? (
              <span style={{ color: COLORS.textMuted }}>loading…</span>
            ) : (
              <span style={{ fontFamily: "'SF Mono', monospace", color: COLORS.bronzeLight, fontWeight: 'var(--fw-semibold)' }}>
                {formatEther(mintFeeWei)} OG
              </span>
            )}
            {provider !== undefined && (
              <span style={{ color: COLORS.textDim, marginLeft: 'var(--space-md)', fontSize: 'var(--text-xs)' }}>
                provider: {provider.slice(0, 10)}…
              </span>
            )}
          </div>

          {error !== null && (
            <Alert variant="error" style={{ marginTop: 'var(--space-lg)' }}>
              {error.message}
            </Alert>
          )}
          {submitError !== null && (
            <Alert variant="error" style={{ marginTop: 'var(--space-md)' }}>
              {submitError}
            </Alert>
          )}

          {result !== null && (
            <div
              role="status"
              style={{
                marginTop: 'var(--space-lg)',
                padding: 'var(--space-lg)',
                background: COLORS.successBg,
                border: `1px solid ${COLORS.successBorder}`,
                borderRadius: 'var(--radius-lg)',
                fontSize: 'var(--text-sm)',
                color: COLORS.success,
              }}
            >
              <strong style={{ fontSize: 'var(--text-base)' }}>Minted agent #{result.tokenId}</strong>
              <br />
              <span style={{ fontSize: 'var(--text-xs)' }}>tx: </span>
              <code style={{ wordBreak: 'break-all', fontSize: 'var(--text-xs)', color: COLORS.bronzeLight }}>{result.txHash}</code>
              <br />
              <Link
                to={`/agents/${result.tokenId}`}
                style={{ display: 'inline-block', marginTop: 'var(--space-sm)', color: COLORS.bronzeLight, fontSize: 'var(--text-sm)', fontWeight: 'var(--fw-semibold)' }}
              >
                View agent #{result.tokenId} →
              </Link>
            </div>
          )}

          <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end', marginTop: 'var(--space-xl)' }}>
            <Button variant="primary" type="submit" disabled={!canSubmit}>
              {isLoading ? 'Minting…' : 'Mint agent'}
            </Button>
          </div>
        </form>
      </Card>
    </main>
  );
}

export default MintForm;
