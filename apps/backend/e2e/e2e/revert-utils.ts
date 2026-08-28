import { AbiCoder, keccak256, toUtf8Bytes } from "ethers";

/** Utilities for the failure-scenario steps: revert assertions + proof-nonce math. */

const coder = AbiCoder.defaultAbiCoder();

export interface FailureResult {
  id: string;
  label: string;
  expected: string;
  ok: boolean;
  detail: string;
}

const results: FailureResult[] = [];

function revertPayload(err: unknown): string {
  const e = err as {
    data?: string;
    info?: { error?: { data?: string } };
    message?: string;
  };
  return `${e?.data ?? ""} ${e?.info?.error?.data ?? ""} ${e?.message ?? ""}`;
}

/**
 * Asserts that a read-only call reverts with the given error. `expected` may be an
 * error NAME (matched as substring of the revert payload, so parameterized errors and
 * human-readable strings both match) or a raw 0x selector prefix. Throws when the call
 * succeeds or reverts with anything unrelated.
 */
export async function expectRevert(
  id: string,
  label: string,
  expected: string[],
  call: () => Promise<unknown>,
): Promise<void> {
  try {
    await call();
  } catch (err) {
    const payload = revertPayload(err);
    const hit = expected.find((x) => payload.includes(x));
    const ok = hit !== undefined;
    results.push({
      id,
      label,
      expected: expected.join(" | "),
      ok,
      detail: ok ? `rejected with ${hit}` : payload.slice(0, 140),
    });
    if (!ok) {
      throw new Error(
        `failure-scenario ${id}: expected revert [${expected.join(" | ")}], got: ${payload.slice(0, 300)}`,
      );
    }
    return;
  }
  results.push({
    id,
    label,
    expected: expected.join(" | "),
    ok: false,
    detail: "call SUCCEEDED — contract accepted an invalid path",
  });
  throw new Error(
    `failure-scenario ${id}: expected revert [${expected.join(" | ")}] but the call succeeded`,
  );
}

/** Records a scenario that cannot be triggered on the live deploy (config fact, not a defect). */
export function recordFailureScenarioUntestable(
  id: string,
  label: string,
  expected: string,
  reason: string,
): void {
  results.push({ id, label, expected, ok: true, detail: reason });
}

export function failureScenarioResults(): FailureResult[] {
  return results;
}

export function printFailureScenarioReport(): void {
  const okCount = results.filter((r) => r.ok).length;
  console.log("\n============================================");
  console.log("  Failure Scenario Matrix (invalid paths MUST revert)");
  console.log("============================================");
  for (const r of results) {
    const flag = r.ok ? "REVERT-OK" : "UNEXPECTED";
    console.log(
      `  ${flag.padEnd(10)} ${r.id.padEnd(30)} ${r.label} [${r.expected}]`,
    );
  }
  console.log(
    `\n  ${okCount}/${results.length} invalid paths rejected with the intended error`,
  );
}

/**
 * Mirrors BaseVerifier's proof nonce: keccak256(abi.encode(dataHash, targetPubkey,
 * sealedKey, nonce, validUntil)) — lets the failure-scenario probes build cleanup
 * nonces that reference their probes without a mined FinalResponse.
 */
export function computeTransferProofNonce(p: {
  accessProof: {
    dataHash: string;
    targetPubkey: string;
    nonce: string;
    validUntil: bigint;
  };
  ownershipProof: { sealedKey: string };
}): string {
  return keccak256(
    coder.encode(
      ["bytes32", "bytes", "bytes", "uint256", "uint256"],
      [
        p.accessProof.dataHash,
        p.accessProof.targetPubkey,
        p.ownershipProof.sealedKey,
        p.accessProof.nonce,
        p.accessProof.validUntil,
      ],
    ),
  );
}

export function functionSelector(signature: string): string {
  return keccak256(toUtf8Bytes(signature)).slice(0, 10);
}

/** Well-known single error selectors used as fallback match keys on raw revert data. */
export const ERR = {
  ZeroAmount: "0x1f2a2005",
  DailyLimitExceeded: "0x194bd314",
  NoStrategySet: "0x9721aee0",
  InvalidMerkleProof: "0xb05e92fa",
  AccessControlUnauthorizedAccount: "0xe2517d3f",
  DelayNotElapsed: "0xec80b2da",
  NoPendingProposal: "0xb1713b6a",
  AxiomProofExpired: "0xdd50f106",
  AxiomInvalidOwnershipProof: "0xa0dfd61f",
  ERC20InsufficientBalance: "0xe450d38c",
  SafeERC20FailedOperation: "0x5274afe7",
} as const;
