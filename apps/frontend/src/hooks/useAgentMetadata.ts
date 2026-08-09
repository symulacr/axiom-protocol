import { useMemo } from "react";
import { useAccount, useChainId, useReadContracts } from "wagmi";
import { type Address, type Hex } from "viem";
import { getAxiomAgentNftAddress } from "../abi/addresses.js";
import { AGENT_NFT_ABI } from "@axiom/config/abis";

const axiomAgentNftAbiParsed = AGENT_NFT_ABI;

type AgentMetadata = {
	tokenId: bigint;
	name: string;
	symbol: string;
	owner: Address;
	creator: Address | undefined;
	dataHash: Hex;
	dataDescription: string;
	tokenUri: string;
};

export function useAgentMetadata(
	tokenId: bigint,
	options?: { enabled?: boolean },
): {
	data: AgentMetadata | null;
	isLoading: boolean;
	error: Error | null;
	refetch: () => void;
} {
	const chainId = useChainId();
	const { isConnected } = useAccount();
	const enabledOption = options?.enabled ?? true;
	const agentNftAddr = getAxiomAgentNftAddress(chainId);

	const contracts = useMemo(
		() =>
			[
				{
					address: agentNftAddr,
					abi: axiomAgentNftAbiParsed,
					functionName: "name",
				},
				{
					address: agentNftAddr,
					abi: axiomAgentNftAbiParsed,
					functionName: "symbol",
				},
				{
					address: agentNftAddr,
					abi: axiomAgentNftAbiParsed,
					functionName: "ownerOf",
					args: [tokenId],
				},
				{
					address: agentNftAddr,
					abi: axiomAgentNftAbiParsed,
					functionName: "intelligentDatasOf",
					args: [tokenId],
				},
				{
					address: agentNftAddr,
					abi: axiomAgentNftAbiParsed,
					functionName: "tokenURI",
					args: [tokenId],
				},
				{
					address: agentNftAddr,
					abi: axiomAgentNftAbiParsed,
					functionName: "creatorOf",
					args: [tokenId],
				},
			] as const,
		[tokenId, agentNftAddr],
	);

	const query = useReadContracts({
		allowFailure: true,
		contracts,
		query: {
			enabled: enabledOption && isConnected && tokenId > 0n,
		},
	});

	const intelligentDatas =
		(
			query.data?.[3] as
				| {
						result?: ReadonlyArray<{ dataDescription: string; dataHash: Hex }>;
						error?: Error;
				  }
				| undefined
		)?.result ?? undefined;
	const firstData = intelligentDatas?.[0];

	// ownerOf reverting is the canonical on-chain signal that the token does
	// not exist. Treat that as "confirmed not found" (data === null after
	// load) instead of an empty shell page. Network-level failures do not
	// carry the revert message, so they keep the previous behavior.
	const ownerOfError = (query.data?.[2] as { error?: Error } | undefined)
		?.error;
	const ownerOfReverted =
		ownerOfError !== undefined &&
		/revert/i.test(ownerOfError.message ?? String(ownerOfError));

	const data = useMemo<AgentMetadata | null>(() => {
		if (!query.data) return null;
		if (ownerOfReverted) return null;
		return {
			tokenId,
			name:
				(query.data[0] as { result?: string; error?: Error } | undefined)
					?.result ?? "",
			symbol:
				(query.data[1] as { result?: string; error?: Error } | undefined)
					?.result ?? "",
			owner:
				(query.data[2] as { result?: Address; error?: Error } | undefined)
					?.result ?? "0x0",
			creator: (
				query.data[5] as { result?: Address; error?: Error } | undefined
			)?.result as Address | undefined,
			dataHash: firstData?.dataHash ?? "0x",
			dataDescription: firstData?.dataDescription ?? "",
			tokenUri:
				(query.data[4] as { result?: string; error?: Error } | undefined)
					?.result ?? "",
		};
	}, [query.data, tokenId, firstData, ownerOfReverted]);

	const refetch = query.refetch;
	const result = useMemo(
		() => ({
			data,
			isLoading: query.isLoading,
			error: (query.error as Error | null) ?? null,
			refetch,
		}),
		[data, query.isLoading, query.error, refetch],
	);

	return result;
}
