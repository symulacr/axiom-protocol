
export type FrictionSeverity = "info" | "warn" | "waste";

export interface FrictionFinding {
  id: string;
  severity: FrictionSeverity;
  category: "duplication" | "waste" | "ux" | "config";
  message: string;
  suggestion: string;
  evidence?: string;
}

const findings: FrictionFinding[] = [];
const stepDurationsMs: Array<{ name: string; ms: number }> = [];

export function resetFrictionFindings(): void {
  findings.length = 0;
  stepDurationsMs.length = 0;
}

export function getFrictionFindings(): readonly FrictionFinding[] {
  return findings;
}

export function recordStepDuration(name: string, ms: number): void {
  stepDurationsMs.push({ name, ms });
  if (ms > 25_000) {
    noteFriction({
      id: `slow-step-${stepDurationsMs.length}`,
      severity: "warn",
      category: "ux",
      message: `E2E step "${name}" took ${(ms / 1000).toFixed(1)}s`,
      suggestion: "Profile RPC/compute latency or parallelize I/O",
      evidence: `${name}=${ms}ms`,
    });
  }
}

export function noteFriction(f: Omit<FrictionFinding, "id"> & { id?: string }): void {
  findings.push({
    id: f.id ?? `F-${findings.length + 1}`,
    ...f,
  });
}

export function seedKnownFriction(deps: {
  walletSource: "e2e-dedicated" | "legacy-env";
  sameKeyOperatorAndTee: boolean;
  runPayment: boolean;
}): void {
  noteFriction({
    id: "dual-mint-path",
    severity: "warn",
    category: "duplication",
    message: "Mint requires oracle POST /v1/agents/mint then on-chain mint — two systems must agree on dataHash",
    suggestion: "Consider single entrypoint (backend mint route) that orchestrates both legs atomically",
  });

  noteFriction({
    id: "oracle-before-mint",
    severity: "info",
    category: "ux",
    message: "Oracle registration is a separate HTTP hop from storage upload",
    suggestion: "Backend could auto-register on upload completion webhook",
  });

  noteFriction({
    id: "authorize-then-revoke",
    severity: "waste",
    category: "waste",
    message: "E2E authorizes delegate then immediately revokes (3 txs) purely for parity coverage",
    suggestion: "In production, keep authorization until transfer clears delegates via _update",
  });

  noteFriction({
    id: "vault-deposit-partial-withdraw",
    severity: "info",
    category: "waste",
    message: "Vault deposits 0.001 OG then withdraws 0.0001 OG — net lock for transfer tick only",
    suggestion: "Use single deposit amount equal to tick signal needs, or skip withdraw when testing tick only",
  });

  noteFriction({
    id: "view-sweep-after-steps",
    severity: "warn",
    category: "duplication",
    message: "View sweep re-reads fields already asserted in mint/deposit/payment steps",
    suggestion: "Collapse view sweep into a single pre-transfer snapshot or generate from step cache",
  });

  noteFriction({
    id: "transfer-reseal-local",
    severity: "info",
    category: "ux",
    message: "Transfer flow re-seals dataKey locally before POST — duplicates encrypt step crypto",
    suggestion: "Backend could accept dataKey envelope and re-seal server-side with TEE",
  });

  if (deps.walletSource === "legacy-env") {
    noteFriction({
      id: "legacy-wallet-mix",
      severity: "warn",
      category: "config",
      message: "E2E uses DEPLOYER_PK fallback instead of dedicated E2E_OPERATOR_PK",
      suggestion: "Run pnpm provision-e2e-wallet and fund E2E_OPERATOR_ADDRESS from faucet",
    });
  }

  if (deps.sameKeyOperatorAndTee) {
    noteFriction({
      id: "operator-tee-same-key",
      severity: "warn",
      category: "config",
      message: "Operator wallet and TEE signer share the same private key",
      suggestion: "Testnet-only; separate TEE_SIGNER_PK on mainnet",
    });
  }

  if (!deps.runPayment) {
    noteFriction({
      id: "payment-skipped",
      severity: "info",
      category: "config",
      message: "E2E_PAYMENT=0 skips payment scenarios — parity matrix marks them SKIP",
      suggestion: "Enable payment path for full economic loop coverage",
    });
  }
}

export function seedFrontendFriction(): void {
  noteFriction({
    id: "ui-mint-skips-storage",
    severity: "info",
    category: "ux",
    message: "Mint wizard registers oracle + on-chain mint; full 0G Storage upload still CLI/E2E-only",
    suggestion: "Add browser storage upload when backend proxy or 0G SDK is wired",
  });
  noteFriction({
    id: "ui-no-set-strategy",
    severity: "info",
    category: "ux",
    message: "StrategyPanel exposes setStrategy; legacy 3-arg vault may need ABI probe",
    suggestion: "Mirror vault-compat detectVaultAbiVariant in frontend if legacy deploys persist",
  });
  noteFriction({
    id: "ui-no-authorize-delegate",
    severity: "info",
    category: "ux",
    message: "DelegatePanel covers authorizeUsage; payComputeProvider still chat/backend only",
    suggestion: "Add compute payment UI on Payments tab when product-ready",
  });
  noteFriction({
    id: "ui-royalty-encode-only",
    severity: "info",
    category: "duplication",
    message: "PaymentPanel uses POST /royalty encode — E2E also runs on-chain setRoyaltyBpsPermitted",
    suggestion: "Single path: encode via API then wallet signs (already partial in UI)",
  });
  noteFriction({
    id: "e2e-mock-tick-redundant",
    severity: "waste",
    category: "waste",
    message: "Mock orchestrator tick duplicates live tick when E2E_LIVE_COMPUTE=1",
    suggestion: "Skip mock tick in fast+live mode; live + availability ticks cover endpoint",
  });
}

let approveTxCount = 0;

export function recordErc20Approve(): void {
  approveTxCount += 1;
  if (approveTxCount > 1) {
    noteFriction({
      id: "duplicate-erc20-approve",
      severity: "waste",
      category: "duplication",
      message: `Multiple ERC20 approve txs in one run (${approveTxCount})`,
      suggestion: "Use ensureErc20Allowance with max allowance once per spender",
      evidence: `approve count=${approveTxCount}`,
    });
  }
}

export function printFrictionReport(): void {
  console.log("\n============================================");
  console.log("  Friction / Waste / Duplication Report");
  console.log("============================================");

  const bySeverity = (s: FrictionSeverity) =>
    findings.filter((f) => f.severity === s);

  for (const sev of ["waste", "warn", "info"] as const) {
    const group = bySeverity(sev);
    if (group.length === 0) continue;
    console.log(`\n  [${sev.toUpperCase()}]`);
    for (const f of group) {
      console.log(`  • ${f.message}`);
      console.log(`    → ${f.suggestion}`);
      if (f.evidence) console.log(`    evidence: ${f.evidence}`);
    }
  }

  if (findings.length === 0) {
    console.log("  No friction findings recorded.");
  } else {
    console.log(`\n  ${findings.length} finding(s) — review for prod UX + gas savings`);
  }

  const slow = stepDurationsMs.filter((s) => s.ms > 10_000).sort((a, b) => b.ms - a.ms);
  if (slow.length > 0) {
    console.log("\n  Slow steps (>10s):");
    for (const s of slow.slice(0, 5)) {
      console.log(`  • ${s.name}: ${(s.ms / 1000).toFixed(1)}s`);
    }
  }
}