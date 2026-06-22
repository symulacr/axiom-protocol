// Axiom Protocol — mint page (`/agents/new` route).
//
// Thin page wrapper around `MintForm`. Reads an optional `?provider=0x…`
// query param (emitted by `ProviderCard`'s "Use this provider" button) and
// threads it through to the form as a pre-fill hint.
//
// Route ordering note: in `App.tsx` this route is declared BEFORE
// `/agents/:tokenId` so React Router v6+ matches the literal `new` segment
// rather than treating it as a tokenId. See:
//   https://reactrouter.com/en/main/route/route#dynamic-segments
//
// Canonical references:
//  - React Router v6+ `useSearchParams` (read ?provider=0x…):
//    https://reactrouter.com/en/main/hooks/use-search-params
//  - viem `getAddress` (EIP-55 checksum the provider param if present):
//    https://viem.sh/docs/utilities/getAddress

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
