
type ScenarioActor = "operator" | "receiver" | "tee-oracle" | "backend" | "any";

interface UsageScenario {
  id: string;
  title: string;
  actor: ScenarioActor;
  contracts: string[];
  functions: string[];
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
      id: "api.health",
      title: "Backend health + chain head",
      actor: "backend",
      contracts: ["Backend HTTP"],
      functions: ["GET /health"],
      intent: "Liveness probe for deploys and frontend boot",
    },
    {
      id: "api.routes",
      title: "API route registry",
      actor: "backend",
      contracts: ["Backend HTTP"],
      functions: ["GET /v1/routes"],
      intent: "Discover registered endpoints (chat tools, docs)",
    },
    {
      id: "events.feed",
      title: "Polled event history",
      actor: "backend",
      contracts: ["Backend HTTP"],
      functions: ["GET /v1/events"],
      intent: "Activity tab + Market page tick/transfer history",
    },
    {
      id: "api.stream",
      title: "WebSocket event stream",
      actor: "backend",
      contracts: ["Backend HTTP"],
      functions: ["WS /v1/stream"],
      intent: "Live Activity updates (hello + topic subscription)",
    },
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
      id: "compute.providers",
      title: "Discover 0G Compute providers",
      actor: "backend",
      contracts: ["Backend HTTP"],
      functions: ["GET /v1/compute/providers"],
      intent: "List GPU services + on-chain provider mapping (cached)",
    },
    {
      id: "agent.list",
      title: "List agents by owner",
      actor: "backend",
      contracts: ["Backend HTTP", "AxiomAgentNFT"],
      functions: ["GET /v1/agents"],
      intent: "Indexer lists minted tokens for wallet (30s TTL cache)",
    },
    {
      id: "agent.metadata",
      title: "Encode metadata update tx",
      actor: "backend",
      contracts: ["Backend HTTP", "AxiomAgentNFT"],
      functions: ["POST /v1/agents/:id/metadata"],
      intent: "Build calldata for on-chain data descriptor update",
    },
    {
      id: "agent.earnings",
      title: "Read agent earnings",
      actor: "backend",
      contracts: ["Backend HTTP", "AxiomPaymentProcessor"],
      functions: ["GET /v1/agents/:id/earnings"],
      intent: "Creator revenue from payment processor",
    },
    {
      id: "payment.config-cache",
      title: "Payment config TTL cache",
      actor: "backend",
      contracts: ["Backend HTTP"],
      functions: ["GET /v1/payment/config"],
      intent: "Protocol fee + token address (5 min cache)",
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
      id: "payment.royalty-encode",
      title: "Encode royalty set transaction",
      actor: "backend",
      contracts: ["Backend HTTP", "AxiomPaymentProcessor"],
      functions: ["POST /v1/agents/:id/royalty"],
      intent: "PaymentPanel builds wallet tx without embedding ABI",
    },
    {
      id: "agent.performance-batch",
      title: "Batch agent performance metrics",
      actor: "backend",
      contracts: ["Backend HTTP"],
      functions: ["GET /v1/agents/performance/batch"],
      intent: "Agents browser loads metrics for many tokenIds at once",
    },
    {
      id: "archive.closest",
      title: "Wayback closest snapshot",
      actor: "backend",
      contracts: ["Backend HTTP", "Internet Archive"],
      functions: ["GET /v1/archive/closest"],
      intent: "Fast archive probe (chat time-travel; snapshots CDX is slow)",
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
      id: "orchestrator.tick-live",
      title: "Live 0G Compute inference tick",
      actor: "backend",
      contracts: ["Backend HTTP", "0G Compute"],
      functions: ["POST /v1/orchestrator/tick"],
      intent: "Real model inference via compute router (E2E_LIVE_COMPUTE=1)",
    },
    {
      id: "compute.chat-tools",
      title: "Streaming chat with tool calls",
      actor: "backend",
      contracts: ["Backend HTTP", "0G Compute"],
      functions: ["POST /v1/chat/completions"],
      intent: "SSE chat + function tools against compute provider",
    },
    {
      id: "chat.tools-read",
      title: "Chat read tools (frontend parity)",
      actor: "backend",
      contracts: ["Backend HTTP", "AxiomAgentNFT", "AxiomStrategyVault"],
      functions: ["GET /v1/agents", "balanceOf", "intelligentDatasOf", "GET /v1/events"],
      intent: "Mirror ChatPage read tools without wallet UI",
    },
    {
      id: "chat.tools-write",
      title: "Chat write/encode tools",
      actor: "backend",
      contracts: ["Backend HTTP", "AxiomAgentNFT", "AxiomStrategyVault"],
      functions: ["POST /v1/agents/:id/metadata", "deposit", "withdraw"],
      intent: "Encode-only paths for mint/deposit/withdraw chat tools",
    },
    {
      id: "chat.tools-complex",
      title: "Multi-tool chat flow",
      actor: "backend",
      contracts: ["Backend HTTP", "0G Compute"],
      functions: ["list → balance → metadata → events → tick → encode"],
      intent: "Complex tool chain matching frontend multi-turn loop",
    },
    {
      id: "chat.cache-hit",
      title: "Chat catalog cache hits",
      actor: "backend",
      contracts: ["Backend HTTP"],
      functions: ["GET /v1/compute/providers", "GET /v1/payment/config", "GET /v1/agents"],
      intent: "Second-read latency for providers, payment config, agent list TTL",
    },
    {
      id: "chat.keepalive",
      title: "SSE connection keep-alive reuse",
      actor: "backend",
      contracts: ["Backend HTTP", "0G Compute"],
      functions: ["POST /v1/chat/completions"],
      intent: "Sequential SSE on shared HTTP agent pool",
    },
    {
      id: "chat.context-growth",
      title: "Growing chat context",
      actor: "backend",
      contracts: ["Backend HTTP", "0G Compute"],
      functions: ["POST /v1/chat/completions"],
      intent: "Multi-turn messages accumulate in conversation history",
    },
    {
      id: "chat.model-switch",
      title: "Model switching in chat",
      actor: "backend",
      contracts: ["Backend HTTP", "0G Compute"],
      functions: ["POST /v1/chat/completions"],
      intent: "Select different models from /v1/compute/providers per request",
    },
    {
      id: "compute.data-availability",
      title: "Storage + vault data availability in tick",
      actor: "backend",
      contracts: ["Backend HTTP", "0G Storage", "AxiomStrategyVault"],
      functions: ["POST /v1/orchestrator/tick"],
      intent: "Tick returns correct Merkle root and live vault balance",
    },
    {
      id: "agent.performance",
      title: "Agent tick performance metrics",
      actor: "backend",
      contracts: ["Backend HTTP"],
      functions: ["GET /v1/agents/:id/performance"],
      intent: "Event-store metrics after orchestrator ticks",
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

export function getUsageScenarios(): UsageScenario[] {
  return [...scenarios.values()];
}

function hasLiveProof(s: UsageScenario): boolean {
  return s.status === "covered" && s.txCount + s.readCount > 0;
}

export interface LiveGateReport {
  live: number;
  inScope: number;
  livePct: number;
  criticalLive: number;
  criticalTotal: number;
  gaps: string[];
}

export function computeLiveGate(criticalIds: readonly string[]): LiveGateReport {
  const all = getUsageScenarios();
  const inScope = all.filter((s) => s.status !== "skipped");
  const live = inScope.filter(hasLiveProof);
  const byId = new Map(all.map((s) => [s.id, s]));
  const gaps: string[] = [];

  for (const id of criticalIds) {
    const s = byId.get(id);
    if (!s || !hasLiveProof(s)) gaps.push(`missing live: ${id}`);
  }
  for (const s of inScope) {
    if (s.status === "pending") gaps.push(`pending: ${s.id}`);
    else if (s.status === "covered" && !hasLiveProof(s)) {
      gaps.push(`no proof: ${s.id} (${s.step ?? "?"})`);
    }
  }

  const criticalLive = criticalIds.filter((id) => {
    const s = byId.get(id);
    return s !== undefined && hasLiveProof(s);
  }).length;

  return {
    live: live.length,
    inScope: inScope.length,
    livePct:
      inScope.length > 0 ? Math.round((live.length / inScope.length) * 100) : 0,
    criticalLive,
    criticalTotal: criticalIds.length,
    gaps,
  };
}

export function assertLiveGate(
  minPct: number,
  criticalIds: readonly string[],
): LiveGateReport {
  const report = computeLiveGate(criticalIds);
  if (report.livePct < minPct) {
    throw new Error(
      `Live gate failed: ${report.livePct}% < ${minPct}% (${report.live}/${report.inScope} in-scope scenarios with tx/read proof)`,
    );
  }
  if (report.criticalLive < report.criticalTotal) {
    const missing = report.gaps.filter((g) => g.startsWith("missing live"));
    throw new Error(
      `Live gate failed: critical ${report.criticalLive}/${report.criticalTotal} (${missing.join("; ")})`,
    );
  }
  return report;
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