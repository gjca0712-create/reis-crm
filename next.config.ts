import type { NextConfig } from "next";

// Este app é a "zona" /admin dentro do domínio da Reis — o site institucional
// (projeto separado, reis-source-para-crm) é a zona padrão e reescreve
// /admin/* pra cá (ver next.config.ts dele). basePath faz o Next prefixar
// automaticamente todo link, redirect() e asset deste app com /admin — não
// precisa mexer em cada `redirect("/login")`/`<Link href="/vendas">` espalhado
// pelo código. Ver node_modules/next/dist/docs/01-app/02-guides/multi-zones.md.
const SITE_ORIGIN_DEV = "http://localhost:3120";

const nextConfig: NextConfig = {
  basePath: "/admin",

  // Baileys (and its "ws" dependency) must run as real Node modules, not be
  // webpack-bundled — bundling breaks ws's native buffer-masking shim
  // ("bufferUtil.mask is not a function").
  serverExternalPackages: ["@whiskeysockets/baileys"],

  experimental: {
    serverActions: {
      // Quem acessa via /admin no site vê o Origin do SITE (o domínio público),
      // não o deste app — sem isso, toda Server Action (login, salvar venda,
      // responder WhatsApp etc.) é rejeitada como possível CSRF. Em produção,
      // trocar pelo domínio real do site.
      allowedOrigins: [SITE_ORIGIN_DEV.replace(/^https?:\/\//, "")],
    },
  },
};

export default nextConfig;
