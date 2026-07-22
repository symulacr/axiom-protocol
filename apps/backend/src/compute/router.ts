import OpenAI from "openai";
import { pickOGNetwork } from "@axiom/config/networks";
import { resolveChainId } from "./broker.js";
import { createLogger } from "../utils/logger.js";

export function getComputeBaseUrl(): string {
  const explicit =
    process.env.AXIOM_COMPUTE_BASE_URL ?? process.env.OG_COMPUTE_BASE_URL;
  if (explicit) return explicit;
  const chainId = resolveChainId();
  const network = pickOGNetwork(chainId);
  return (
    network?.computeRouterUrl ??
    "https://router-api.0g.ai/v1"
  );
}

const log = createLogger("compute-router");
const ROUTER_TIMEOUT_MS = 30_000;

const clientChatIdMap = new WeakMap<object, string>();

export function setClientChatId(client: object, chatId: string): void {
  clientChatIdMap.set(client, chatId);
}


export interface RouterClientOptions {
  timeout?: number;
}


export async function createRouterClient(
  model?: string,
  opts: RouterClientOptions = {},
): Promise<OpenAI> {
  const timeout = opts.timeout ?? ROUTER_TIMEOUT_MS;
  log.info("Creating router client", { model });

  // Fast path: direct API key with explicit provider URL
  const directKey = process.env.AXIOM_COMPUTE_DIRECT_KEY;
  if (directKey) {
    const directBase = process.env.AXIOM_COMPUTE_DIRECT_URL ?? "https://compute-network-6.integratenetwork.work/v1/proxy";
    log.info("Using direct compute provider", { directBase, model });
    return new OpenAI({ baseURL: directBase, apiKey: directKey, timeout, maxRetries: 0 });
  }

  // Prefer the API-key router path over the wallet-signed path
  const routerKey = process.env.AXIOM_COMPUTE_API_KEY ?? process.env.OG_COMPUTE_API_KEY;
  if (routerKey) {
    log.info("Using API-key compute router", { model });
    return new OpenAI({ baseURL: getComputeBaseUrl(), apiKey: routerKey, timeout, maxRetries: 0 });
  }

  throw new Error("AXIOM_COMPUTE_API_KEY or OG_COMPUTE_API_KEY required");
}
