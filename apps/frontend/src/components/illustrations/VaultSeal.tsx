import type { CSSProperties, ReactElement } from "react";

/**
 * VaultSeal — a sealed vault with a rotating bronze seal.
 * Decorative SVG for the landing hero. Inherits currentColor for strokes.
 * The seal rotates slowly (20s) via the .seal-rotate CSS class.
 * Under prefers-reduced-motion the rotation stops (CSS handles it).
 */
export function VaultSeal({
  size = 240,
  style,
}: {
  size?: number;
  style?: CSSProperties;
}): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      aria-hidden="true"
      style={{ color: "var(--c-bronze)", ...style }}
    >
      {/* Outer ring — the vault boundary */}
      <circle
        cx="100"
        cy="100"
        r="92"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.3"
      />
      {/* Rotating seal group */}
      <g className="seal-rotate" style={{ transformOrigin: "100px 100px" }}>
        {/* Seal outer ring with notches */}
        <circle
          cx="100"
          cy="100"
          r="72"
          stroke="currentColor"
          strokeWidth="2"
          opacity="0.6"
          strokeDasharray="4 8"
        />
        {/* Seal inner ring */}
        <circle
          cx="100"
          cy="100"
          r="56"
          stroke="currentColor"
          strokeWidth="1.5"
          opacity="0.4"
        />
        {/* Cross axes — the "key" symbol */}
        <line x1="100" y1="40" x2="100" y2="160" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
        <line x1="40" y1="100" x2="160" y2="100" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
        {/* Cardinal notches */}
        {[0, 90, 180, 270].map((angle) => {
          const rad = (angle * Math.PI) / 180;
          const x1 = 100 + Math.cos(rad) * 72;
          const y1 = 100 + Math.sin(rad) * 72;
          const x2 = 100 + Math.cos(rad) * 82;
          const y2 = 100 + Math.sin(rad) * 82;
          return (
            <line
              key={angle}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="currentColor"
              strokeWidth="2"
            />
          );
        })}
      </g>
      {/* Center — the sealed core */}
      <circle cx="100" cy="100" r="24" fill="currentColor" opacity="0.15" className="phosphor-pulse" />
      <circle cx="100" cy="100" r="24" stroke="currentColor" strokeWidth="1.5" />
      {/* Key symbol in center */}
      <circle cx="100" cy="96" r="6" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <line x1="100" y1="102" x2="100" y2="112" stroke="currentColor" strokeWidth="1.5" />
      <line x1="100" y1="108" x2="104" y2="108" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
