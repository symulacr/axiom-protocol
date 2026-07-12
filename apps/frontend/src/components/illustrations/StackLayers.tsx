import type { CSSProperties, ReactElement } from "react";

/**
 * StackLayers — three stacked translucent panels representing
 * 0G Chain, 0G Compute, 0G Storage. Used in the "stack" section.
 * Each layer is offset and animates in with staggered translateY.
 */
export function StackLayers({
  width = 360,
  height = 240,
  style,
}: {
  width?: number;
  height?: number;
  style?: CSSProperties;
}): ReactElement {
  const layerW = 280;
  const layerH = 48;
  const cx = width / 2;
  const startY = 50;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
      style={{ color: "var(--c-bronze)", maxWidth: "100%", height: "auto", ...style }}
    >
      {/* Storage — bottom layer */}
      <g>
        <rect
          x={cx - layerW / 2}
          y={startY + 100}
          width={layerW}
          height={layerH}
          rx="8"
          stroke="currentColor"
          strokeWidth="1.5"
          opacity="0.3"
          fill="var(--c-bronze-bg)"
        />
        <text x={cx} y={startY + 100 + 30} textAnchor="middle" fontSize="13" fill="var(--c-text-muted)" fontWeight="500">
          0G Storage
        </text>
        <text x={cx} y={startY + 100 + 42} textAnchor="middle" fontSize="9" fill="var(--c-text-dim)" fontFamily="var(--font-mono)">
          encrypted payloads · merkle proofs
        </text>
      </g>

      {/* Compute — middle layer */}
      <g>
        <rect
          x={cx - layerW / 2}
          y={startY + 50}
          width={layerW}
          height={layerH}
          rx="8"
          stroke="currentColor"
          strokeWidth="1.5"
          opacity="0.5"
          fill="var(--c-bronze-bg)"
        />
        <text x={cx} y={startY + 50 + 30} textAnchor="middle" fontSize="13" fill="var(--c-text-muted)" fontWeight="500">
          0G Compute
        </text>
        <text x={cx} y={startY + 50 + 42} textAnchor="middle" fontSize="9" fill="var(--c-text-dim)" fontFamily="var(--font-mono)">
          TEE-attested inference · re-keying
        </text>
      </g>

      {/* Chain — top layer */}
      <g>
        <rect
          x={cx - layerW / 2}
          y={startY}
          width={layerW}
          height={layerH}
          rx="8"
          stroke="currentColor"
          strokeWidth="1.5"
          opacity="0.8"
          fill="var(--c-bronze-bg)"
        />
        <text x={cx} y={startY + 30} textAnchor="middle" fontSize="13" fill="var(--c-text)" fontWeight="600">
          0G Chain
        </text>
        <text x={cx} y={startY + 42} textAnchor="middle" fontSize="9" fill="var(--c-text-dim)" fontFamily="var(--font-mono)">
          ERC-7857 iNFTs · settlements
        </text>
      </g>

      {/* Connection lines between layers */}
      <line x1={cx - layerW / 2 + 20} y1={startY + layerH} x2={cx - layerW / 2 + 20} y2={startY + 50} stroke="var(--c-border-strong)" strokeWidth="1" opacity="0.4" />
      <line x1={cx + layerW / 2 - 20} y1={startY + layerH} x2={cx + layerW / 2 - 20} y2={startY + 50} stroke="var(--c-border-strong)" strokeWidth="1" opacity="0.4" />
      <line x1={cx - layerW / 2 + 20} y1={startY + 50 + layerH} x2={cx - layerW / 2 + 20} y2={startY + 100} stroke="var(--c-border-strong)" strokeWidth="1" opacity="0.4" />
      <line x1={cx + layerW / 2 - 20} y1={startY + 50 + layerH} x2={cx + layerW / 2 - 20} y2={startY + 100} stroke="var(--c-border-strong)" strokeWidth="1" opacity="0.4" />
    </svg>
  );
}
