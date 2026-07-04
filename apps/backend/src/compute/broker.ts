// Shared broker factory for the 0G Compute SDK.
//
// Centralises the three patterns our code needs:
//   1. ReadOnly broker — list services, resolve provider URLs (no wallet).
//   2. Authenticated broker — request headers, auto-funding, TEE verification.
//   3. Per-chain-id instance caching to avoid re-initialisation on every tick.
//
// All workarounds for missing SDK features (custom token decoders, manual
// depositFund/transferFund loops, hand-rolled JsonRpcProvider setup) belong
// here. Callers should not import the underlying SDK directly.
import { JsonRpcProvider, Wallet } from "ethers";
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

const log = createLogger("compute-broker");

export interface BrokerConfig {
  evmRpc: string;
  chainId?: number;
  signer: Wallet;
}

/** Resolve the 0G chain id from explicit config or env (defaults to Galileo). */
export function resolveChainId(chainId?: number): number {
  if (chainId !== undefined) return chainId;
  const env = Number(process.env.AXIOM_CHAIN_ID);
  return Number.isFinite(env) && env > 0 ? env : GALILEO_CHAIN_ID;
}

/** Pull the EVM RPC URL from explicit config or env (falls back to the network's default). */
export function resolveEvmRpc(chainId?: number): string {
  if (process.env.AXIOM_EVM_RPC) return process.env.AXIOM_EVM_RPC;
  const network = pickOGNetwork(resolveChainId(chainId));
  return network?.evmRpc ?? "https://evmrpc-testnet.0g.ai";
}

/** Static factory for a one-shot JsonRpcProvider + Wallet pair. */
export function createProviderAndSigner(
  config: Pick<BrokerConfig, "evmRpc" | "chainId" | "signer">,
): {
  provider: JsonRpcProvider;
  signer: Wallet;
} {
  const chainId = resolveChainId(config.chainId);
  const provider = new JsonRpcProvider(config.evmRpc, chainId, {
    staticNetwork: true,
  });
  return { provider, signer: config.signer.connect(provider) as Wallet };
}

// --- Read-only broker cache (per chain id) ---

const _readOnlyCache = new Map<number, ReadOnlyInferenceBroker>();

/** Get (or lazily create) a read-only inference broker for the given chain id. */
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

// --- Authenticated broker cache (per chain id) ---

const _brokerCache = new Map<number, ZGComputeNetworkBroker>();

/** Get (or lazily create) an authenticated broker that can fund, sign and verify. */
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

// --- Contract address helpers ---

/** SDK's contract address set for the given chain id, falling back to testnet. */
export function getContractAddressesForChain(chainId: number): {
  ledger: string;
  inference: string;
  fineTuning: string;
} {
  if (chainId === Number(MAINNET_CHAIN_ID)) return CONTRACT_ADDRESSES.mainnet;
  if (chainId === Number(HARDHAT_CHAIN_ID)) return CONTRACT_ADDRESSES.hardhat;
  if (chainId === GALILEO_CHAIN_ID) return CONTRACT_ADDRESSES.testnet;
  // Unknown chain — keep behaviour parity with the previous tee-verifier path.
  return CONTRACT_ADDRESSES.testnet;
}

/**
 * Best-effort auto-funding for a single provider. The SDK handles both the
 * sub-account bootstrap and the background funding loop, so callers do not
 * need to manage `depositFund` + `transferFund` or check `acknowledged` themselves.
 *
 * Returns `true` once the background funding timer is started; `false` if the
 * preconditions (signer, deposit amount) are not met. Errors are downgraded
 * to warnings so a Direct-mode failure never blocks a Router-mode request.
 */
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
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/** Stop background auto-funding timers for one provider (or all when omitted). */
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
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
