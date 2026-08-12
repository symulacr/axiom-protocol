import { fetchJson } from "../../utils/response.js";

interface StepResult {
  step: number;
  name: string;
  ok: boolean;
  summary: string;
  txHash?: string;
  blockNumber?: number;
  explorerUrl?: string;
}

export const stepResults: StepResult[] = [];

function pushStepResult(
  step: number,
  name: string,
  summary: string,
  ok = true,
  txHash?: string,
): void {
  stepResults.push({ step, name, ok, summary, txHash });
}

export async function getStep<T>(
  backendUrl: string,
  step: number,
  name: string,
  summary: (
    r: T,
    meta: { ok: boolean; status: number },
  ) => { summary: string; ok?: boolean },
): Promise<T> {
  const { data: res, ok, status } = await fetchJson<T>(`${backendUrl}${name}`);
  const s = summary(res, { ok, status });
  console.log(`          ${JSON.stringify(res).slice(0, 500)}${JSON.stringify(res).length > 500 ? "…" : ""}`);
  pushStepResult(step, name, s.summary, s.ok ?? ok, undefined);
  if (s.ok === false || !ok) {
    throw new Error(`${name}: ${s.summary}`);
  }
  return res;
}

export async function postStep<T>(
  backendUrl: string,
  step: number,
  name: string,
  body: unknown,
  summary: (r: T) => { summary: string; txHash?: string; ok?: boolean },
): Promise<T> {
  const { data: res, ok, status } = await fetchJson<T>(`${backendUrl}${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const s = summary(res);
  const stepOk = s.ok ?? ok;
  console.log(`          ${JSON.stringify(res)}`);
  stepResults.push({
    step,
    name,
    ok: stepOk,
    summary: s.summary,
    txHash: s.txHash,
  });
  if (!stepOk) {
    throw new Error(`${name}: ${s.summary} (status=${status})`);
  }
  return res;
}