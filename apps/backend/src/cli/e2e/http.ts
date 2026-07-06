import { fetchJson } from "../../utils/fetch-json.js";

export interface StepResult {
  step: number;
  name: string;
  ok: boolean;
  summary: string;
  txHash?: string;
  blockNumber?: number;
  explorerUrl?: string;
}

export const stepResults: StepResult[] = [];

/**
 * Run one HTTP step: build the request, fire it, parse JSON, log + push
 * a `StepResult`. The `summary` callback is given the typed response so
 * the caller can pick the fields it wants to surface in the report.
 */
export async function postStep<T>(
  backendUrl: string,
  step: number,
  name: string,
  body: unknown,
  summary: (r: T) => { summary: string; txHash?: string; ok?: boolean },
): Promise<T> {
  const { data: res } = await fetchJson<T>(`${backendUrl}${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const s = summary(res);
  console.log(`          ${JSON.stringify(res)}`);
  stepResults.push({
    step,
    name,
    ok: s.ok ?? true,
    summary: s.summary,
    txHash: s.txHash,
  });
  return res;
}