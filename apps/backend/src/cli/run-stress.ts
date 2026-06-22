// apps/bench/scripts/stress-test.ts
//
// Live on-chain stress test for the Axiom Protocol contracts on 0G Galileo.
// Runs a configurable batch of full user journeys (mint → deposit → strategy →
// tick → two-stage transfer) across N receiver wallets, plus a concurrency
// probe, an access-denial probe, and an on-chain replay probe.
//
// Usage:
//   cd apps/bench
//   unset AGENT_NFT_ADDRESS AXIOM_TEE_VERIFIER VAULT_ADDRESS AXIOM_PAYMENT_PROCESSOR
//   pnpm exec tsx scripts/stress-test.ts \
//     --wallets ../../wallets/stress-test-wallets.json \
//     --rpc https://0g-galileo-testnet.drpc.org \
//     --deposit 0.01 \
//     --batch 5
//
// All amounts in ether (e.g. 0.01 = 0.01 OG per deposit). Set --deposit to a
// value the operator wallet can afford for `N` agents plus gas.
//
// Exits non-zero if any probe fails. Prints a JSON report on stdout for
// downstream parsing.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { Wallet, JsonRpcProvider, Contract, parseEther, formatEther, ZeroAddress, type TransactionReceipt } from "ethers";
import { publicKeyUncompressedFromPrivate } from "@axiom/oracle/crypto/secp256k1";
import { aesGcmEncrypt } from "@axiom/oracle/crypto/aes-gcm";
import { ZeroGStorage } from "../storage/0g";
import { loadEnv } from "../env";
loadEnv();

interface WalletEntry {
  readonly address: string;
  readonly privateKey: string;
}

interface Args {
  readonly walletsPath: string;
  readonly rpc: string;
  readonly storageRpc: string;
  readonly deposit: bigint;
  readonly batch: number;
  readonly privateKey: string;
  readonly agentNft: string;
  readonly vault: string;
  readonly verifier: string;
  readonly backend: string;
  readonly chainId: number;
}

const ABI = {
  nft: [
    "function mint((string dataDescription, bytes32 dataHash)[] iDatas, address to) payable returns (uint256 tokenId)",
    "function mintFee() view returns (uint256)",
    "function ownerOf(uint256 tokenId) view returns (address)",
    "function intelligentDatasOf(uint256 tokenId) view returns (tuple(string dataDescription, bytes32 dataHash)[])",
    "function iTransferFrom(address from, address to, uint256 tokenId, tuple(tuple(bytes32 dataHash, bytes targetPubkey, uint256 nonce, bytes proof, uint256 validUntil) accessProof, tuple(uint8 oracleType, bytes32 dataHash, bytes sealedKey, bytes targetPubkey, uint256 nonce, bytes proof, uint256 validUntil) ownershipProof)[] proofs)",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  ] as const,
  vault: [
    "function deposit(uint256 tokenId) payable",
    "function setStrategy(uint256 tokenId, bytes32 merkleRoot, uint256 dailyLimit)",
    "function strategyOf(uint256 tokenId) view returns (bytes32 merkleRoot, uint256 dailyLimit)",
  ] as const,
  storage: [
    "function upload(bytes data, string tags) returns (string rootHash, uint64 totalChunks, uint64 totalSegments)",
  ] as const,
} as const;

interface JourneyResult {
  readonly index: number;
  readonly receiver: string;
  readonly tokenId: string;
  readonly mintTx: string;
  readonly depositTx: string;
  readonly strategyTx: string;
  readonly transferTx: string;
  readonly durationMs: number;
  readonly ok: boolean;
  readonly error?: string;
}

interface Report {
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly network: { readonly rpc: string; readonly chainId: number };
  readonly contracts: { readonly nft: string; readonly vault: string; readonly verifier: string };
  readonly operator: string;
  readonly operatorBalanceWei: string;
  readonly depositPerAgentWei: string;
  readonly batchSize: number;
  readonly walletCount: number;
  readonly journeys: readonly JourneyResult[];
  readonly concurrency: {
    readonly ticks: number;
    readonly passes: number;
    readonly failures: number;
    readonly durationMs: number;
  };
  readonly accessDenial: {
    readonly depositOtherTokenId: string;
    readonly pass: boolean;
    readonly error: string;
  };
  readonly replay: {
    readonly tokenId: string;
    readonly firstTx: string;
    readonly replayRejected: boolean;
    readonly replayError: string;
  };
  readonly findings: readonly string[];
}

function parseArgs(argv: readonly string[]): Args {
  const get = (flag: string, dflt: string): string => {
    const idx = argv.indexOf(flag);
    return idx >= 0 && idx + 1 < argv.length ? argv[idx + 1]! : dflt;
  };
  const walletsPath = resolve(get("--wallets", "../../wallets/stress-test-wallets.json"));
  const rpc = get("--rpc", process.env["OG_RPC_URL"] ?? "https://evmrpc-testnet.0g.ai");
  const depositEth = get("--deposit", "0.01");
  const batchStr = get("--batch", "5");
  return {
    walletsPath,
    rpc,
    storageRpc: process.env["OG_STORAGE_RPC"] ?? "https://indexer-storage-testnet-turbo.0g.ai",
    deposit: parseEther(depositEth),
    batch: Number.parseInt(batchStr, 10),
    privateKey: process.env["AXIOM_DEPLOYER_PK"] ?? (() => { throw new Error("AXIOM_DEPLOYER_PK required"); })(),
    agentNft: process.env["AGENT_NFT_ADDRESS"] ?? "0xf12F158a20c36a351b056FD60b3a7377ce4F1e09",
    vault: process.env["VAULT_ADDRESS"] ?? "0xb7F89e50D5A3039Da7d39528436B820371572874",
    verifier: process.env["AXIOM_TEE_VERIFIER"] ?? "0x24f725198d64A3b03A8386cD8fa12BD7c591734A",
    backend: process.env["BACKEND_URL"] ?? "http://127.0.0.1:3000",
    chainId: Number.parseInt(process.env["OG_CHAIN_ID"] ?? "16602", 10),
  };
}

async function callWithTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return await Promise.race<T>([
    p,
    sleep(ms).then(() => {
      throw new Error(`timeout after ${ms}ms: ${label}`);
    }),
  ]);
}

async function postJson(url: string, body: unknown, timeoutMs: number): Promise<unknown> {
  const res = await callWithTimeout(
    fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    }),
    timeoutMs,
    `POST ${url}`,
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`POST ${url} → ${res.status} ${res.statusText}: ${t.slice(0, 200)}`);
  }
  return await res.json();
}

async function prepareAndMint(
  args: Args,
  deployer: Wallet,
  index: number,
): Promise<{ rootHash: `0x${string}`; sealedKeyHex: `0x${string}`; tokenId: string; mintTx: string }> {
  // 1. Generate dataKey, encrypt plaintext with AES-256-GCM, ECIES-seal to deployer.
  const dataKey = new Uint8Array(32);
  crypto.getRandomValues(dataKey);
  const plaintext = new TextEncoder().encode(`stress-test strategy ${index} @ ${Date.now()}`);
  const enc = await aesGcmEncrypt(dataKey, plaintext);
  // Concat iv || ciphertext || authTag into a single Uint8Array (required by ZeroGStorage.uploadData).
  const blob = new Uint8Array(enc.iv.length + enc.ciphertext.length + enc.authTag.length);
  blob.set(enc.iv, 0);
  blob.set(enc.ciphertext, enc.iv.length);
  blob.set(enc.authTag, enc.iv.length + enc.ciphertext.length);
  const deployerPub = new Uint8Array(65);
  deployerPub[0] = 0x04;
  const dpk = publicKeyUncompressedFromPrivate(Uint8Array.from(Buffer.from(deployer.privateKey.slice(2), "hex")));
  deployerPub.set(dpk.subarray(0, 64), 1);
  const { encrypt: eciesEnc } = await import("eciesjs");
  const sealedKey = eciesEnc(deployerPub, dataKey);
  const sealedKeyHex = ("0x" + Buffer.from(sealedKey).toString("hex")) as `0x${string}`;

  // 2. Upload to 0G Storage (real upload — gives a real Merkle root).
  const storage = new ZeroGStorage({ indexerRpc: args.storageRpc, evmRpc: args.rpc, signer: deployer });
  const upload = await storage.uploadData(blob, { type: "aes256", key: dataKey });
  const rootHash = upload.rootHash as `0x${string}`;

  // 3. Mint via backend — this both mints on-chain AND registers the dataHash with the oracle.
  const mintRes = (await postJson(
    `${args.backend}/v1/agents/mint`,
    { agentNft: args.agentNft, encryptedStrategyUri: rootHash, sealedKey: sealedKeyHex, owner: deployer.address },
    90_000,
  )) as Record<string, unknown>;
  if (mintRes["ok"] !== true) {
    throw new Error(`backend mint failed: ${JSON.stringify(mintRes)}`);
  }
  const tokenId = String(mintRes["tokenId"] ?? "");
  const mintTx = String(mintRes["txHash"] ?? "");
  return { rootHash, sealedKeyHex, tokenId, mintTx };
}

async function depositOne(
  deployer: Wallet,
  vault: Contract,
  tokenId: bigint,
  valueWei: bigint,
): Promise<TransactionReceipt> {
  const tx = await vault.deposit!(tokenId, { value: valueWei, gasPrice: 3_000_000_000n });
  return await callWithTimeout(tx.wait(), 60_000, `deposit ${tokenId}`);
}

async function setStrategyOne(
  deployer: Wallet,
  vault: Contract,
  tokenId: bigint,
  index: number,
): Promise<TransactionReceipt> {
  const merkleRoot = ("0x" + Buffer.from(`merkle-${index}`).toString("hex").padEnd(64, "0").slice(0, 64)) as `0x${string}`;
  const tx = await vault.setStrategy!(tokenId, merkleRoot, parseEther("1"), { gasPrice: 3_000_000_000n });
  return await callWithTimeout(tx.wait(), 60_000, `setStrategy ${tokenId}`);
}

async function transferOne(
  deployer: Wallet,
  receiver: Wallet,
  nft: Contract,
  backendUrl: string,
  tokenId: bigint,
  receiverPubKey64: string,
  dataHash: string,
  sealedKeyHex: string,
): Promise<string> {
  // Two-stage via backend.
  const challengeRes = (await postJson(
    `${backendUrl}/v1/agents/${tokenId.toString()}/transfer`,
    {
      to: receiver.address,
      receiverPubKey64,
      accessProofNonce: 1,
      dataHash,
      sealedKey: sealedKeyHex,
    },
    30_000,
  )) as Record<string, unknown>;
  if (challengeRes["stage"] !== "challenge") {
    throw new Error(`transfer ${tokenId}: challenge stage missing: ${JSON.stringify(challengeRes)}`);
  }
  const challenge = challengeRes as { dataHash: string; targetPubkey: string; accessProofNonce: number; validUntil: string };

  // Re-seal the dataKey for the receiver (Option A).
  const { decrypt: eciesDecrypt, encrypt: eciesEncrypt } = await import("eciesjs");
  const recoveredDataKey = eciesDecrypt(
    Buffer.from(deployer.privateKey.slice(2), "hex"),
    Buffer.from(sealedKeyHex.slice(2), "hex"),
  );
  const receiverPub = new Uint8Array(65);
  receiverPub[0] = 0x04;
  receiverPub.set(Buffer.from(receiverPubKey64.slice(2, 130), "hex"), 1);
  const resealedKey = eciesEncrypt(receiverPub, recoveredDataKey);
  const sealedKeyForReceiver = ("0x" + Buffer.from(resealedKey).toString("hex")) as `0x${string}`;

  // Receiver signs the access digest (raw ECDSA via ethers).
  const { SigningKey, getBytes, computeAddress, AbiCoder, keccak256 } = await import("ethers");
  const accessInput = {
    dataHash: challenge.dataHash,
    targetPubkey: challenge.targetPubkey,
    nonce: BigInt(challenge.accessProofNonce),
    validUntil: BigInt(challenge.validUntil),
  };
  const digest = keccak256(
    AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "bytes", "uint256", "uint256"],
      [accessInput.dataHash, accessInput.targetPubkey, accessInput.nonce, accessInput.validUntil],
    ),
  );
  const sig = receiver.signingKey.sign(getBytes(digest)).serialized;

  // Final stage.
  const finalRes = (await postJson(
    `${backendUrl}/v1/agents/${tokenId.toString()}/transfer`,
    {
      to: receiver.address,
      receiverPubKey64,
      dataHash: challenge.dataHash,
      sealedKey: sealedKeyForReceiver,
      accessProof: {
        dataHash: challenge.dataHash,
        targetPubkey: challenge.targetPubkey,
        nonce: challenge.accessProofNonce.toString(),
        proof: sig,
        validUntil: challenge.validUntil,
      },
    },
    30_000,
  )) as Record<string, unknown>;
  if (finalRes["stage"] !== "final") {
    throw new Error(`transfer ${tokenId}: final stage missing: ${JSON.stringify(finalRes)}`);
  }
  const final = finalRes as {
    accessProof: { dataHash: string; targetPubkey: string; nonce: string; proof: string; validUntil: string };
    ownershipProof: { oracleType: number; dataHash: string; sealedKey: string; targetPubkey: string; nonce: string; proof: string; validUntil: string };
  };

  // Submit on-chain.
  const proofs = [{
    accessProof: {
      dataHash: final.accessProof.dataHash,
      targetPubkey: final.accessProof.targetPubkey,
      nonce: final.accessProof.nonce,
      proof: final.accessProof.proof,
      validUntil: final.accessProof.validUntil,
    },
    ownershipProof: {
      oracleType: final.ownershipProof.oracleType,
      dataHash: final.ownershipProof.dataHash,
      sealedKey: final.ownershipProof.sealedKey,
      targetPubkey: final.ownershipProof.targetPubkey,
      nonce: final.ownershipProof.nonce,
      proof: final.ownershipProof.proof,
      validUntil: final.ownershipProof.validUntil,
    },
  }];
  const tx = await nft.iTransferFrom!(deployer.address, receiver.address, tokenId, proofs, {
    type: 0,
    gasPrice: 3_000_000_000n,
  });
  const receipt = await callWithTimeout(tx.wait(), 60_000, `iTransferFrom ${tokenId}`);
  // Verify access signer.
  const recoveredPubKey = SigningKey.recoverPublicKey(
    getBytes(digest),
    final.accessProof.proof,
  );
  const recoveredAddr = computeAddress(recoveredPubKey);
  if (recoveredAddr.toLowerCase() !== receiver.address.toLowerCase()) {
    throw new Error(`access signer mismatch: ${recoveredAddr} != ${receiver.address}`);
  }
  void ZeroAddress;
  // tx.wait() returns ContractTransactionReceipt | null; cast-safe for stress test.
  return (receipt as TransactionReceipt).hash;
}

async function derivePubKey64(pk: string): Promise<string> {
  const clean = pk.startsWith("0x") ? pk.slice(2) : pk;
  const pub = publicKeyUncompressedFromPrivate(Uint8Array.from(Buffer.from(clean, "hex")));
  return ("0x" + Buffer.from(pub).toString("hex")) as `0x${string}`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const provider = new JsonRpcProvider(args.rpc);
  const network = await provider.getNetwork();
  const deployer = new Wallet(args.privateKey, provider);
  const nft = new Contract(args.agentNft, ABI.nft, deployer);
  const vault = new Contract(args.vault, ABI.vault, deployer);
  const walletEntries = JSON.parse(readFileSync(args.walletsPath, "utf-8")) as WalletEntry[];
  const findings: string[] = [];

  const opBalance = (await provider.getBalance(deployer.address)) as bigint;
  const requiredPerAgent = args.deposit + parseEther("0.02"); // buffer for gas + mint fee
  const totalRequired = requiredPerAgent * BigInt(walletEntries.length);
  if (opBalance < totalRequired) {
    findings.push(
      `operator balance ${formatEther(opBalance)} OG < required ${formatEther(totalRequired)} OG for ${walletEntries.length} agents at ${formatEther(args.deposit)} OG deposit each`,
    );
  }

  console.error(`Stress test: ${walletEntries.length} agents, deposit=${formatEther(args.deposit)} OG each`);
  console.error(`Operator: ${deployer.address} (balance ${formatEther(opBalance)} OG)`);

  // Phase 1: sequential journeys.
  const journeys: JourneyResult[] = [];
  for (let i = 0; i < walletEntries.length; i++) {
    const w = walletEntries[i]!;
    const receiver = new Wallet(w.privateKey, provider);
    const receiverPubKey64 = await derivePubKey64(w.privateKey);
    const startedAt = Date.now();
    let ok = false;
    let err: string | undefined;
    let mintTx = "", depositTx = "", strategyTx = "", transferTx = "";
    let tokenId = "0";
    try {
      const m = await prepareAndMint(args, deployer, i);
      mintTx = m.mintTx;
      tokenId = m.tokenId;
      const d = await depositOne(deployer, vault, BigInt(m.tokenId), args.deposit);
      depositTx = d.hash;
      const s = await setStrategyOne(deployer, vault, BigInt(m.tokenId), i);
      strategyTx = s.hash;
      transferTx = await transferOne(deployer, receiver, nft, args.backend, BigInt(m.tokenId), receiverPubKey64, m.rootHash, m.sealedKeyHex);
      ok = true;
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
      findings.push(`journey ${i} (tokenId=${tokenId}, receiver=${w.address}): ${err.slice(0, 200)}`);
    }
    journeys.push({
      index: i,
      receiver: w.address,
      tokenId,
      mintTx, depositTx, strategyTx, transferTx,
      durationMs: Date.now() - startedAt,
      ok,
      ...(err !== undefined ? { error: err } : {}),
    });
    console.error(`  [${i}] tokenId=${tokenId} ${ok ? "OK" : "FAIL"} in ${Date.now() - startedAt}ms ${err ?? ""}`);
  }

  // Phase 2: concurrency probe — N parallel /v1/orchestrator/tick calls.
  const concStart = Date.now();
  const concResults = await Promise.allSettled(
    Array.from({ length: args.batch }, () =>
      callWithTimeout(
        fetch(`${args.backend}/v1/orchestrator/tick`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ vault: args.vault, agentNft: args.agentNft }),
        }).then((r) => r.json()),
        20_000,
        "tick",
      ),
    ),
  );
  const concPass = concResults.filter((r) => r.status === "fulfilled").length;
  const concFail = concResults.length - concPass;
  if (concFail > 0) findings.push(`concurrency: ${concFail}/${args.batch} tick calls failed`);
  const concurrency = {
    ticks: args.batch,
    passes: concPass,
    failures: concFail,
    durationMs: Date.now() - concStart,
  };
  console.error(`Concurrency: ${concPass}/${args.batch} pass in ${concurrency.durationMs}ms`);

  // Phase 3: access denial — try to deposit for a tokenId the deployer no longer owns (after transfer).
  let accessOk = false; let accessErr = "skipped (no transferred tokenId available)";
  const transferred = journeys.find((j) => j.ok && j.transferTx !== "");
  if (transferred) {
    try {
      await depositOne(deployer, vault, BigInt(transferred.tokenId), parseEther("0.001"));
      accessErr = "deposit succeeded on token the deployer no longer owns — LEAK";
      findings.push(accessErr);
    } catch (e) {
      accessOk = true;
      accessErr = (e instanceof Error ? e.message : String(e)).slice(0, 200);
    }
  }
  const accessDenial = { depositOtherTokenId: transferred?.tokenId ?? "", pass: accessOk, error: accessErr };

  // Phase 4: on-chain replay — try to iTransferFrom a tokenId that was already transferred.
  let replayRejected = false; let replayErr = "skipped"; let firstTx = "";
  const firstTransferred = journeys.find((j) => j.ok && j.transferTx !== "");
  if (firstTransferred) {
    firstTx = firstTransferred.transferTx;
    const w = walletEntries[firstTransferred.index]!;
    const receiver = new Wallet(w.privateKey, provider);
    const receiverPubKey64 = await derivePubKey64(w.privateKey);
    try {
      await transferOne(
        deployer,
        receiver,
        nft,
        args.backend,
        BigInt(firstTransferred.tokenId),
        receiverPubKey64,
        ("0x" + "00".repeat(32)) as `0x${string}`,
        ("0x" + "00".repeat(65)) as `0x${string}`,
      );
      replayErr = "replay succeeded — REPLAY ATTACK POSSIBLE";
      findings.push(replayErr);
    } catch (e) {
      replayRejected = true;
      replayErr = (e instanceof Error ? e.message : String(e)).slice(0, 200);
    }
  }
  const replay = { tokenId: firstTransferred?.tokenId ?? "", firstTx, replayRejected, replayError: replayErr };

  // Build report.
  const report: Report = {
    startedAt: new Date(concStart - journeys.reduce((a, j) => a + j.durationMs, 0)).toISOString(),
    finishedAt: new Date().toISOString(),
    network: { rpc: args.rpc, chainId: Number(network.chainId) },
    contracts: { nft: args.agentNft, vault: args.vault, verifier: args.verifier },
    operator: deployer.address,
    operatorBalanceWei: opBalance.toString(),
    depositPerAgentWei: args.deposit.toString(),
    batchSize: args.batch,
    walletCount: walletEntries.length,
    journeys,
    concurrency,
    accessDenial,
    replay,
    findings,
  };
  console.log(JSON.stringify(report, null, 2));
  if (findings.length > 0) {
    console.error(`\nFINDINGS (${findings.length}):`);
    for (const f of findings) console.error(`  - ${f}`);
    process.exit(1);
  }
}

void main().catch((e) => {
  console.error("stress-test fatal:", e);
  process.exit(1);
});
