
type BreakLayer = "backend" | "contract" | "storage" | "compute" | "oracle" | "ops";

interface ScenarioBreakCard {
  scenarioId: string;
  canBreak: string[];
  layer: BreakLayer;
  detect: string;
  improveBackend?: string;
  improveContract?: string;
}

const CARDS: ScenarioBreakCard[] = [
  {
    scenarioId: "storage.upload",
    canBreak: ["storage node sync timeout", "insufficient OG for storage fee", "RPC unreachable"],
    layer: "storage",
    detect: "Step 4 throws before rootHash",
    improveBackend: "Retry with backoff; surface storage fee estimate in /health",
    improveContract: "N/A (off-chain)",
  },
  {
    scenarioId: "storage.verify",
    canBreak: ["indexer lag", "Merkle proof mismatch", "wrong root"],
    layer: "storage",
    detect: "downloadWithProof assert fails",
    improveBackend: "Poll indexer until root locatable before mint",
  },
  {
    scenarioId: "oracle.preregister",
    canBreak: ["oracle down", "dataHash rejected", "TEE signer mismatch"],
    layer: "oracle",
    detect: "POST /v1/agents/mint non-2xx",
    improveBackend: "Backend-orchestrated mint bundles oracle+chain",
    improveContract: "On-chain mint could accept oracle attestation in one tx",
  },
  {
    scenarioId: "agent.mint",
    canBreak: ["insufficient OG for mintFee", "dataHash not registered", "RPC receipt flake"],
    layer: "contract",
    detect: "mint receipt status=0 or missing Transfer log",
    improveContract: "Clearer revert: MintFeeRequired, DataHashNotSeen",
  },
  {
    scenarioId: "vault.fund",
    canBreak: ["msg.value=0", "wrong tokenId", "reentrancy guard"],
    layer: "contract",
    detect: "deposit receipt revert",
    improveContract: "Emit Deposit with indexed tokenId for indexer",
  },
  {
    scenarioId: "vault.strategy",
    canBreak: ["legacy 3-arg vs 4-arg ABI skew", "invalid Merkle root", "not vault owner"],
    layer: "contract",
    detect: "setStrategy revert or strategyOf mismatch",
    improveBackend: "vault-compat already handles; expose variant in /v1/payment/config",
    improveContract: "UUPS upgrade path for vault ABI uniformity",
  },
  {
    scenarioId: "vault.withdraw",
    canBreak: ["withdraw > balance", "daily limit exceeded"],
    layer: "contract",
    detect: "withdraw balance assert fails",
    improveContract: "WithdrawAmountExceedsBalance with balance in error",
  },
  {
    scenarioId: "agent.authorize",
    canBreak: ["not owner", "delegate is zero address"],
    layer: "contract",
    detect: "authorizeUsage revert",
  },
  {
    scenarioId: "agent.revoke",
    canBreak: ["revoke non-authorized user"],
    layer: "contract",
    detect: "authorizedUsersOf not empty after revoke",
  },
  {
    scenarioId: "payment.royalty",
    canBreak: ["bps > 10000", "not creator", "already set"],
    layer: "contract",
    detect: "setRoyaltyBpsPermitted revert",
    improveContract: "RoyaltyAlreadySet event",
  },
  {
    scenarioId: "payment.agent",
    canBreak: ["USDC balance < amount", "allowance < amount", "royalty not set"],
    layer: "contract",
    detect: "payForAgent revert or earnings flat",
    improveBackend: "POST /v1/payment/quote before pay; dynamic sizing in E2E",
  },
  {
    scenarioId: "payment.withdraw",
    canBreak: ["earnings=0", "reentrancy", "wrong caller"],
    layer: "contract",
    detect: "withdrawAgentEarnings revert",
  },
  {
    scenarioId: "orchestrator.tick-live",
    canBreak: ["compute 401", "model not found", "split-brain event store (2 backends)"],
    layer: "compute",
    detect: "tick 200 but mock output; performance totalTicks=0",
    improveBackend: "File-backed EventStore; require signer for compute router",
  },
  {
    scenarioId: "agent.performance",
    canBreak: ["tick dedupe key collision", "wrong backend instance"],
    layer: "backend",
    detect: "totalTicks < minTicks",
    improveBackend: "Unique txHash per tick (fixed); shared store for dev",
  },
  {
    scenarioId: "events.feed",
    canBreak: ["since filter excludes new ticks", "unbounded Tick bucket"],
    layer: "backend",
    detect: "GET /v1/events empty for recent tokenId",
    improveBackend: "Apply limit to eventName queries; default sort newest-first",
  },
  {
    scenarioId: "transfer.onchain",
    canBreak: ["invalid AccessProof", "proof nonce reuse", "expired validUntil"],
    layer: "contract",
    detect: "iTransferFrom revert",
    improveContract: "Custom errors: ProofExpired, InvalidAccessProof",
  },
  {
    scenarioId: "api.stream",
    canBreak: ["WS auth token missing", "max clients exceeded"],
    layer: "backend",
    detect: "WS closes before hello",
    improveBackend: "Document token query param; raise MAX_WS_CLIENTS in dev",
  },
  {
    scenarioId: "archive.closest",
    canBreak: ["Wayback timeout", "GET schema parsed body not query (fixed)"],
    layer: "backend",
    detect: "archive 400/500",
    improveBackend: "CDX timeout + cached snapshots; separate slow job for /snapshots",
  },
];

export function printScenarioBreakReport(): void {
  console.log("\n============================================");
  console.log("  Scenario Break Matrix (fault planning)");
  console.log("============================================");
  console.log(
    "  Use for chaos injection: each row = what to break, how E2E detects, what to fix.\n",
  );

  const byLayer = new Map<BreakLayer, ScenarioBreakCard[]>();
  for (const c of CARDS) {
    const list = byLayer.get(c.layer) ?? [];
    list.push(c);
    byLayer.set(c.layer, list);
  }

  for (const [layer, cards] of byLayer) {
    console.log(`  [${layer.toUpperCase()}]`);
    for (const c of cards) {
      console.log(`  • ${c.scenarioId}`);
      console.log(`    break: ${c.canBreak.join("; ")}`);
      console.log(`    detect: ${c.detect}`);
      if (c.improveBackend) console.log(`    backend→ ${c.improveBackend}`);
      if (c.improveContract) console.log(`    contract→ ${c.improveContract}`);
    }
    console.log("");
  }

  console.log("  Parallelization note:");
  console.log("  • Operator wallet: single nonce lane — pipeline send, batch-wait receipts");
  console.log("  • Disjoint lanes: HTTP/WS ∥ on-chain reads; post-mint HTTP ∥ vault deposit+strategy");
  console.log("  • Mega lane (default): view-sweep reads ∥ withdraw+authorize+update+royalty pipeline");
  console.log("  • ~2× wall time: E2E_REUSE_TOKEN=1 (after E2E_KEEP_TOKEN=1 seed) or E2E_SKIP_VAULT_WITHDRAW=1");
}