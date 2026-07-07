import type { ToolHttp } from "./transport.js";

export async function fetchJson<T>(
  http: ToolHttp,
  path: string,
  init?: Parameters<ToolHttp["fetch"]>[1],
): Promise<{ ok: boolean; data: T; status: number }> {
  const res = await http.fetch(path, init);
  const text = await res.text();
  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    return { ok: false, data: { error: text } as T, status: res.status };
  }
  return { ok: res.ok, data, status: res.status };
}