import { useCallback, useState } from "react";
import { keccak256, toBytes, toHex } from "viem";
import { API_KEY, ORACLE_URL } from "../config/env.js";
import { humanizeError } from "../utils/format.js";
import { buildDefaultPayload } from "./mintPayload.js";

export type MintWizardStep = "name" | "minting" | "ready";
export { buildDefaultPayload } from "./mintPayload.js";

export function useMintWizard() {
  const [step, setStep] = useState<MintWizardStep>("name");
  const [agentName, setAgentName] = useState("");
  const [payloadText, setPayloadText] = useState("");
  const [dataHash, setDataHash] = useState<`0x${string}` | "">("");
  const [oracleOk, setOracleOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      const payload = ensurePayload(name);
      const bytes = toBytes(payload);
      const hash = keccak256(bytes);
      setDataHash(hash);
      return hash;
    },
    [ensurePayload],
  );

  const registerOracle = useCallback(
    async (name?: string) => {
      setBusy(true);
      setError(null);
      setStep("minting");
      try {
        const hash = deriveDataHash(name);
        const res = await fetch(`${ORACLE_URL}/v1/agents/mint`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(API_KEY ? { "x-api-key": API_KEY } : {}),
          },
          body: JSON.stringify({ dataHash: hash }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Oracle mint failed: ${res.status}`);
        }
        const body = (await res.json()) as { ok?: boolean; dataHash?: string };
        if (body.ok !== true) throw new Error("Oracle did not accept dataHash");
        setOracleOk(true);
        setStep("ready");
        return hash;
      } catch (err) {
        setError(humanizeError(err));
        setStep("name");
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [deriveDataHash],
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
    error,
    busy,
    setError,
    payloadPreview: payloadText.trim()
      ? toHex(toBytes(payloadText.trim())).slice(0, 42) + "…"
      : null,
  };
}
