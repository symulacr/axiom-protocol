import { useCallback, useState } from "react";
import { keccak256, toBytes, toHex } from "viem";
import { ORACLE_URL } from "../config/env.js";
import { humanizeError } from "../utils/format.js";

export type MintWizardStep = "describe" | "oracle" | "mint";

export function useMintWizard() {
  const [step, setStep] = useState<MintWizardStep>("describe");
  const [agentName, setAgentName] = useState("");
  const [payloadText, setPayloadText] = useState("");
  const [dataHash, setDataHash] = useState<`0x${string}` | "">("");
  const [oracleOk, setOracleOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const deriveDataHash = useCallback(() => {
    const bytes = toBytes(payloadText.trim() || agentName.trim());
    const hash = keccak256(bytes);
    setDataHash(hash);
    return hash;
  }, [agentName, payloadText]);

  const registerOracle = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const hash = dataHash || deriveDataHash();
      const res = await fetch(`${ORACLE_URL}/v1/agents/mint`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dataHash: hash }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Oracle mint failed: ${res.status}`);
      }
      const body = (await res.json()) as { ok?: boolean; dataHash?: string };
      if (body.ok !== true) throw new Error("Oracle did not accept dataHash");
      setOracleOk(true);
      setStep("mint");
    } catch (err) {
      setError(humanizeError(err));
    } finally {
      setBusy(false);
    }
  }, [dataHash, deriveDataHash]);

  return {
    step,
    setStep,
    agentName,
    setAgentName,
    payloadText,
    setPayloadText,
    dataHash,
    deriveDataHash,
    oracleOk,
    registerOracle,
    error,
    busy,
    payloadPreview: payloadText.trim()
      ? toHex(toBytes(payloadText.trim())).slice(0, 42) + "…"
      : null,
  };
}