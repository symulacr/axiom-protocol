import type { CSSProperties, ReactElement } from "react";

/**
 * ReKeyDiagram — shows the TEE re-keying process on transfer.
 * A key morphs between two holders. Used in the "differentiator" section.
 * Strokes animate via data-svg-draw when scrolled into view.
 */
export function ReKeyDiagram({
  width = 480,
  height = 200,
  style,
}: {
  width?: number;
  height?: number;
  style?: CSSProperties;
}): ReactElement {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 480 200"
      fill="none"
      aria-hidden="true"
      style={{ color: "var(--c-bronze)", maxWidth: "100%", height: "auto", ...style }}
    >
      {/* Left holder — sender */}
      <g>
        <circle cx="60" cy="100" r="32" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
        <circle cx="60" cy="100" r="20" stroke="currentColor" strokeWidth="1.5" opacity="0.2" />
        <text x="60" y="155" textAnchor="middle" fontSize="11" fill="var(--c-text-dim)" fontFamily="var(--font-mono)">
          sender
        </text>
      </g>

      {/* Transfer arrow — the re-key path */}
      <g>
        <line
          x1="100"
          y1="100"
          x2="220"
          y2="100"
          stroke="var(--c-phosphor)"
          strokeWidth="2"
          strokeDasharray="6 4"
          opacity="0.6"
        />
        {/* Arrowhead */}
        <path d="M 220 100 L 212 95 L 212 105 Z" fill="var(--c-phosphor)" opacity="0.8" />
      </g>

      {/* The key — center, morphing */}
      <g transform="translate(240, 100)">
        {/* Key ring */}
        <circle cx="0" cy="-10" r="12" stroke="currentColor" strokeWidth="2" fill="none" />
        {/* Key shaft */}
        <line x1="0" y1="2" x2="0" y2="22" stroke="currentColor" strokeWidth="2" />
        {/* Key teeth */}
        <line x1="0" y1="16" x2="6" y2="16" stroke="currentColor" strokeWidth="2" />
        <line x1="0" y1="22" x2="4" y2="22" stroke="currentColor" strokeWidth="2" />
        {/* Glow behind key — phosphor pulse */}
        <circle cx="0" cy="0" r="24" fill="var(--c-phosphor-dim)" className="phosphor-pulse" opacity="0.5" />
      </g>

      {/* TEE box — the re-keying enclave */}
      <g transform="translate(240, 100)">
        <rect
          x="-35"
          y="-35"
          width="70"
          height="70"
          rx="8"
          stroke="var(--c-border-strong)"
          strokeWidth="1"
          fill="none"
          opacity="0.5"
          strokeDasharray="3 3"
        />
        <text x="0" y="48" textAnchor="middle" fontSize="9" fill="var(--c-text-dim)" fontFamily="var(--font-mono)">
          TEE
        </text>
      </g>

      {/* Transfer arrow — to receiver */}
      <g>
        <line
          x1="280"
          y1="100"
          x2="400"
          y2="100"
          stroke="var(--c-phosphor)"
          strokeWidth="2"
          strokeDasharray="6 4"
          opacity="0.6"
        />
        <path d="M 400 100 L 392 95 L 392 105 Z" fill="var(--c-phosphor)" opacity="0.8" />
      </g>

      {/* Right holder — receiver (with new key) */}
      <g>
        <circle cx="440" cy="100" r="32" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
        <circle cx="440" cy="100" r="20" stroke="currentColor" strokeWidth="1.5" opacity="0.2" />
        {/* New key icon inside */}
        <circle cx="440" cy="96" r="5" stroke="var(--c-phosphor)" strokeWidth="1.5" fill="none" />
        <line x1="440" y1="101" x2="440" y2="108" stroke="var(--c-phosphor)" strokeWidth="1.5" />
        <text x="440" y="155" textAnchor="middle" fontSize="11" fill="var(--c-text-dim)" fontFamily="var(--font-mono)">
          receiver
        </text>
      </g>

      {/* Label — "re-keyed" */}
      <text x="240" y="180" textAnchor="middle" fontSize="10" fill="var(--c-phosphor)" fontFamily="var(--font-mono)">
        re-keyed on every transfer
      </text>
    </svg>
  );
}
