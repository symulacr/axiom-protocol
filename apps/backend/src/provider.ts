import { JsonRpcProvider, FetchRequest } from "ethers";
import { resolveRpcUrl } from "@axiom/config/networks";

// Cache keyed by resolved RPC URL so per-chain lookups (e.g. resolveModelDataRoot)
// get distinct providers instead of the first chain's provider forever.
const providers = new Map<string, JsonRpcProvider>();

export function getSharedProvider(chainId?: number): JsonRpcProvider {
  const rpcUrl = resolveRpcUrl(chainId);
  let provider = providers.get(rpcUrl);
  if (!provider) {
    const fetchReq = new FetchRequest(rpcUrl);
    fetchReq.timeout = 10_000;
    provider = new JsonRpcProvider(fetchReq, undefined, {
      staticNetwork: true,
    });
    providers.set(rpcUrl, provider);
  }
  return provider;
}
