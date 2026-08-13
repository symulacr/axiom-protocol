import { Wallet, hexlify } from "ethers";
import { loadEnv, getEnv, getEnvWithAlias } from "@axiom/config/env";
import { createLogger } from "../utils/logger.js";

const log = createLogger("run-e2e");
import { getSharedProvider } from "../provider.js";
import {
  buildEip712Domain,
  deriveUncompressedPubkeyFromHex,
} from "@axiom/config";
import { getAddresses } from "@axiom/config/addresses";
import { resolveStorageRpc, ARISTOTLE_CHAIN_ID } from "@axiom/config/networks";
import { fetchJson } from "../utils/response.js";
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
  runVaultDepositStep,
  runVaultDepositStrategyPipeline,
  runVaultStrategyStep,
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
  runTeeCleanupStep,
  runUpdateDataStep,
  runUpdateRoyaltyPipelineStep,
  runVaultWithdrawStep,
  runWithdrawEarningsStep,
} from "./e2e/coverage.js";
import { resolveE2eWallets, runWalletPreflight } from "./e2e/wallet.js";
import { initUsageScenarios, markScenarioSkipped } from "./e2e/scenarios.js";
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
import { buildChatEval, printChatEval } from "./e2e/eval.js";

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
  ["AXIOM_MOCK_USDC_ADDRESS", "PAYMENT_TOKEN_ADDR"],
  addresses.mockUsdc,
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
    for (const fn of [
      "payForAgent",
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
      markSkipped(contract, fn, "E2E_PAYMENT=0");
    }
    for (const id of [
      "payment.royalty",
      "payment.agent",
      "payment.compute",
      "payment.withdraw",
    ] as const) {
      markScenarioSkipped(id, "E2E_PAYMENT=0");
    }
  }

  printE2eBanner({
    networkName: getEnv("OG_NETWORK_NAME", "aristotle"),
    rpc: RPC,
    storageRpc: STORAGE_RPC,
    backendUrl: BACKEND_URL,
    deployerAddress: operatorAddress,
    teeSignerAddress: teeSigner.address,
    teeVerifier: TEE_VERIFIER,
    paymentProcessor: PAYMENT_PROCESSOR,
    paymentToken: PAYMENT_TOKEN,
    agentNft: AGENT_NFT,
    vault: VAULT,
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
        agentNft: AGENT_NFT,
        vault: VAULT,
        teeVerifier: TEE_VERIFIER,
        paymentProcessor: PAYMENT_PROCESSOR,
        paymentToken: PAYMENT_TOKEN,
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
    ] as const) {
      markScenarioSkipped(id, "E2E_REUSE_TOKEN");
    }
    for (const [contract, fn] of [
      ["AxiomAgentNFT", "mint"],
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
      }),
    ]);
    vaultBalanceAfterWithdraw = balanceAfterDeposit;
  } else {
    await postMintHttp;
    await runVaultDepositStep({
      vault: VAULT,
      deployer: operator,
      tokenId,
      chainId: OG_CHAIN_ID,
    });
    await runVaultStrategyStep({
      vault: VAULT,
      deployer: operator,
      tokenId,
      strategyRoot: uploadRoot,
      chainId: OG_CHAIN_ID,
    });
    vaultBalanceAfterWithdraw = await runVaultWithdrawStep({
      vault: VAULT,
      deployer: operator,
      tokenId,
      chainId: OG_CHAIN_ID,
    });
  }

  const paymentRunnable =
    RUN_PAYMENT && preflight.operatorUsdc >= E2E_PAYMENT_MICRO_MIN_TOTAL;

  const viewSweepDeps = {
    agentNft: AGENT_NFT,
    vault: VAULT,
    paymentProcessor: PAYMENT_PROCESSOR,
    teeVerifier: TEE_VERIFIER,
    paymentToken: PAYMENT_TOKEN,
    deployer: operator,
    tokenId,
    chainId: OG_CHAIN_ID,
    teeSignerAddress: teeSigner.address,
  };

  if (E2E_MEGA_PIPELINE) {
    if (E2E_SKIP_VAULT_WITHDRAW) {
      noteFriction({
        id: "fast-skip-vault-withdraw",
        severity: "info",
        category: "waste",
        message: "E2E_SKIP_VAULT_WITHDRAW skipped withdraw in mega pipeline",
        suggestion:
          "Set E2E_FULL_VAULT=1 for full vault.withdraw on-chain proof",
      });
      markScenarioSkipped("vault.withdraw", "E2E_SKIP_VAULT_WITHDRAW");
    }
    const [, megaBal] = await Promise.all([
      runMatrixViewSweepStep(viewSweepDeps),
      runPostVaultCoveragePipeline({
        vault: VAULT,
        agentNft: AGENT_NFT,
        paymentProcessor: PAYMENT_PROCESSOR,
        deployer: operator,
        tokenId,
        dataHash: uploadRoot,
        delegateAddress: teeSigner.address,
        chainId: OG_CHAIN_ID,
        skipWithdraw: E2E_SKIP_VAULT_WITHDRAW,
        withRoyalty: RUN_PAYMENT,
      }),
    ]);
    vaultBalanceAfterWithdraw = megaBal;
  } else {
    if (!E2E_SKIP_VAULT_WITHDRAW && E2E_PIPELINE_TX) {
      vaultBalanceAfterWithdraw = await runVaultWithdrawStep({
        vault: VAULT,
        deployer: operator,
        tokenId,
        chainId: OG_CHAIN_ID,
      });
    } else if (E2E_SKIP_VAULT_WITHDRAW) {
      noteFriction({
        id: "fast-skip-vault-withdraw",
        severity: "info",
        category: "waste",
        message:
          "E2E_SKIP_VAULT_WITHDRAW / fast path skipped withdraw (~1 block saved)",
        suggestion: "Set E2E_FULL_VAULT=1 for full vault.withdraw scenario",
      });
      markScenarioSkipped("vault.withdraw", "E2E_SKIP_VAULT_WITHDRAW");
    }

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

    if (RUN_PAYMENT) {
      await runUpdateRoyaltyPipelineStep({
        agentNft: AGENT_NFT,
        paymentProcessor: PAYMENT_PROCESSOR,
        deployer: operator,
        tokenId,
        dataHash: uploadRoot,
        chainId: OG_CHAIN_ID,
      });
    } else {
      await runUpdateDataStep({
        agentNft: AGENT_NFT,
        deployer: operator,
        tokenId,
        dataHash: uploadRoot,
        chainId: OG_CHAIN_ID,
      });
    }
  }

  // Transfer proofs = 2 backend/oracle HTTP round-trips (challenge→final);
  // route reads only mint-time NFT state (ownerOf/balanceOf/dataHash), so it
  // is independent of the payment/tick/DA/perf lanes. Start it NOW to overlap
  // chain mining; iTransferFrom (ownership move) still awaits it at the end.
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
    for (const fn of [
      "payForAgent",
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
    ] as const) {
      markScenarioSkipped(id, reason);
    }
    noteFriction({
      id: "e2e-usdc-depleted",
      severity: "warn",
      category: "waste",
      message: `Skipped payment pipeline — ${reason}`,
      suggestion: "Fund MockUSDC or set E2E_PAYMENT=0",
    });
  } else if (paymentRunnable) {
    await runPaymentPipelineStep({
      paymentProcessor: PAYMENT_PROCESSOR,
      paymentToken: PAYMENT_TOKEN,
      deployer: operator,
      tokenId,
      provider: receiverAddress,
      chainId: OG_CHAIN_ID,
    });
    await runWithdrawEarningsStep({
      paymentProcessor: PAYMENT_PROCESSOR,
      paymentToken: PAYMENT_TOKEN,
      deployer: operator,
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
        "Run full E2E (no REUSE/KEEP) periodically for iTransferFrom proofs",
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

    await runTeeCleanupStep({
      teeVerifier: TEE_VERIFIER,
      deployer: operator,
      finalResp,
      chainId: OG_CHAIN_ID,
    });
  }

  if (!E2E_LIVE_COMPUTE) {
    // Without live compute, these scenarios cannot produce live proof; mark
    // them skipped regardless of E2E_CHAT_BENCH so the live gate does not
    // fail on them (runLiveChatToolsBench also short-circuits on !liveCompute).
    markScenarioSkipped("compute.chat-tools", "E2E_LIVE_COMPUTE=0");
    markScenarioSkipped("orchestrator.tick-live", "E2E_LIVE_COMPUTE=0");
  }

  if (process.env.E2E_CHAT_BENCH === "0") {
    for (const id of [
      "chat.tools-read",
      "chat.tools-write",
      "chat.tools-complex",
      "chat.cache-hit",
      "chat.keepalive",
      "chat.context-growth",
      "chat.model-switch",
    ] as const) {
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
