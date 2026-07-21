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
import { fetchJson } from "../utils/fetch-json.js";
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
import {
  initUsageScenarios,
  markScenarioSkipped,
} from "./e2e/scenarios.js";
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
