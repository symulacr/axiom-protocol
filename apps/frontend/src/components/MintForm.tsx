// Axiom Protocol — `MintForm` component.
//
// Form that mints a new iNFT agent through the backend `POST /v1/agents/mint`
// endpoint. The user supplies the encrypted strategy URI (the 0G Storage
// root hash / iNFT `dataHash`) and the TEE-sealed encryption key; the owner
// is auto-filled from the connected wallet (read-only). The on-chain mint
// fee is read live from `AxiomAgentNFT.mintFee()` via wagmi v2
// `useReadContracts` so the user sees the exact native-token cost before
// submitting.
//
// The backend wallet signs the on-chain `mint()` call — the frontend does
// NOT use `useWriteContract` for mint (unlike the transfer flow). The hook
// `useMint` is the thin fetch client.
//
// UI states:
//   - !isConnected          → "Connect wallet to mint an agent".
//   - connected, idle       → editable form with live mint-fee display.
//   - loading               → submit button disabled, "Minting…".
//   - error                 → red alert with the backend error message.
//   - success               → green panel: tokenId + tx hash + link to
//                              `/agents/:tokenId`.
//
// Canonical references:
//  - wagmi v2 `useReadContracts` (multicall, isLoading, data):
//    https://wagmi.sh/react/hooks/useReadContracts
//  - wagmi v2 `useAccount` (isConnected, address):
//    https://wagmi.sh/react/hooks/useAccount
//  - viem `formatEther` (wei → ETH string for the fee display):
//    https://viem.sh/docs/utilities/formatEther
//  - viem `isHex` (validate 0x-prefixed inputs):
//    https://viem.sh/docs/utilities/isHex
//  - React Router v6+ `<Link>` (SPA navigation to the new agent):
//    https://reactrouter.com/en/main/components/link
//  - EIP-721 mint + EIP-7857 iNFT dataHash / sealedKey:
//    https://eips.ethereum.org/EIPS/eip-721
//    https://eips.ethereum.org/EIPS/eip-7857

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
import { COLORS, Card, Button, Alert, PageHeader, SectionTitle, MonoLabel, Skeleton } from './ui.js';

/**
 * Minimal read-only ABI fragment for `AxiomAgentNFT.mintFee()`. The shared
 * `AxiomAgentNFT.json` only carries the EIP-721 + EIP-7857 getters consumed
 * elsewhere; `mintFee` is a Wave-3 admin-set view function (see
 * `apps/contracts/src/AxiomAgentNFT.sol:178`) and is defined locally here so
 * the shared ABI file stays untouched for the other Wave-4 agents.
 *
 * wagmi v2 accepts a partial ABI array for `useReadContracts` and infers the
 * return type from the fragment — `bigint` for `uint256`.
 *   https://wagmi.sh/react/typescript#const-assert-abis-typed-data
 */
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
  /** Optional provider address pre-fill (?provider=0x…). Kept for the
   * page wrapper to thread through; not directly rendered as a field. */
  provider?: `0x${string}` | undefined;
};

/**
 * Validate a 0x-prefixed hex input. Returns `null` when valid (non-empty and
 * hex-shaped), otherwise a human-readable error string.
 */
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

  const [dataDescription, setDataDescription] = useState('');
  const [encryptedStrategyUri, setEncryptedStrategyUri] = useState('');
  const [sealedKey, setSealedKey] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Live mint-fee read. `useReadContracts` infers `bigint` from the
  // `uint256` output; we only enable the query once the contract address
  // is known (always true for the deployed Galileo proxy, but the guard
  // keeps wagmi's type inference happy and avoids a stray call in tests).
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
        // The hook surfaces the error via `error`; keep this branch for
        // the rare synchronous throw.
        setSubmitError(err instanceof Error ? err.message : String(err));
      }
    },
    [canSubmit, encryptedStrategyUri, isLoading, mint, owner, sealedKey],
  );

  const onDescriptionChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      setDataDescription(event.target.value);
    },
    [],
  );
  const onUriChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      setEncryptedStrategyUri(event.target.value);
      // Clear a prior success/error when the user edits after minting.
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
        <Card style={{ textAlign: 'center', padding: 48 }}>
          <p style={{ color: COLORS.textMuted, fontSize: 15, margin: 0, fontWeight: 300 }}>
            Connect your wallet to mint an iNFT agent.
          </p>
        </Card>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 580 }}>
      <PageHeader title="Mint a New Agent" subtitle="Upload an encrypted strategy and mint it as an ERC-7857 iNFT" />

      <Card>
        <p style={{ color: COLORS.textMuted, fontSize: 13, lineHeight: 1.65, margin: '0 0 20px', fontWeight: 300 }}>
          Upload your encrypted strategy bundle to the TEE oracle, then mint the
          iNFT. The backend relays the on-chain{' '}
          <code style={{ color: COLORS.bronzeLight }}>AxiomAgentNFT.mint()</code> call
          and pays the mint fee from the backend wallet.
        </p>

        <form onSubmit={onSubmit}>
          <label htmlFor={`${formId}-desc`} style={labelStyle}>
            Strategy description <span style={{ color: COLORS.textDim, fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            id={`${formId}-desc`}
            name="dataDescription"
            type="text"
            value={dataDescription}
            onChange={onDescriptionChange}
            placeholder="e.g. Mean-reversion on 0G OG/USDC"
            autoComplete="off"
            style={{ ...inputStyle, fontFamily: 'inherit' }}
          />
          <p style={fieldHintStyle}>
            Stored as the iNFT <code style={{ color: COLORS.bronzeLight }}>dataDescription</code>.
            Defaults to "Axiom strategy bundle" when blank.
          </p>

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

          <div style={{ marginTop: 16, padding: '12px 16px', background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 13 }}>
            <span style={{ fontWeight: 500, color: COLORS.textPrimary }}>Mint fee: </span>
            {feeError !== null ? (
              <span style={{ color: COLORS.danger }}>
                unavailable ({feeError.message})
              </span>
            ) : mintFeeWei === undefined ? (
              <span style={{ color: COLORS.textMuted }}>loading…</span>
            ) : (
              <span style={{ fontFamily: "'SF Mono', monospace", color: COLORS.bronzeLight, fontWeight: 600 }}>
                {formatEther(mintFeeWei)} OG
              </span>
            )}
            {provider !== undefined && (
              <span style={{ color: COLORS.textDim, marginLeft: 12, fontSize: 12 }}>
                provider: {provider.slice(0, 10)}…
              </span>
            )}
          </div>

          {error !== null && (
            <Alert variant="error" style={{ marginTop: 16 }}>
              {error.message}
            </Alert>
          )}
          {submitError !== null && (
            <Alert variant="error" style={{ marginTop: 12 }}>
              {submitError}
            </Alert>
          )}

          {result !== null && (
            <div
              role="status"
              style={{
                marginTop: 16,
                padding: '16px',
                background: COLORS.successBg,
                border: `1px solid ${COLORS.successBorder}`,
                borderRadius: 8,
                fontSize: 14,
                color: COLORS.success,
              }}
            >
              <strong style={{ fontSize: 15 }}>Minted agent #{result.tokenId}</strong>
              <br />
              <span style={{ fontSize: 12 }}>tx: </span>
              <code style={{ wordBreak: 'break-all', fontSize: 12, color: COLORS.bronzeLight }}>{result.txHash}</code>
              <br />
              <Link
                to={`/agents/${result.tokenId}`}
                style={{ display: 'inline-block', marginTop: 10, color: COLORS.bronzeLight, fontSize: 14, fontWeight: 600 }}
              >
                View agent #{result.tokenId} →
              </Link>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
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
