/**
 * Inline SVG data URIs (zero network fetches). Rendered inside
 * mix-blend-mode:screen slots that stay dark under light theme (B9
 * dark-lock) — hexes mirror their CSS tokens in src/styles/index.css.
 */
const CANVAS_PLATE = "#0c1011";
const CANVAS_FADE = "#0b0e0f";
const COPPER = "#d28b52"; // --copper
const PHOSPHOR = "#67e8b4"; // --phosphor
const WARNING = "#f0b36b"; // --warning
// Legacy teal family, retired from CSS tokens; retained for art identity.
const TEAL_LEGACY = "#79c4cd";
const TEAL_ROUTE = "#6bb9c8";

const ART = {
  // T4: heroPulse retired — the landing plate now renders the real console
  // row markup instead of the generative field (the img was display:none'd).
  onboarding: TEAL_LEGACY,
  proof: PHOSPHOR,
  recovery: WARNING,
  mint: COPPER,
  payment: WARNING,
  transfer: TEAL_ROUTE,
  recovery404: WARNING,
} as const;

function field(accent: string, seed: number): string {
  // Deterministic asymmetric composition: copper nucleus, orbit ring, scan grid.
  const cx = 62 + (seed % 3) * 9;
  const cy = 40 + (seed % 2) * 14;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 80' preserveAspectRatio='xMidYMid slice'>` +
    `<defs>` +
    `<radialGradient id='g' cx='${cx}%' cy='${cy}%' r='70%'>` +
    `<stop offset='0%' stop-color='${accent}' stop-opacity='.55'/>` +
    `<stop offset='38%' stop-color='${accent}' stop-opacity='.16'/>` +
    `<stop offset='100%' stop-color='${CANVAS_FADE}' stop-opacity='0'/>` +
    `</radialGradient>` +
    `<pattern id='p' width='12' height='12' patternUnits='userSpaceOnUse' patternTransform='rotate(24)'>` +
    `<path d='M0 0H12' stroke='${accent}' stroke-opacity='.08' stroke-width='1'/>` +
    `</pattern>` +
    `</defs>` +
    `<rect width='120' height='80' fill='${CANVAS_PLATE}'/>` +
    `<rect width='120' height='80' fill='url(#p)'/>` +
    `<rect width='120' height='80' fill='url(#g)'/>` +
    `<circle cx='${(cx * 1.2).toFixed(1)}' cy='${(cy * 0.9).toFixed(1)}' r='5' fill='none' stroke='${accent}' stroke-opacity='.8' stroke-width='.8' transform='skewX(-14)'/>` +
    `<circle cx='${(cx * 1.2).toFixed(1)}' cy='${(cy * 0.9).toFixed(1)}' r='1.6' fill='${PHOSPHOR}' fill-opacity='.9'/>` +
    `<path d='M-4 64 Q 40 ${48 + (seed % 3) * 6} 124 ${44 + (seed % 2) * 8}' stroke='${accent}' stroke-opacity='.35' fill='none' stroke-width='.7'/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, "%27")}`;
}

export const MEDIA = {
  onboarding: field(ART.onboarding, 4),
  proof: field(ART.proof, 5),
  recovery: field(ART.recovery, 6),
  mint: field(ART.mint, 7),
  payment: field(ART.payment, 8),
  transfer: field(ART.transfer, 9),
  recovery404: field(ART.recovery404, 10),
} as const;
