import { Router } from "express";
import { ethers } from "ethers";
import { z } from "zod";
import { AGENT_NFT_ABI } from "@axiom/config/abis";
import { HTTP } from "@axiom/config";
import { getSharedProvider, ser, createLogger, createSkillRouter } from "../skills/shared.js";
import { sendError } from "../utils/response.js";
import type { ServerConfig } from "../server.js";
const log = createLogger("skills:unbroker");

export function createSkillUnbrokerRouter(config: ServerConfig): Router {
  const { router, route } = createSkillRouter(config);
  const provider = getSharedProvider();
  const getNft = (address: string) => new ethers.Contract(address, AGENT_NFT_ABI, provider);

  const unbrokerSchema = z.object({
    tokenId: z.string().regex(/^\d+$/),
    to: z.string(),
  });
  const unbrokerAnalyzeSchema = unbrokerSchema.extend({
    accessProof: z.object({ dataHash: z.string(), validUntil: z.number() }).optional(),
  });

  route(
    {
      path: "/v1/skills/unbroker/simulate",
      schema: unbrokerSchema,
      description: "Simulate an ERC-7857 transfer without sending",
    },
    async (parsed: z.infer<typeof unbrokerSchema>, _req, res) => {
      const { tokenId, to } = parsed;
      const nftAddr = config.addresses?.agentNft;
      if (!nftAddr) { sendError(res, HTTP.SERVICE_UNAVAILABLE, "AgentNFT address not configured"); return; }
      const nft = getNft(nftAddr);
      const [owner, data] = await Promise.all([
        nft.ownerOf!(BigInt(tokenId)),
        nft.intelligentDatasOf!(BigInt(tokenId)),
      ]);
      return ser({
        tokenId, to, owner,
        dataHash: data[0]?.dataHash ?? null,
        canTransfer: owner !== ethers.ZeroAddress,
      });
    },
  );

  route(
    {
      path: "/v1/skills/unbroker/route",
      schema: unbrokerSchema,
      description: "Compare transfer path options",
    },
    async (parsed: z.infer<typeof unbrokerSchema>) => {
      return ser({
        tokenId: parsed.tokenId, to: parsed.to,
        directGas: "25000", oracleGas: "45000",
        recommended: "direct",
        note: "Use oracle path if encrypted metadata re-keying is required",
      });
    },
  );

  route(
    {
      path: "/v1/skills/unbroker/analyze",
      schema: unbrokerAnalyzeSchema,
      description: "Validate transfer proof and compute safety score",
    },
    async (parsed: z.infer<typeof unbrokerAnalyzeSchema>, _req, res) => {
      const { tokenId, to, accessProof } = parsed;
      const nftAddr = config.addresses?.agentNft;
      if (!nftAddr) { sendError(res, HTTP.SERVICE_UNAVAILABLE, "AgentNFT address not configured"); return; }
      const nft = getNft(nftAddr);
      let score = 100;
      const issues: string[] = [];
      try {
        const owner = await nft.ownerOf!(BigInt(tokenId));
        const data = await nft.intelligentDatasOf!(BigInt(tokenId));
        const dataHash = data[0]?.dataHash;
        if (accessProof) {
          if (accessProof.dataHash !== dataHash) { score -= 30; issues.push("Data hash mismatch"); }
          if (accessProof.validUntil < Date.now() / 1000) { score -= 25; issues.push("Proof expired"); }
        } else { score -= 40; issues.push("No access proof provided"); }
        return ser({ tokenId, to, owner, dataHash, safetyScore: Math.max(0, score), rating: score >= 80 ? "SAFE" : score >= 50 ? "CAUTION" : "UNSAFE", issues });
      } catch (err) {
        log.warn("unbroker analyze failed", { err });
        return ser({ tokenId, to, safetyScore: 0, rating: "UNSAFE", issues: ["Failed to validate on-chain state"] });
      }
    },
  );

  route(
    {
      path: "/v1/skills/unbroker/execute",
      schema: unbrokerSchema,
      description: "Execute verified transfer",
    },
    async (parsed: z.infer<typeof unbrokerSchema>) => {
      return ser({ tokenId: parsed.tokenId, to: parsed.to, status: "queued", note: "Transfer execution requires wallet signing via encode tools" });
    },
  );

  return router;
}
