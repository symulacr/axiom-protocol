import { Router } from "express";
import type { JsonRpcProvider } from "ethers";
import { z } from "zod";
import { AGENT_NFT_ABI } from "@axiom/config/abis";
import { addressViem, hexViem } from "@axiom/config/types/schemas";
import { TypedContract } from "@axiom/config/types/contract";
import type { ServerConfig } from "../server.js";
import { createRoute } from "./route-factory.js";

const mintEncodeSchema = z.object({
  dataDescription: z.string().min(1).max(1024),
  dataHash: hexViem,
  to: addressViem,
});

type MintEncodeBody = z.infer<typeof mintEncodeSchema>;

type AgentNftMintEncodeMethods = {
  mintFee(): Promise<bigint>;
};

export function createMintEncodeRouter(
  config: ServerConfig,
  provider: JsonRpcProvider,
): Router {
  const router = Router();

  createRoute(
    router,
    {
      method: "post",
      path: "/v1/agents/mint/encode",
      schema: mintEncodeSchema,
      requireAddress: "agentNft",
      consumer: "useMintEncode",
      description: "Encode AxiomAgentNFT mint transaction (value = on-chain mintFee)",
    },
    async (parsed: MintEncodeBody, _req, _res, { config: cfg }) => {
      const nftAddr = cfg.addresses!.agentNft;
      const nftTc = new TypedContract<AgentNftMintEncodeMethods>(
        nftAddr,
        AGENT_NFT_ABI,
        provider,
      );
      const mintFee = await nftTc.contract.mintFee();
      const data = nftTc.iface.encodeFunctionData("mint", [
        [{ dataDescription: parsed.dataDescription, dataHash: parsed.dataHash }],
        parsed.to,
      ]);
      return { to: nftAddr, data, value: mintFee.toString() };
    },
    config,
  );

  return router;
}