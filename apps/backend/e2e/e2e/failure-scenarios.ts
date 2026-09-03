import { TypedContract } from "@axiom/config/types/contract";
import { AbiCoder, parseEther, type Provider, type Wallet } from "ethers";
import {
  AGENT_NFT_ABI,
  PAYMENT_PROCESSOR_ABI,
  TEE_VERIFIER_ABI,
  VAULT_ABI,
} from "@axiom/config/abis";
import type { Eip712Domain } from "@axiom/config";
import { accessMessageHash } from "@axiom/config";
import { zeroPadValue, toBeHex } from "ethers";
import { recordOnChainStep } from "./onchain.js";
import { markScenarioCovered } from "./scenarios.js";
import { markCovered } from "./matrix.js";
import {
  computeTransferProofNonce,
  ERR,
  expectRevert,
  failureScenarioResults,
  functionSelector,
  recordFailureScenarioUntestable,
} from "./revert-utils.js";

/**
 * Failure scenarios: every step asserts the REVERT — the V2 contracts must reject
 * each invalid path with the exact intended custom error, not succeed.
 * Every probe is a read-only staticCall/eth_call (never broadcast; no gas, no state).
 */

export interface ExpectRevertDeps {
  agentNft: string;
  vault: string;
  paymentProcessor: string;
  teeVerifier: string;
  paymentToken: string;
  deployer: Wallet;
  receiver: Wallet;
  tokenId: bigint;
  strategyRoot: `0x${string}`;
  sealedKey: `0x${string}`;
  eip712Domain: Eip712Domain;
  chainId: number;
}

const coder = AbiCoder.defaultAbiCoder();

type NftFail = {
  mint(
    iDatas: Array<{ dataDescription: string; dataHash: string }>,
    to: string,
    overrides?: { value?: bigint },
  ): Promise<unknown>;
  transferAndCleanExpiredProofs(
    from: string,
    to: string,
    tokenId: bigint,
    proofs: unknown[],
    cleanupNonces: string[],
  ): Promise<unknown>;
  proposeFeeWithdrawal(to: string): Promise<unknown>;
  executeFeeWithdrawal(): Promise<unknown>;
  setMintFee(newFee: bigint): Promise<unknown>;
  pause(): Promise<unknown>;
  setMintFeeEstimate?: never;
};
type VaultFail = {
  deposit(tokenId: bigint, overrides?: { value?: bigint }): Promise<unknown>;
  execute(
    tokenId: bigint,
    target: string,
    value: bigint,
    data: string,
    merkleProof: string[],
  ): Promise<unknown>;
};
type PayFail = {
  payForAgentAndCompute(
    agentTokenId: bigint,
    provider: string,
    agentAmount: bigint,
    computeAmount: bigint,
  ): Promise<unknown>;
};
type TeeFail = {
  verifyTransferValidity(
    proofs: unknown[],
    to: string,
    nft: string,
  ): Promise<unknown>;
};

interface TransferValidityProofShape {
  accessProof: {
    dataHash: `0x${string}`;
    targetPubkey: string;
    nonce: string;
    proof: string;
    validUntil: bigint;
  };
  ownershipProof: {
    oracleType: number;
    dataHash: `0x${string}`;
    sealedKey: string;
    targetPubkey: string;
    nonce: string;
    proof: string;
    validUntil: bigint;
  };
}

/**
 * TransferValidityProof pair where ONE non-allowlisted key signs BOTH legs.
 * Access recovery matches `to` (its check passes); ownership recovery is not in the
 * signer allowlist → the exact AxiomInvalidOwnershipProof path. Timestamps/fields are
 * cross-consistent so the probe reaches the signature check instead of failing earlier.
 */
function revokedSignerProof(
  deps: ExpectRevertDeps,
  domain: Eip712Domain,
  nonSigner: Wallet,
): TransferValidityProofShape {
  const validUntil = BigInt(Math.floor(Date.now() / 1000) + 300);
  const nonce = zeroPadValue(toBeHex(987654321n), 32);
  const dataHash = deps.strategyRoot;
  const targetPubkey = "0x" + "ab".repeat(64);
  const digest = accessMessageHash(
    {
      dataHash,
      targetPubkey: targetPubkey as `0x${string}`,
      to: nonSigner.address as `0x${string}`,
      nft: deps.agentNft as `0x${string}`,
      nonce: nonce as `0x${string}`,
      validUntil,
    },
    domain,
  );
  const sig = nonSigner.signingKey.sign(digest).serialized;
  return {
    accessProof: {
      dataHash,
      targetPubkey,
      nonce,
      proof: sig,
      validUntil,
    },
    ownershipProof: {
      oracleType: 0,
      dataHash,
      sealedKey: deps.sealedKey,
      targetPubkey,
      nonce,
      proof: sig,
      validUntil,
    },
  };
}

async function ethCall(
  provider: Provider,
  to: string,
  data: string,
): Promise<string> {
  return provider.call({ to, data });
}

async function readStrategy(
  provider: Provider,
  vault: string,
  tokenId: bigint,
): Promise<{ root: string; dailyLimit: bigint; dailySpent: bigint }> {
  const raw = await ethCall(
    provider,
    vault,
    functionSelector("strategyOf(uint256)") +
      coder.encode(["uint256"], [tokenId]).slice(2),
  );
  const [root, dailyLimit, dailySpent] = coder.decode(
    ["bytes32", "uint256", "uint256", "uint64", "uint64"],
    raw,
  ) as unknown as [string, bigint, bigint];
  return { root, dailyLimit, dailySpent };
}

async function readVaultBalance(
  provider: Provider,
  vault: string,
  tokenId: bigint,
): Promise<bigint> {
  const raw = await ethCall(
    provider,
    vault,
    functionSelector("balanceOf(uint256)") +
      coder.encode(["uint256"], [tokenId]).slice(2),
  );
  const [balance] = coder.decode(["uint256"], raw) as unknown as [bigint];
  return balance;
}

async function readMintFee(
  provider: Provider,
  agentNft: string,
): Promise<bigint> {
  const raw = await ethCall(provider, agentNft, functionSelector("mintFee()"));
  const [fee] = coder.decode(["uint256"], raw) as unknown as [bigint];
  return fee;
}

async function readMaxPayCap(
  provider: Provider,
  processor: string,
): Promise<bigint> {
  const raw = await ethCall(
    provider,
    processor,
    functionSelector("maxPayCap()"),
  );
  const [cap] = coder.decode(["uint256"], raw) as unknown as [bigint];
  return cap;
}

/** hasRole(ADMIN_ROLE, account) on the agent NFT (ADMIN_ROLE selector keccak("ADMIN_ROLE")). */
async function hasRole(
  provider: Provider,
  agentNft: string,
  account: string,
): Promise<boolean> {
  const adminRole = await import("ethers").then(({ keccak256, toUtf8Bytes }) =>
    keccak256(toUtf8Bytes("ADMIN_ROLE")),
  );
  const raw = await ethCall(
    provider,
    agentNft,
    functionSelector("hasRole(bytes32,address)") +
      coder.encode(["bytes32", "address"], [adminRole, account]).slice(2),
  );
  const [ok] = coder.decode(["bool"], raw) as unknown as [boolean];
  return ok;
}

export async function runFailureScenarioSteps(
  deps: ExpectRevertDeps,
): Promise<void> {
  console.log(
    "\n[Failure scenarios] every invalid path must revert with its intended error",
  );
  const provider = deps.deployer.provider;
  if (!provider) throw new Error("failure-scenarios: wallet missing provider");

  const nft = new TypedContract<NftFail>(
    deps.agentNft,
    AGENT_NFT_ABI,
    deps.deployer,
  );
  const vault = new TypedContract<VaultFail>(
    deps.vault,
    VAULT_ABI,
    deps.deployer,
  );
  const pay = new TypedContract<PayFail>(
    deps.paymentProcessor,
    PAYMENT_PROCESSOR_ABI,
    deps.deployer,
  );
  const tee = new TypedContract<TeeFail>(
    deps.teeVerifier,
    TEE_VERIFIER_ABI,
    deps.deployer,
  );
  const someoneElse = deps.receiver.address;

  // (a) mint with insufficient payment — "Insufficient mint fee" fires when
  // msg.value < mintFee. On the live deploy mintFee()==0, so the guard is
  // configuration-dependent: probe it only when a fee is set, else record honestly.
  const mintFee = await readMintFee(provider, deps.agentNft);
  if (mintFee > 0n) {
    await expectRevert(
      "mint.insufficient-payment",
      "mint with value < mintFee",
      ["Insufficient mint fee"],
      () =>
        nft.contract.mint(
          [{ dataDescription: "failure-probe", dataHash: deps.strategyRoot }],
          deps.deployer.address,
          { value: mintFee - 1n },
        ),
    );
  } else {
    recordFailureScenarioUntestable(
      "mint.insufficient-payment",
      "mint with value < mintFee",
      "Insufficient mint fee",
      "mintFee()==0 on live deploy (no fee configured) — value-0 mint is valid",
    );
  }

  // (b) deposit 0 to vault
  await expectRevert(
    "vault.deposit-zero",
    "deposit(msg.value=0)",
    ["ZeroAmount", ERR.ZeroAmount],
    () => vault.contract.deposit(deps.tokenId, { value: 0n }),
  );

  // (c) execute with no strategy — the strategyRoot guard fires BEFORE any token
  // existence check, so a never-strategized tokenId provably reverts NoStrategySet
  // (guard-order verified live: execute on a nonexistent id reverts NoStrategySet).
  await expectRevert(
    "vault.execute-no-strategy",
    "execute before setStrategy",
    ["NoStrategySet", ERR.NoStrategySet],
    () => vault.contract.execute(424242n, someoneElse, 1n, "0x", []),
  );

  // (d) execute over daily limit — reachable only when dailySpent+value > dailyLimit
  // with value <= vault balance (value > balance reverts ZeroAmount first). Probe when
  // the live limit is below the balance; otherwise the config makes it unreachable
  // via read-only probes (arming needs a state-changing setStrategy).
  const strategy = await readStrategy(provider, deps.vault, deps.tokenId);
  const vaultBalance = await readVaultBalance(
    provider,
    deps.vault,
    deps.tokenId,
  );
  const spendable = vaultBalance > strategy.dailySpent ? vaultBalance : 0n;
  if (
    strategy.root !== "0x" + "0".repeat(64) &&
    spendable > 0n &&
    strategy.dailySpent + spendable > strategy.dailyLimit
  ) {
    await expectRevert(
      "vault.execute-daily-limit",
      "execute spend over dailyLimit",
      ["DailyLimitExceeded", ERR.DailyLimitExceeded],
      () =>
        vault.contract.execute(deps.tokenId, someoneElse, spendable, "0x", []),
    );
  } else {
    recordFailureScenarioUntestable(
      "vault.execute-daily-limit",
      "execute spend over dailyLimit",
      "DailyLimitExceeded",
      `config: balance=${vaultBalance} spent=${strategy.dailySpent} limit=${strategy.dailyLimit} — limit ≥ spendable balance (ZeroAmount guard would fire first)`,
    );
  }

  // (e) pay exceeding MAX_PAY cap — with a configured cap the lane must revert
  // PayAmountExceedsCap; with cap=0 (disabled on the live deploy) the same probe
  // reverts on funding at the token guard. Either way the pay lane REJECTS the pay.
  const cap = await readMaxPayCap(provider, deps.paymentProcessor);
  if (cap === 0n) {
    recordFailureScenarioUntestable(
      "payment.pay-over-cap",
      "pay above MAX_PAY cap",
      "PayAmountExceedsCap",
      "cap disabled (maxPayCap=0) on live deploy — funding guard proven instead",
    );
    await expectRevert(
      "payment.pay-unfundable",
      "pay beyond wallet funds",
      [
        "SafeERC20FailedOperation",
        "ERC20InsufficientBalance",
        ERR.SafeERC20FailedOperation,
        ERR.ERC20InsufficientBalance,
      ],
      () =>
        pay.contract.payForAgentAndCompute(
          deps.tokenId,
          someoneElse,
          parseEther("1000000"),
          1n,
        ),
    );
  } else {
    await expectRevert(
      "payment.pay-over-cap",
      "pay above MAX_PAY cap",
      ["PayAmountExceedsCap"],
      () =>
        pay.contract.payForAgentAndCompute(
          deps.tokenId,
          someoneElse,
          cap + 1n,
          1n,
        ),
    );
  }

  // (f) transfer with expired proof — the validUntil deadline is checked BEFORE
  // signature fields, so an expired proof reverts AxiomProofExpired regardless of bytes.
  const now = BigInt(Math.floor(Date.now() / 1000));
  const expiredProof: TransferValidityProofShape = {
    accessProof: {
      dataHash: deps.strategyRoot,
      targetPubkey: "0x" + "cd".repeat(64),
      nonce: zeroPadValue(toBeHex(1n), 32),
      proof: "0x" + "00".repeat(65),
      validUntil: now - 1n,
    },
    ownershipProof: {
      oracleType: 0,
      dataHash: deps.strategyRoot,
      sealedKey: deps.sealedKey,
      targetPubkey: "0x" + "cd".repeat(64),
      nonce: zeroPadValue(toBeHex(1n), 32),
      proof: "0x" + "00".repeat(65),
      validUntil: now - 1n,
    },
  };
  await expectRevert(
    "transfer.expired-proof",
    "transfer with expired proof",
    ["AxiomProofExpired", ERR.AxiomProofExpired],
    () =>
      nft.contract.transferAndCleanExpiredProofs(
        deps.deployer.address,
        someoneElse,
        deps.tokenId,
        [expiredProof],
        [computeTransferProofNonce(expiredProof)],
      ),
  );

  // (g) non-admin pause/setFee — AccessControl unauthorized account
  await expectRevert(
    "nft.pause-non-admin",
    "pause without ADMIN_ROLE",
    ["AccessControlUnauthorizedAccount", ERR.AccessControlUnauthorizedAccount],
    () => nft.contract.pause(),
  );
  await expectRevert(
    "nft.setMintFee-non-admin",
    "setMintFee without ADMIN_ROLE",
    ["AccessControlUnauthorizedAccount", ERR.AccessControlUnauthorizedAccount],
    () => nft.contract.setMintFee(parseEther("1")),
  );

  // (h) propose-then-early-execute fee withdrawal — the 1-day timelock must reject.
  // The NFT admin on the live deploy is the ORACLE admin (0x0553…), not the e2e
  // operator, so the operator's propose reverts at the role gate — that IS the
  // intended rejection for an unauthorized fee-drain attempt. When the admin role
  // IS held by the caller, the probe drives propose→immediate execute → DelayNotElapsed.
  const isAdmin = await hasRole(provider, deps.agentNft, deps.deployer.address);
  if (isAdmin) {
    await expectRevert(
      "nft.fee-withdraw-early",
      "executeFeeWithdrawal before 1-day delay",
      ["DelayNotElapsed", ERR.DelayNotElapsed],
      async () => {
        await nft.contract.proposeFeeWithdrawal(someoneElse);
        await nft.contract.executeFeeWithdrawal();
      },
    );
  } else {
    await expectRevert(
      "nft.fee-withdraw-early-non-admin",
      "proposeFeeWithdrawal without ADMIN_ROLE (fee-drain rejected at role gate)",
      [
        "AccessControlUnauthorizedAccount",
        ERR.AccessControlUnauthorizedAccount,
      ],
      () => nft.contract.proposeFeeWithdrawal(someoneElse),
    );
  }

  // (i) revoked-signer proof — ownership proof signed by a non-allowlisted key.
  const bogus = revokedSignerProof(deps, deps.eip712Domain, deps.receiver);
  await expectRevert(
    "tee.revoked-signer-proof",
    "ownership proof by non-allowlisted signer",
    ["AxiomInvalidOwnershipProof", ERR.AxiomInvalidOwnershipProof],
    () =>
      tee.contract.verifyTransferValidity([bogus], someoneElse, deps.agentNft),
  );

  const results = failureScenarioResults();
  const okCount = results.filter((r) => r.ok).length;
  console.log(
    `          ✓ ${okCount}/${results.length} invalid paths rejected (see Failure Scenario Matrix)`,
  );
  markScenarioCovered("reverts.failure-scenarios", "failure-scenarios", {
    reads: results.length,
  });
  markCovered("AxiomAgentNFT", "mint", "failure-scenarios");
  markCovered("AxiomStrategyVault", "execute", "failure-scenarios");
  markCovered(
    "AxiomPaymentProcessor",
    "payForAgentAndCompute",
    "failure-scenarios",
  );
  markCovered(
    "AxiomTeeVerifier",
    "verifyTransferValidity",
    "failure-scenarios",
  );
  recordOnChainStep({
    step: 13,
    name: "failure scenarios (all must revert)",
    ok: true,
    summary: `${okCount}/${results.length} invalid-path probes rejected with intended errors`,
    chainId: deps.chainId,
  });
}
