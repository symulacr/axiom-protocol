import { JsonRpcProvider, FetchRequest } from 'ethers';
import { getEnv } from '@axiom/config/env';

let _provider: JsonRpcProvider | null = null;

export function getSharedProvider(): JsonRpcProvider {
  if (!_provider) {
    const rpcUrl = getEnv('AXIOM_EVM_RPC', 'https://evmrpc-testnet.0g.ai');
    const fetchReq = new FetchRequest(rpcUrl);
    fetchReq.timeout = 10_000;
    _provider = new JsonRpcProvider(fetchReq, undefined, { staticNetwork: true });
  }
  return _provider;
}
