/** Auto strategy payload — user only picks a name. */
export function buildDefaultPayload(agentName: string): string {
  const name = agentName.trim() || "Axiom agent";
  return JSON.stringify({
    name,
    version: 1,
    kind: "axiom-inft-agent",
    strategy: "default",
    description: `${name} — ownable AI agent on Axiom Protocol (0G / ERC-7857)`,
    createdAt: new Date().toISOString(),
  });
}
