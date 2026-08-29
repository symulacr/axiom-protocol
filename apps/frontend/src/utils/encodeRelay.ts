// Shared encode-relay sender: POST the encode endpoint, then push the returned
// calldata through the connected wallet. Used by useVaultWrite (deposit/withdraw),
// AgentPage set-strategy, and useMintWizard — one place that owns the
// `BigInt(encoded.value || "0")` + chain attachment convention.
import type { EncodeResponse } from "../utils/apiFetch.js";
import { apiFetch } from "../utils/apiFetch.js";
import type { Chain } from "viem";

type WalletClientLike = {
  sendTransaction: (tx: {
    to: `0x${string}`;
    data: `0x${string}`;
    value: bigint;
    chain?: Chain | null;
  }) => Promise<`0x${string}`>;
  chain?: Chain | null;
};

/** Send a backend-provided encode response through the wallet and return the tx hash. */
export async function sendEncodedTransaction(
  walletClient: WalletClientLike,
  encoded: EncodeResponse,
): Promise<`0x${string}`> {
  return walletClient.sendTransaction({
    to: encoded.to,
    data: encoded.data,
    value: BigInt(encoded.value || "0"),
    chain: (walletClient as { chain?: Chain | null }).chain,
  });
}

/** Full relay: fetch the encode endpoint, then send through the wallet. */
export async function encodeRelayTransaction(
  walletClient: WalletClientLike,
  path: string,
  body: Record<string, unknown>,
): Promise<`0x${string}`> {
  const encoded = await apiFetch<EncodeResponse>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return sendEncodedTransaction(walletClient, encoded);
}
