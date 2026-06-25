export function agentPath(id: bigint | string, resource?: string): string {
  const base = `/v1/agents/${id.toString()}`;
  return resource ? `${base}/${resource}` : base;
}

export function agentTransferPath(id: bigint | string): string {
  return agentPath(id, 'transfer');
}

export function agentPayPath(id: bigint | string): string {
  return agentPath(id, 'pay');
}

export function agentEarningsPath(id: bigint | string): string {
  return agentPath(id, 'earnings');
}

export function agentRoyaltyPath(id: bigint | string): string {
  return agentPath(id, 'royalty');
}

export function agentHistoryPath(id: bigint | string): string {
  return agentPath(id, 'history');
}

/** React Query key factories for auto-prefixed, type-safe query keys. */
export const queryKeys = {
  events: (since?: number) => ['events', { since }] as const,
  providers: () => ['providers'] as const,
  health: () => ['health'] as const,
};
