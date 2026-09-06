import Link from "next/link";
import Hero from "@/components/home/Hero";
import Diferenciais from "@/components/home/Diferenciais";
import CategoriasGrid from "@/components/home/CategoriasGrid";
import HistoriaPreview from "@/components/home/HistoriaPreview";
import MarcasParceiras from "@/components/home/MarcasParceiras";
import BlogPreview from "@/components/home/BlogPreview";
import ProductCard from "@/components/catalog/ProductCard";
import FadeIn from "@/components/FadeIn";
import { ArrowRightIcon } from "@/components/icons";
import { products } from "@/data/products";

const FEATURED_SLUGS = [
  "cimento-cp-ii-32-50kg",
  "porcelanato-acetinado-60x60",
  "lampada-led-bulbo-9w",
  "caixa-dagua-1000l",
  "furadeira-impacto-650w",
  "tinta-latex-premium-branco-neve-18l",
  "vergalhao-ca-50-10mm-12m",
  "disjuntor-bipolar-40a",
];

export default function HomePage() {
  const featured = FEATURED_SLUGS.map((slug) => products.find((p) => p.slug === slug)).filter(
    (p): p is (typeof products)[number] => Boolean(p)
  );

  return (
    <>
      <Hero />
      <CategoriasGrid />

      <section className="border-t border-outline-variant/20 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-6">
          <FadeIn>
            <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
              <div>
                <p className="font-label-bold text-sm font-semibold uppercase tracking-wide text-primary">
                  Vitrine
                </p>
                <h2 className="mt-2 font-display text-3xl font-bold text-on-background sm:text-4xl">
                  Produtos em Destaque
                </h2>
              </div>
              <Link
                href="/catalogo"
                className="inline-flex items-center gap-2 font-label-bold text-sm font-semibold text-primary hover:underline"
              >
                Ver catálogo completo
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </div>
          </FadeIn>

          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {featured.map((product, index) => (
              <FadeIn key={product.id} delay={index * 60}>
                <ProductCard product={product} />
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      <Diferenciais />
      <HistoriaPreview />
      <MarcasParceiras />
      <BlogPreview />
    </>
  );
}
