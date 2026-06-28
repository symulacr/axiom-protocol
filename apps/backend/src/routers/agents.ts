import type { Express, Request, Response, NextFunction } from "express";
import { ethers } from "ethers";
import { TypedContract } from "@axiom/config/types/contract";
import { AGENT_NFT_ABI } from "@axiom/config/abis";
import type { ServerConfig } from "../server.js";
import { sendError } from "../utils/response.js";
import { TRANSFER_TOPIC, MAX_AGENT_ENUMERATION } from "../utils/constants.js";
import type { DefaultSignerOracleClient } from "../oracle/client.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("agents");
import type { Eip712Domain } from "@axiom/oracle/signer";
import { accessMessageHash } from "@axiom/oracle/signer";
import { transferBodySchema } from "../route-schemas.js";

type AgentNFTMethods = {
  intelligentDatasOf(tokenId: bigint): Promise<{ dataDescription: string; dataHash: string }[]>;
  creatorOf(tokenId: bigint): Promise<string>;
};

export function registerAgentRoutes(
  app: Express,
  config: ServerConfig,
  provider: ethers.JsonRpcProvider,
  oracle: DefaultSignerOracleClient,
  eip712Domain: Eip712Domain,
): void {
  // TTL cache for agent listing (30s per owner)
  const agentCache = new Map<string, { data: unknown; timestamp: number }>();
  const AGENT_CACHE_TTL = 30_000;

  // GET /v1/agents — list agents owned by address
  app.get("/v1/agents", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const owner = typeof req.query.owner === "string" ? req.query.owner.toLowerCase() : undefined;
      if (!owner || !/^0x[0-9a-f]{40}$/i.test(owner)) {
        sendError(res, 400, "Valid owner address required");
        return;
      }
      // Check cache
      const cached = agentCache.get(owner);
      if (cached && Date.now() - cached.timestamp < AGENT_CACHE_TTL) {
        res.json(cached.data);
        return;
      }
      const nftAddr = config.addresses?.agentNft;
      if (!nftAddr) {
        sendError(res, 503, "Agent NFT address not configured");
        return;
      }
      const iface = new ethers.Interface([
        "function balanceOf(address) view returns (uint256)",
        "function ownerOf(uint256) view returns (address)",
        "function intelligentDatasOf(uint256) view returns (tuple(string dataDescription, bytes32 dataHash)[])",
        "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
      ]);
      const balanceHex = await provider.call({ to: nftAddr, data: iface.encodeFunctionData("balanceOf", [owner]) });
      const balance = BigInt(balanceHex);
      if (balance === 0n) {
        res.json({ owner, agents: [] });
        return;
      }
      const paddedOwner = ("0x" + "00".repeat(12) + owner.slice(2)) as `0x${string}`;
      const transferLogs = await provider.getLogs({
        address: nftAddr,
        fromBlock: 0,
        toBlock: "latest",
        topics: [TRANSFER_TOPIC, null, paddedOwner],
      });
      const seen = new Set<bigint>();
      const tokens: { tokenId: string; owner: string; dataDescription?: string }[] = [];
      for (const log of transferLogs) {
        const rawTid = log.topics[3];
        if (!rawTid) continue;
        const tokenId = BigInt(rawTid);
        if (seen.has(tokenId)) continue;
        seen.add(tokenId);
        const ownerHex = await provider.call({ to: nftAddr, data: iface.encodeFunctionData("ownerOf", [tokenId]) });
        const currentOwner = ethers.getAddress("0x" + ownerHex.slice(26));
        if (currentOwner.toLowerCase() === owner) {
          tokens.push({ tokenId: tokenId.toString(), owner });
        }
        if (tokens.length >= MAX_AGENT_ENUMERATION) break;
      }
      const metadataResults = await Promise.allSettled(
        tokens.map(async (t) => {
          try {
            const dataHex = await provider.call({ to: nftAddr, data: iface.encodeFunctionData("intelligentDatasOf", [BigInt(t.tokenId)]) });
            const decoded = iface.decodeFunctionResult("intelligentDatasOf", dataHex);
            const datas = decoded[0] as Array<{ dataDescription: string }>;
            return datas[0]?.dataDescription ?? '';
          } catch {
            return '';
          }
        }),
      );
      for (let i = 0; i < tokens.length; i++) {
        const result = metadataResults[i];
        if (result && result.status === 'fulfilled') {
          tokens[i]!.dataDescription = String(result.value ?? '');
        }
      }
      const result = { owner, agents: tokens };
      agentCache.set(owner, { data: result, timestamp: Date.now() });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // POST /v1/agents/:id/transfer — two-phase transfer (challenge + finalize)
  app.post("/v1/agents/:id/transfer", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id;
      if (!id) { sendError(res, 400, "Missing id"); return; }
      if (!config.addresses?.agentNft) {
        sendError(res, 500, "AgentNFT address not configured");
        return;
      }
      const nft = config.addresses.agentNft;
      const {
        to, receiverPubKey64, accessProofNonce,
        dataHash: dataHashIn, sealedKey: sealedKeyIn,
        oldDataEncryptionKey, oldDataUri, accessProof,
      } = transferBodySchema.parse(req.body);

      let dataHash = dataHashIn;
      if (!dataHash && config.addresses?.agentNft) {
        try {
          const nftTc = new TypedContract<AgentNFTMethods>(config.addresses.agentNft, AGENT_NFT_ABI, provider);
          const datas = await nftTc.contract.intelligentDatasOf(BigInt(id));
          dataHash = (datas as { dataHash: string }[])?.[0]?.dataHash as `0x${string}` | undefined;
        } catch (err) {
          log.warn("intelligentDatasOf failed for token", { tokenId: id, error: err instanceof Error ? err.message : String(err) });
        }
      }
      if (!dataHash) {
        sendError(res, 400, "Cannot determine dataHash for token");
        return;
      }

      let pk = receiverPubKey64;
      if (pk.length === 130 && pk.startsWith("0x04")) {
        pk = ("0x" + pk.slice(4)) as `0x${string}`;
      } else if (ethers.getBytes(pk).length === 65) {
        pk = ethers.hexlify(ethers.getBytes(pk).slice(1)) as `0x${string}`;
      }

      // Challenge stage
      const canRekey = !!(oldDataEncryptionKey && oldDataUri);
      if (!accessProof) {
        const nonce = BigInt(accessProofNonce ?? 0);
        if (canRekey) {
          const rekey = await oracle.transferValidity({
            oldDataHash: dataHash, oldDataUri: oldDataUri!,
            targetPubkey64: pk, accessProofNonce: nonce.toString(),
            oldDataEncryptionKey: oldDataEncryptionKey!, to, nft,
          });
          const validUntil = BigInt(rekey.validUntil ?? (Math.floor(Date.now() / 1000) + 86400));
          res.json({
            ok: true, stage: "challenge", tokenId: id, to, dataHash,
            oldDataHash: dataHash, newDataHash: rekey.newDataHash, newDataUri: rekey.newDataUri,
            targetPubkey: pk, accessProofNonce: nonce.toString(),
            validUntil: validUntil.toString(), sealedKey: rekey.sealedKey,
            ownershipSignature: rekey.ownershipSignature,
            signer: config.signer.address as `0x${string}`, rekeyed: true,
          });
          return;
        }
        const validUntil = BigInt(Math.floor(Date.now() / 1000)) + 86400n;
        const sealedKeyOrDefault: `0x${string}` = (sealedKeyIn && sealedKeyIn.length >= 2 ? sealedKeyIn : ("0x" + "00".repeat(32))) as `0x${string}`;
        if (!sealedKeyIn || sealedKeyIn.length < 2) {
          if (process.env.NODE_ENV === 'production') { sendError(res, 400, "sealedKey is required in production"); return; }
          log.warn("No sealedKey provided, using zero-padded fallback (devnet only)", { tokenId: id });
        }
        const tee = await oracle.signOwnership({ dataHash, sealedKey: sealedKeyOrDefault, targetPubkey: pk, to, nft, nonce, validUntil });
        res.json({ ok: true, stage: "challenge", tokenId: id, to, dataHash, targetPubkey: pk, accessProofNonce: nonce.toString(), validUntil: validUntil.toString(), ownershipSignature: tee.signature, signer: tee.signer });
        return;
      }

      // Finalize stage
      const nonce = BigInt(accessProof.nonce);
      const validUntil = BigInt(accessProof.validUntil);
      const proofDataHash = accessProof.dataHash;
      const proofTargetPubkey = accessProof.targetPubkey;
      if (proofDataHash.toLowerCase() !== dataHash.toLowerCase()) { sendError(res, 400, "accessProof dataHash mismatch"); return; }
      if (proofTargetPubkey.toLowerCase() !== pk.toLowerCase()) { sendError(res, 400, "accessProof targetPubkey mismatch"); return; }

      const accessInput = { dataHash: proofDataHash, targetPubkey: proofTargetPubkey, to, nft, nonce, validUntil };
      const recoveredPubKey = ethers.SigningKey.recoverPublicKey(ethers.getBytes(accessMessageHash(accessInput, eip712Domain)), accessProof.proof);
      const accessSigner = ethers.computeAddress(recoveredPubKey) as `0x${string}`;
      if (accessSigner.toLowerCase() !== to.toLowerCase()) {
        log.warn("accessProof signer does not match receiver — allowing anyway", { accessSigner, receiver: to });
      }
      const sealedKeyOrDefault: `0x${string}` = (sealedKeyIn && sealedKeyIn.length >= 2 ? sealedKeyIn : ("0x" + "00".repeat(32))) as `0x${string}`;
      if (!sealedKeyIn || sealedKeyIn.length < 2) {
        if (process.env.NODE_ENV === 'production') { sendError(res, 400, "sealedKey is required in production"); return; }
        log.warn("No sealedKey provided, using zero-padded fallback (devnet only)", { tokenId: id });
      }
      const tee = await oracle.signOwnership({ dataHash: proofDataHash, sealedKey: sealedKeyOrDefault, targetPubkey: proofTargetPubkey, to, nft, nonce, validUntil });
      res.json({
        ok: true, stage: "final", tokenId: id, to, accessSigner, signer: tee.signer,
        accessProof: { dataHash: proofDataHash, targetPubkey: proofTargetPubkey, nonce: nonce.toString(), proof: accessProof.proof, validUntil: validUntil.toString() },
        ownershipProof: { oracleType: 0, dataHash: proofDataHash, sealedKey: sealedKeyOrDefault, targetPubkey: proofTargetPubkey, nonce: nonce.toString(), proof: tee.signature, validUntil: validUntil.toString() },
      });
    } catch (err) {
      next(err);
    }
  });
}
