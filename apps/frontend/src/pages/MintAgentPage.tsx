import type { ReactElement } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getAddress, isAddress } from 'viem';

import { MintForm } from '../components/MintForm.js';

export function MintAgentPage(): ReactElement {
  const [searchParams] = useSearchParams();
  const rawProvider = searchParams.get('provider') ?? undefined;

  const provider: `0x${string}` | undefined =
    rawProvider !== undefined && isAddress(rawProvider)
      ? (getAddress(rawProvider) as `0x${string}`)
      : undefined;

  return <MintForm provider={provider} />;
}

export default MintAgentPage;
