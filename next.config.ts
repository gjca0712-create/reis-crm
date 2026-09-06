import type { NextConfig } from "next";

// CRM e site institucional agora são um app Next.js só (era Multi-Zones —
// dois apps separados costurados por rewrites; virou um único projeto por
// pedido explícito do cliente). Site fica nas rotas normais (app/(site)/*),
// CRM fica todo debaixo de app/admin/*.
const nextConfig: NextConfig = {
  // Baileys (and its "ws" dependency) must run as real Node modules, not be
  // webpack-bundled — bundling breaks ws's native buffer-masking shim
  // ("bufferUtil.mask is not a function").
  serverExternalPackages: ["@whiskeysockets/baileys"],

  images: {
    // Placeholders de categoria (data/products.ts) são SVG gerados por
    // scripts/gen-placeholders.mjs e servidos via next/image com src em
    // string. CSP restrita neutraliza o risco de SVG com script embutido;
    // remover dangerouslyAllowSVG quando fotos reais (raster) substituírem.
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
};

export default nextConfig;
