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
    "https://router-api-testnet.integratenetwork.work/v1"
  );
}

const log = createLogger("compute-router");
const ROUTER_TIMEOUT_MS = 30_000;

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
    maxRetries: 0,
  });
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
  const routerKey =
    process.env.AXIOM_COMPUTE_API_KEY ?? process.env.OG_COMPUTE_API_KEY;
  if (routerKey) {
    return buildOpenAIClient(getComputeBaseUrl(), routerKey, timeout);
  }
  throw new Error("AXIOM_COMPUTE_API_KEY or OG_COMPUTE_API_KEY required");
}
