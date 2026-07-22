import { FetchRequest, JsonRpcProvider } from "ethers";
import { ARISTOTLE_CHAIN_ID } from "@axiom/config/networks";

export function resolveChainId(chainId?: number): number {
  if (chainId !== undefined) return chainId;
  const env = Number(process.env.AXIOM_CHAIN_ID);
  return Number.isFinite(env) && env > 0 ? env : ARISTOTLE_CHAIN_ID;
}

export function createStaticProvider(
  evmRpc: string,
  chainId?: number,
  opts?: { timeoutMs?: number },
): JsonRpcProvider {
  const cid = resolveChainId(chainId);
  if (opts?.timeoutMs !== undefined) {
    const fetchReq = new FetchRequest(evmRpc);
    fetchReq.timeout = opts.timeoutMs;
    return new JsonRpcProvider(fetchReq, cid, { staticNetwork: true });
  }
  return new JsonRpcProvider(evmRpc, cid, { staticNetwork: true });
}

