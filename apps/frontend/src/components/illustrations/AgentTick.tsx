import type { CSSProperties, ReactElement } from "react";

/**
 * AgentTick — a live agent "executing". Phosphor waveform + tick marks.
 * Used in chat empty state and landing "live market" section.
 * The waveform pulses via .phosphor-pulse CSS class.
 */
export function AgentTick({
  width = 320,
  height = 120,
  style,
}: {
  width?: number;
  height?: number;
  style?: CSSProperties;
}): ReactElement {
  // Generate a waveform path
  const points: string[] = [];
  const midY = height / 2;
  const segments = 40;
  const segW = width / segments;
  for (let i = 0; i <= segments; i++) {
    const x = i * segW;
    const wave = Math.sin(i * 0.5) * 20 + Math.sin(i * 0.15) * 10;
    const y = midY + wave;
    points.push(`${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
      style={{ maxWidth: "100%", height: "auto", ...style }}
    >
      {/* Tick marks — bottom axis */}
      {Array.from({ length: 16 }).map((_, i) => {
        const x = (i / 15) * width;
        return (
          <line
            key={i}
            x1={x}
            y1={height - 8}
            x2={x}
            y2={height - 4}
            stroke="var(--c-border-strong)"
            strokeWidth="1"
          />
        );
      })}

      {/* Center axis line */}
      <line
        x1="0"
        y1={midY}
        x2={width}
        y2={midY}
        stroke="var(--c-border)"
        strokeWidth="1"
        opacity="0.4"
      />

      {/* Waveform — phosphor glow */}
      <path
        d={points.join(" ")}
        stroke="var(--c-phosphor)"
        strokeWidth="2"
        fill="none"
        className="phosphor-pulse"
        opacity="0.8"
      />

      {/* Current tick marker — right edge */}
      <circle
        cx={width - 4}
        cy={midY}
        r="3"
        fill="var(--c-phosphor)"
        className="phosphor-pulse"
      />
    </svg>
  );
}
