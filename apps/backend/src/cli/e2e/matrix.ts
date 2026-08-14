type CoverageKind = "view" | "write";
type CoverageStatus = "pending" | "covered" | "skipped";

interface MatrixEntry {
  contract: string;
  function: string;
  kind: CoverageKind;
  status: CoverageStatus;
  step?: string;
  skipReason?: string;
}

const entries = new Map<string, MatrixEntry>();

function key(contract: string, fn: string): string {
  return `${contract}::${fn}`;
}

function register(
  contract: string,
  fn: string,
  kind: CoverageKind,
  initial: CoverageStatus = "pending",
  skipReason?: string,
): void {
  const k = key(contract, fn);
  if (!entries.has(k)) {
    entries.set(k, {
      contract,
      function: fn,
      kind,
      status: initial,
      skipReason,
    });
  }
}

export function initParityMatrix(): void {
  entries.clear();

  const agentNft = "AxiomAgentNFT";
  const vault = "AxiomStrategyVault";
  const payment = "AxiomPaymentProcessor";
  const tee = "AxiomTeeVerifier";
  const erc20 = "MockUSDC";

  for (const fn of [
    "mint",
    "update",
    "creatorOf",
    "mintFee",
    "storageInfo",
    "pendingVerifier",
    "pendingVerifierExecutableAt",
    "iTransferFrom",
    "authorizeUsage",
    "revokeAuthorization",
    "authorizedUsersOf",
    "delegateAccess",
    "getDelegateAccess",
    "intelligentDatasOf",
    "intelligentDataOf",
    "verifier",
    "tokenURI",
    "name",
    "symbol",
    "ownerOf",
    "supportsInterface",
  ] as const) {
    register(
      agentNft,
      fn,
      fn.startsWith("get") ||
        fn.endsWith("Of") ||
        [
          "name",
          "symbol",
          "verifier",
          "tokenURI",
          "mintFee",
          "storageInfo",
          "pendingVerifier",
          "pendingVerifierExecutableAt",
        ].includes(fn)
        ? "view"
        : "write",
    );
  }

  for (const [fn, reason] of [
    ["mintWithRole", "requires MINTER_ROLE wallet (not E2E deployer path)"],
    ["iClone", "requires clone proofs + second data leg"],
    ["iCloneFrom", "requires clone proofs + parent token"],
    [
      "iTransfer",
      "same proof path as iTransferFrom; covered by transfer pipeline",
    ],
    ["proposeVerifier", "OPERATOR_ROLE + 1-day timelock"],
    ["executeVerifier", "OPERATOR_ROLE + timelock elapsed"],
    ["cancelVerifierProposal", "OPERATOR_ROLE admin path"],
    ["setMintFee", "ADMIN_ROLE"],
    ["setStorageInfo", "ADMIN_ROLE"],
    ["withdrawMintFees", "DEFAULT_ADMIN_ROLE"],
    ["pause", "ADMIN_ROLE"],
    ["unpause", "ADMIN_ROLE"],
    ["initialize", "proxy deploy-only"],
    ["transferFrom", "unsafe bare transfer (breaks sealed key)"],
    ["safeTransferFrom", "unsafe bare transfer"],
  ] as const) {
    register(agentNft, fn, "write", "skipped", reason);
  }

  for (const fn of [
    "deposit",
    "withdraw",
    "balanceOf",
    "setStrategy",
    "strategyOf",
  ] as const) {
    register(
      vault,
      fn,
      fn === "balanceOf" || fn === "strategyOf" ? "view" : "write",
    );
  }
  for (const [fn, reason] of [
    ["execute", "requires strategy Merkle proof tree"],
    ["recoverExcessNative", "edge-case admin recovery"],
    ["pause", "onlyOwner"],
    ["unpause", "onlyOwner"],
  ] as const) {
    register(vault, fn, "write", "skipped", reason);
  }

  for (const fn of [
    "payForAgent",
    "payComputeProvider",
    "withdrawAgentEarnings",
    "protocolTreasury",
    "pendingProtocolTreasury",
    "pendingTreasuryEffectiveAt",
    "protocolFeeBps",
    "paymentToken",
    "totalOutstandingEarnings",
    "royaltyBpsOf",
    "royaltyBpsSet",
    "agentEarningsOf",
  ] as const) {
    const view = [
      "protocolTreasury",
      "pendingProtocolTreasury",
      "pendingTreasuryEffectiveAt",
      "protocolFeeBps",
      "paymentToken",
      "totalOutstandingEarnings",
      "royaltyBpsOf",
      "royaltyBpsSet",
      "agentEarningsOf",
    ].includes(fn);
    register(payment, fn, view ? "view" : "write");
  }
  for (const [fn, reason] of [
    [
      "setRoyaltyBps",
      "creator-only; royalty folded into payAndWithdrawEarnings",
    ],
    ["proposeProtocolTreasury", "onlyOwner timelock"],
    ["executeProtocolTreasury", "onlyOwner timelock"],
    ["cancelProtocolTreasuryProposal", "onlyOwner"],
    ["setProtocolFeeBps", "onlyOwner"],
    ["setPaymentToken", "onlyOwner"],
    ["pause", "onlyOwner"],
    ["unpause", "onlyOwner"],
  ] as const) {
    register(payment, fn, "write", "skipped", reason);
  }

  for (const fn of [
    "verifyTransferValidity",
    "domainSeparator",
    "registeredSigner",
    "maxProofAgeSeconds",
    "cleanExpiredProofs",
    "owner",
  ] as const) {
    const view = fn !== "cleanExpiredProofs" && fn !== "verifyTransferValidity";
    register(tee, fn, view ? "view" : "write");
  }
  register(tee, "verifyTransferValidity", "write", "pending");
  for (const [fn, reason] of [
    ["proposeSigner", "onlyOwner timelock"],
    ["executeSigner", "onlyOwner timelock"],
    ["cancelSignerProposal", "onlyOwner"],
  ] as const) {
    register(tee, fn, "write", "skipped", reason);
  }

  for (const fn of ["approve", "balanceOf", "allowance", "transfer"] as const) {
    register(
      erc20,
      fn,
      fn === "balanceOf" || fn === "allowance" ? "view" : "write",
    );
  }
}

export function markCovered(contract: string, fn: string, step: string): void {
  const k = key(contract, fn);
  const e = entries.get(k);
  if (!e) {
    entries.set(k, {
      contract,
      function: fn,
      kind: "write",
      status: "covered",
      step,
    });
    return;
  }
  e.status = "covered";
  e.step = step;
  e.skipReason = undefined;
}

export function markSkipped(
  contract: string,
  fn: string,
  reason: string,
): void {
  const k = key(contract, fn);
  const e = entries.get(k);
  if (e) {
    e.status = "skipped";
    e.skipReason = reason;
  } else {
    register(contract, fn, "write", "skipped", reason);
  }
}

interface ParityReport {
  covered: number;
  skipped: number;
  pending: number;
  total: number;
  actionable: number;
  actionableCovered: number;
  actionablePct: number;
  pendingEntries: MatrixEntry[];
}

function computeParityReport(): ParityReport {
  const all = [...entries.values()].sort((a, b) =>
    a.contract === b.contract
      ? a.function.localeCompare(b.function)
      : a.contract.localeCompare(b.contract),
  );
  const covered = all.filter((e) => e.status === "covered").length;
  const skipped = all.filter((e) => e.status === "skipped").length;
  const pending = all.filter((e) => e.status === "pending").length;
  const actionable = all.filter((e) => e.status !== "skipped");
  const actionableCovered = actionable.filter(
    (e) => e.status === "covered",
  ).length;
  const actionablePct =
    actionable.length === 0
      ? 100
      : Math.round((actionableCovered / actionable.length) * 100);
  return {
    covered,
    skipped,
    pending,
    total: all.length,
    actionable: actionable.length,
    actionableCovered,
    actionablePct,
    pendingEntries: all.filter((e) => e.status === "pending"),
  };
}

export function printParityMatrix(): ParityReport {
  const report = computeParityReport();
  const all = [...entries.values()].sort((a, b) =>
    a.contract === b.contract
      ? a.function.localeCompare(b.function)
      : a.contract.localeCompare(b.contract),
  );

  console.log("\n============================================");
  console.log("  On-Chain Parity Matrix");
  console.log("============================================");
  console.log(
    `  Actionable: ${report.actionableCovered}/${report.actionable} (${report.actionablePct}%)  |  skipped admin/timelock: ${report.skipped}  |  pending: ${report.pending}`,
  );
  console.log("");

  let current = "";
  for (const e of all) {
    if (e.contract !== current) {
      current = e.contract;
      console.log(`  [${current}]`);
    }
    const flag =
      e.status === "covered" ? "OK" : e.status === "skipped" ? "SKIP" : "MISS";
    const detail =
      e.status === "covered"
        ? (e.step ?? "")
        : e.status === "skipped"
          ? (e.skipReason ?? "")
          : "not exercised";
    console.log(
      `    ${flag.padEnd(4)} ${e.function.padEnd(28)} ${e.kind.padEnd(5)} ${detail}`,
    );
  }

  if (report.pending > 0) {
    console.log("\n  Pending (actionable, not yet covered):");
    for (const e of report.pendingEntries) {
      console.log(`    - ${e.contract}.${e.function}`);
    }
  }

  return report;
}
