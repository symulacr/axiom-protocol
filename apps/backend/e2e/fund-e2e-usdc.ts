import { parseUnits, Wallet } from "ethers";
import { loadEnv, getEnv, getEnvWithAlias } from "@axiom/config/env";
import { createLogger } from "../src/utils/logger.js";

const log = createLogger("fund-e2e-usdc");
import { getAddresses } from "@axiom/config/addresses";
import { PAYMENT_TOKEN_ABI } from "@axiom/config/abis";
import { TypedContract } from "@axiom/config/types/contract";
import { ARISTOTLE_CHAIN_ID } from "@axiom/config/networks";
import { getSharedProvider } from "../src/providers.js";
import { resolveE2eWallets } from "./e2e/wallet.js";
import { E2E_PAYMENT_MICRO_MIN_TOTAL } from "./e2e/fast-path.js";

loadEnv();

const DEFAULT_MINT_HUMAN = "1000000";

interface PaymentTokenMint {
  mint(
    to: string,
    amount: bigint,
  ): Promise<{ hash: string; wait(): Promise<unknown> }>;
  balanceOf(account: string): Promise<bigint>;
  decimals(): Promise<number>;
}

async function main(): Promise<void> {
  const provider = getSharedProvider(ARISTOTLE_CHAIN_ID);
  const { operatorAddress } = resolveE2eWallets(provider);
  const addresses = getAddresses(process.env);
  const tokenAddr = getEnvWithAlias(
    "AXIOM_PAYMENT_TOKEN",
    ["AXIOM_PAYMENT_TOKEN", "AXIOM_MOCK_USDC_ADDRESS", "PAYMENT_TOKEN_ADDR"],
    addresses.paymentToken,
  );

  const mintHuman = getEnv("E2E_USDC_MINT_AMOUNT_HUMAN", DEFAULT_MINT_HUMAN);
  const broadcasterPk = getEnv("DEPLOYER_PK");
  const broadcaster = new Wallet(broadcasterPk, provider);

  const token = new TypedContract<PaymentTokenMint>(
    tokenAddr,
    PAYMENT_TOKEN_ABI,
    broadcaster,
  );
  const decimals = await token.contract.decimals();
  const amount = parseUnits(mintHuman, decimals);
  const before = await token.contract.balanceOf(operatorAddress);

  console.log("\n[E2E USDC] Minting MockUSDC");
  console.log(`  Token:     ${tokenAddr}`);
  console.log(`  Recipient: ${operatorAddress}`);
  console.log(`  Amount:    ${mintHuman} (${amount.toString()} base units)`);
  console.log(`  Balance:   ${before.toString()} before`);

  const tx = await token.contract.mint(operatorAddress, amount);
  console.log(`  Tx:        ${tx.hash}`);
  await tx.wait();

  const after = await token.contract.balanceOf(operatorAddress);
  console.log(`  Balance:   ${after.toString()} after`);

  if (after < E2E_PAYMENT_MICRO_MIN_TOTAL) {
    throw new Error(
      `Minted balance ${after} still below E2E minimum ${E2E_PAYMENT_MICRO_MIN_TOTAL}`,
    );
  }
  console.log("\n[E2E USDC] Funded — payment E2E pipeline can run.");
}

main().catch((err: unknown) => {
  log.error("fund e2e usdc run failed", { err });
  process.exit(1);
});
