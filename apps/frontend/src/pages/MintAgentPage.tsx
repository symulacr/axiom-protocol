// Axiom Protocol — mint page (`/agents/new` route).
//
// Thin wrapper around `MintForm`. Reads an optional `?provider=0x…` query
// param from `ProviderCard`'s "Use this provider" button.

import type { ReactElement } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getAddress, isAddress } from 'viem';

import { MintForm } from '../components/MintForm.js';

export function MintAgentPage(): ReactElement {
  const [searchParams] = useSearchParams();
  const rawProvider = searchParams.get('provider') ?? undefined;

  // Only accept the provider param if it's a valid address; otherwise drop
  // it silently rather than rendering a broken hint.
  const provider: `0x${string}` | undefined =
    rawProvider !== undefined && isAddress(rawProvider)
      ? (getAddress(rawProvider) as `0x${string}`)
      : undefined;

  return <MintForm provider={provider} />;
}

export default MintAgentPage;
