import { Wallet, hexlify } from "ethers";
import { loadEnv, getEnv, getEnvWithAlias } from "../env.js";
import { getSharedProvider } from "../provider.js";
import {
  buildEip712Domain,
  deriveUncompressedPubkeyFromHex,
} from "@axiom/config";
import { getAddresses } from "@axiom/config/addresses";
import { resolveStorageRpc, GALILEO_CHAIN_ID } from "@axiom/config/networks";
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
  runVaultStrategyStep,
  runPaymentStep,
  runTickStep,
  runTransferSteps,
  runOnChainTransferStep,
  printReport,
} from "./e2e/steps.js";
import { initParityMatrix, markSkipped } from "./e2e/matrix.js";
import {
  runAuthorizeDelegateStep,
  runMatrixViewSweepStep,
  runPayComputeProviderStep,
  runRoyaltyStep,
  runTeeCleanupStep,
  runUpdateDataStep,
  runVaultWithdrawStep,
  runWithdrawEarningsStep,
} from "./e2e/coverage.js";

/**
 * Live E2E on 0G Galileo: storage upload + merkle verify, on-chain mint/deposit/
 * strategy/payment/transfer with receipt proofs and block explorer links.
 */

loadEnv();

const DEPLOYER_PK = getEnv("DEPLOYER_PK");
const TEE_SIGNER_PK = getEnv("TEE_SIGNER_PK");
const RPC = getEnvWithAlias("AXIOM_EVM_RPC", ["OG_RPC_URL"]);
const STORAGE_RPC = getEnvWithAlias(
  "AXIOM_STORAGE_RPC",
  ["OG_STORAGE_RPC"],
  resolveStorageRpc(GALILEO_CHAIN_ID),
);
const BACKEND_URL = getEnv("BACKEND_URL", "http://127.0.0.1:3000");
const ORACLE_URL = getEnv("AXIOM_ORACLE_URL");
const OG_CHAIN_ID = Number.parseInt(
  getEnvWithAlias("AXIOM_CHAIN_ID", ["OG_CHAIN_ID"], String(GALILEO_CHAIN_ID)),
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
const deployer = new Wallet(DEPLOYER_PK, provider);
const teeSigner = new Wallet(TEE_SIGNER_PK, provider);
const RECEIVER_PK = getEnvWithAlias(
  "RECEIVER_PK",
  ["AXIOM_TEST_RECEIVER_1_PK"],
  "",
);
if (!RECEIVER_PK) {
  throw new Error("Missing RECEIVER_PK or AXIOM_TEST_RECEIVER_1_PK for transfer step");
}
const receiver = new Wallet(RECEIVER_PK, provider);
const to = receiver.address as `0x${string}`;
const receiverPubKey64 = hexlify(
  deriveUncompressedPubkeyFromHex(RECEIVER_PK),
) as `0x${string}`;
const eip712Domain = buildEip712Domain(OG_CHAIN_ID, TEE_VERIFIER as `0x${string}`);

const RUN_PAYMENT = getEnv("E2E_PAYMENT", "1") !== "0";
const PARITY_MIN_PCT = Number.parseInt(getEnv("E2E_PARITY_MIN_PCT", "90"), 10);

async function main(): Promise<void> {
  initParityMatrix();
  if (!RUN_PAYMENT) {
    for (const fn of [
      "payForAgent",
      "payComputeProvider",
      "withdrawAgentEarnings",
      "setRoyaltyBpsPermitted",
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
  }

  printE2eBanner({
    networkName: getEnv("OG_NETWORK_NAME", "galileo"),
    rpc: RPC,
    storageRpc: STORAGE_RPC,
    backendUrl: BACKEND_URL,
    deployerAddress: deployer.address,
    teeSignerAddress: teeSigner.address,
    teeVerifier: TEE_VERIFIER,
    paymentProcessor: PAYMENT_PROCESSOR,
    paymentToken: PAYMENT_TOKEN,
    agentNft: AGENT_NFT,
    vault: VAULT,
  });

  await runHealthStep(BACKEND_URL, fetchJson);
  await runContractsLiveStep({
    provider,
    chainId: OG_CHAIN_ID,
    agentNft: AGENT_NFT,
    vault: VAULT,
    teeVerifier: TEE_VERIFIER,
    paymentProcessor: PAYMENT_PROCESSOR,
    paymentToken: PAYMENT_TOKEN,
  });

  const strategyJson = runStrategyStep();
  const { blob, sealedKey } = runEncryptStep(DEPLOYER_PK, strategyJson);
  const upload = await runUploadStep({
    storageRpc: STORAGE_RPC,
    rpc: RPC,
    signer: deployer,
    blob,
    chainId: OG_CHAIN_ID,
  });
  await runStorageVerifyStep({
    storageRpc: STORAGE_RPC,
    rpc: RPC,
    signer: deployer,
    rootHash: upload.rootHash,
    expectedBlob: blob,
  });
  await runOracleRegisterStep(ORACLE_URL, upload.rootHash, fetchJson);

  const mint = await runOnChainMintStep({
    agentNft: AGENT_NFT,
    deployer,
    dataHash: upload.rootHash,
    chainId: OG_CHAIN_ID,
  });
  const tokenId = mint.tokenId;
  const tokenIdStr = tokenId.toString();

  const vaultBalance = await runVaultDepositStep({
    vault: VAULT,
    deployer,
    tokenId,
    chainId: OG_CHAIN_ID,
  });
  await runVaultStrategyStep({
    vault: VAULT,
    deployer,
    tokenId,
    strategyRoot: upload.rootHash,
    chainId: OG_CHAIN_ID,
  });

  const vaultBalanceAfterWithdraw = await runVaultWithdrawStep({
    vault: VAULT,
    deployer,
    tokenId,
    chainId: OG_CHAIN_ID,
  });

  await runMatrixViewSweepStep({
    agentNft: AGENT_NFT,
    vault: VAULT,
    paymentProcessor: PAYMENT_PROCESSOR,
    teeVerifier: TEE_VERIFIER,
    paymentToken: PAYMENT_TOKEN,
    deployer,
    tokenId,
    chainId: OG_CHAIN_ID,
    teeSignerAddress: teeSigner.address,
  });

  await runAuthorizeDelegateStep({
    agentNft: AGENT_NFT,
    deployer,
    tokenId,
    delegateAddress: teeSigner.address,
    chainId: OG_CHAIN_ID,
  });

  await runUpdateDataStep({
    agentNft: AGENT_NFT,
    deployer,
    tokenId,
    dataHash: upload.rootHash,
    chainId: OG_CHAIN_ID,
  });

  if (RUN_PAYMENT) {
    await runRoyaltyStep({
      paymentProcessor: PAYMENT_PROCESSOR,
      deployer,
      tokenId,
      chainId: OG_CHAIN_ID,
    });
    await runPaymentStep({
      paymentProcessor: PAYMENT_PROCESSOR,
      paymentToken: PAYMENT_TOKEN,
      deployer,
      tokenId,
      chainId: OG_CHAIN_ID,
    });
    await runPayComputeProviderStep({
      paymentProcessor: PAYMENT_PROCESSOR,
      paymentToken: PAYMENT_TOKEN,
      deployer,
      provider: receiver.address,
      chainId: OG_CHAIN_ID,
    });
    await runWithdrawEarningsStep({
      paymentProcessor: PAYMENT_PROCESSOR,
      paymentToken: PAYMENT_TOKEN,
      deployer,
      chainId: OG_CHAIN_ID,
    });
  }

  await runTickStep({
    backendUrl: BACKEND_URL,
    postStep,
    vault: VAULT,
    agentNft: AGENT_NFT,
    tokenId: tokenIdStr,
    vaultBalanceWei: vaultBalanceAfterWithdraw,
  });

  const finalResp = await runTransferSteps({
    backendUrl: BACKEND_URL,
    postStep,
    deployer,
    receiver,
    receiverPubKey64,
    to,
    tokenId: tokenIdStr,
    dataHash: upload.rootHash,
    sealedKey,
    agentNft: AGENT_NFT,
    eip712Domain,
  });
  await runOnChainTransferStep({
    agentNft: AGENT_NFT,
    deployer,
    to,
    tokenId: tokenIdStr,
    finalResp,
    eip712Domain,
    chainId: OG_CHAIN_ID,
  });

  await runTeeCleanupStep({
    teeVerifier: TEE_VERIFIER,
    deployer,
    finalResp,
    chainId: OG_CHAIN_ID,
  });

  printReport({ parityMinPct: PARITY_MIN_PCT });
}

void main();