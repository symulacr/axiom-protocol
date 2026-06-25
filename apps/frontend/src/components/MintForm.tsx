import {
  useCallback,
  useId,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAccount, useReadContracts } from 'wagmi';
import { formatEther, isHex, parseAbi, type Address } from 'viem';
import { AGENT_NFT_ABI } from '@axiom/config/abis';

const agentNftAbi = parseAbi(AGENT_NFT_ABI);
import { getAxiomAgentNftAddress } from '../abi/addresses.js';
import { useMint } from '../hooks/useMint.js';
import { COLORS, Card, Button, Alert, PageHeader, Input, ConnectedGuard } from './ui.js';

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginTop: 16,
  fontWeight: 'var(--fw-medium)',
  fontSize: 'var(--text-sm)',
  color: COLORS.textPrimary,
};

const fieldHintStyle: React.CSSProperties = {
  color: COLORS.textDim,
  fontSize: 'var(--text-xs)',
  margin: '4px 0 0',
  fontWeight: 'var(--fw-light)',
};

export type MintFormProps = {
  provider?: `0x${string}` | undefined;
};

function isOracleRelatedError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('timeout') || lower.includes('oracle');
}

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
  const { mint, cancelMint, isLoading, error, result, registrationWarning, reset } = useMint();

  const navigate = useNavigate();
  const [encryptedStrategyUri, setEncryptedStrategyUri] = useState('');
  const [sealedKey, setSealedKey] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

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
        const mintResult = await mint({
          agentNft: getAxiomAgentNftAddress(),
          encryptedStrategyUri: encryptedStrategyUri as `0x${string}`,
          sealedKey: sealedKey as `0x${string}`,
          owner,
        });
        if (mintResult) {
          toast.success(`Agent #${mintResult.tokenId} minted!`);
          setEncryptedStrategyUri('');
          setSealedKey('');
          navigate('/agents');
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
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

  return (
    <main style={{ maxWidth: '36rem' }}>
      <ConnectedGuard>
      <PageHeader title="Mint a New Agent" subtitle="Upload an encrypted strategy and mint it as an ERC-7857 iNFT" />

      <Card>
        <p style={{ color: COLORS.textMuted, fontSize: 'var(--text-sm)', lineHeight: 'var(--lh-normal)', margin: '0 0 var(--space-xl)', fontWeight: 'var(--fw-regular)' }}>
          Upload your encrypted strategy bundle to the TEE oracle, then mint the
          iNFT. The backend relays the on-chain{' '}
          <code style={{ color: COLORS.bronzeLight }}>AxiomAgentNFT.mint()</code> call
          and pays the mint fee from the backend wallet.
        </p>

        <form onSubmit={onSubmit}>
          <label htmlFor="strategy-bundle" style={labelStyle}>Encrypted Strategy Bundle</label>
          <input
            id="strategy-bundle"
            type="file"
            accept=".json,.bin"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const text = await file.text();
              try {
                const bundle = JSON.parse(text);
                if (bundle.encryptedStrategyUri) setEncryptedStrategyUri(bundle.encryptedStrategyUri);
                if (bundle.sealedKey) setSealedKey(bundle.sealedKey);
              } catch (err) {
                console.warn('[MintForm] File parse failed, treating as raw text:', err);
                setEncryptedStrategyUri(text.trim());
              }
            }}
            style={{ marginBottom: 12, color: COLORS.textMuted, fontSize: 'var(--text-sm)' }}
          />
          <p style={{ fontSize: 'var(--text-xs)', color: COLORS.textMuted, margin: '4px 0 12px 0' }}>
            Upload a strategy bundle from your TEE session, or manually enter the hex values below.
          </p>
          <details style={{ fontSize: 'var(--text-xs)', color: COLORS.textMuted, marginBottom: 12 }}>
            <summary style={{ cursor: 'pointer', color: COLORS.bronzeLight }}>How to get strategy bundle?</summary>
            <ol style={{ paddingLeft: 16, marginTop: 8, lineHeight: 'var(--lh-relaxed)' }}>
              <li>Run your AI agent strategy in a Trusted Execution Environment (TEE)</li>
              <li>The TEE outputs an encrypted strategy bundle file</li>
              <li>Upload the bundle above, or paste its hex values manually</li>
            </ol>
          </details>

          <label htmlFor={`${formId}-uri`} style={labelStyle}>
            Encrypted strategy URI / dataHash
          </label>
          <Input
            id={`${formId}-uri`}
            name="encryptedStrategyUri"
            type="text"
            value={encryptedStrategyUri}
            onChange={onUriChange}
            placeholder="0x…  (0G Storage root hash)"
            autoComplete="off"
            spellCheck={false}
            style={{ width: '100%', marginTop: 6, fontFamily: "'SF Mono', monospace", boxSizing: 'border-box' }}
            required
          />
          {uriError !== null && (
            <p role="alert" style={{ color: COLORS.danger, fontSize: 'var(--text-xs)', margin: '4px 0 0' }}>
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
          <Input
            id={`${formId}-sealed`}
            name="sealedKey"
            type="text"
            value={sealedKey}
            onChange={onSealedKeyChange}
            placeholder="0x…  (TEE-sealed encryption key)"
            autoComplete="off"
            spellCheck={false}
            style={{ width: '100%', marginTop: 6, fontFamily: "'SF Mono', monospace", boxSizing: 'border-box' }}
            required
          />
          {sealedKeyError !== null && (
            <p role="alert" style={{ color: COLORS.danger, fontSize: 'var(--text-xs)', margin: '4px 0 0' }}>
              {sealedKeyError}
            </p>
          )}
          <p style={fieldHintStyle}>
            The TEE-sealed encryption key from the oracle upload step.
          </p>

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
              {isOracleRelatedError(error.message) && (
                <p style={{ fontSize: 'var(--text-xs)', marginTop: 6, opacity: 0.85 }}>
                  This may be related to oracle connectivity. Ensure your TEE oracle service is running and reachable.
                </p>
              )}
            </Alert>
          )}
          {submitError !== null && (
            <Alert variant="error" style={{ marginTop: 'var(--space-md)' }}>
              {submitError}
              {isOracleRelatedError(submitError) && (
                <p style={{ fontSize: 'var(--text-xs)', marginTop: 6, opacity: 0.85 }}>
                  This may be related to oracle connectivity. Ensure your TEE oracle service is running and reachable.
                </p>
              )}
            </Alert>
          )}

          {result !== null && (
            <Alert variant="success" style={{ marginTop: 'var(--space-lg)' }}>
              <strong>Minted agent #{result.tokenId}</strong>
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
              {registrationWarning !== null && (
                <p style={{ fontSize: 'var(--text-xs)', color: COLORS.textMuted, marginTop: 8 }}>
                  {registrationWarning}
                </p>
              )}
            </Alert>
          )}

          <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end', marginTop: 'var(--space-xl)' }}>
            <Button variant="primary" type="submit" disabled={!canSubmit}>
              {isLoading ? 'Minting…' : 'Mint agent'}
            </Button>
            {isLoading && (
              <button type="button" onClick={cancelMint}
                style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', background: 'transparent',
                  border: `1px solid ${COLORS.textDim}`, color: COLORS.text, cursor: 'pointer' }}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </Card>
      </ConnectedGuard>
    </main>
  );
}

export default MintForm;
