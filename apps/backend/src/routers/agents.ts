import { hexViem, addressViem } from "@axiom/config/types/hex-schema";
import { AGENT_NFT_ABI } from "@axiom/config/abis";
import { z } from "zod";
import type { Express, Request, Response } from "express";
import { ethers } from "ethers";
import type { Hex } from "viem";
import { deriveMintDataHash } from "@axiom/config/types/hex";
import {
  TypedContract,
  type AgentNFTMethods,
} from "@axiom/config/types/contract";
import type { ServerConfig } from "../config-types.js";
import { sendError, extractErrorMessage } from "../utils/response.js";
import { TTLCache } from "../utils/response.js";
import { TRANSFER_TOPIC } from "@axiom/config/constants";
import {
  signOwnership,
  transferValidity,
  OracleRequestError,
  type OracleRouteDeps,
} from "../oracle/routes.js";
import { createLogger } from "../utils/logger.js";
import { readAgentDataHash } from "../skills/shared.js";
import { createRoute } from "./route-factory.js";
import { enumerateOwnedAgents } from "../agents/enumerate.js";

const log = createLogger("agents");

const mintEncodeSchema = z.union([
  // Legacy shape (deprecated): wizard previously derived dataHash client-side.
  // Pinned by existing tests — must keep behaving identically.
  z.object({
    dataDescription: z.string().min(1).max(1024),
    dataHash: hexViem,
    to: addressViem,
  }),
  // Hashless shape (P3 §(c)-A): server derives dataHash from the agent name,
  // marks it seen for the oracle, and builds the description.
  z.object({
    name: z.string().min(2).max(80),
    owner: addressViem,
  }),
]);

type MintEncodeBody = z.infer<typeof mintEncodeSchema>;

interface MintEncodeResult {
  to: Hex;
  data: string;
  value: string;
}

/** Description the FE derives for a minted agent name (useMintWizard.ts buildDefaultPayload). */
function mintDescription(name: string): string {
  return `${name} — ownable AI agent on Axiom Protocol (0G / ERC-7857)`;
}

type AgentNftMintEncodeMethods = {
  mintFee(): Promise<bigint>;
};
import type { Eip712Domain, OwnershipProofInput } from "@axiom/config/eip712";
import {
  canonicalNonceHex,
  recoverAccessSigner,
  recoverOwnershipSigner,
} from "@axiom/config/eip712";
import { HTTP } from "@axiom/config/constants";
import { normalizePubkey64 } from "@axiom/config/crypto/keys";
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

function resolveSealedKeyGuard(
  sealedKeyIn: string | undefined,
  res: Response,
  tokenId: string,
): `0x${string}` | undefined {
  const { key: sealedKeyOrDefault, missing } = resolveSealedKey(sealedKeyIn);
  if (missing) {
    if (process.env.NODE_ENV === "production") {
      sendError(res, HTTP.BAD_REQUEST, "sealedKey is required in production");
      return undefined;
    }
    log.warn(
      "No sealedKey provided, using zero-padded fallback (devnet only)",
      { tokenId },
    );
  }
  return sealedKeyOrDefault;
}

// Verify against the SERVER-CONFIGURED trusted TEE signer (AXIOM_TEE_SIGNER_PK), never the oracle's self-claimed tee.signer: recovering and comparing the actual signer catches a swapped or forged oracle.
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

interface OwnershipSignatureRequest {
  dataHash: Hex;
  sealedKey: Hex;
  targetPubkey: Hex;
  to: Hex;
  nft: Hex;
  nonce: Hex;
  validUntil: bigint;
}

/**
 * Test doubles for the oracle implement this interface (signOwnership(args) →
 * signature + signer) instead of being duck-typed off the real deps shape.
 * The in-process oracle signs via deps.signer — requestOwnershipSignature
 * prefers the double's method when present, else falls through to it.
 */
export interface OwnershipSignerOverride {
  signOwnership(
    args: OwnershipSignatureRequest,
  ): Promise<{ signature: Hex; signer: Hex }>;
}

async function requestOwnershipSignature(
  oracle: OracleRouteDeps & Partial<OwnershipSignerOverride>,
  args: OwnershipSignatureRequest,
): Promise<{ signature: Hex; signer: Hex }> {
  if (oracle.signOwnership) {
    return oracle.signOwnership(args);
  }
  return signOwnership(oracle, args);
}

/** Oracle-signs the ownership proof, then verifies it against the trusted TEE signer;
 *  sends the error response and returns null on signature mismatch. */
async function signOwnershipVerified(
  res: Response,
  oracle: OracleRouteDeps,
  args: OwnershipSignatureRequest,
  trustedSigner: Hex,
  domain: Eip712Domain,
): Promise<{ signature: Hex; signer: Hex } | null> {
  const tee = await requestOwnershipSignature(oracle, args);
  if (
    !assertTrustedOracleSigner(res, tee.signature, args, trustedSigner, domain)
  ) {
    return null;
  }
  return tee;
}

export function registerAgentRoutes(
  app: Express,
  config: ServerConfig,
  provider: ethers.JsonRpcProvider | ethers.FallbackProvider,
  oracle: OracleRouteDeps,
  eip712Domain: Eip712Domain,
  nftTc: TypedContract<AgentNFTMethods> | null,
): void {
  const agentListTtlMs = config.env?.AXIOM_AGENT_LIST_CACHE_MS ?? 120_000;
  const agentCache = new TTLCache<unknown>(agentListTtlMs);
  const mintStatsCache = new TTLCache<unknown>(60_000);
  const mintFeeCache = new TTLCache<bigint>(60_000);
  const pubkeyCache = new TTLCache<`0x${string}` | null>(60_000);

  // Env-required at boot (backendEnvSchema); a missing PK fails loudly here
  // instead of silently zeroing the signer (audit F3.2/M2).
  const teeSignerPk = config.env?.AXIOM_TEE_SIGNER_PK;
  if (!teeSignerPk) throw new Error("AXIOM_TEE_SIGNER_PK required");
  const trustedSigner = ethers.computeAddress(teeSignerPk) as Hex;

  createRoute(
    app,
    {
      path: "/v1/agents",
      method: "get",
      consumer: "agents",
      description: "List owned agents",
    },
    async (_parsed: unknown, req: Request, res: Response) => {
      const owner =
        typeof req.query.owner === "string"
          ? req.query.owner.toLowerCase()
          : undefined;
      if (!owner || !/^0x[0-9a-f]{40}$/i.test(owner))
        return sendError(res, HTTP.BAD_REQUEST, "Valid owner address required");
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
      if (!nftAddr)
        return sendError(
          res,
          HTTP.SERVICE_UNAVAILABLE,
          "Agent NFT address not configured",
        );
      const result = await enumerateOwnedAgents(provider, nftAddr, owner);
      agentCache.set(owner, result);
      res.json(result);
    },
    config,
  );

  createRoute(
    app,
    {
      path: "/v1/agents/stats",
      method: "get",
      consumer: "public-seo-hub",
      description:
        "Real on-chain agent registry stats: distinct mints + latest tokenId (60s cache)",
    },
    async (_parsed: unknown, _req: Request, res: Response) => {
      const nftAddr = config.addresses?.agentNft;
      if (!nftAddr)
        return sendError(
          res,
          HTTP.SERVICE_UNAVAILABLE,
          "Agent NFT address not configured",
        );
      const cached = mintStatsCache.get("global");
      if (cached) {
        res.json(cached);
        return;
      }
      try {
        // Mints are Transfer logs with the zero address as `from` (topic1).
        // Full-range indexed query: a recent-window scan would undercount
        // registries whose older mints fall outside the window.
        const zeroPad = "0x" + "0".repeat(64);
        const mintLogs = await provider.getLogs({
          address: nftAddr,
          fromBlock: 0,
          toBlock: "latest",
          topics: [TRANSFER_TOPIC, zeroPad],
        });
        const mintIds = mintLogs.flatMap((logEntry) =>
          logEntry.topics[3] ? [BigInt(logEntry.topics[3])] : [],
        );
        const tokenIds = new Set(mintIds);
        const latestTokenId =
          mintIds.length > 0 ? mintIds.reduce((a, b) => (b > a ? b : a)) : 0n;
        const stats = {
          totalMinted: tokenIds.size,
          latestTokenId: tokenIds.size > 0 ? latestTokenId.toString() : null,
        };
        mintStatsCache.set("global", stats);
        res.json(stats);
      } catch (err) {
        sendError(res, HTTP.BAD_GATEWAY, extractErrorMessage(err));
      }
    },
    config,
  );

  createRoute(
    app,
    {
      path: "/v1/agents/:id/transfer",
      method: "post",
      schema: transferBodySchema,
      requireId: true,
      requireAddress: "agentNft",
      consumer: "agents",
      description: "Transfer agent ownership",
    },
    async (
      parsed: z.infer<typeof transferBodySchema>,
      _req: Request,
      res: Response,
      helpers,
    ) => {
      try {
        const id = helpers.id;
        if (!id) return sendError(res, HTTP.BAD_REQUEST, "Missing id");
        // requireAddress guard above already 503s (ADDRESS_NOT_CONFIGURED) when agentNft is unset.
        const nft = config.addresses!.agentNft;
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
            dataHash = (await readAgentDataHash(nftTc.contract, BigInt(id))) as
              `0x${string}` | undefined;
          } catch (err) {
            log.warn("intelligentDatasOf failed for token", {
              tokenId: id,
              error: extractErrorMessage(err),
            });
          }
        }
        if (!dataHash)
          return sendError(
            res,
            HTTP.BAD_REQUEST,
            "Cannot determine dataHash for token",
          );

        let pk: `0x${string}`;
        try {
          pk = normalizePubkey64(receiverPubKey64);
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
        if (!accessProof) {
          const nonce = BigInt(accessProofNonce ?? 0);
          // Custody (proto option C / ADR-004 §2.4): with AXIOM_DEK_CUSTODY on,
          // a sender that brings no DEK material is served from the vault —
          // transferValidity re-keys from the stored row when one exists and
          // throws the typed "no sealed data key on file" 400 when one does
          // not, telling the sender to provide sealedDataEncryptionKey.
          // oldDataUri falls back to the on-chain dataHash, which satisfies
          // the root-binding rule (the dataHash IS the 0G storage root).
          const custodyAttempt =
            config.env?.AXIOM_DEK_CUSTODY === "true" &&
            oracle.dekCustody !== undefined;
          if (oldDataUri && sealedDataEncryptionKey) {
            const rekey = await transferValidity(oracle, {
              oldDataHash: dataHash,
              oldDataUri,
              targetPubkey64: pk,
              accessProofNonce: nonce.toString(),
              sealedDataEncryptionKey,
              tokenId: id,
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
          if (custodyAttempt) {
            // Sender brought no DEK material at all — custody supplies it.
            // root-binding rule: oldDataUri must equal oldDataHash, and the
            // on-chain dataHash IS the storage root (skills/shared.ts:21-34).
            const rekey = await transferValidity(oracle, {
              oldDataHash: dataHash,
              oldDataUri: dataHash,
              targetPubkey64: pk,
              accessProofNonce: nonce.toString(),
              tokenId: id,
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
              rekeyedFromCustody: true,
            });
            return;
          }
          const validUntil = BigInt(Math.floor(Date.now() / 1000)) + 86400n;
          const sealedKeyOrDefault = resolveSealedKeyGuard(
            sealedKeyIn,
            res,
            id,
          );
          if (!sealedKeyOrDefault) return;
          const nonceHex = canonicalNonceHex(nonce);
          const tee = await signOwnershipVerified(
            res,
            oracle,
            {
              dataHash,
              sealedKey: sealedKeyOrDefault,
              targetPubkey: pk,
              to,
              nft,
              nonce: nonceHex,
              validUntil,
            },
            trustedSigner,
            eip712Domain,
          );
          if (!tee) return;
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
        if (proofDataHash.toLowerCase() !== dataHash.toLowerCase())
          return sendError(
            res,
            HTTP.BAD_REQUEST,
            "accessProof dataHash mismatch",
          );
        if (proofTargetPubkey.toLowerCase() !== pk.toLowerCase())
          return sendError(
            res,
            HTTP.BAD_REQUEST,
            "accessProof targetPubkey mismatch",
          );

        const nonceHex = canonicalNonceHex(nonce);
        const accessInput = {
          dataHash: proofDataHash,
          targetPubkey: proofTargetPubkey,
          to,
          nft,
          nonce: nonceHex,
          validUntil,
        };
        // A malformed/garbage proof hex throws inside ECDSA recovery — surface a
        // readable 400 instead of an opaque 500 INTERNAL_ERROR.
        let accessSigner: `0x${string}`;
        try {
          accessSigner = recoverAccessSigner(
            accessProof.proof,
            accessInput,
            eip712Domain,
          );
        } catch {
          sendError(
            res,
            HTTP.BAD_REQUEST,
            "accessProof.proof is not a valid signature (recovery failed)",
            "ACCESS_PROOF_INVALID",
          );
          return;
        }
        if (accessSigner.toLowerCase() !== to.toLowerCase()) {
          sendError(
            res,
            400,
            "accessProof signer does not match recipient address",
          );
          return;
        }
        const sealedKeyOrDefault = resolveSealedKeyGuard(sealedKeyIn, res, id);
        if (!sealedKeyOrDefault) return;
        const tee = await signOwnershipVerified(
          res,
          oracle,
          {
            dataHash: proofDataHash,
            sealedKey: sealedKeyOrDefault,
            targetPubkey: proofTargetPubkey,
            to,
            nft,
            nonce: nonceHex,
            validUntil,
          },
          trustedSigner,
          eip712Domain,
        );
        if (!tee) return;
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
            nonce: nonceHex,
            proof: accessProof.proof,
            validUntil: validUntil.toString(),
          },
          ownershipProof: {
            oracleType: 0,
            dataHash: proofDataHash,
            sealedKey: sealedKeyOrDefault,
            targetPubkey: proofTargetPubkey,
            nonce: nonceHex,
            proof: tee.signature,
            validUntil: validUntil.toString(),
          },
        });
      } catch (err) {
        if (err instanceof OracleRequestError) {
          sendError(res, err.status, err.message);
          return;
        }
        throw err;
      }
    },
    config,
  );

  createRoute(
    app,
    {
      method: "post",
      path: "/v1/agents/mint/encode",
      schema: mintEncodeSchema,
      requireAddress: "agentNft",
      consumer: "useMintEncode",
      description:
        "Encode AxiomAgentNFT mint transaction (value = on-chain mintFee)",
    },
    async (parsed: MintEncodeBody, _req, res, { config: cfg }) => {
      // requireAddress guard above already 503s (ADDRESS_NOT_CONFIGURED) when agentNft is unset.
      const nftAddr = cfg.addresses!.agentNft;
      // Fold of POST /oracle/v1/agents/mint: register the dataHash so the oracle's
      // signOwnership accepts it without a second FE round-trip; same 32-byte shape
      // guard as the standalone route (kept for back-compat).
      let dataHash: Hex;
      let dataDescription: string;
      let to: Hex;
      if ("name" in parsed) {
        // Hashless shape: derive exactly as the FE wizard does
        // (keccak256(toHex(name.trim())) via deriveMintDataHash) so chat/wizard mints agree.
        const name = parsed.name.trim() || "Axiom agent";
        dataHash = deriveMintDataHash(name);
        dataDescription = mintDescription(name);
        to = parsed.owner;
      } else {
        dataHash = parsed.dataHash;
        dataDescription = parsed.dataDescription;
        to = parsed.to;
      }
      if (!/^0x[0-9a-fA-F]{64}$/.test(dataHash)) {
        return sendError(
          res,
          HTTP.BAD_REQUEST,
          "dataHash must be a 32-byte hex string (0x + 64 hex chars)",
        );
      }
      oracle.storage.markDataHashSeen(dataHash);
      const nftTc = new TypedContract<AgentNftMintEncodeMethods>(
        nftAddr,
        AGENT_NFT_ABI,
        provider,
      );
      let mintFee = mintFeeCache.get(nftAddr);
      if (mintFee === undefined) {
        mintFee = await nftTc.contract.mintFee();
        mintFeeCache.set(nftAddr, mintFee);
      }
      const data = nftTc.iface.encodeFunctionData("mint", [
        [
          {
            dataDescription,
            dataHash,
          },
        ],
        to,
      ]);
      const result: MintEncodeResult = {
        to: nftAddr as Hex,
        data,
        value: mintFee.toString(),
      };
      return result;
    },
    config,
  );

  // GET /v1/registry/pubkey/:address — receiver-pubkey lookup for the hashless
  // transfer flow (P3 §(c)-B). Contract fixed with the FE (TransferModal expects
  // a 130-char `0x` + 64-byte X||Y pubkey; NO_ONCHAIN_KEY → Advanced paste).
  createRoute(
    app,
    {
      method: "get",
      path: "/v1/registry/pubkey/:id",
      consumer: "useReceiverPubkey",
      description:
        "Recover a wallet's uncompressed public key from its latest outgoing tx (404 NO_ONCHAIN_KEY when none exists)",
    },
    async (
      _parsed: unknown,
      _req: Request,
      res: Response,
      { id }: { id: string },
    ) => {
      // createRoute passes req.params.id through as `id`; validate as 0x + 40 hex.
      const address = id;
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
        return sendError(res, HTTP.BAD_REQUEST, "Invalid address");
      }
      const cacheKey = address.toLowerCase();
      const cached = pubkeyCache.get(cacheKey);
      if (cached === null || cached !== undefined) {
        if (cached === null) {
          return sendError(res, HTTP.NOT_FOUND, "NO_ONCHAIN_KEY");
        }
        return { receiverPubKey64: cached };
      }
      // LIMITATION: no tx-by-sender source exists in this backend — the event
      // store indexes only contract-log events (Transfer/Updated/… payloads
      // carry tokenId, not tx senders), and the orchestrator keeps only its own
      // settlement txs. Recovering an arbitrary sender's pubkey would require a
      // full block scan (eth_getTransactionBySender is not a standard RPC);
      // that is deliberately not built here. Burner wallets with zero outgoing
      // txs have no recoverable key regardless — the FE keeps the Advanced
      // manual-paste fallback for this 404.
      const recovered = await recoverPubkeyFromLatestOutgoingTx(
        provider,
        address,
      );
      pubkeyCache.set(cacheKey, recovered);
      if (recovered === null) {
        return sendError(res, HTTP.NOT_FOUND, "NO_ONCHAIN_KEY");
      }
      return { receiverPubKey64: recovered };
    },
    config,
  );
}

/**
 * Attempts pubkey recovery from an address's latest outgoing transaction via
 * the backend provider. Currently no tx-by-sender index exists (see route
 * comment above), so this returns null without RPC traffic; if an indexer or
 * RPC surface for sender→txs lands, plug it in here with viem
 * `recoverPublicKey({ publicKey: serializeTransaction(tx) })` and normalize
 * via `normalizePubkey64` to the X||Y shape the transfer route expects.
 */
async function recoverPubkeyFromLatestOutgoingTx(
  _provider: ethers.JsonRpcProvider | ethers.FallbackProvider,
  _address: string,
): Promise<`0x${string}` | null> {
  return null;
}
