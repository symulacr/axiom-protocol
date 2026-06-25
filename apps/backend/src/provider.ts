import { JsonRpcProvider, FetchRequest } from 'ethers';
import { resolveRpcUrl } from "@axiom/config/networks";

let _provider: JsonRpcProvider | null = null;

export function getSharedProvider(chainId?: number): JsonRpcProvider {
  if (!_provider) {
    const rpcUrl = resolveRpcUrl(chainId);
    const fetchReq = new FetchRequest(rpcUrl);
    fetchReq.timeout = 10_000;
    _provider = new JsonRpcProvider(fetchReq, undefined, { staticNetwork: true });
  }
  return _provider;
}
