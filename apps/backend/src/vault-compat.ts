import { Contract, type Provider } from "ethers";
import { VAULT_ABI, VAULT_ABI_LEGACY } from "@axiom/config/abis";

export type VaultAbiVariant = "legacy" | "current";

const variantCache = new Map<string, VaultAbiVariant>();

const STRATEGY_OF_CURRENT = [
  "function strategyOf(uint256) view returns (bytes32, uint256, uint256, uint64, uint64)",
] as const;

const STRATEGY_OF_LEGACY = [
  "function strategyOf(uint256) view returns (bytes32, uint256, uint256, uint64)",
] as const;

export async function detectVaultAbiVariant(
  provider: Provider,
  vaultAddress: string,
): Promise<VaultAbiVariant> {
  const key = vaultAddress.toLowerCase();
  const cached = variantCache.get(key);
  if (cached) return cached;

  const currentProbe = new Contract(vaultAddress, STRATEGY_OF_CURRENT, provider);
  const currentStrategyOf = currentProbe.getFunction("strategyOf");
  try {
    await currentStrategyOf.staticCall(0n);
    variantCache.set(key, "current");
    return "current";
  } catch {
    const legacyProbe = new Contract(vaultAddress, STRATEGY_OF_LEGACY, provider);
    await legacyProbe.getFunction("strategyOf").staticCall(0n);
    variantCache.set(key, "legacy");
    return "legacy";
  }
}

export function vaultAbiFor(
  variant: VaultAbiVariant,
): typeof VAULT_ABI | typeof VAULT_ABI_LEGACY {
  return variant === "legacy" ? VAULT_ABI_LEGACY : VAULT_ABI;
}

export interface VaultStrategyState {
  root: string;
  dailyLimit: bigint;
  validUntilDay: bigint;
}

export async function readVaultStrategy(
  provider: Provider,
  vaultAddress: string,
  tokenId: bigint,
): Promise<VaultStrategyState> {
  const variant = await detectVaultAbiVariant(provider, vaultAddress);
  if (variant === "legacy") {
    const vault = new Contract(vaultAddress, STRATEGY_OF_LEGACY, provider);
    const [root, dailyLimit] = await vault.getFunction("strategyOf")(tokenId);
    return { root, dailyLimit, validUntilDay: 0n };
  }
  const vault = new Contract(vaultAddress, STRATEGY_OF_CURRENT, provider);
  const [root, dailyLimit, , , validUntilDay] = await vault
    .getFunction("strategyOf")(tokenId);
  return { root, dailyLimit, validUntilDay };
}