import type { ReactElement } from "react";
import { formatEther } from "viem";
import { COLORS } from "../components/ui.js";
import { parseEncodePreview } from "./encodePreview.js";

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
}: {
  content: string | null;
  toolName?: string;
}): ReactElement | null {
  const preview = parseEncodePreview(content);
  if (!preview) return null;

  const amountLabel =
    toolName === "withdraw" || toolName === "deposit"
      ? `${preview.amount ?? "?"} 0G`
      : preview.amount
        ? `${preview.amount}${preview.amountUnit ? ` ${preview.amountUnit}` : ""}`
        : null;

  if (preview.txHash) {
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
          {preview.txHash}
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
    </div>
  );
}