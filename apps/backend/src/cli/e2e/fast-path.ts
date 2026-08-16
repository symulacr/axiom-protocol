import { fetchJson } from "../../utils/response.js";
import { resolveChainId } from "../../compute/index.js";
import { defaultChatModelForChain } from "@axiom/config/networks";

export async function resolveE2eComputeModel(
  backendUrl: string,
  explicit?: string,
): Promise<string> {
  if (explicit) return explicit;
  const { data, ok } = await fetchJson<{
    services?: Array<{ model: string }>;
  }>(`${backendUrl}/v1/compute/providers`, {
    ...(process.env.AXIOM_API_KEY
      ? { headers: { "x-api-key": process.env.AXIOM_API_KEY } }
      : {}),
  });
  const services = ok ? (data.services ?? []) : [];
  const prefer = ["qwen2.5-omni", "deepseek-v4-flash"];
  for (const id of prefer) {
    const hit = services.find(
      (s) => s.model.toLowerCase() === id.toLowerCase(),
    );
    if (hit) return hit.model;
  }
  // Chain-driven fallback (Galileo catalog has no "-7b" suffixed ids — that id 404s live).
  return (
    process.env.AXIOM_COMPUTE_MODEL ??
    defaultChatModelForChain(resolveChainId())
  );
}

export function e2eFastEnabled(): boolean {
  return process.env.E2E_FAST !== "0";
}

export function e2eLiveComputeEnabled(): boolean {
  return process.env.E2E_LIVE_COMPUTE !== "0";
}

export function e2eStrictComputeEnabled(): boolean {
  return process.env.E2E_STRICT_COMPUTE !== "0";
}

export function e2ePipelineTxEnabled(): boolean {
  return process.env.E2E_PIPELINE_TX !== "0" && e2eFastEnabled();
}

export function e2eSkipVaultWithdrawEnabled(): boolean {
  if (process.env.E2E_FULL_VAULT === "1") return false;
  return process.env.E2E_SKIP_VAULT_WITHDRAW === "1";
}

export function e2eMegaPipelineEnabled(): boolean {
  return process.env.E2E_MEGA_PIPELINE !== "0" && e2ePipelineTxEnabled();
}

export function e2eKeepTokenEnabled(): boolean {
  return process.env.E2E_KEEP_TOKEN === "1";
}

export const E2E_PAYMENT_MICRO_MIN_TOTAL = 20_000n;
