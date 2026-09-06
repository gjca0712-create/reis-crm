import { siteConfig } from "./site-config";
import type { BlogPost, Product, StockStatus } from "./types";

const AVAILABILITY_MAP: Record<StockStatus, string> = {
  "em-estoque": "https://schema.org/InStock",
  "sob-encomenda": "https://schema.org/PreOrder",
  indisponivel: "https://schema.org/OutOfStock",
};

export function hardwareStoreJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "HardwareStore",
    "@id": `${siteConfig.siteUrl}/#loja`,
    name: siteConfig.fullName,
    url: siteConfig.siteUrl,
    image: `${siteConfig.siteUrl}/opengraph-image`,
    description: `${siteConfig.fullName}: ${siteConfig.yearsOfTradition} anos de tradição em Cruz das Almas - BA. Amplo estoque de materiais de construção, entrega com frota própria e atendimento técnico especializado.`,
    telephone: siteConfig.phone.e164,
    priceRange: "$$",
    address: {
      "@type": "PostalAddress",
      streetAddress: siteConfig.address.street,
      addressLocality: siteConfig.address.city,
      addressRegion: siteConfig.address.state,
      postalCode: siteConfig.address.postalCode,
      addressCountry: "BR",
    },
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        opens: "08:00",
        closes: "18:00",
      },
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Saturday"],
        opens: "08:00",
        closes: "12:00",
      },
    ],
    hasMap: siteConfig.mapsDirectionsUrl,
    // Sem aggregateRating de propósito: não existe nota/contagem real confirmada
    // publicamente ainda para a Reis (ver checklist no README). Nunca inventar esse número.
  };
}

export function productJsonLd(product: Product, categoryName: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.shortDescription,
    category: categoryName,
    image: product.images.map((img) => `${siteConfig.siteUrl}${img}`),
    sku: product.id,
    offers: {
      "@type": "Offer",
      url: `${siteConfig.siteUrl}/produto/${product.slug}`,
      priceCurrency: "BRL",
      price: product.price.toFixed(2),
      availability: AVAILABILITY_MAP[product.stock],
      itemCondition: "https://schema.org/NewCondition",
      seller: {
        "@type": "HardwareStore",
        name: siteConfig.fullName,
      },
    },
  };
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${siteConfig.siteUrl}${item.url}`,
    })),
  };
}

export function articleJsonLd(post: BlogPost) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt,
    image: `${siteConfig.siteUrl}${post.coverImage}`,
    datePublished: post.publishedAt,
    author: {
      "@type": "Organization",
      name: siteConfig.fullName,
    },
    publisher: {
      "@type": "Organization",
      name: siteConfig.fullName,
      logo: {
        "@type": "ImageObject",
        url: `${siteConfig.siteUrl}/icon.png`,
      },
    },
  };
}
