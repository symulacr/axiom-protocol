// Shared agent-enumeration core for GET /v1/agents (routers/agents.ts) and the
// MCP list_agents tool (mcp/tools.ts): both surfaces must return the same shape
// and obey the same caps.
import { ethers } from "ethers";
import { AGENT_NFT_ABI } from "@axiom/config/abis";

export const MAX_AGENT_ENUMERATION = 100 as const;
export const AGENT_LOG_SCAN_BLOCKS = 50_000;

export interface OwnedAgent {
  tokenId: string;
  owner: string;
  dataDescription?: string;
}

/** Enumerate an owner's agent NFTs via Transfer logs (recent window, full-history
 *  fallback), then read each token's dataDescription. Throws when the NFT address
 *  is unconfigured — callers own their own error envelope. */
export async function enumerateOwnedAgents(
  provider: ethers.Provider,
  nftAddr: string,
  owner: string,
): Promise<{ owner: string; agents: OwnedAgent[] }> {
  const iface = new ethers.Interface(AGENT_NFT_ABI);
  const balanceHex = await provider.call({
    to: nftAddr,
    data: iface.encodeFunctionData("balanceOf", [owner]),
  });
  const balance = BigInt(balanceHex);
  const tokens: OwnedAgent[] = [];
  const transferTopic = iface.getEvent("Transfer")!.topicHash;
  if (balance > 0n) {
    const paddedOwner = ("0x" +
      "00".repeat(12) +
      owner.slice(2)) as `0x${string}`;
    const latest = await provider.getBlockNumber();
    const fromBlock = Math.max(0, latest - AGENT_LOG_SCAN_BLOCKS);
    let transferLogs = await provider.getLogs({
      address: nftAddr,
      fromBlock,
      toBlock: "latest",
      topics: [transferTopic, null, paddedOwner],
    });
    if (transferLogs.length === 0) {
      try {
        transferLogs = await provider.getLogs({
          address: nftAddr,
          fromBlock: 0,
          toBlock: "latest",
          topics: [transferTopic, null, paddedOwner],
        });
      } catch {
        // best-effort: a log fetch failure must not abort the owner lookup
      }
    }
    const uniqueTokenIds = [
      ...new Set(
        transferLogs.flatMap((entry) =>
          entry.topics[3] ? [BigInt(entry.topics[3])] : [],
        ),
      ),
    ];
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
    for (const t of ownerResults) if (t) tokens.push(t);
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
    tokens.forEach((token, i) => {
      const result = metadataResults[i];
      if (result?.status === "fulfilled")
        token.dataDescription = String(result.value ?? "");
    });
  }
  return { owner, agents: tokens };
}
