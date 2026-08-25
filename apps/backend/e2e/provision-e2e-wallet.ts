import { loadEnv } from "@axiom/config/env";
import { provisionE2eWalletsToEnv } from "./e2e/wallet.js";

loadEnv();

const { operatorAddress, receiverAddress } = provisionE2eWalletsToEnv();

console.log("============================================");
console.log("  E2E Wallets Provisioned");
console.log("============================================");
console.log(`Operator (fund OG + USDC): ${operatorAddress}`);
console.log(`Receiver (transfer target): ${receiverAddress}`);
console.log("");
console.log("Fund operator OG: https://faucet.0g.ai");
console.log("Fund operator USDC: pnpm --filter @axiom/backend fund-e2e-usdc");
console.log("Keys saved to:");
console.log("  - .env (E2E_OPERATOR_PK, E2E_RECEIVER_PK, RECEIVER_PK)");
console.log("  - wallets/e2e-operator.json");
console.log("  - wallets/e2e-receiver.json");
console.log("");
console.log("Then run: cd apps/backend && pnpm run-e2e");
