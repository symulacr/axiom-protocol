import OpenAI from "openai";
import { FetchRequest, JsonRpcProvider } from "ethers";
import { ARISTOTLE_CHAIN_ID, pickOGNetwork } from "@axiom/config/networks";
import { createLogger } from "../utils/logger.js";

// ── broker.ts ────────────────────────────────────────────────────────────────

export function resolveChainId(chainId?: number): number {
	if (chainId !== undefined) return chainId;
	const env = Number(process.env.AXIOM_CHAIN_ID);
	return Number.isFinite(env) && env > 0 ? env : ARISTOTLE_CHAIN_ID;
}

export function createStaticProvider(
	evmRpc: string,
	chainId?: number,
	opts?: { timeoutMs?: number },
): JsonRpcProvider {
	const cid = resolveChainId(chainId);
	if (opts?.timeoutMs !== undefined) {
		const fetchReq = new FetchRequest(evmRpc);
		fetchReq.timeout = opts.timeoutMs;
		return new JsonRpcProvider(fetchReq, cid, { staticNetwork: true });
	}
	return new JsonRpcProvider(evmRpc, cid, { staticNetwork: true });
}

// ── router.ts ────────────────────────────────────────────────────────────────

export function getComputeBaseUrl(): string {
	const explicit =
		process.env.AXIOM_COMPUTE_BASE_URL ?? process.env.OG_COMPUTE_BASE_URL;
	if (explicit) return explicit;
	const chainId = resolveChainId();
	const network = pickOGNetwork(chainId);
	return network?.computeRouterUrl ?? "https://router-api.0g.ai/v1";
}

const logRouter = createLogger("compute-router");
const ROUTER_TIMEOUT_MS = 30_000;

interface RouterClientOptions {
	timeout?: number;
}

export async function createRouterClient(
	model?: string,
	opts: RouterClientOptions = {},
): Promise<OpenAI> {
	const timeout = opts.timeout ?? ROUTER_TIMEOUT_MS;
	logRouter.info("Creating router client", { model });

	// Fast path: direct API key with explicit provider URL
	const directKey = process.env.AXIOM_COMPUTE_DIRECT_KEY;
	if (directKey) {
		const directBase =
			process.env.AXIOM_COMPUTE_DIRECT_URL ??
			"https://compute-network-6.integratenetwork.work/v1/proxy";
		logRouter.info("Using direct compute provider", { directBase, model });
		return new OpenAI({
			baseURL: directBase,
			apiKey: directKey,
			timeout,
			maxRetries: 0,
		});
	}

	// Prefer the API-key router path over the wallet-signed path
	const routerKey =
		process.env.AXIOM_COMPUTE_API_KEY ?? process.env.OG_COMPUTE_API_KEY;
	if (routerKey) {
		logRouter.info("Using API-key compute router", { model });
		return new OpenAI({
			baseURL: getComputeBaseUrl(),
			apiKey: routerKey,
			timeout,
			maxRetries: 0,
		});
	}

	throw new Error("AXIOM_COMPUTE_API_KEY or OG_COMPUTE_API_KEY required");
}
