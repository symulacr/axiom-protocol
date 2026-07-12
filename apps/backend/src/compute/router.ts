import OpenAI from "openai";
import { Wallet } from "ethers";
import { pickOGNetwork } from "@axiom/config/networks";
import { resolveChainId, getBroker } from "./broker.js";
import { discoverProviders, selectProvider } from "./provider-discovery.js";
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

function buildOpenAIClient(baseURL: string, apiKey: string, timeout: number): OpenAI {
  return new OpenAI({
    baseURL,
    apiKey,
    timeout,
    maxRetries: 0,
  });
}

export interface RouterClientOptions {
  timeout?: number;
  signer?: Wallet;
  signerPk?: string;
  evmRpc?: string;
}

interface DirectChunk {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: Array<{
    index?: number;
    delta?: { role?: string; content?: string };
    finish_reason?: string | null;
  }>;
}

type DirectClient = {
  chat: {
    completions: {
      create: (
        body: Record<string, unknown>,
        reqOpts?: { signal?: AbortSignal },
      ) => AsyncGenerator<DirectChunk>;
    };
  };
};

function streamFromEndpoint(
  endpoint: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  reqOpts?: { signal?: AbortSignal },
): AsyncGenerator<DirectChunk> {
  return (async function* () {
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...body, stream: true }),
      signal: reqOpts?.signal,
    });
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      throw new Error(`Compute error ${res.status}: ${text.slice(0, 300)}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line.startsWith("data:")) {
          const data = line.slice(5).trim();
          if (data !== "[DONE]") {
            try {
              yield JSON.parse(data) as DirectChunk;
            } catch {
              /* skip keep-alive */
            }
          }
        }
      }
    }
  })();
}

function createSignedSessionClient(
  baseUrl: string,
  authHeader: string,
): DirectClient {
  const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  return {
    chat: {
      completions: {
        create: (body, reqOpts) =>
          streamFromEndpoint(
            endpoint,
            { "Content-Type": "application/json", Authorization: authHeader },
            body,
            reqOpts,
          ),
      },
    },
  };
}

export async function createRouterClient(
  model?: string,
  opts: RouterClientOptions = {},
): Promise<OpenAI> {
  const timeout = opts.timeout ?? ROUTER_TIMEOUT_MS;
  log.info("Creating router client", { model });

  const directKey = process.env.AXIOM_COMPUTE_DIRECT_KEY;
  if (directKey) {
    const directBase = process.env.AXIOM_COMPUTE_DIRECT_URL ?? "https://compute-network-6.integratenetwork.work/v1/proxy";
    log.info("Using direct compute provider", { directBase, model });
    return createSignedSessionClient(directBase, `Bearer ${directKey}`) as unknown as OpenAI;
  }
  const signer = opts.signer ?? (opts.signerPk ? new Wallet(opts.signerPk) : undefined);
  if (signer) {
    const broker = await getBroker(signer);
    const cid = resolveChainId();
    const evmRpc = opts.evmRpc ?? process.env.AXIOM_EVM_RPC ?? "";
    const services = await discoverProviders(evmRpc, cid);
    const provider = selectProvider(services, { model })?.provider;
    if (!provider) throw new Error(`No 0G provider for model ${model}`);
    const { Authorization } = await broker.inference.getRequestHeaders(provider);
    log.info("Using wallet-signed compute session", { provider, model });
    return createSignedSessionClient(getComputeBaseUrl(), Authorization) as unknown as OpenAI;
  }

  const routerKey = process.env.AXIOM_COMPUTE_API_KEY ?? process.env.OG_COMPUTE_API_KEY;
  if (routerKey) return buildOpenAIClient(getComputeBaseUrl(), routerKey, timeout);
  throw new Error("AXIOM_COMPUTE_API_KEY or OG_COMPUTE_API_KEY required");
}
