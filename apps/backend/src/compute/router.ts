import OpenAI from "openai";
import { Wallet } from "ethers";
import { pickOGNetwork } from "@axiom/config/networks";
import { resolveChainId, getBroker, createStaticProvider } from "./broker.js";
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

export const clientChatIdMap = new WeakMap<object, string>();

export function setClientChatId(client: object, chatId: string): void {
  clientChatIdMap.set(client, chatId);
}
/** Dev-only fallback — set AXIOM_COMPUTE_PROVIDER in production */
const HARDCODED_PROVIDER = "0xa48f01287233509FD694a22Bf840225062E67836";


export interface RouterClientOptions {
  timeout?: number;
  signer?: Wallet;
  signerPk?: string;
  evmRpc?: string;
}


export function buildSigner(opts: RouterClientOptions): Wallet | undefined {
  return opts.signerPk
    ? new Wallet(opts.signerPk, createStaticProvider(opts.evmRpc ?? process.env.AXIOM_EVM_RPC ?? "https://evmrpc.0g.ai"))
    : opts.signer;
}

export async function fundProviderAccount(
  providerAddress: string,
  minBalance: number = 0,
): Promise<void> {
  const signer = buildSigner({});
  if (!signer) return;
  const broker = await getBroker(signer);
  const ledger = await broker.ledger.getLedger().catch(() => null);
  if (!ledger) {
    log.info("No ledger found, funding provider account", { providerAddress });
    await broker.ledger.depositFund(minBalance > 0 ? minBalance : 1_000_000);
  }
  await broker.inference.startAutoFunding(providerAddress, {
    bufferMultiplier: 3,
  });
  log.info("Auto-funding started for provider", { providerAddress });
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

  // Wallet-signed path: use broker SDK to get request headers
  const signer = buildSigner(opts);
  if (signer) {
    const broker = await getBroker(signer);
    const ledgerResp = await broker.ledger.getLedger().catch(() => null);
    const balance: bigint | null = ledgerResp && typeof ledgerResp === "object" && "balance" in ledgerResp
      ? (ledgerResp as { balance: bigint }).balance
      : null;
    if (balance !== null && balance < 100_000n) {
      log.warn("Ledger balance low", { balance });
    }
    const provider = process.env.AXIOM_COMPUTE_PROVIDER ?? HARDCODED_PROVIDER;
    await Promise.all([
      broker.inference.acknowledgeProviderSigner(provider).catch((e) => {
        log.warn("provider acknowledge skipped", { provider, error: String(e) });
      }),
      fundProviderAccount(provider).catch((e) => {
        log.warn("auto-funding skipped", { provider, error: String(e) });
      }),
    ]);
    const { Authorization } = await broker.inference.getRequestHeaders(provider);
    log.info("Using wallet-signed compute session", { provider, model });
    return new OpenAI({ baseURL: getComputeBaseUrl(), apiKey: Authorization.replace(/^Bearer\s+/i, ""), timeout, maxRetries: 0 });
  }

  throw new Error("AXIOM_COMPUTE_API_KEY or OG_COMPUTE_API_KEY required");
}
