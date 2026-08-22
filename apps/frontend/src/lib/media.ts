/**
 * Self-contained media for the console.
 * The original Manus sandbox served these from /manus-storage (a server-side
 * proxy that does not exist outside that environment); every image is now an
 * inline SVG data URI so the mockup renders identically offline with zero 404s.
 * Motifs follow the Copper Command Deck palette: graphite canvas, copper
 * focal energy, phosphor verified-live accents.
 */
const ART = {
  mark: "#d28b52",
  hero: "#efae6b",
  heroPulse: "#67e8b4",
  wallet: "#d28b52",
  onboarding: "#79c4cd",
  proof: "#67e8b4",
  recovery: "#f0b36b",
  mint: "#d28b52",
  payment: "#f0b36b",
  transfer: "#6bb9c8",
  recovery404: "#f0b36b",
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
    `<stop offset='100%' stop-color='#0b0e0f' stop-opacity='0'/>` +
    `</radialGradient>` +
    `<pattern id='p' width='12' height='12' patternUnits='userSpaceOnUse' patternTransform='rotate(24)'>` +
    `<path d='M0 0H12' stroke='${accent}' stroke-opacity='.08' stroke-width='1'/>` +
    `</pattern>` +
    `</defs>` +
    `<rect width='120' height='80' fill='#0c1011'/>` +
    `<rect width='120' height='80' fill='url(#p)'/>` +
    `<rect width='120' height='80' fill='url(#g)'/>` +
    `<circle cx='${(cx * 1.2).toFixed(1)}' cy='${(cy * 0.9).toFixed(1)}' r='5' fill='none' stroke='${accent}' stroke-opacity='.8' stroke-width='.8' transform='skewX(-14)'/>` +
    `<circle cx='${(cx * 1.2).toFixed(1)}' cy='${(cy * 0.9).toFixed(1)}' r='1.6' fill='#67e8b4' fill-opacity='.9'/>` +
    `<path d='M-4 64 Q 40 ${48 + (seed % 3) * 6} 124 ${44 + (seed % 2) * 8}' stroke='${accent}' stroke-opacity='.35' fill='none' stroke-width='.7'/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, "%27")}`;
}

export const MEDIA = {
  mark: field(ART.mark, 0),
  hero: field(ART.hero, 1),
  heroPulse: field(ART.heroPulse, 2),
  wallet: field(ART.wallet, 3),
  onboarding: field(ART.onboarding, 4),
  proof: field(ART.proof, 5),
  recovery: field(ART.recovery, 6),
  mint: field(ART.mint, 7),
  payment: field(ART.payment, 8),
  transfer: field(ART.transfer, 9),
  recovery404: field(ART.recovery404, 10),
  video: null as string | null,
} as const;
