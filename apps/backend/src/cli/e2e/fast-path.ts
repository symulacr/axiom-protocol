import { fetchJson } from "../../utils/fetch-json.js";

export async function resolveE2eComputeModel(
  backendUrl: string,
  explicit?: string,
): Promise<string> {
  if (explicit) return explicit;
  const { data, ok } = await fetchJson<{
    services?: Array<{ model: string }>;
  }>(`${backendUrl}/v1/compute/providers`);
  const services = ok ? (data.services ?? []) : [];
  const prefer = [
    "qwen2.5-omni",
    "qwen2.5-omni-7b",
    "qwen/qwen2.5-omni-7b",
    "qwen2.5-7b-instruct",
  ];
  for (const id of prefer) {
    const hit = services.find(
      (s) => s.model.toLowerCase() === id.toLowerCase(),
    );
    if (hit) return hit.model;
  }
  return process.env.AXIOM_COMPUTE_MODEL ?? "qwen2.5-omni-7b";
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