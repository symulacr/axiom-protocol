import { useCallback, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { useMutation } from "@tanstack/react-query";
import { keccak256, toBytes, toHex } from "viem";
import { humanizeError } from "../utils/format.js";
import {
	apiFetch,
	oracleFetch,
	type EncodeResponse,
} from "../utils/apiFetch.js";
import { buildDefaultPayload } from "./mintPayload.js";

type MintWizardStep = "name" | "minting" | "ready";

export function useMintWizard() {
	const [step, setStep] = useState<MintWizardStep>("name");
	const [agentName, setAgentName] = useState("");
	const [payloadText, setPayloadText] = useState("");
	const [dataHash, setDataHash] = useState<`0x${string}` | "">("");
	const [oracleOk, setOracleOk] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const { address: owner } = useAccount();
	const { data: walletClient } = useWalletClient();

	const ensurePayload = useCallback(
		(name?: string) => {
			const n = (name ?? agentName).trim();
			const payload = buildDefaultPayload(n);
			setPayloadText(payload);
			return payload;
		},
		[agentName],
	);

	const deriveDataHash = useCallback(
		(name?: string) => {
			const n = (name ?? agentName).trim() || "Axiom agent";
			// Canonical mint dataHash: keccak256(toHex(name)) — identical to the
			// chat mint_agent derivation (packages/chat-runtime/src/executors/
			// encode.ts). The contract stores this 32-byte value verbatim and the
			// oracle only signs ownership proofs for hashes it has SEEN, so both
			// mint paths MUST derive the same hash for the same agent name. The
			// real dataHash is the 0G storage Merkle root of the uploaded payload
			// (docs/current-state.md "Merkle root = dataHash"); until the payload
			// is uploaded this deterministic name hash is used.
			const hash = keccak256(toHex(n));
			ensurePayload(name); // keep the metadata preview in sync
			setDataHash(hash);
			return hash;
		},
		[agentName, ensurePayload],
	);

	/** POST to oracle: register the mint dataHash. */
	const oracleMutation = useMutation({
		retry: false,
		mutationFn: (hash: `0x${string}`) =>
			oracleFetch<{ ok?: boolean; dataHash?: string }>("/v1/agents/mint", {
				method: "POST",
				body: JSON.stringify({ dataHash: hash }),
			}),
	});

	/** POST /v1/agents/mint/encode, then submit the mint tx from the wallet. */
	const encodeMutation = useMutation({
		retry: false,
		mutationFn: async (input: {
			dataHash: `0x${string}`;
			description: string;
		}) => {
			if (!owner || !walletClient) {
				throw new Error("wallet not connected");
			}
			const encoded = await apiFetch<EncodeResponse>("/v1/agents/mint/encode", {
				method: "POST",
				body: JSON.stringify({
					dataDescription: input.description,
					dataHash: input.dataHash,
					to: owner,
				}),
			});
			return walletClient.sendTransaction({
				to: encoded.to,
				data: encoded.data,
				value: BigInt(encoded.value),
				chain: walletClient.chain,
			});
		},
	});

	const registerOracle = useCallback(
		async (name?: string): Promise<`0x${string}`> => {
			setError(null);
			setStep("minting");
			try {
				const hash = deriveDataHash(name);
				const body = await oracleMutation.mutateAsync(hash);
				if (body.ok !== true) throw new Error("Oracle did not accept dataHash");
				setOracleOk(true);
				setStep("ready");
				return hash;
			} catch (err) {
				setError(humanizeError(err));
				setStep("name");
				throw err;
			}
		},
		[deriveDataHash, oracleMutation],
	);

	/** Encode + submit the mint transaction; resolves with the on-chain hash. */
	const chainMint = useCallback(
		async (dataHash: `0x${string}`): Promise<`0x${string}`> =>
			encodeMutation.mutateAsync({
				dataHash,
				// Must match the name used in deriveDataHash (keccak256(toHex(name)))
				description: agentName.trim() || "Axiom agent",
			}),
		[encodeMutation, agentName],
	);

	return {
		step,
		setStep,
		agentName,
		setAgentName,
		payloadText,
		setPayloadText,
		dataHash,
		deriveDataHash,
		ensurePayload,
		oracleOk,
		registerOracle,
		chainMint,
		error,
		busy:
			oracleMutation.isPending ||
			encodeMutation.isPending ||
			step === "minting",
		setError,
		payloadPreview: payloadText.trim()
			? toHex(toBytes(payloadText.trim())).slice(0, 42) + "…"
			: null,
	};
}
