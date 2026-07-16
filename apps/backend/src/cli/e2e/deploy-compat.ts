import { Contract, type Provider } from "ethers";

const probeCache = new Map<string, boolean>();

function cacheKey(address: string, signature: string): string {
  return `${address.toLowerCase()}::${signature}`;
}

export async function hasContractFunction(
  provider: Provider,
  address: string,
  signature: string,
  args: readonly unknown[] = [],
): Promise<boolean> {
  const key = cacheKey(address, signature);
  const cached = probeCache.get(key);
  if (cached !== undefined) return cached;

  const fn = signature.match(/function\s+(\w+)/)?.[1];
  if (!fn) throw new Error(`deploy-compat: invalid signature ${signature}`);

  const contract = new Contract(address, [signature], provider);
  try {
    await contract.getFunction(fn).staticCall(...args);
    probeCache.set(key, true);
    return true;
  } catch {
    probeCache.set(key, false);
    return false;
  }
}

export const LEGACY_DEPLOY_REASON = "legacy Wave E-6 deploy (function absent)";