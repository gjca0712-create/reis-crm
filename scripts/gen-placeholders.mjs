// Gera placeholders SVG (gradiente escuro + grão + ícone dourado da categoria) para eu poder
// substituir por fotos reais de produto depois sem quebrar o layout. Um arquivo por categoria
// (não por produto) — ver data/products.ts.
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "images", "produtos");
mkdirSync(outDir, { recursive: true });

const GOLD = "#f2ca50";

const ICONS = {
  basico: `<g transform="translate(-60,-55)" stroke="${GOLD}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 110h108" />
    <path d="M18 110V50l42-30 42 30v60" />
    <path d="M42 110V74h36v36" />
  </g>`,
  acabamento: `<g transform="translate(-55,-55)" stroke="${GOLD}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <rect x="4" y="4" width="46" height="46" rx="4" />
    <rect x="60" y="4" width="46" height="46" rx="4" />
    <rect x="4" y="60" width="46" height="46" rx="4" />
    <rect x="60" y="60" width="46" height="46" rx="4" />
  </g>`,
  eletrica: `<g transform="translate(-35,-58)" stroke="${GOLD}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M38 4 12 62h30l-6 50 40-64H46l6-44z" />
  </g>`,
  hidraulica: `<g transform="translate(-45,-55)" stroke="${GOLD}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M28 4v28a18 18 0 0018 18h6a18 18 0 0018-18V4" />
    <path d="M52 50v36" />
    <path d="M12 110c0-18 12-24 40-24s40 6 40 24" />
  </g>`,
  ferramentas: `<g transform="translate(-55,-55)" stroke="${GOLD}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M84 26a24 24 0 01-32 32L18 92l14 14 34-34a24 24 0 0032-32l-16 16-12-12z" />
  </g>`,
  fundacao: `<g transform="translate(-55,-55)" stroke="${GOLD}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 110V44M32 110V44M54 110V44M76 110V44M98 110V44" />
    <path d="M4 44l54-34 54 34" />
    <path d="M4 110h108" />
  </g>`,
  tintas: `<g transform="translate(-40,-58)" stroke="${GOLD}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 4h52v28l10 10v10H4V42l10-10z" />
    <path d="M26 52v26a14 14 0 0014 14 14 14 0 0014-14V52" />
  </g>`,
};

function svgFor({ width, height, seed, icon }) {
  const cx = width / 2;
  const cy = height / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <radialGradient id="g${seed}" cx="50%" cy="38%" r="75%">
      <stop offset="0%" stop-color="#1e2021" />
      <stop offset="55%" stop-color="#16181a" />
      <stop offset="100%" stop-color="#0c0e0f" />
    </radialGradient>
    <filter id="grain${seed}">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="${seed}" stitchTiles="stitch" />
      <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.04 0" />
    </filter>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#g${seed})" />
  <rect width="${width}" height="${height}" filter="url(#grain${seed})" />
  <g transform="translate(${cx},${cy}) scale(1.4)" opacity="0.6">${icon}</g>
  <text x="24" y="${height - 22}" font-family="Arial, sans-serif" font-size="12" letter-spacing="2" fill="#ffffff" opacity="0.3">FOTO ILUSTRATIVA — SUBSTITUIR</text>
</svg>`;
}

const CATEGORIES = [
  "basico",
  "acabamento",
  "eletrica",
  "hidraulica",
  "ferramentas",
  "fundacao",
  "tintas",
];

CATEGORIES.forEach((slug, index) => {
  const svg = svgFor({ width: 900, height: 900, seed: index + 1, icon: ICONS[slug] });
  writeFileSync(join(outDir, `${slug}.svg`), svg, "utf8");
  console.log(`generated produtos/${slug}.svg`);
});
