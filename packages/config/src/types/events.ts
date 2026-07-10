export function tokenIdFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  for (const key of ["tokenId", "agentTokenId", "_tokenId", "newTokenId"] as const) {
    const raw = record[key];
    if (raw === undefined || raw === null || raw === "") continue;
    if (typeof raw === "bigint") return raw.toString();
    if (typeof raw === "number" && Number.isFinite(raw))
      return BigInt(raw).toString();
    if (typeof raw === "string") {
      try {
        return BigInt(raw).toString();
      } catch {
      }
    }
  }
  return null;
}
