import OpenAI from "openai";
import { JsonRpcProvider, Wallet } from "ethers";
import { createZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";
import { pickOGNetwork, GALILEO_CHAIN_ID } from "@axiom/config/networks";
import { resolveProviderUrl, acknowledgeProviderSigner } from "./provider-discovery.js";
import { createLogger } from "../utils/logger.js";

/**
 * Resolve the 0G Compute Router base URL.
 *
 * Precedence:
 *   1. `OG_COMPUTE_BASE_URL` env var (explicit override)
 *   2. Network-specific URL from pickOGNetwork()
 *   3. Galileo testnet fallback
 */
export function getComputeBaseUrl(): string {
  const explicit = process.env.OG_COMPUTE_BASE_URL;
  if (explicit) return explicit;
  const chainId = Number(process.env.AXIOM_CHAIN_ID) || GALILEO_CHAIN_ID;
  const network = pickOGNetwork(chainId);
  return network?.computeRouterUrl ?? "https://router-api-testnet.integratenetwork.work/v1";
}

function decodeDirectKeyToken(token: string): { provider: string; address: string } | null {
  if (!token.startsWith("app-sk-")) return null;
  const b64 = token.slice("app-sk-".length);
  try {
    const decoded = Buffer.from(b64, "base64").toString("utf-8");
    // Format: JSON payload || "|" || hex signature
    const pipeIdx = decoded.lastIndexOf("|");
    if (pipeIdx === -1) return null;
    const payload = JSON.parse(decoded.slice(0, pipeIdx));
    // Field normalization for SDK format variation
    const provider: string | undefined = payload.provider ?? payload.providerAddress;
    const address: string | undefined = payload.address ?? payload.user;
    if (!provider) return null;
    return { provider, address: address ?? "" };
  } catch {
    return null;
  }
}


const log = createLogger("compute");
const NEURON_PER_0G = 10n ** 18n;

/**
 * Fund the compute ledger for direct provider access.
 *
 * 1. Deposits `AXIOM_COMPUTE_DEPOSIT_AMOUNT` 0G (default 0.01) into the user's ledger.
 * 2. Transfers the equivalent amount to the provider's inference sub-account.
 * 3. Acknowledges the provider signer so billing headers can be generated.
 *
 * Gated by the `AXIOM_COMPUTE_DEPOSIT_AMOUNT` env var. When unset, funding is skipped
 * entirely so the Router API path remains the primary path.
 */
async function fundComputeAccount(providerAddress: string): Promise<void> {
  const raw = process.env.AXIOM_COMPUTE_DEPOSIT_AMOUNT;
  if (raw === undefined) return; // Feature flag: not set → skip funding
  const amount = Number(raw);
  if (amount <= 0) return;

  const rpcUrl = process.env.AXIOM_EVM_RPC ?? "https://evmrpc-testnet.0g.ai";
  const chainId = Number(process.env.AXIOM_CHAIN_ID) || GALILEO_CHAIN_ID;
  const pk = process.env.DEPLOYER_PK;
  if (!pk) {
    log.warn("DEPLOYER_PK not set — cannot fund compute account");
    return;
  }

  try {
    const provider = new JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true });
    const signer = new Wallet(pk, provider);
    const broker = await createZGComputeNetworkBroker(signer);

    log.info("Depositing compute funds", { amount, provider: providerAddress });
    await broker.ledger.depositFund(amount);

    const amountNeuron = BigInt(Math.floor(amount * Number(NEURON_PER_0G)));
    await broker.ledger.transferFund(providerAddress, "inference", amountNeuron);

    log.info("Compute account funded successfully", { provider: providerAddress });
  } catch (err) {
    // Soft-fail: funding failure should not block the request
    log.warn("Failed to fund compute account", {
      provider: providerAddress,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
const ROUTER_TIMEOUT_MS = 30_000;

export async function createRouterClient(timeout = ROUTER_TIMEOUT_MS): Promise<OpenAI> {
  const directKey = process.env.AXIOM_COMPUTE_DIRECT_KEY;
  if (directKey) {
    const tokenInfo = decodeDirectKeyToken(directKey);
    if (tokenInfo) {
      const providerUrl = await resolveProviderUrl(tokenInfo.provider);
      if (providerUrl) {
        // Acknowledge provider signer and fund account (soft-fail on funding)
        await acknowledgeProviderSigner(tokenInfo.provider);
        await fundComputeAccount(tokenInfo.provider);
        return new OpenAI({
          baseURL: `${providerUrl}/v1/proxy`,
          apiKey: directKey,
          timeout,
          maxRetries: 2,
        });
      }
      throw new Error(`Provider ${tokenInfo.provider} not found in on-chain registry`);
    }
    throw new Error("Cannot decode app-sk-* token. Check AXIOM_COMPUTE_DIRECT_KEY.");
  }
  const routerKey = process.env.AXIOM_COMPUTE_API_KEY ?? process.env.OG_COMPUTE_API_KEY;
  if (routerKey) {
    return new OpenAI({ baseURL: getComputeBaseUrl(), apiKey: routerKey, timeout, maxRetries: 2 });
  }
  throw new Error("AXIOM_COMPUTE_DIRECT_KEY, AXIOM_COMPUTE_API_KEY, or OG_COMPUTE_API_KEY required");
}
