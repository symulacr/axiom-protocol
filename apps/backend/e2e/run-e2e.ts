import { Wallet, hexlify } from "ethers";
import { loadEnv, getEnv, getEnvWithAlias } from "@axiom/config/env";
import { createLogger } from "../src/utils/logger.js";

const log = createLogger("run-e2e");
import { getSharedProvider } from "../src/providers.js";
import {
  buildEip712Domain,
  deriveUncompressedPubkeyFromHex,
} from "@axiom/config";
import { getAddresses } from "@axiom/config/addresses";
import { resolveStorageRpc, ARISTOTLE_CHAIN_ID } from "@axiom/config/networks";
import { fetchJson } from "../src/utils/response.js";
import { postStep } from "./e2e/http.js";
import {
  printE2eBanner,
  runHealthStep,
  runContractsLiveStep,
  runStrategyStep,
  runEncryptStep,
  runUploadStep,
  runStorageVerifyStep,
  runOracleRegisterStep,
  runOnChainMintStep,
  runVaultDepositStrategyPipeline,
  runTickStep,
  runTransferSteps,
  runOnChainTransferStep,
  printReport,
} from "./e2e/steps.js";
import { initParityMatrix, markSkipped } from "./e2e/matrix.js";
import {
  runAuthorizeDelegateStep,
  runMatrixViewSweepStep,
  runPaymentPipelineStep,
  runPostVaultCoveragePipeline,
} from "./e2e/coverage.js";
import { resolveE2eWallets, runWalletPreflight } from "./e2e/wallet.js";
import { initUsageScenarios, markScenarioSkipped } from "./e2e/scenarios.js";
import {
  runFailureScenarioSteps,
  type ExpectRevertDeps,
} from "./e2e/failure-scenarios.js";
import { printFailureScenarioReport } from "./e2e/revert-utils.js";
import {
  noteFriction,
  recordStepDuration,
  resetFrictionFindings,
  seedFrontendFriction,
  seedKnownFriction,
} from "./e2e/friction.js";
import { resetErc20AllowanceCache } from "./e2e/erc20.js";
import {
  runAgentPerformanceStep,
  runAgentPostMintOpsStep,
  runChatToolCallStep,
  runComputeProvidersStep,
  runDataAvailabilityStep,
  runLiveComputeTickStep,
  runPaymentConfigCacheStep,
} from "./e2e/compute-agents.js";
import {
  e2eFastEnabled,
  e2eLiveComputeEnabled,
  e2eKeepTokenEnabled,
  e2eMegaPipelineEnabled,
  e2ePipelineTxEnabled,
  E2E_PAYMENT_MICRO_MIN_TOTAL,
  e2eSkipVaultWithdrawEnabled,
  resolveE2eComputeModel,
} from "./e2e/fast-path.js";
import {
  e2eReuseEnabled,
  loadE2eReuseSnapshot,
  saveE2eReuseSnapshot,
} from "./e2e/e2e-reuse.js";
import { runFrontendPostTickBundle } from "./e2e/frontend-flows.js";
import { runChatBench, printChatBenchReport } from "./e2e/chat-bench.js";
import { buildChatEval, printChatEval, CHAT_EVAL_IDS } from "./e2e/eval.js";

loadEnv();

const TEE_SIGNER_PK = getEnv("TEE_SIGNER_PK");
const RPC = getEnvWithAlias("AXIOM_EVM_RPC", ["OG_RPC_URL"]);
const STORAGE_RPC = getEnvWithAlias(
  "AXIOM_STORAGE_RPC",
  ["OG_STORAGE_RPC"],
  resolveStorageRpc(ARISTOTLE_CHAIN_ID),
);
// Explicit storage fee (wei). >0 skips SDK market() pricing — required on
// chains whose flow contract lacks market() (Galileo testnet reverts).
const STORAGE_FEE = getEnv("AXIOM_STORAGE_FEE", "0");
const BACKEND_URL = getEnv("BACKEND_URL", "http://127.0.0.1:3000");
if (process.env.BACKEND_URL === undefined) {
  console.warn("[config] BACKEND_URL defaulting to localhost");
}
const ORACLE_URL = getEnv("AXIOM_ORACLE_URL");
const OG_CHAIN_ID = Number.parseInt(
  getEnvWithAlias(
    "AXIOM_CHAIN_ID",
    ["OG_CHAIN_ID"],
    String(ARISTOTLE_CHAIN_ID),
  ),
  10,
);

const addresses = getAddresses(process.env);
const TEE_VERIFIER = getEnvWithAlias(
  "AXIOM_TEE_VERIFIER_ADDRESS",
  ["AXIOM_TEE_VERIFIER"],
  addresses.teeVerifier,
);
const PAYMENT_PROCESSOR = getEnvWithAlias(
  "AXIOM_PAYMENT_PROCESSOR_ADDRESS",
  ["AXIOM_PAYMENT_PROCESSOR", "PAYMENT_PROCESSOR_ADDRESS"],
  addresses.paymentProcessor,
);
const PAYMENT_TOKEN = getEnvWithAlias(
  "AXIOM_PAYMENT_TOKEN",
  ["AXIOM_PAYMENT_TOKEN", "AXIOM_MOCK_USDC_ADDRESS", "PAYMENT_TOKEN_ADDR"],
  addresses.paymentToken,
);
const AGENT_NFT = getEnvWithAlias(
  "AXIOM_AGENT_NFT_ADDRESS",
  ["AGENT_NFT_ADDRESS", "AXIOM_AGENT_NFT"],
  addresses.agentNft,
);
const VAULT = getEnvWithAlias(
  "AXIOM_STRATEGY_VAULT_ADDRESS",
  ["VAULT_ADDRESS"],
  addresses.strategyVault,
);

// Deployed-address bundle shared by every step-deps object in main().
const contractAddrs = {
  agentNft: AGENT_NFT,
  vault: VAULT,
  teeVerifier: TEE_VERIFIER,
  paymentProcessor: PAYMENT_PROCESSOR,
  paymentToken: PAYMENT_TOKEN,
};

const provider = getSharedProvider(OG_CHAIN_ID);
const { operator, receiver, operatorAddress, receiverAddress, source } =
  resolveE2eWallets(provider);
const teeSigner = new Wallet(TEE_SIGNER_PK, provider);

const operatorPk = operator.privateKey;
const receiverPk = receiver.privateKey;
const to = receiver.address as `0x${string}`;
const receiverPubKey64 = hexlify(
  deriveUncompressedPubkeyFromHex(receiverPk),
) as `0x${string}`;
const eip712Domain = buildEip712Domain(
  OG_CHAIN_ID,
  TEE_VERIFIER as `0x${string}`,
);

const RUN_PAYMENT = getEnv("E2E_PAYMENT", "1") !== "0";
const RUN_FAILURE_SCENARIOS = getEnv("E2E_FAILURE_SCENARIOS", "1") !== "0";
const LIVE_GATE_MIN_PCT = Number.parseInt(
  getEnv("E2E_LIVE_GATE_MIN_PCT", "85"),
  10,
);
const E2E_STRICT_FUNDING = getEnv("E2E_STRICT_FUNDING", "0") === "1";
const E2E_COMPUTE_MODEL = getEnv("E2E_COMPUTE_MODEL", "");
const E2E_FAST = e2eFastEnabled();
const E2E_LIVE_COMPUTE = e2eLiveComputeEnabled();
const E2E_PIPELINE_TX = e2ePipelineTxEnabled();
const E2E_MEGA_PIPELINE = e2eMegaPipelineEnabled();
const E2E_SKIP_VAULT_WITHDRAW = e2eSkipVaultWithdrawEnabled();
const E2E_REUSE = e2eReuseEnabled();
const E2E_KEEP_TOKEN = e2eKeepTokenEnabled();
const E2E_SKIP_TRANSFER = E2E_REUSE || E2E_KEEP_TOKEN;

/** Marks all payment parity/scenario rows skipped under the given reason (E2E_PAYMENT=0 or depleted USDC). */
function skipPaymentScenarios(reason: string): void {
  for (const fn of [
    "payForAgent",
    "payForAgentAndCompute",
    "payComputeProvider",
    "withdrawAgentEarnings",
    "approve",
    "allowance",
    "transfer",
  ] as const) {
    const contract =
      fn === "approve" || fn === "transfer" || fn === "allowance"
        ? "MockUSDC"
        : "AxiomPaymentProcessor";
    markSkipped(contract, fn, reason);
  }
  for (const id of [
    "payment.agent",
    "payment.compute",
    "payment.withdraw",
    "payment.royalty",
  ] as const) {
    markScenarioSkipped(id, reason);
  }
}

async function main(): Promise<void> {
  const t0 = Date.now();
  initParityMatrix();
  initUsageScenarios();
  resetFrictionFindings();
  resetErc20AllowanceCache();

  seedKnownFriction({
    walletSource: source,
    sameKeyOperatorAndTee:
      operator.address.toLowerCase() === teeSigner.address.toLowerCase(),
    runPayment: RUN_PAYMENT,
  });
  seedFrontendFriction();

  if (!RUN_PAYMENT) {
    skipPaymentScenarios("E2E_PAYMENT=0");
  }
  if (!RUN_FAILURE_SCENARIOS) {
    markScenarioSkipped("reverts.failure-scenarios", "E2E_FAILURE_SCENARIOS=0");
  }

  printE2eBanner({
    networkName: getEnv("OG_NETWORK_NAME", "aristotle"),
    rpc: RPC,
    storageRpc: STORAGE_RPC,
    backendUrl: BACKEND_URL,
    deployerAddress: operatorAddress,
    teeSignerAddress: teeSigner.address,
    ...contractAddrs,
  });
  console.log(
    `  Mode: fast=${E2E_FAST ? "on" : "off"} liveCompute=${E2E_LIVE_COMPUTE ? "on" : "off"} pipelineTx=${E2E_PIPELINE_TX ? "on" : "off"} mega=${E2E_MEGA_PIPELINE ? "on" : "off"} reuse=${E2E_REUSE ? "on" : "off"} keepToken=${E2E_KEEP_TOKEN ? "on" : "off"} skipVaultWithdraw=${E2E_SKIP_VAULT_WITHDRAW ? "on" : "off"}`,
  );

  const [, preflight] = await Promise.all([
    Promise.all([
      runHealthStep(BACKEND_URL, fetchJson),
      runContractsLiveStep({
        provider,
        chainId: OG_CHAIN_ID,
        ...contractAddrs,
      }),
    ]),
    runWalletPreflight({
      provider,
      operator,
      receiver,
      paymentToken: PAYMENT_TOKEN,
      chainId: OG_CHAIN_ID,
    }),
  ]);
  if (E2E_STRICT_FUNDING && !preflight.ok) {
    throw new Error(
      `E2E wallet underfunded — fund ${operatorAddress} at https://faucet.0g.ai (set E2E_STRICT_FUNDING=0 to warn only)`,
    );
  }

  const strategyJson = runStrategyStep();
  const { blob, sealedKey } = runEncryptStep(operatorPk, strategyJson);

  const reuseSnap = E2E_REUSE ? loadE2eReuseSnapshot() : null;
  let uploadRoot: `0x${string}`;
  let tokenId: bigint;
  if (reuseSnap) {
    console.log(
      `\n[E2E] REUSE tokenId=${reuseSnap.tokenId} dataHash=${reuseSnap.dataHash.slice(0, 14)}… (skip upload/mint)`,
    );
    uploadRoot = reuseSnap.dataHash;
    tokenId = BigInt(reuseSnap.tokenId);
    for (const id of [
      "storage.upload",
      "storage.verify",
      "oracle.preregister",
      "agent.mint",
      "agent.update",
    ] as const) {
      markScenarioSkipped(id, "E2E_REUSE_TOKEN");
    }
    for (const [contract, fn] of [
      ["AxiomAgentNFT", "mint"],
      // update is folded into mint (final iDatas) — skipped together.
      ["AxiomAgentNFT", "update"],
      ["AxiomAgentNFT", "iTransferFrom"],
      ["AxiomTeeVerifier", "cleanExpiredProofs"],
      ["AxiomTeeVerifier", "verifyTransferValidity"],
    ] as const) {
      markSkipped(contract, fn, "E2E_REUSE_TOKEN");
    }
    noteFriction({
      id: "e2e-reuse-token",
      severity: "info",
      category: "waste",
      message: "E2E_REUSE_TOKEN skipped storage+mint (~60s saved)",
      suggestion: "Run full E2E periodically to refresh .data/e2e-last.json",
    });
  } else {
    const upload = await runUploadStep({
      storageRpc: STORAGE_RPC,
      rpc: RPC,
      signer: operator,
      blob,
      chainId: OG_CHAIN_ID,
      storageFee: STORAGE_FEE === "0" ? undefined : BigInt(STORAGE_FEE),
    });
    uploadRoot = upload.rootHash;

    await Promise.all([
      runStorageVerifyStep({
        storageRpc: STORAGE_RPC,
        rpc: RPC,
        signer: operator,
        rootHash: upload.rootHash,
        expectedBlob: blob,
        transportKey: upload.transportKey,
      }),
      runOracleRegisterStep(ORACLE_URL, upload.rootHash, fetchJson),
    ]);

    const mint = await runOnChainMintStep({
      agentNft: AGENT_NFT,
      deployer: operator,
      dataHash: uploadRoot,
      chainId: OG_CHAIN_ID,
    });
    tokenId = mint.tokenId;
  }
  const tokenIdStr = tokenId.toString();

  const computeModel = await resolveE2eComputeModel(
    BACKEND_URL,
    E2E_COMPUTE_MODEL || undefined,
  );
  console.log(`\n[E2E] Resolved compute model: ${computeModel}`);

  const postMintHttp = Promise.all([
    runComputeProvidersStep({ backendUrl: BACKEND_URL }),
    runAgentPostMintOpsStep({
      backendUrl: BACKEND_URL,
      operatorAddress,
      tokenId: tokenIdStr,
      dataHash: uploadRoot,
    }),
    runPaymentConfigCacheStep({ backendUrl: BACKEND_URL }),
  ]);

  let vaultBalanceAfterWithdraw: bigint;
  if (E2E_PIPELINE_TX) {
    const [, balanceAfterDeposit] = await Promise.all([
      postMintHttp,
      runVaultDepositStrategyPipeline({
        vault: VAULT,
        deployer: operator,
        tokenId,
        strategyRoot: uploadRoot,
        chainId: OG_CHAIN_ID,
        skipWithdraw: E2E_SKIP_VAULT_WITHDRAW,
      }),
    ]);
    vaultBalanceAfterWithdraw = balanceAfterDeposit;
  } else {
    await postMintHttp;
    vaultBalanceAfterWithdraw = await runVaultDepositStrategyPipeline({
      vault: VAULT,
      deployer: operator,
      tokenId,
      strategyRoot: uploadRoot,
      chainId: OG_CHAIN_ID,
      skipWithdraw: E2E_SKIP_VAULT_WITHDRAW,
    });
  }

  const paymentRunnable =
    RUN_PAYMENT && preflight.operatorUsdc >= E2E_PAYMENT_MICRO_MIN_TOTAL;

  const viewSweepDeps = {
    ...contractAddrs,
    deployer: operator,
    tokenId,
    chainId: OG_CHAIN_ID,
    teeSignerAddress: teeSigner.address,
  };

  if (E2E_SKIP_VAULT_WITHDRAW) {
    noteFriction({
      id: "fast-skip-vault-withdraw",
      severity: "info",
      category: "waste",
      message:
        "E2E_SKIP_VAULT_WITHDRAW kept depositAndSetStrategy (no withdraw leg)",
      suggestion:
        "Set E2E_FULL_VAULT=1 for the folded vault.withdraw on-chain proof",
    });
    markScenarioSkipped("vault.withdraw", "E2E_SKIP_VAULT_WITHDRAW");
    markSkipped("AxiomStrategyVault", "withdraw", "E2E_SKIP_VAULT_WITHDRAW");
  }

  if (E2E_MEGA_PIPELINE) {
    const [, megaBal] = await Promise.all([
      runMatrixViewSweepStep(viewSweepDeps),
      runPostVaultCoveragePipeline({
        vault: VAULT,
        agentNft: AGENT_NFT,
        deployer: operator,
        tokenId,
        delegateAddress: teeSigner.address,
        chainId: OG_CHAIN_ID,
      }),
    ]);
    vaultBalanceAfterWithdraw = megaBal;
  } else {
    await Promise.all([
      runMatrixViewSweepStep(viewSweepDeps),
      runAuthorizeDelegateStep({
        agentNft: AGENT_NFT,
        deployer: operator,
        tokenId,
        delegateAddress: teeSigner.address,
        chainId: OG_CHAIN_ID,
      }),
    ]);
    // Mint writes final iDatas and payAndWithdrawEarnings sets royalty in-tx — no separate config txs.
    // (payAndWithdrawEarnings is e2e-only, no production producer — ledger M5.)
  }

  // Transfer route reads only mint-time NFT state (lane-independent) — start now to overlap chain mining.
  const transferHttp = E2E_SKIP_TRANSFER
    ? null
    : runTransferSteps({
        backendUrl: BACKEND_URL,
        postStep,
        deployer: operator,
        receiver,
        receiverPubKey64,
        to,
        tokenId: tokenIdStr,
        dataHash: uploadRoot,
        sealedKey,
        agentNft: AGENT_NFT,
        eip712Domain,
      });

  if (RUN_PAYMENT && !paymentRunnable) {
    if (E2E_STRICT_FUNDING) {
      throw new Error(
        `USDC ${preflight.operatorUsdc} < ${E2E_PAYMENT_MICRO_MIN_TOTAL} — fund ${operatorAddress} or E2E_PAYMENT=0`,
      );
    }
    const reason = `USDC depleted (${preflight.operatorUsdc})`;
    skipPaymentScenarios(reason);
    noteFriction({
      id: "e2e-usdc-depleted",
      severity: "warn",
      category: "waste",
      message: `Skipped payment pipeline — ${reason}`,
      suggestion: "Fund MockUSDC or set E2E_PAYMENT=0",
    });
  } else if (paymentRunnable) {
    // payAndWithdrawEarnings folds royalty-set + pay + compute + withdraw into one tx — no separate step.
    // (e2e-only, no production producer — ledger M5.)
    await runPaymentPipelineStep({
      paymentProcessor: PAYMENT_PROCESSOR,
      paymentToken: PAYMENT_TOKEN,
      deployer: operator,
      tokenId,
      provider: receiverAddress,
      chainId: OG_CHAIN_ID,
    });
  }

  const tickBalance = vaultBalanceAfterWithdraw;

  if (!E2E_LIVE_COMPUTE) {
    await runTickStep({
      backendUrl: BACKEND_URL,
      postStep,
      vault: VAULT,
      agentNft: AGENT_NFT,
      tokenId: tokenIdStr,
      vaultBalanceWei: tickBalance,
    });
  }

  if (E2E_LIVE_COMPUTE) {
    await Promise.all([
      runLiveComputeTickStep({
        backendUrl: BACKEND_URL,
        vault: VAULT,
        agentNft: AGENT_NFT,
        tokenId: tokenIdStr,
        vaultBalanceWei: tickBalance,
        computeModel,
      }),
      runChatToolCallStep({ backendUrl: BACKEND_URL, computeModel }),
    ]);
  }

  await runDataAvailabilityStep({
    backendUrl: BACKEND_URL,
    vault: VAULT,
    agentNft: AGENT_NFT,
    tokenId: tokenIdStr,
    expectedRoot: uploadRoot,
    vaultBalanceWei: tickBalance,
  });

  const minTicks = E2E_LIVE_COMPUTE ? 2 : 1;
  await Promise.all([
    runAgentPerformanceStep({
      backendUrl: BACKEND_URL,
      tokenId: tokenIdStr,
      minTicks,
    }),
    runFrontendPostTickBundle({
      backendUrl: BACKEND_URL,
      tokenId: tokenIdStr,
      minTicks,
    }),
  ]);

  // Failure scenarios: every invalid path must revert with its intended error.
  if (RUN_FAILURE_SCENARIOS) {
    const failureDeps: ExpectRevertDeps = {
      ...contractAddrs,
      deployer: operator,
      receiver,
      tokenId,
      strategyRoot: uploadRoot,
      sealedKey: hexlify(sealedKey) as `0x${string}`,
      eip712Domain,
      chainId: OG_CHAIN_ID,
    };
    await runFailureScenarioSteps(failureDeps);
  }

  if (E2E_SKIP_TRANSFER) {
    if (!E2E_REUSE) {
      saveE2eReuseSnapshot({
        tokenId: tokenIdStr,
        dataHash: uploadRoot,
        savedAt: new Date().toISOString(),
      });
    }
    for (const id of [
      "transfer.proof",
      "transfer.onchain",
      "tee.cleanup",
    ] as const) {
      markScenarioSkipped(id, E2E_REUSE ? "E2E_REUSE_TOKEN" : "E2E_KEEP_TOKEN");
    }
    noteFriction({
      id: E2E_REUSE ? "e2e-reuse-skip-transfer" : "e2e-keep-token",
      severity: "info",
      category: "waste",
      message: E2E_REUSE
        ? "E2E_REUSE_TOKEN skipped transfer+tee (~2 blocks saved)"
        : "E2E_KEEP_TOKEN skipped transfer — snapshot saved for E2E_REUSE_TOKEN",
      suggestion:
        "Run full E2E (no REUSE/KEEP) periodically for transferAndCleanExpiredProofs proofs",
    });
  } else {
    saveE2eReuseSnapshot({
      tokenId: tokenIdStr,
      dataHash: uploadRoot,
      savedAt: new Date().toISOString(),
    });
    const finalResp = await transferHttp!;
    await runOnChainTransferStep({
      agentNft: AGENT_NFT,
      deployer: operator,
      to,
      tokenId: tokenIdStr,
      finalResp,
      eip712Domain,
      chainId: OG_CHAIN_ID,
    });
    // runTeeCleanupStep removed: cleanup nonce folded into transferAndCleanExpiredProofs (same tx).
  }

  if (!E2E_LIVE_COMPUTE) {
    // Without live compute there is no live proof; mark skipped so the live gate does not fail.
    markScenarioSkipped("compute.chat-tools", "E2E_LIVE_COMPUTE=0");
    markScenarioSkipped("orchestrator.tick-live", "E2E_LIVE_COMPUTE=0");
  }

  if (process.env.E2E_CHAT_BENCH === "0") {
    // compute.chat-tools is handled by the E2E_LIVE_COMPUTE branch above.
    for (const id of CHAT_EVAL_IDS) {
      if (id === "compute.chat-tools") continue;
      markScenarioSkipped(id, "E2E_CHAT_BENCH=0");
    }
  } else {
    const chatReport = await runChatBench({
      backendUrl: BACKEND_URL,
      operatorAddress: operator.address,
      tokenId: tokenIdStr,
      vault: VAULT,
      agentNft: AGENT_NFT,
      chainId: OG_CHAIN_ID,
      liveCompute: E2E_LIVE_COMPUTE,
      operatorSigner: operator,
      contextRounds:
        Number.parseInt(process.env.CHAT_BENCH_CONTEXT_ROUNDS ?? "3", 10) || 3,
      keepAliveRounds:
        Number.parseInt(process.env.CHAT_BENCH_KEEPALIVE_ROUNDS ?? "2", 10) ||
        2,
    });
    printChatBenchReport(chatReport);
    printChatEval(buildChatEval(chatReport));
  }

  const elapsedMs = Date.now() - t0;
  recordStepDuration("e2e-total", elapsedMs);
  const elapsed = (elapsedMs / 1000).toFixed(1);
  console.log(`\n  Total wall time: ${elapsed}s (fast=${E2E_FAST})`);
  printReport({ liveGateMinPct: LIVE_GATE_MIN_PCT });
  printFailureScenarioReport();
  process.exit(0);
}

main().catch((err: unknown) => {
  const msg =
    err && typeof err === "object" && "message" in err
      ? (err as Error).message
      : String(err);
  log.error("e2e run failed", { err, errMessage: msg });
  console.error("E2E FAILED:", msg);
  process.exit(1);
});
