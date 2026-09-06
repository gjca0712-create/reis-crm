import { NextResponse } from "next/server";
import { siteConfig } from "@/lib/site-config";
import { categories } from "@/data/categories";

export const dynamic = "force-static";

// Resumo em texto simples do negócio, no formato llms.txt (llmstxt.org), para que
// ferramentas de IA generativa consigam ler e citar os fatos da Reis sem interpretar HTML.
export function GET() {
  const categoryList = categories.map((c) => `- ${c.name}: ${c.description}`).join("\n");

  const body = `# ${siteConfig.fullName}

> ${siteConfig.slogan} Loja de materiais de construção com ${siteConfig.yearsOfTradition} anos de tradição em ${siteConfig.address.city} - ${siteConfig.address.state}, Brasil.

## Sobre
- Fundada em ${siteConfig.foundedYear} pela família Reis.
- Amplo estoque com pronta entrega e frota própria para logística ágil.
- Equipe técnica para orientar engenheiros, arquitetos, construtores e reformas residenciais.

## Categorias de produtos
${categoryList}

## Informações práticas
- Endereço: ${siteConfig.address.full}
- Funcionamento: ${siteConfig.hours.weekdays}; ${siteConfig.hours.saturday}
- Telefone: ${siteConfig.phone.display}
- WhatsApp: ${siteConfig.whatsapp.display}
- Rota no Google Maps: ${siteConfig.mapsDirectionsUrl}

## Site
- Home: ${siteConfig.siteUrl}
- Catálogo: ${siteConfig.siteUrl}/catalogo
- Sitemap: ${siteConfig.siteUrl}/sitemap.xml
`;

  return new NextResponse(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
