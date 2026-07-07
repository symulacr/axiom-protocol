import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Wallet, type Provider } from "ethers";
import { getEnv, getEnvWithAlias } from "../../env.js";
import { addressExplorerUrl } from "./onchain.js";
import { E2E_PAYMENT_MICRO_MIN_TOTAL } from "./fast-path.js";

export interface E2eWalletBundle {
  operator: Wallet;
  receiver: Wallet;
  operatorAddress: string;
  receiverAddress: string;
  source: "e2e-dedicated" | "legacy-env";
}

const REPO_ROOT = join(import.meta.dirname, "../../../../..");

export function resolveE2eWallets(provider: Provider): E2eWalletBundle {
  const e2eOperatorPk = getEnvWithAlias(
    "E2E_OPERATOR_PK",
    ["AXIOM_E2E_OPERATOR_PK"],
    "",
  );
  const e2eReceiverPk = getEnvWithAlias(
    "E2E_RECEIVER_PK",
    ["AXIOM_E2E_RECEIVER_PK", "RECEIVER_PK", "AXIOM_TEST_RECEIVER_1_PK"],
    "",
  );

  if (e2eOperatorPk && e2eReceiverPk) {
    const operator = new Wallet(e2eOperatorPk, provider);
    const receiver = new Wallet(e2eReceiverPk, provider);
    return {
      operator,
      receiver,
      operatorAddress: operator.address,
      receiverAddress: receiver.address,
      source: "e2e-dedicated",
    };
  }

  const deployerPk = getEnv("DEPLOYER_PK");
  const receiverPk = getEnvWithAlias(
    "RECEIVER_PK",
    ["AXIOM_TEST_RECEIVER_1_PK"],
    "",
  );
  if (!receiverPk) {
    throw new Error(
      "Missing E2E wallet: set E2E_OPERATOR_PK + E2E_RECEIVER_PK, or DEPLOYER_PK + RECEIVER_PK. Run: pnpm --filter @axiom/backend provision-e2e-wallet",
    );
  }
  return {
    operator: new Wallet(deployerPk, provider),
    receiver: new Wallet(receiverPk, provider),
    operatorAddress: new Wallet(deployerPk).address,
    receiverAddress: new Wallet(receiverPk).address,
    source: "legacy-env",
  };
}

export interface PreflightResult {
  operatorOg: bigint;
  receiverOg: bigint;
  operatorUsdc: bigint;
  paymentToken: string;
  ok: boolean;
  warnings: string[];
}

export async function runWalletPreflight(deps: {
  provider: Provider;
  operator: Wallet;
  receiver: Wallet;
  paymentToken: string;
  chainId: number;
  minOperatorOgWei?: bigint;
  minOperatorUsdc?: bigint;
}): Promise<PreflightResult> {
  const minOg = deps.minOperatorOgWei ?? 50_000_000_000_000_000n; // 0.05 OG
  const minUsdc = deps.minOperatorUsdc ?? E2E_PAYMENT_MICRO_MIN_TOTAL;
  const warnings: string[] = [];

  const operatorOg = await deps.provider.getBalance(deps.operator.address);
  const receiverOg = await deps.provider.getBalance(deps.receiver.address);

  let operatorUsdc = 0n;
  try {
    const { TypedContract } = await import("@axiom/config/types/contract");
    const { ERC20_ABI } = await import("@axiom/config/abis");
    const token = new TypedContract<{ balanceOf(a: string): Promise<bigint> }>(
      deps.paymentToken,
      ERC20_ABI,
      deps.operator,
    );
    operatorUsdc = await token.contract.balanceOf(deps.operator.address);
  } catch {
    warnings.push("Could not read MockUSDC balance");
  }

  if (operatorOg < minOg) {
    warnings.push(
      `Operator OG low: ${operatorOg} wei < ${minOg} — fund ${deps.operator.address} at https://faucet.0g.ai`,
    );
  }
  if (operatorUsdc < minUsdc) {
    warnings.push(
      `Operator USDC low: ${operatorUsdc} < ${minUsdc} — transfer MockUSDC to ${deps.operator.address}`,
    );
  }
  const infoOnly: string[] = [];
  if (receiverOg === 0n) {
    infoOnly.push(
      `Receiver has 0 OG (OK for transfer-only; needs OG only if signing txs on-chain)`,
    );
  }

  const faucet = getEnv("OG_FAUCET_URL", "https://faucet.0g.ai");
  console.log("\n[E2E Wallets] Preflight");
  console.log(`  Operator: ${deps.operator.address} (${addressExplorerUrl(deps.chainId, deps.operator.address)})`);
  console.log(`  Receiver: ${deps.receiver.address} (${addressExplorerUrl(deps.chainId, deps.receiver.address)})`);
  console.log(`  Operator OG:  ${operatorOg} wei`);
  console.log(`  Receiver OG:  ${receiverOg} wei`);
  console.log(`  Operator USDC: ${operatorUsdc}`);
  console.log(`  Faucet: ${faucet}`);
  for (const w of warnings) console.log(`  ⚠ ${w}`);
  for (const i of infoOnly) console.log(`  ℹ ${i}`);

  return {
    operatorOg,
    receiverOg,
    operatorUsdc,
    paymentToken: deps.paymentToken,
    ok: warnings.length === 0,
    warnings: [...warnings, ...infoOnly],
  };
}

/** Generate fresh E2E operator + receiver keypairs and append to repo .env */
export function provisionE2eWalletsToEnv(): {
  operatorAddress: string;
  receiverAddress: string;
} {
  const walletsDir = join(REPO_ROOT, "wallets");
  mkdirSync(walletsDir, { recursive: true });

  const operator = Wallet.createRandom();
  const receiver = Wallet.createRandom();
  const createdAt = new Date().toISOString();

  writeFileSync(
    join(walletsDir, "e2e-operator.json"),
    `${JSON.stringify(
      {
        role: "e2e-operator",
        address: operator.address,
        privateKey: operator.privateKey,
        mnemonic: operator.mnemonic?.phrase ?? null,
        createdAt,
        network: "0G Galileo (16602)",
        faucet: "https://faucet.0g.ai",
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
  writeFileSync(
    join(walletsDir, "e2e-receiver.json"),
    `${JSON.stringify(
      {
        role: "e2e-receiver",
        address: receiver.address,
        privateKey: receiver.privateKey,
        createdAt,
        network: "0G Galileo (16602)",
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );

  const envPath = join(REPO_ROOT, ".env");
  let env = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  env = env
    .split("\n")
    .filter(
      (l) =>
        !/^E2E_OPERATOR_|^E2E_RECEIVER_|^# ─── E2E dedicated/.test(l),
    )
    .join("\n");
  if (!env.endsWith("\n")) env += "\n";
  env += `
# ─── E2E dedicated wallets (generated ${createdAt.slice(0, 10)}) ───
# Fund operator OG: https://faucet.0g.ai
E2E_OPERATOR_PK=${operator.privateKey}
E2E_OPERATOR_ADDRESS=${operator.address}
E2E_RECEIVER_PK=${receiver.privateKey}
E2E_RECEIVER_ADDRESS=${receiver.address}
RECEIVER_PK=${receiver.privateKey}
`;
  writeFileSync(envPath, env);

  return {
    operatorAddress: operator.address,
    receiverAddress: receiver.address,
  };
}