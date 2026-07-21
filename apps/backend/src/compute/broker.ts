import { FetchRequest, JsonRpcProvider, Wallet } from "ethers";
import {
  createReadOnlyInferenceBroker,
  createZGComputeNetworkBroker,
  type ReadOnlyInferenceBroker,
  type ZGComputeNetworkBroker,
} from "@0gfoundation/0g-compute-ts-sdk";
import { ARISTOTLE_CHAIN_ID } from "@axiom/config/networks";
import { createLogger } from "../utils/logger.js";
import { extractErrorMessage } from "../utils/response.js";

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

const _readOnlyCache = new Map<number, ReadOnlyInferenceBroker>();

export async function getReadOnlyBroker(
  rpcUrl: string,
  chainId?: number,
): Promise<ReadOnlyInferenceBroker> {
  const cid = resolveChainId(chainId);
  const cached = _readOnlyCache.get(cid);
  if (cached) return cached;
  const broker = await createReadOnlyInferenceBroker({ rpcUrl, networkId: cid });
  _readOnlyCache.set(cid, broker);
  return broker;
}



const _brokerCache = new Map<number, ZGComputeNetworkBroker>();

export async function getBroker(
  signer: Wallet,
  chainId?: number,
): Promise<ZGComputeNetworkBroker> {
  const cid = resolveChainId(chainId);
  const cached = _brokerCache.get(cid);
  if (cached) return cached;
  const broker = await createZGComputeNetworkBroker(signer, { networkId: cid, skipAttestation: true });
  _brokerCache.set(cid, broker);
  return broker;
}

const teeLog = createLogger("tee-verifier");

export async function verifyTeeResponse(
  chainId: number,
  signer: Wallet,
  providerAddress: string,
  content: string,
  chatId?: string,
): Promise<boolean | null> {
  try {
    const broker = await getBroker(signer, chainId);
    // v1.4: processResponse → responseProcessor.process (old processResponse still works but deprecated)
    const result = await broker.inference.responseProcessor.process(
      providerAddress,
      chatId,
      content,
    );
    teeLog.info("TEE processResponse completed", {
      providerAddress,
      chatId: chatId ?? "(none)",
      result,
    });
    return result;
  } catch (err) {
    teeLog.warn("TEE verification error", {
      providerAddress,
      error: extractErrorMessage(err),
    });
    return null;
  }
}
