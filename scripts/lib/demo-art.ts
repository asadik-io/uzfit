/**
 * Original, generated demo artwork (abstract shapes, no photography), so demo venues have
 * imagery with unambiguous usage rights. Deterministic for a given seed.
 */

type Theme = { from: string; to: string; shape: string; accent: string };

const THEMES: Record<string, Theme> = {
  gym: { from: "#0f172a", to: "#047857", shape: "#10b981", accent: "#bef264" },
  yoga: { from: "#ecfccb", to: "#34d399", shape: "#047857", accent: "#fef9c3" },
  swimming: { from: "#0c4a6e", to: "#06b6d4", shape: "#67e8f9", accent: "#e0f2fe" },
  boxing: { from: "#450a0a", to: "#ea580c", shape: "#fb923c", accent: "#fde68a" },
  dance: { from: "#3b0764", to: "#db2777", shape: "#f472b6", accent: "#fbcfe8" },
  functional: { from: "#064e3b", to: "#84cc16", shape: "#bef264", accent: "#ecfccb" },
};

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function glyph(category: string, t: Theme): string {
  switch (category) {
    case "gym":
      return `<g transform="translate(600 450) rotate(-18)" fill="${t.accent}">
        <rect x="-260" y="-22" width="520" height="44" rx="22"/>
        <rect x="-300" y="-110" width="70" height="220" rx="24"/><rect x="-220" y="-80" width="50" height="160" rx="18"/>
        <rect x="230" y="-110" width="70" height="220" rx="24"/><rect x="170" y="-80" width="50" height="160" rx="18"/></g>`;
    case "yoga":
      return `<g fill="none" stroke="${t.shape}" stroke-width="14" stroke-linecap="round">
        <circle cx="600" cy="400" r="120" fill="${t.accent}" stroke="none"/>
        <path d="M280 700 C 450 560, 750 560, 920 700"/><path d="M360 760 C 500 660, 700 660, 840 760"/></g>`;
    case "swimming":
      return `<g fill="none" stroke="${t.accent}" stroke-width="22" stroke-linecap="round">
        ${[0, 1, 2]
          .map(
            (i) =>
              `<path d="M120 ${420 + i * 110} q 80 -60 160 0 t 160 0 t 160 0 t 160 0 t 160 0 t 160 0" opacity="${1 - i * 0.25}"/>`,
          )
          .join("")}</g>`;
    case "boxing":
      return `<g transform="translate(600 450)"><circle r="190" fill="${t.accent}"/>
        <path d="M-120 -40 h240 v120 a60 60 0 0 1 -60 60 h-120 a60 60 0 0 1 -60 -60 z" fill="${t.to}"/></g>`;
    case "dance":
      return `<g fill="none" stroke="${t.accent}" stroke-width="18" stroke-linecap="round">
        <path d="M200 650 C 350 300, 520 800, 650 420 S 900 300, 1000 520"/>
        <circle cx="820" cy="300" r="48" fill="${t.accent}" stroke="none"/></g>`;
    default:
      return `<polyline points="120,520 330,520 400,360 490,690 580,300 660,560 740,520 1080,520" fill="none"
        stroke="${t.accent}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
}

/** SVG artwork (1200x900) for a venue image. */
export function venueArtSvg(category: string, seed: number): string {
  const t = THEMES[category] ?? THEMES.functional!;
  const rand = random(seed);
  const circles = Array.from({ length: 7 }, () => {
    const r = 40 + rand() * 180;
    return `<circle cx="${(rand() * 1200).toFixed(0)}" cy="${(rand() * 900).toFixed(0)}" r="${r.toFixed(0)}" fill="${t.shape}" opacity="${(0.08 + rand() * 0.18).toFixed(2)}"/>`;
  }).join("");
  const angle = Math.round(rand() * 360);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
  <defs><linearGradient id="g" gradientTransform="rotate(${angle} .5 .5)">
    <stop offset="0" stop-color="${t.from}"/><stop offset="1" stop-color="${t.to}"/></linearGradient></defs>
  <rect width="1200" height="900" fill="url(#g)"/>${circles}${glyph(category, t)}
</svg>`;
}
