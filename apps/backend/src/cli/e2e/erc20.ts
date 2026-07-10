import { MaxUint256, type TransactionResponse, type Wallet } from "ethers";
import { TypedContract } from "@axiom/config/types/contract";
import { ERC20_ABI } from "@axiom/config/abis";
import { assertReceiptOk } from "./onchain.js";
import { markCovered } from "./matrix.js";
import { recordErc20Approve } from "./friction.js";

type Erc20 = {
  approve(spender: string, amount: bigint): Promise<TransactionResponse>;
  allowance(owner: string, spender: string): Promise<bigint>;
  balanceOf(account: string): Promise<bigint>;
};

const approvedSpend = new Map<string, bigint>();

export function resetErc20AllowanceCache(): void {
  approvedSpend.clear();
}

export async function ensureErc20Allowance(deps: {
  token: string;
  owner: Wallet;
  spender: string;
  amount: bigint;
  step: string;
}): Promise<void> {
  const token = new TypedContract<Erc20>(deps.token, ERC20_ABI, deps.owner);
  const cacheKey = `${deps.token.toLowerCase()}:${deps.spender.toLowerCase()}`;
  const cached = approvedSpend.get(cacheKey) ?? 0n;

  markCovered("MockUSDC", "balanceOf", deps.step);
  const balance = await token.contract.balanceOf(deps.owner.address);
  if (balance < deps.amount) {
    throw new Error(`ERC20 balance ${balance} < ${deps.amount} for ${deps.step}`);
  }

  markCovered("MockUSDC", "allowance", deps.step);
  const onChain = await token.contract.allowance(deps.owner.address, deps.spender);
  if (onChain >= deps.amount && cached >= deps.amount) return;

  const approveTx = await token.contract.approve(deps.spender, MaxUint256);
  assertReceiptOk(await approveTx.wait(), `approve ${deps.step}`);
  recordErc20Approve();
  markCovered("MockUSDC", "approve", deps.step);
  approvedSpend.set(cacheKey, MaxUint256);
}