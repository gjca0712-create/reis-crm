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

  // Padrão do Next é 1MB por Server Action — pequeno demais pra anexar foto
  // (WhatsApp Suporte manda arquivo pelo mesmo formulário/action).
  experimental: {
    serverActions: {
      bodySizeLimit: "15mb",
    },
    // Sem isso, o cache de navegação do navegador (client router cache) pode
    // reaproveitar uma versão antiga de uma página dinâmica ao navegar de
    // volta pra ela (ex: trocar de usuário logado, ou reabrir uma conversa
    // pela barra lateral) — mostrando dado desatualizado (nome de quem
    // respondeu, status da conversa) até dar F5 manualmente.
    staleTimes: {
      dynamic: 0,
    },
  },

  images: {
    // Placeholders de categoria (data/products.ts) são SVG gerados por
    // scripts/gen-placeholders.mjs e servidos via next/image com src em
    // string. CSP restrita neutraliza o risco de SVG com script embutido;
    // remover dangerouslyAllowSVG quando fotos reais (raster) substituírem.
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Impede que o site (e o /admin) seja carregado dentro de um
          // <iframe> de outro domínio — mitiga clickjacking.
          { key: "X-Frame-Options", value: "DENY" },
          // Impede o navegador de tentar "adivinhar" o tipo de um arquivo
          // diferente do Content-Type declarado.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Não vaza a URL completa (com querystring) como referrer pra
          // sites de terceiro ao clicar num link externo.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Força HTTPS por 1 ano, incluindo subdomínios — Railway já serve
          // tudo em HTTPS, isso garante que o navegador nunca tente HTTP.
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
