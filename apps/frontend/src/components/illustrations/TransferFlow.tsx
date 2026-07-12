import type { CSSProperties, ReactElement } from "react";

/**
 * TransferFlow — owner → verification → transfer → new owner.
 * Horizontal motion lines indicate the transfer direction.
 * Designed to be paired with `data-svg-reveal` scroll animation.
 */
export function TransferFlow({
  width = 380,
  height = 180,
  style,
}: {
  width?: number;
  height?: number;
  style?: CSSProperties;
}): ReactElement {
  const cy = height / 2;
  const ownerX = 40;
  const newOwnerX = width - 40;
  const verifyX = width / 2;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
      style={{ color: "var(--c-bronze)", maxWidth: "100%", height: "auto", ...style }}
    >
      {/* Owner circle */}
      <circle cx={ownerX} cy={cy} r="26" stroke="currentColor" strokeWidth="1.5" fill="var(--c-bronze-bg)" />
      <text x={ownerX} y={cy + 4} textAnchor="middle" fontSize="9" fill="currentColor" fontFamily="var(--font-mono)">
        owner
      </text>

      {/* New owner circle (outlined, represents target) */}
      <circle cx={newOwnerX} cy={cy} r="26" stroke="var(--c-phosphor)" strokeWidth="1.5" strokeDasharray="4 3" fill="var(--c-teal-bg)" opacity="0.7" />
      <text x={newOwnerX} y={cy + 4} textAnchor="middle" fontSize="9" fill="var(--c-text-dim)" fontFamily="var(--font-mono)">
        new
      </text>

      {/* Verification diamond in the center */}
      <g transform={`translate(${verifyX} ${cy}) rotate(45)`}>
        <rect x="-14" y="-14" width="28" height="28" stroke="currentColor" strokeWidth="1.5" fill="var(--c-surface-raised)" />
      </g>
      <text x={verifyX} y={cy + 50} textAnchor="middle" fontSize="8" fill="var(--c-text-dim)" fontFamily="var(--font-mono)">
        verify
      </text>

      {/* Flow lines — left half toward center */}
      <line x1={ownerX + 28} y1={cy} x2={verifyX - 22} y2={cy} stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      {/* Arrow head */}
      <path d={`M ${verifyX - 22} ${cy} l -5 -3 l 0 6 z`} fill="currentColor" opacity="0.6" />

      {/* Flow lines — right half (dashed = pending) */}
      <line x1={verifyX + 22} y1={cy} x2={newOwnerX - 28} y2={cy} stroke="var(--c-phosphor)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.7" />
      <path d={`M ${newOwnerX - 28} ${cy} l -5 -3 l 0 6 z`} fill="var(--c-phosphor)" opacity="0.8" />
    </svg>
  );
}
