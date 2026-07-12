import type { CSSProperties, ReactElement } from "react";

/**
 * MerkleTree — branching tree of hashes representing verifiable proofs.
 * Branches animate via stroke-dashoffset (data-svg-draw) on scroll.
 */
export function MerkleTree({
  width = 360,
  height = 200,
  style,
}: {
  width?: number;
  height?: number;
  style?: CSSProperties;
}): ReactElement {
  const cx = width / 2;
  const top = 20;
  const leafY = height - 30;
  const midY = top + (leafY - top) / 2;

  // 4 leaves
  const leafPositions = [
    cx - 120,
    cx - 40,
    cx + 40,
    cx + 120,
  ];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
      style={{ color: "var(--c-bronze)", maxWidth: "100%", height: "auto", ...style }}
    >
      {/* Root */}
      <rect x={cx - 18} y={top} width="36" height="24" rx="4" stroke="currentColor" strokeWidth="1.5" fill="var(--c-bronze-bg)" />
      <text x={cx} y={top + 16} textAnchor="middle" fontSize="8" fill="currentColor" fontFamily="var(--font-mono)">root</text>

      {/* Branches from root to mid nodes */}
      <line x1={cx - 8} y1={top + 24} x2={cx - 50} y2={midY - 12} stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
      <line x1={cx + 8} y1={top + 24} x2={cx + 50} y2={midY - 12} stroke="currentColor" strokeWidth="1.5" opacity="0.4" />

      {/* Mid nodes */}
      <rect x={cx - 68} y={midY - 12} width="36" height="24" rx="4" stroke="currentColor" strokeWidth="1.5" opacity="0.6" fill="var(--c-bronze-bg)" />
      <rect x={cx + 32} y={midY - 12} width="36" height="24" rx="4" stroke="currentColor" strokeWidth="1.5" opacity="0.6" fill="var(--c-bronze-bg)" />

      {/* Branches from mid to leaves */}
      {leafPositions.map((lx, i) => {
        const midX = i < 2 ? cx - 50 : cx + 50;
        return (
          <line
            key={i}
            x1={midX}
            y1={midY + 12}
            x2={lx}
            y2={leafY - 12}
            stroke="currentColor"
            strokeWidth="1"
            opacity="0.3"
          />
        );
      })}

      {/* Leaves — hash nodes */}
      {leafPositions.map((lx, i) => (
        <g key={i}>
          <rect
            x={lx - 16}
            y={leafY - 12}
            width="32"
            height="24"
            rx="4"
            stroke="var(--c-phosphor)"
            strokeWidth="1"
            opacity="0.5"
            fill="var(--c-teal-bg)"
          />
          <text x={lx} y={leafY + 4} textAnchor="middle" fontSize="7" fill="var(--c-text-dim)" fontFamily="var(--font-mono)">
            h{i}
          </text>
        </g>
      ))}
    </svg>
  );
}
