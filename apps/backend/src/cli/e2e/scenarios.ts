/**
 * Usage-scenario registry for live E2E — maps real user journeys to on-chain surfaces.
 */

export type ScenarioActor = "operator" | "receiver" | "tee-oracle" | "backend" | "any";

export interface UsageScenario {
  id: string;
  title: string;
  actor: ScenarioActor;
  contracts: string[];
  functions: string[];
  /** Human-readable intent */
  intent: string;
  status: "pending" | "covered" | "skipped";
  step?: string;
  skipReason?: string;
  txCount: number;
  readCount: number;
}

const scenarios = new Map<string, UsageScenario>();

function seed(): void {
  const defs: Array<Omit<UsageScenario, "status" | "txCount" | "readCount">> = [
    {
      id: "storage.upload",
      title: "Encrypt & upload strategy to 0G Storage",
      actor: "operator",
      contracts: ["0G Storage"],
      functions: ["uploadData"],
      intent: "Persist encrypted agent payload; obtain Merkle root",
    },
    {
      id: "storage.verify",
      title: "Download + Merkle verify",
      actor: "operator",
      contracts: ["0G Storage"],
      functions: ["downloadWithProof"],
      intent: "Prove bytes match root before mint",
    },
    {
      id: "oracle.preregister",
      title: "Oracle dataHash registration",
      actor: "tee-oracle",
      contracts: ["Oracle HTTP"],
      functions: ["POST /v1/agents/mint"],
      intent: "TEE acknowledges dataHash before on-chain mint",
    },
    {
      id: "agent.mint",
      title: "Mint iNFT on-chain",
      actor: "operator",
      contracts: ["AxiomAgentNFT"],
      functions: ["mint", "mintFee", "creatorOf", "intelligentDatasOf"],
      intent: "Create token bound to storage root",
    },
    {
      id: "vault.fund",
      title: "Fund agent vault",
      actor: "operator",
      contracts: ["AxiomStrategyVault"],
      functions: ["deposit", "balanceOf"],
      intent: "Lock native OG for agent execution budget",
    },
    {
      id: "vault.strategy",
      title: "Attach strategy Merkle root",
      actor: "operator",
      contracts: ["AxiomStrategyVault"],
      functions: ["setStrategy", "strategyOf"],
      intent: "Bind vault spend rules to uploaded strategy root",
    },
    {
      id: "vault.withdraw",
      title: "Partial vault withdrawal",
      actor: "operator",
      contracts: ["AxiomStrategyVault"],
      functions: ["withdraw"],
      intent: "Creator pulls unused vault balance",
    },
    {
      id: "agent.authorize",
      title: "Grant usage to delegate",
      actor: "operator",
      contracts: ["AxiomAgentNFT"],
      functions: ["authorizeUsage", "authorizedUsersOf"],
      intent: "Allow third party to use agent metadata",
    },
    {
      id: "agent.delegate",
      title: "Delegate access-proof signing",
      actor: "operator",
      contracts: ["AxiomAgentNFT"],
      functions: ["delegateAccess", "getDelegateAccess"],
      intent: "Assistant can sign AccessProof on owner behalf",
    },
    {
      id: "agent.revoke",
      title: "Revoke usage authorization",
      actor: "operator",
      contracts: ["AxiomAgentNFT"],
      functions: ["revokeAuthorization"],
      intent: "Remove delegate usage rights",
    },
    {
      id: "agent.update",
      title: "Update on-chain data descriptor",
      actor: "operator",
      contracts: ["AxiomAgentNFT"],
      functions: ["update", "intelligentDataOf"],
      intent: "Refresh metadata pointer without reminting",
    },
    {
      id: "payment.royalty",
      title: "Set creator royalty split",
      actor: "operator",
      contracts: ["AxiomPaymentProcessor"],
      functions: ["setRoyaltyBpsPermitted", "royaltyBpsOf"],
      intent: "Creator configures revenue share before payments",
    },
    {
      id: "payment.agent",
      title: "Pay for agent service",
      actor: "operator",
      contracts: ["AxiomPaymentProcessor", "MockUSDC"],
      functions: ["payForAgent", "approve", "agentEarningsOf"],
      intent: "Payer funds creator earnings + protocol treasury",
    },
    {
      id: "payment.compute",
      title: "Pay compute provider",
      actor: "operator",
      contracts: ["AxiomPaymentProcessor", "MockUSDC"],
      functions: ["payComputeProvider"],
      intent: "Protocol operator pays GPU provider",
    },
    {
      id: "payment.withdraw",
      title: "Creator withdraws earnings",
      actor: "operator",
      contracts: ["AxiomPaymentProcessor"],
      functions: ["withdrawAgentEarnings"],
      intent: "Creator claims accumulated USDC",
    },
    {
      id: "orchestrator.tick",
      title: "Backend orchestrator tick",
      actor: "backend",
      contracts: ["Backend HTTP"],
      functions: ["POST /v1/orchestrator/tick"],
      intent: "AI recommends action given vault balance signal",
    },
    {
      id: "transfer.proof",
      title: "TEE + receiver proof pipeline",
      actor: "backend",
      contracts: ["Backend HTTP", "AxiomTeeVerifier"],
      functions: ["POST /v1/agents/:id/transfer", "verifyTransferValidity"],
      intent: "Challenge → receiver signs AccessProof → TEE OwnershipProof",
    },
    {
      id: "transfer.onchain",
      title: "Provable iTransferFrom",
      actor: "operator",
      contracts: ["AxiomAgentNFT"],
      functions: ["iTransferFrom", "ownerOf"],
      intent: "Move token + publish re-sealed key on-chain",
    },
    {
      id: "tee.cleanup",
      title: "Reclaim expired proof nonces",
      actor: "any",
      contracts: ["AxiomTeeVerifier"],
      functions: ["cleanExpiredProofs"],
      intent: "Garbage-collect used proof slots after max age",
    },
    {
      id: "views.sweep",
      title: "Read-only contract surface sweep",
      actor: "any",
      contracts: ["AxiomAgentNFT", "AxiomPaymentProcessor", "AxiomTeeVerifier", "MockUSDC"],
      functions: ["name", "symbol", "tokenURI", "domainSeparator", "protocolTreasury"],
      intent: "Single batched pass over all query endpoints",
    },
  ];

  for (const d of defs) {
    scenarios.set(d.id, { ...d, status: "pending", txCount: 0, readCount: 0 });
  }
}

seed();

export function initUsageScenarios(): void {
  seed();
}

export function markScenarioCovered(
  id: string,
  step: string,
  opts?: { txs?: number; reads?: number },
): void {
  const s = scenarios.get(id);
  if (!s) return;
  s.status = "covered";
  s.step = step;
  s.txCount += opts?.txs ?? 0;
  s.readCount += opts?.reads ?? 0;
}

export function markScenarioSkipped(id: string, reason: string): void {
  const s = scenarios.get(id);
  if (!s) return;
  s.status = "skipped";
  s.skipReason = reason;
}

export function recordScenarioTx(id: string, count = 1): void {
  const s = scenarios.get(id);
  if (s) s.txCount += count;
}

export function recordScenarioRead(id: string, count = 1): void {
  const s = scenarios.get(id);
  if (s) s.readCount += count;
}

export function getUsageScenarios(): UsageScenario[] {
  return [...scenarios.values()];
}

export function printUsageScenarioMatrix(): void {
  const all = getUsageScenarios();
  const covered = all.filter((s) => s.status === "covered").length;
  const skipped = all.filter((s) => s.status === "skipped").length;
  const pending = all.filter((s) => s.status === "pending").length;
  const totalTx = all.reduce((n, s) => n + s.txCount, 0);

  console.log("\n============================================");
  console.log("  Usage Scenario Matrix");
  console.log("============================================");
  console.log(
    `  Covered: ${covered}/${all.length}  |  skipped: ${skipped}  |  pending: ${pending}  |  on-chain txs: ${totalTx}`,
  );
  console.log("");

  for (const s of all) {
    const flag =
      s.status === "covered" ? "OK" : s.status === "skipped" ? "SKIP" : "MISS";
    const txInfo = s.txCount > 0 ? ` txs=${s.txCount}` : "";
    console.log(`  ${flag.padEnd(4)} ${s.id.padEnd(22)} ${s.actor.padEnd(10)} ${s.title}${txInfo}`);
    if (s.status === "covered" && s.step) {
      console.log(`        ↳ ${s.step}`);
    }
    if (s.status === "skipped" && s.skipReason) {
      console.log(`        ↳ ${s.skipReason}`);
    }
  }
}