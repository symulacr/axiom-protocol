export interface FetchJsonResult<T> {
  ok: boolean;
  status: number;
  data: T;
}

export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<FetchJsonResult<T>> {
  const res = await fetch(url, init);
  const text = await res.text();

  let data: T;
  try {
    data = (text ? JSON.parse(text) : {}) as T;
  } catch {
    throw new Error(
      `fetchJson: invalid JSON from ${url} (status ${res.status})`,
    );
  }

  return { ok: res.ok, status: res.status, data };
}