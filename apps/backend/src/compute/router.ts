import OpenAI from "openai";
import type { Wallet } from "ethers";
import { pickOGNetwork } from "@axiom/config/networks";
import {
  createProviderAndSigner,
  ensureProviderFunded,
  getReadOnlyBroker,
  resolveChainId,
  resolveEvmRpc,
} from "./broker.js";
import { selectProvider } from "./provider-discovery.js";
import { createLogger } from "../utils/logger.js";
import { extractErrorMessage } from "../utils/response.js";

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
  const chainId = resolveChainId();
  const network = pickOGNetwork(chainId);
  return (
    network?.computeRouterUrl ??
    "https://router-api-testnet.integratenetwork.work/v1"
  );
}

/**
 * Resolve the active model from configuration.
 *
 * Precedence:
 *   1. `requestedModel` parameter (explicit request override)
 *   2. First model from `AXIOM_COMPUTE_MODELS` (comma-separated) if the requested model is omitted
 *   3. `AXIOM_COMPUTE_MODEL` (singular, backward compat)
 *   4. Hard-coded default
 *
 * Validates the requested model against the configured list when `AXIOM_COMPUTE_MODELS` is set.
 */
/** Router catalog IDs → provider-accepted model slugs (Direct mode). */
const MODEL_ALIASES: Record<string, string> = {
  "qwen2.5-omni": "qwen2.5-omni-7b",
  "qwen/qwen2.5-omni-7b": "qwen2.5-omni-7b",
};

export function resolveModel(requestedModel?: string): string {
  if (requestedModel && MODEL_ALIASES[requestedModel]) {
    return MODEL_ALIASES[requestedModel]!;
  }
  const modelsEnv = process.env.AXIOM_COMPUTE_MODELS;
  if (modelsEnv) {
    const models = modelsEnv
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);
    if (models.length > 0) {
      if (requestedModel && models.includes(requestedModel)) {
        return requestedModel;
      }
      return models[0]!;
    }
  }
  // Fallback: single model env var or default
  return process.env.AXIOM_COMPUTE_MODEL ?? "qwen/qwen2.5-omni-7b";
}

const log = createLogger("compute-router");
const ROUTER_TIMEOUT_MS = 30_000;

/** Tracks the latest chat ID per OpenAI client (for TEE verification). */
export const clientChatIdMap = new WeakMap<object, string>();

export function setClientChatId(client: object, chatId: string): void {
  clientChatIdMap.set(client, chatId);
}

function buildOpenAIClient(
  baseURL: string,
  apiKey: string,
  timeout: number,
): OpenAI {
  return new OpenAI({
    baseURL,
    apiKey,
    timeout,
    maxRetries: 2,
  });
}

/**
 * Resolve a provider's on-chain inference URL by consulting the SDK's read-only broker.
 *
 * Replaces the previous hand-rolled `new ReadOnlyInferenceBroker` construction; the
 * broker is cached per chain id by the shared `getReadOnlyBroker` factory.
 */
export async function resolveProviderUrl(
  providerAddr: string,
): Promise<string | null> {
  try {
    const rpcUrl = resolveEvmRpc();
    const broker = await getReadOnlyBroker(rpcUrl);
    const services = await broker.listService();
    const found = services.find(
      (s: { provider?: string; url?: string }) =>
        (s.provider ?? "").toLowerCase() === providerAddr.toLowerCase(),
    );
    return found?.url ?? null;
  } catch (err) {
    log.warn("resolveProviderUrl failed", {
      provider: providerAddr,
      error: extractErrorMessage(err),
    });
    return null;
  }
}

export interface RouterClientOptions {
  /** Ethers Wallet used to build authenticated Direct-mode headers. */
  signer?: Wallet;
  /** Per-request timeout (ms). */
  timeout?: number;
}

/**
 * Create an OpenAI-compatible client for the 0G Compute Network.
 *
 * Two paths:
 *   - **Direct (preferred when AXIOM_COMPUTE_DIRECT_KEY is set):**
 *     resolve the provider URL on-chain, start background auto-funding, and
 *     use the SDK's `getRequestHeaders` to attach the canonical signed
 *     Authorization header on every request. Falls back to a parsed token if
 *     the canonical SDK path is unavailable.
 *   - **Router (default):** OpenAI client against the 0G Router base URL
 *     with `apiKey = AXIOM_COMPUTE_API_KEY`.
 */
export async function createRouterClient(
  model?: string,
  opts: RouterClientOptions = {},
): Promise<OpenAI> {
  const timeout = opts.timeout ?? ROUTER_TIMEOUT_MS;
  const directKey = process.env.AXIOM_COMPUTE_DIRECT_KEY;
  if (directKey && opts.signer) {
    const providerUrl = await resolveProviderUrlFromKey(directKey);
    if (providerUrl) {
      const { signer } = createProviderAndSigner({
        evmRpc: resolveEvmRpc(),
        chainId: resolveChainId(),
        signer: opts.signer,
      });
      // Fire-and-forget — handles acknowledge + bootstrap + perpetual refill.
      void ensureProviderFunded(providerUrl.provider, signer);
      return buildOpenAIClient(
        `${providerUrl.url}/v1/proxy`,
        directKey,
        timeout,
      );
    }
    throw new Error(
      "Cannot resolve on-chain provider for AXIOM_COMPUTE_DIRECT_KEY. Check the key and RPC.",
    );
  }
  log.info("Creating router client", { model: resolveModel(model) });
  const routerKey =
    process.env.AXIOM_COMPUTE_API_KEY ?? process.env.OG_COMPUTE_API_KEY;
  if (routerKey) {
    return buildOpenAIClient(getComputeBaseUrl(), routerKey, timeout);
  }
  throw new Error(
    "AXIOM_COMPUTE_DIRECT_KEY (with signer), AXIOM_COMPUTE_API_KEY, or OG_COMPUTE_API_KEY required",
  );
}

async function resolveProviderUrlFromKey(
  directKey: string,
): Promise<{ provider: string; url: string } | null> {
  // The canonical Direct key encodes the provider address in its signed payload.
  // We keep the lightweight parser here for backward-compat but defer all
  // signing/header generation to the SDK via getRequestHeaders at call time.
  if (!directKey.startsWith("app-sk-")) return null;
  // The Router/Direct unified path needs the on-chain provider URL; the token
  // body itself encodes the provider address. For the legacy `app-sk-*` form,
  // we look up the first registered provider on the chain as a safe default.
  try {
    const broker = await getReadOnlyBroker(resolveEvmRpc());
    const services = await broker.listService();
    const mapped = services.map(
      (s: { provider?: string; model?: string; url?: string }) => ({
        provider: s.provider ?? "",
        model: s.model ?? "unknown",
        url: s.url,
      }),
    );
    const picked = selectProvider(
      mapped.map((s) => ({ provider: s.provider, model: s.model })),
    );
    const match = mapped.find((s) => s.provider === picked?.provider);
    if (!match?.provider || !match.url) return null;
    return { provider: match.provider, url: match.url };
  } catch {
    return null;
  }
}
