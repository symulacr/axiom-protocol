import { defineConfig } from "@wagmi/cli";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadAbi(name: string) {
  const content = readFileSync(
    join(__dirname, "abis", `${name}.json`),
    "utf-8",
  );
  return JSON.parse(content);
}

export default defineConfig({
  out: "src/abis/generated.ts",
  contracts: [
    {
      name: "AxiomAgentNFT",
      abi: loadAbi("agentNft"),
    },
    {
      name: "AxiomStrategyVault",
      abi: loadAbi("vault"),
    },
    {
      name: "AxiomPaymentProcessor",
      abi: loadAbi("paymentProcessor"),
    },
    {
      name: "AxiomTeeVerifier",
      abi: loadAbi("teeVerifier"),
    },
    {
      name: "AxiomMockUSDC",
      abi: loadAbi("mockUsdc"),
    },
  ],
});
