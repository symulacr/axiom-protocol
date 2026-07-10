import type { Wallet } from "ethers";
import { getBroker } from "./broker.js";
import { createLogger } from "../utils/logger.js";
import { extractErrorMessage } from "../utils/response.js";

const log = createLogger("tee-verifier");

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
