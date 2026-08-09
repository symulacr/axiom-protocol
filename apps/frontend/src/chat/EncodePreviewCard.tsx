import { useState, type ReactElement } from "react";
import { formatEther } from "viem";
import { COLORS } from "../components/ui.js";

type EncodePreview = {
  encodeOnly?: boolean;
  to?: string;
  data?: string;
  value?: string;
  amount?: string;
  amountUnit?: string;
  txHash?: string;
};

function parseEncodePreview(content: string | null): EncodePreview | null {
  if (!content) return null;
  try {
    const obj = JSON.parse(content) as EncodePreview & { error?: string };
    if (obj.error !== undefined) return null;
    if (obj.encodeOnly || obj.txHash) return obj;
    return null;
  } catch {
    return null;
  }
}

export function hasEncodePreview(content: string | null): boolean {
  return parseEncodePreview(content) !== null;
}

function formatNativeValue(weiStr: string): string {
  try {
    return `${formatEther(BigInt(weiStr))} 0G`;
  } catch {
    return `${weiStr} wei`;
  }
}

export function EncodePreviewCard({
  content,
  toolName,
  onSign,
}: {
  content: string | null;
  toolName?: string;
  onSign?: (a: {
    to: `0x${string}`;
    data?: `0x${string}`;
    value?: bigint;
  }) => Promise<`0x${string}`>;
}): ReactElement | null {
  const preview = parseEncodePreview(content);
  if (!preview) return null;
  const [signedHash, setSignedHash] = useState<string | null>(null);
  const handleSign = async () => {
    if (!onSign || !preview.to) return;
    try {
      const hash = await onSign({
        to: preview.to as `0x${string}`,
        data: (preview.data as `0x${string}`) ?? undefined,
        value: preview.value ? BigInt(preview.value) : undefined,
      });
      setSignedHash(hash);
    } catch {
      /* signing rejected or failed */
    }
  };

  const amountLabel =
    toolName === "withdraw" || toolName === "deposit"
      ? `${preview.amount ?? "?"} 0G`
      : preview.amount
        ? `${preview.amount}${preview.amountUnit ? ` ${preview.amountUnit}` : ""}`
        : null;

  if (preview.txHash ?? signedHash) {
    return (
      <div
        style={{
          marginTop: "var(--space-xs)",
          padding: "var(--space-sm) var(--space-md)",
          borderRadius: "var(--radius-md)",
          border: `1px solid ${COLORS.bronzeBorder}`,
          background: COLORS.bronzeBg,
          fontSize: "var(--text-sm)",
        }}
      >
        <strong style={{ color: COLORS.bronzeLight }}>Signed</strong>
        <div style={{ color: COLORS.textMuted, marginTop: 4, wordBreak: "break-all" }}>
          {preview.txHash ?? signedHash}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: "var(--space-xs)",
        padding: "var(--space-sm) var(--space-md)",
        borderRadius: "var(--radius-md)",
        border: `1px solid ${COLORS.border}`,
        background: COLORS.bg,
        fontSize: "var(--text-xs)",
        color: COLORS.textMuted,
      }}
    >
      <div style={{ fontWeight: "var(--fw-semibold)", color: COLORS.text, marginBottom: 6 }}>
        Encode preview — confirm in wallet
      </div>
      {preview.to ? <div>to: {preview.to}</div> : null}
      {preview.value && preview.value !== "0" ? (
        <div>value: {formatNativeValue(preview.value)}</div>
      ) : null}
      {amountLabel ? <div>amount: {amountLabel}</div> : null}
      {preview.data ? (
        <div style={{ wordBreak: "break-all", marginTop: 4 }}>
          data: {preview.data.slice(0, 66)}
          {preview.data.length > 66 ? "…" : ""}
        </div>
      ) : null}
      {onSign && preview.to && !signedHash ? (
        <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={handleSign}>
          Sign in wallet
        </button>
      ) : null}
    </div>
  );
}