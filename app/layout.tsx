import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter, Oswald } from "next/font/google";
import "./globals.css";
import { siteConfig } from "@/lib/site-config";

// Root "de verdade" — só existe um <html>/<body> no Next.js App Router, então
// fica minimalista de propósito. Cada zona tem seu próprio layout aninhado
// que decide tema/estrutura visual: app/(site)/layout.tsx (site institucional,
// Header/Footer/CartProvider) e app/admin/layout.tsx (CRM, tema escuro sem
// chrome do site). As duas fontes carregam aqui porque as duas zonas usam Inter,
// e só o site usa Oswald (--font-oswald vira "" nas páginas do CRM, inofensivo).
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const oswald = Oswald({ subsets: ["latin"], variable: "--font-oswald", weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.siteUrl),
  title: "Reis Materiais de Construção",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${oswald.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
