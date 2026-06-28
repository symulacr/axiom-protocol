import {
  CONTRACT_ADDRESSES,
  TESTNET_CHAIN_ID,
  MAINNET_CHAIN_ID,
  HARDHAT_CHAIN_ID,
  createLedgerBroker,
  createInferenceBroker,
  type InferenceBroker,
} from "@0gfoundation/0g-compute-ts-sdk";
import type { Wallet } from "ethers";
import { createLogger } from "../utils/logger.js";

const log = createLogger("tee-verifier");

/** SDK contract address set for a given network. */
type ContractAddresses = {
  readonly ledger: string;
  readonly inference: string;
  readonly fineTuning: string;
};

function getContractAddresses(chainId: number): ContractAddresses {
  if (chainId === Number(MAINNET_CHAIN_ID)) return CONTRACT_ADDRESSES.mainnet;
  if (chainId === Number(HARDHAT_CHAIN_ID)) return CONTRACT_ADDRESSES.hardhat;
  return CONTRACT_ADDRESSES.testnet; // Galileo testnet (16602) and unknown → testnet
}

// Cache broker per chain ID to avoid re-initializing on every tick.
const _brokerCache = new Map<number, InferenceBroker>();

/**
 * Verify a compute response by calling the SDK's `processResponse`.
 *
 * Checks the provider's TEE signature against the response content when a
 * chat ID is available. When no chat ID is provided, the SDK skips the
 * verifiability check and only caches the fee estimate. This is safe —
 * verification is best-effort and never blocks the tick.
 *
 * @param chainId  - EIP-155 chain ID (16602=Galileo, 16661=Aristotle …).
 * @param signer   - Ethers Wallet used to initialize the broker.
 * @param providerAddress - On-chain provider address.
 * @param content  - The full LLM response text (used for fee estimation).
 * @param chatId   - Optional chat ID from the provider's response headers.
 * @returns `true`  – response verified against TEE signer;
 *          `false` – service not verifiable or verification failed;
 *          `null`  – skipped (no chat ID, init error, or unsupported chain).
 */
export async function verifyTeeResponse(
  chainId: number,
  signer: Wallet,
  providerAddress: string,
  content: string,
  chatId?: string,
): Promise<boolean | null> {
  try {
    let broker = _brokerCache.get(chainId);
    if (!broker) {
      const addrs = getContractAddresses(chainId);
      const ledger = await createLedgerBroker(
        signer,
        addrs.ledger,
        addrs.inference,
        addrs.fineTuning,
      );
      broker = await createInferenceBroker(signer, addrs.inference, ledger);
      _brokerCache.set(chainId, broker);
    }

    const result = await broker.processResponse(
      providerAddress,
      chatId,
      content,
    );
    log.info("TEE processResponse completed", {
      providerAddress,
      chatId: chatId ?? "(none)",
      result,
    });
    return result;
  } catch (err) {
    log.warn("TEE verification error", {
      providerAddress,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
