const AGENT_NFT_IFACE = new ethers.Interface([
  "function balanceOf(address) view returns (uint256)",
  "function ownerOf(uint256) view returns (address)",
  "function intelligentDatasOf(uint256) view returns (tuple(string dataDescription, bytes32 dataHash)[])",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);
import { hexViem, addressViem } from "@axiom/config/types/hex";
import { AGENT_NFT_ABI } from "@axiom/config/abis";
import { z } from "zod";
import type { Express, Request, Response } from "express";
import { ethers } from "ethers";
import type { Hex } from "viem";
import { TypedContract, type AgentNFTMethods } from "@axiom/config/types/contract";
import { type ServerConfig, isUpstreamTransportError } from "../server.js";
import { sendError, extractErrorMessage } from "../utils/response.js";
import { TTLCache } from "../utils/cache.js";
import { TRANSFER_TOPIC } from "@axiom/config";
import type { DefaultSignerOracleClient } from "../oracle/client.js";
import { createLogger } from "../utils/logger.js";
import { createRoute } from "./route-factory.js";

const log = createLogger("agents");

const MAX_AGENT_ENUMERATION = 100 as const;
const AGENT_LOG_SCAN_BLOCKS = 50_000;

const mintEncodeSchema = z.object({
  dataDescription: z.string().min(1).max(1024),
  dataHash: hexViem,
  to: addressViem,
});

type MintEncodeBody = z.infer<typeof mintEncodeSchema>;

type AgentNftMintEncodeMethods = {
  mintFee(): Promise<bigint>;
};
import type { Eip712Domain, OwnershipProofInput } from "@axiom/config";
import {
  recoverAccessSigner,
  recoverOwnershipSigner,
  HTTP,
} from "@axiom/config";
import { transferBodySchema } from "../route-schemas.js";

function resolveSealedKey(sealedKeyIn: string | undefined): {
  key: `0x${string}`;
  missing: boolean;
} {
  const key = (
    sealedKeyIn && sealedKeyIn.length >= 2
      ? sealedKeyIn
      : "0x" + "00".repeat(32)
  ) as `0x${string}`;
  return { key, missing: !sealedKeyIn || sealedKeyIn.length < 2 };
}

// The oracle returns a signature it produced with its TEE key. We MUST verify
// that signature against the SERVER-CONFIGURED trusted TEE signer
// (AXIOM_TEE_SIGNER_PK) — NOT the signer the oracle claims for itself. A
// malicious or swapped oracle could sign with any key and report that same key
// as `tee.signer`, which would trivially pass a self-comparison. Recovering the
// signer from the signature and comparing it to the configured address catches
// oracle swaps / misconfiguration before we relay the proof to the client.
export function assertTrustedOracleSigner(
  res: Response,
  signature: Hex,
  input: OwnershipProofInput,
  trustedSigner: Hex,
  domain: Eip712Domain,
): boolean {
  const recovered = recoverOwnershipSigner(signature, input, domain);
  if (recovered.toLowerCase() !== trustedSigner.toLowerCase()) {
    sendError(
      res,
      HTTP.BAD_GATEWAY,
      "oracle ownership signature is not from the configured trusted TEE signer",
      "ORACLE_SIGNATURE_INVALID",
    );
    return false;
  }
  return true;
}

export function registerAgentRoutes(
  app: Express,
  config: ServerConfig,
  provider: ethers.JsonRpcProvider,
  oracle: DefaultSignerOracleClient,
  eip712Domain: Eip712Domain,
  nftTc: TypedContract<AgentNFTMethods> | null,
): void {
  const agentListTtlMs = (() => {
    const n = Number.parseInt(process.env.AXIOM_AGENT_LIST_CACHE_MS ?? "", 10);
    return Number.isFinite(n) && n > 0 ? n : 120_000;
  })();
  const agentCache = new TTLCache<unknown>(agentListTtlMs);

  // Trust anchor for oracle ownership proofs: the TEE signer this backend is
  // configured to trust. Derived once from env so every proof is checked
  // against a server-controlled address, never the oracle's self-claimed
  // `tee.signer` (which a malicious oracle could forge to match its own key).
  const trustedSigner = config.env
    ? (ethers.computeAddress(config.env.AXIOM_TEE_SIGNER_PK) as Hex)
    : ("0x0000000000000000000000000000000000000000" as Hex);

  createRoute(app, {
    path: "/v1/agents",
    method: "get",
    consumer: "agents",
    description: "List owned agents",
  }, async (_parsed: unknown, req: Request, res: Response) => {
    const owner =
      typeof req.query.owner === "string"
        ? req.query.owner.toLowerCase()
        : undefined;
    if (!owner || !/^0x[0-9a-f]{40}$/i.test(owner)) {
      sendError(res, HTTP.BAD_REQUEST, "Valid owner address required");
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=120");
    const bypassCache =
      req.query.fresh === "1" ||
      req.query.nocache === "1" ||
      req.get("cache-control")?.includes("no-cache");
    if (!bypassCache) {
      const cached = agentCache.get(owner);
      if (cached) {
        res.json(cached);
        return;
      }
    }
    const nftAddr = config.addresses?.agentNft;
    if (!nftAddr) {
      sendError(res, HTTP.SERVICE_UNAVAILABLE, "Agent NFT address not configured");
      return;
    }
    const iface = AGENT_NFT_IFACE;
    const balanceHex = await provider.call({
      to: nftAddr,
      data: iface.encodeFunctionData("balanceOf", [owner]),
    });
    const balance = BigInt(balanceHex);
    if (balance === 0n) {
      res.json({ owner, agents: [] });
      return;
    }
    const paddedOwner = ("0x" +
      "00".repeat(12) +
      owner.slice(2)) as `0x${string}`;
    const latest = await provider.getBlockNumber();
    const fromBlock = Math.max(0, latest - AGENT_LOG_SCAN_BLOCKS);
    let transferLogs = await provider.getLogs({
      address: nftAddr,
      fromBlock,
      toBlock: "latest",
      topics: [TRANSFER_TOPIC, null, paddedOwner],
    });
    if (transferLogs.length === 0) {
      try {
        transferLogs = await provider.getLogs({
          address: nftAddr,
          fromBlock: 0,
          toBlock: "latest",
          topics: [TRANSFER_TOPIC, null, paddedOwner],
        });
      } catch {
        // best-effort: a log fetch failure must not abort the owner lookup
      }
    }
    const seen = new Set<bigint>();
    const uniqueTokenIds: bigint[] = [];
    for (const log of transferLogs) {
      const rawTid = log.topics[3];
      if (!rawTid) continue;
      const tokenId = BigInt(rawTid);
      if (seen.has(tokenId)) continue;
      seen.add(tokenId);
      uniqueTokenIds.push(tokenId);
    }
    const ownerResults = await Promise.all(
      uniqueTokenIds.slice(0, MAX_AGENT_ENUMERATION).map(async (tokenId) => {
        const ownerHex = await provider.call({
          to: nftAddr,
          data: iface.encodeFunctionData("ownerOf", [tokenId]),
        });
        const currentOwner = ethers.getAddress("0x" + ownerHex.slice(26));
        return currentOwner.toLowerCase() === owner
          ? { tokenId: tokenId.toString(), owner }
          : null;
      }),
    );
    const tokens: { tokenId: string; owner: string; dataDescription?: string }[] =
      ownerResults.filter((t): t is NonNullable<typeof t> => t !== null);
    const metadataResults = await Promise.allSettled(
      tokens.map(async (t) => {
        try {
          const dataHex = await provider.call({
            to: nftAddr,
            data: iface.encodeFunctionData("intelligentDatasOf", [
              BigInt(t.tokenId),
            ]),
          });
          const decoded = iface.decodeFunctionResult(
            "intelligentDatasOf",
            dataHex,
          );
          const datas = decoded[0] as Array<{ dataDescription: string }>;
          return datas[0]?.dataDescription ?? "";
        } catch {
          return "";
        }
      }),
    );
    for (let i = 0; i < tokens.length; i++) {
      const result = metadataResults[i];
      if (result && result.status === "fulfilled") {
        tokens[i]!.dataDescription = String(result.value ?? "");
      }
    }
    const result = { owner, agents: tokens };
    agentCache.set(owner, result);
    res.json(result);
  }, config);

  createRoute(app, {
    path: "/v1/agents/:id/transfer",
    method: "post",
    schema: transferBodySchema,
    requireId: true,
    consumer: "agents",
    description: "Transfer agent ownership",
  }, async (parsed: z.infer<typeof transferBodySchema>, req: Request, res: Response, helpers) => {
    try {
      const id = helpers.id;
      if (!id) {
        sendError(res, HTTP.BAD_REQUEST, "Missing id");
        return;
      }
      if (!config.addresses?.agentNft) {
        sendError(res, HTTP.INTERNAL, "AgentNFT address not configured");
        return;
      }
      const nft = config.addresses.agentNft;
      const {
        to,
        receiverPubKey64,
        accessProofNonce,
        dataHash: dataHashIn,
        sealedKey: sealedKeyIn,
        oldDataEncryptionKey,
        sealedDataEncryptionKey,
        oldDataUri,
        accessProof,
      } = parsed;

      let dataHash = dataHashIn;
      if (!dataHash && nftTc) {
        try {
          const datas = await nftTc.contract.intelligentDatasOf(BigInt(id));
          dataHash = (datas as { dataHash: string }[])?.[0]?.dataHash as
            | `0x${string}`
            | undefined;
        } catch (err) {
          log.warn("intelligentDatasOf failed for token", {
            tokenId: id,
            error: extractErrorMessage(err),
          });
        }
      }
      if (!dataHash) {
        sendError(res, HTTP.BAD_REQUEST, "Cannot determine dataHash for token");
        return;
      }

      let pk = receiverPubKey64;
      try {
        if (pk.length === 130 && pk.startsWith("0x04")) {
          pk = ("0x" + pk.slice(4)) as `0x${string}`;
        } else {
          const pubBytes = ethers.getBytes(pk);
          if (pubBytes.length === 65) {
            pk = ethers.hexlify(pubBytes.slice(1)) as `0x${string}`;
          }
        }
      } catch {
        sendError(res, HTTP.BAD_REQUEST, "Invalid receiverPubKey64 hex");
        return;
      }

      // Never accept or forward cleartext DEK — only ECIES-sealed to oracle.
      if (oldDataEncryptionKey && !sealedDataEncryptionKey) {
        sendError(
          res,
          HTTP.BAD_REQUEST,
          "cleartext oldDataEncryptionKey rejected; send sealedDataEncryptionKey (ECIES to oracle pubkey from GET {oracle}/health)",
          "CLEARTEXT_DEK_REJECTED",
        );
        return;
      }
      const canRekey = !!(oldDataUri && sealedDataEncryptionKey);
      if (!accessProof) {
        const nonce = BigInt(accessProofNonce ?? 0);
        if (canRekey) {
          const rekey = await oracle.transferValidity({
            oldDataHash: dataHash,
            oldDataUri: oldDataUri!,
            targetPubkey64: pk,
            accessProofNonce: nonce.toString(),
            sealedDataEncryptionKey,
            to,
            nft,
          });
          const validUntil = BigInt(
            rekey.validUntil ?? Math.floor(Date.now() / 1000) + 86400,
          );
          res.json({
            ok: true,
            stage: "challenge",
            tokenId: id,
            to,
            dataHash,
            oldDataHash: dataHash,
            newDataHash: rekey.newDataHash,
            newDataUri: rekey.newDataUri,
            targetPubkey: pk,
            accessProofNonce: nonce.toString(),
            validUntil: validUntil.toString(),
            sealedKey: rekey.sealedKey,
            ownershipSignature: rekey.ownershipSignature,
            signer: config.signer.address as `0x${string}`,
            rekeyed: true,
          });
          return;
        }
        const validUntil = BigInt(Math.floor(Date.now() / 1000)) + 86400n;
        const { key: sealedKeyOrDefault, missing } = resolveSealedKey(sealedKeyIn);
        if (missing) {
          if (process.env.NODE_ENV === "production") {
            sendError(res, HTTP.BAD_REQUEST, "sealedKey is required in production");
            return;
          }
          log.warn("No sealedKey provided, using zero-padded fallback (devnet only)", { tokenId: id });
        }
        const nonceHex = ethers.toBeHex(nonce) as `0x${string}`;
        const tee = await oracle.signOwnership({
          dataHash,
          sealedKey: sealedKeyOrDefault,
          targetPubkey: pk,
          to,
          nft,
          nonce: nonceHex,
          validUntil,
        });
        if (
          !assertTrustedOracleSigner(
            res,
            tee.signature,
            { dataHash, sealedKey: sealedKeyOrDefault, targetPubkey: pk, to, nft, nonce: nonceHex, validUntil },
            trustedSigner,
            eip712Domain,
          )
        ) {
          return;
        }
        res.json({
          ok: true,
          stage: "challenge",
          tokenId: id,
          to,
          dataHash,
          targetPubkey: pk,
          accessProofNonce: nonce.toString(),
          validUntil: validUntil.toString(),
          ownershipSignature: tee.signature,
          signer: tee.signer,
        });
        return;
      }

      const nonce = BigInt(accessProof.nonce);
      const validUntil = BigInt(accessProof.validUntil);
      const proofDataHash = accessProof.dataHash;
      const proofTargetPubkey = accessProof.targetPubkey;
      if (proofDataHash.toLowerCase() !== dataHash.toLowerCase()) {
        sendError(res, HTTP.BAD_REQUEST, "accessProof dataHash mismatch");
        return;
      }
      if (proofTargetPubkey.toLowerCase() !== pk.toLowerCase()) {
        sendError(res, HTTP.BAD_REQUEST, "accessProof targetPubkey mismatch");
        return;
      }

      const nonceHex = ethers.toBeHex(nonce) as `0x${string}`;
      const accessInput = {
        dataHash: proofDataHash,
        targetPubkey: proofTargetPubkey,
        to,
        nft,
        nonce: nonceHex,
        validUntil,
      };
      const accessSigner = recoverAccessSigner(
        accessProof.proof,
        accessInput,
        eip712Domain,
      );
      if (accessSigner.toLowerCase() !== to.toLowerCase()) {
        sendError(
          res,
          400,
          "accessProof signer does not match recipient address",
        );
        return;
      }
      const sealedKeyOrDefault: `0x${string}` = (
        sealedKeyIn && sealedKeyIn.length >= 2
          ? sealedKeyIn
          : "0x" + "00".repeat(32)
      ) as `0x${string}`;
      if (!sealedKeyIn || sealedKeyIn.length < 2) {
        if (process.env.NODE_ENV === "production") {
          sendError(res, HTTP.BAD_REQUEST, "sealedKey is required in production");
          return;
        }
        log.warn(
          "No sealedKey provided, using zero-padded fallback (devnet only)",
          { tokenId: id },
        );
      }
      const tee = await oracle.signOwnership({
        dataHash: proofDataHash,
        sealedKey: sealedKeyOrDefault,
        targetPubkey: proofTargetPubkey,
        to,
        nft,
        nonce: nonceHex,
        validUntil,
      });
      if (
        !assertTrustedOracleSigner(
          res,
          tee.signature,
          { dataHash: proofDataHash, sealedKey: sealedKeyOrDefault, targetPubkey: proofTargetPubkey, to, nft, nonce: nonceHex, validUntil },
          trustedSigner,
          eip712Domain,
        )
      ) {
        return;
      }
      res.json({
        ok: true,
        stage: "final",
        tokenId: id,
        to,
        accessSigner,
        signer: tee.signer,
        accessProof: {
          dataHash: proofDataHash,
          targetPubkey: proofTargetPubkey,
          nonce: nonce.toString(),
          proof: accessProof.proof,
          validUntil: validUntil.toString(),
        },
        ownershipProof: {
          oracleType: 0,
          dataHash: proofDataHash,
          sealedKey: sealedKeyOrDefault,
          targetPubkey: proofTargetPubkey,
          nonce: nonce.toString(),
          proof: tee.signature,
          validUntil: validUntil.toString(),
        },
      });
    } catch (err) {
      if (isUpstreamTransportError(err)) {
        sendError(
          res,
          HTTP.SERVICE_UNAVAILABLE,
          `TEE oracle at ${config.oracleBaseUrl} is unreachable; deploy the oracle service or set AXIOM_ORACLE_URL`,
          "ORACLE_UNAVAILABLE",
        );
        return;
      }
      throw err;
    }
  }, config);

  createRoute(
    app,
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
}
