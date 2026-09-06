import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { products, getProductBySlug } from "@/data/products";
import { getCategoryBySlug } from "@/data/categories";
import { getBrandBySlug } from "@/data/brands";
import { getRelatedProducts } from "@/lib/catalog";
import { formatBRL } from "@/lib/cart";
import ProductGallery from "@/components/product/ProductGallery";
import ProductSpecsTable from "@/components/product/ProductSpecsTable";
import RelatedProducts from "@/components/product/RelatedProducts";
import StockBadge from "@/components/product/StockBadge";
import AddToCartBar from "@/components/product/AddToCartBar";
import JsonLd from "@/components/JsonLd";
import { productJsonLd, breadcrumbJsonLd } from "@/lib/schema";

export function generateStaticParams() {
  return products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) return {};
  return {
    title: product.name,
    description: product.shortDescription,
    openGraph: { title: product.name, description: product.shortDescription },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) notFound();

  const category = getCategoryBySlug(product.categorySlug);
  const brand = product.brandSlug ? getBrandBySlug(product.brandSlug) : undefined;
  const related = getRelatedProducts(product, products);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <JsonLd data={productJsonLd(product, category?.name ?? "")} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Início", url: "/" },
          { name: "Catálogo", url: "/catalogo" },
          ...(category ? [{ name: category.name, url: `/catalogo/${category.slug}` }] : []),
          { name: product.name, url: `/produto/${product.slug}` },
        ])}
      />

      <nav className="mb-6 flex flex-wrap items-center gap-1 text-sm text-on-background/50">
        <Link href="/catalogo" className="hover:text-primary">
          Catálogo
        </Link>
        {category && (
          <>
            <span>/</span>
            <Link href={`/catalogo/${category.slug}`} className="hover:text-primary">
              {category.name}
            </Link>
          </>
        )}
        <span>/</span>
        <span className="text-on-background">{product.name}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-2">
        <ProductGallery images={product.images} alt={product.name} />

        <div>
          <div className="flex items-center gap-3">
            <StockBadge status={product.stock} />
            {brand && <span className="text-sm text-on-background/50">{brand.name}</span>}
          </div>
          <h1 className="mt-3 font-display text-3xl font-bold text-on-background">
            {product.name}
          </h1>
          <p className="mt-2 text-on-background/70">{product.shortDescription}</p>

          <div className="mt-6 flex items-baseline gap-2">
            <span className="font-display text-4xl font-bold text-primary">
              {formatBRL(product.price)}
            </span>
            <span className="text-on-background/50">/ {product.unit}</span>
          </div>

          <div className="mt-8">
            <AddToCartBar product={product} />
          </div>

          <div className="mt-10">
            <h2 className="font-display text-lg font-semibold text-on-background">
              Ficha Técnica
            </h2>
            <div className="mt-3">
              <ProductSpecsTable specs={product.specs} />
            </div>
          </div>
        </div>
      </div>

      <RelatedProducts products={related} />
    </div>
  );
}
