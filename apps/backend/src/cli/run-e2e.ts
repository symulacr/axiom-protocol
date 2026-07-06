import { Wallet, hexlify } from "ethers";
import { loadEnv, getEnv, getEnvWithAlias } from "../env.js";
import { getSharedProvider } from "../provider.js";
import {
  buildEip712Domain,
  deriveUncompressedPubkeyFromHex,
} from "@axiom/config";
import { resolveStorageRpc, GALILEO_CHAIN_ID } from "@axiom/config/networks";
import { fetchJson } from "../utils/fetch-json.js";
import { postStep } from "./e2e/http.js";
import {
  printE2eBanner,
  runHealthStep,
  runStrategyStep,
  runEncryptStep,
  runUploadStep,
  runMintStep,
  runSkippedVaultSteps,
  runTickStep,
  runTransferSteps,
  runOnChainTransferStep,
  printReport,
} from "./e2e/steps.js";

/**
 * End-to-end CLI for the Axiom Protocol on 0G Galileo testnet.
 * Per the `ts-no-dynamic-import` rule, all modules are static-imported.
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
// Wave E-5 (2026-06-16) — all addresses are env-driven so a redeploy
// doesn't require a code change. See docs/deployments/wave-e5-redeploy-2026-06-16.md.
const TEE_VERIFIER = getEnv(
  "AXIOM_TEE_VERIFIER",
  "0xB27c73aD01f61Ec1FDC302dF2350326228F14c11",
);
const PAYMENT_PROCESSOR = getEnv(
  "AXIOM_PAYMENT_PROCESSOR",
  "0xe14F3d2f927E197916284B8399ade5FfFF12CB0c",
);
const PAYMENT_TOKEN = getEnv(
  "AXIOM_PAYMENT_TOKEN",
  "0x354CA53bAB51C0666964fa050628d8351f8A7d19",
);
const AGENT_NFT = getEnv(
  "AGENT_NFT_ADDRESS",
  "0x5a89B0a41b2d9E7b661d2a4b1b06e43211b59379",
);
const VAULT = getEnv(
  "VAULT_ADDRESS",
  "0xE3f3Af712B379e2DE19ffB3a7375A15D1FC31979",
);

const provider = getSharedProvider(OG_CHAIN_ID);
const deployer = new Wallet(DEPLOYER_PK, provider);
const teeSigner = new Wallet(TEE_SIGNER_PK, provider);
const RECEIVER_PK = getEnv("RECEIVER_PK");
const receiver = new Wallet(RECEIVER_PK, provider);
const to = receiver.address as `0x${string}`;
const receiverPubKey64 = hexlify(
  deriveUncompressedPubkeyFromHex(RECEIVER_PK),
) as `0x${string}`;
const eip712Domain = buildEip712Domain(OG_CHAIN_ID, TEE_VERIFIER as `0x${string}`);

async function main(): Promise<void> {
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
  const strategyJson = runStrategyStep();
  const { blob, sealedKey } = runEncryptStep(DEPLOYER_PK, strategyJson);
  const upload = await runUploadStep({
    storageRpc: STORAGE_RPC,
    rpc: RPC,
    signer: deployer,
    blob,
  });
  await runMintStep(ORACLE_URL, upload.rootHash, fetchJson);
  runSkippedVaultSteps();
  const tokenId = "0";
  await runTickStep({
    backendUrl: BACKEND_URL,
    postStep,
    vault: VAULT,
    agentNft: AGENT_NFT,
    tokenId,
  });
  const finalResp = await runTransferSteps({
    backendUrl: BACKEND_URL,
    postStep,
    deployer,
    receiver,
    receiverPubKey64,
    to,
    tokenId,
    dataHash: upload.rootHash,
    sealedKey,
    agentNft: AGENT_NFT,
    eip712Domain,
  });
  await runOnChainTransferStep({
    agentNft: AGENT_NFT,
    deployer,
    to,
    tokenId,
    finalResp,
    eip712Domain,
  });
  printReport();
}

void main();