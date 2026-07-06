/**
 * Friction / waste / duplication detector for live E2E runs.
 */

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

export function resetFrictionFindings(): void {
  findings.length = 0;
}

export function noteFriction(f: Omit<FrictionFinding, "id"> & { id?: string }): void {
  findings.push({
    id: f.id ?? `F-${findings.length + 1}`,
    ...f,
  });
}

/** Built-in static friction points in the E2E design */
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
}