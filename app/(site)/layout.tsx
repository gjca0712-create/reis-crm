import type { Metadata, Viewport } from "next";
import { siteConfig } from "@/lib/site-config";
import { hardwareStoreJsonLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppFloat from "@/components/WhatsAppFloat";
import { CartProvider } from "@/components/cart/CartProvider";

// Era o layout raiz do site quando ele era um app Next.js à parte (ver
// app/layout.tsx pro root de verdade agora). <html>/<body> saíram daqui — só
// o root pode declarar os dois — e viraram uma div; o resto do conteúdo
// (fontes, Header/Footer/CartProvider, tema claro/Material-3) é idêntico.

const title = `${siteConfig.fullName} | ${siteConfig.slogan} em Cruz das Almas - BA`;
const description = `${siteConfig.fullName}: ${siteConfig.yearsOfTradition} anos de tradição em Cruz das Almas - BA. Amplo estoque, entrega com frota própria e atendimento técnico especializado para reforma, construção e obras.`;

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.siteUrl),
  title: {
    default: title,
    template: `%s | ${siteConfig.fullName}`,
  },
  description,
  keywords: [
    "material de construção Cruz das Almas",
    "loja de materiais de construção BA",
    "cimento Cruz das Almas",
    "material de construção Bahia",
    "loja de tintas Cruz das Almas",
    "material elétrico e hidráulico Cruz das Almas",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title,
    description,
    url: siteConfig.siteUrl,
    locale: "pt_BR",
    type: "website",
    siteName: siteConfig.fullName,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
    },
  },
};

export const viewport: Viewport = {
  themeColor: "#121415",
  width: "device-width",
  initialScale: 1,
};

export default function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen flex-col bg-background font-body text-on-background">
      <JsonLd data={hardwareStoreJsonLd()} />

      {/* ANALYTICS: substituir G-XXXXXXXXXX pelo ID real do Google Analytics 4.
          Eventos "whatsapp_click"/"add_to_cart"/"begin_checkout" (lib/analytics.ts) são
          as métricas de conversão principais. */}
      {/*
      <script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
      <script dangerouslySetInnerHTML={{ __html: `
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', 'G-XXXXXXXXXX');
      `}} />
      */}

      <CartProvider>
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <WhatsAppFloat />
      </CartProvider>
    </div>
  );
}
