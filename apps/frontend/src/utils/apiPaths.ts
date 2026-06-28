export function agentPath(id: bigint | string, resource?: string): string {
  const base = `/v1/agents/${id.toString()}`;
  return resource ? `${base}/${resource}` : base;
}

export function agentTransferPath(id: bigint | string): string {
  return agentPath(id, 'transfer');
}

export function agentEarningsPath(id: bigint | string): string {
  return agentPath(id, 'earnings');
}

export function agentRoyaltyPath(id: bigint | string): string {
  return agentPath(id, 'royalty');
}


