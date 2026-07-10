import { FetchRequest, JsonRpcProvider, Wallet } from "ethers";
import {
  CONTRACT_ADDRESSES,
  createReadOnlyInferenceBroker,
  createZGComputeNetworkBroker,
  HARDHAT_CHAIN_ID,
  MAINNET_CHAIN_ID,
  type ReadOnlyInferenceBroker,
  type ZGComputeNetworkBroker,
} from "@0gfoundation/0g-compute-ts-sdk";
import { GALILEO_CHAIN_ID, pickOGNetwork } from "@axiom/config/networks";
import { createLogger } from "../utils/logger.js";
import { extractErrorMessage } from "../utils/response.js";

const log = createLogger("compute-broker");

export interface BrokerConfig {
  evmRpc: string;
  chainId?: number;
  signer: Wallet;
}

export function resolveChainId(chainId?: number): number {
  if (chainId !== undefined) return chainId;
  const env = Number(process.env.AXIOM_CHAIN_ID);
  return Number.isFinite(env) && env > 0 ? env : GALILEO_CHAIN_ID;
}

export function resolveEvmRpc(chainId?: number): string {
  if (process.env.AXIOM_EVM_RPC) return process.env.AXIOM_EVM_RPC;
  const network = pickOGNetwork(resolveChainId(chainId));
  return network?.evmRpc ?? "https://evmrpc-testnet.0g.ai";
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

export function createProviderAndSigner(
  config: Pick<BrokerConfig, "evmRpc" | "chainId" | "signer">,
): {
  provider: JsonRpcProvider;
  signer: Wallet;
} {
  const provider = createStaticProvider(config.evmRpc, config.chainId);
  return { provider, signer: config.signer.connect(provider) as Wallet };
}


const _readOnlyCache = new Map<number, ReadOnlyInferenceBroker>();

export async function getReadOnlyBroker(
  rpcUrl: string,
  chainId?: number,
): Promise<ReadOnlyInferenceBroker> {
  const cid = resolveChainId(chainId);
  const cached = _readOnlyCache.get(cid);
  if (cached) return cached;
  const broker = await createReadOnlyInferenceBroker(rpcUrl, cid);
  _readOnlyCache.set(cid, broker);
  return broker;
}


const _brokerCache = new Map<number, ZGComputeNetworkBroker>();

export function clearBrokerCache(chainId?: number): void {
  if (chainId !== undefined) {
    _readOnlyCache.delete(chainId);
    _brokerCache.delete(chainId);
  } else {
    _readOnlyCache.clear();
    _brokerCache.clear();
  }
}

export async function getBroker(
  signer: Wallet,
  chainId?: number,
): Promise<ZGComputeNetworkBroker> {
  const cid = resolveChainId(chainId);
  const cached = _brokerCache.get(cid);
  if (cached) return cached;
  const broker = await createZGComputeNetworkBroker(signer);
  _brokerCache.set(cid, broker);
  return broker;
}


export function getContractAddressesForChain(chainId: number): {
  ledger: string;
  inference: string;
  fineTuning: string;
} {
  if (chainId === Number(MAINNET_CHAIN_ID)) return CONTRACT_ADDRESSES.mainnet;
  if (chainId === Number(HARDHAT_CHAIN_ID)) return CONTRACT_ADDRESSES.hardhat;
  if (chainId === GALILEO_CHAIN_ID) return CONTRACT_ADDRESSES.testnet;
  return CONTRACT_ADDRESSES.testnet;
}

export async function ensureProviderFunded(
  providerAddress: string,
  signer: Wallet,
  chainId?: number,
): Promise<boolean> {
  const raw = process.env.AXIOM_COMPUTE_DEPOSIT_AMOUNT;
  if (raw === undefined) return false;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) return false;

  try {
    const broker = await getBroker(signer, chainId);
    await broker.inference.startAutoFunding(providerAddress);
    log.info("Auto-funding started", { provider: providerAddress, amount });
    return true;
  } catch (err) {
    log.warn("Auto-funding failed", {
      provider: providerAddress,
      error: extractErrorMessage(err),
    });
    return false;
  }
}

export async function stopAutoFunding(
  signer: Wallet,
  chainId?: number,
  provider?: string,
): Promise<void> {
  try {
    const broker = await getBroker(signer, chainId);
    broker.inference.stopAutoFunding(provider);
  } catch (err) {
    log.warn("Stop auto-funding failed", {
      error: extractErrorMessage(err),
    });
  }
}
