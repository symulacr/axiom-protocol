// Thin wrapper around the 0G Compute SDK's `InferenceBroker.processResponse`.
//
// In Direct mode the SDK's `processResponse` verifies the provider's TEE
// signature against the chat content (when a chat ID is available) and
// caches the fee estimate for the next `getRequestHeaders` call. The Router
// path performs TEE verification server-side, so this hook is a no-op
// there. Gated by `AXIOM_COMPUTE_VERIFY_TEE === "true"` in the orchestrator
// and intentionally best-effort — never blocks the tick.
import type { Wallet } from "ethers";
import { getBroker } from "./broker.js";
import { createLogger } from "../utils/logger.js";
import { extractErrorMessage } from "../utils/response.js";

const log = createLogger("tee-verifier");

/**
 * Verify a compute response by calling the SDK's `processResponse`.
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
    const broker = await getBroker(signer, chainId);
    const result = await broker.inference.processResponse(
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
      error: extractErrorMessage(err),
    });
    return null;
  }
}
