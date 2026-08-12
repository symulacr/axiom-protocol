import { ethers } from "ethers";
import { getSharedProvider } from "../../provider.js";

const ZERO_ROOT = `0x${"0".repeat(64)}` as const;

const VAULT_ABI = [
  "function balanceOf(uint256) view returns (uint256)",
  "function strategyOf(uint256) view returns (bytes32, uint256, uint256, uint64, uint64)",
  "function strategyOf(uint256) view returns (bytes32, uint256, uint256, uint64)",
] as const;

interface TickReadyState {
  ready: boolean;
  balance: bigint;
  strategyRoot: string | null;
}

export async function probeTickReady(
  vault: string,
  tokenId: string,
): Promise<TickReadyState> {
  const provider = getSharedProvider();
  const contract = new ethers.Contract(vault, VAULT_ABI, provider);
  const id = BigInt(tokenId);
  let balance: bigint;
  let strategyRoot: string | null;
  try {
    balance = (await contract.getFunction("balanceOf")(id)) as bigint;
  } catch {
    return { ready: false, balance: 0n, strategyRoot: null };
  }
  try {
    const current = (await contract.getFunction("strategyOf")(id)) as [
      string,
      bigint,
      bigint,
      bigint,
      bigint,
    ];
    strategyRoot = current[0] ?? null;
  } catch {
    try {
      const legacy = (await contract.getFunction("strategyOf")(id)) as [
        string,
        bigint,
        bigint,
        bigint,
      ];
      strategyRoot = legacy[0] ?? null;
    } catch {
      strategyRoot = null;
    }
  }
  const ready =
    balance > 0n &&
    !!strategyRoot &&
    strategyRoot !== ZERO_ROOT;
  return { ready, balance, strategyRoot };
}

export function benchSkipsOrchestrateWhenNotReady(liveCompute: boolean): boolean {
  return !liveCompute;
}