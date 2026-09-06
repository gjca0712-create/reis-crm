import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import CatalogExplorer from "@/components/catalog/CatalogExplorer";
import { products } from "@/data/products";
import { categories, getCategoryBySlug } from "@/data/categories";

export function generateStaticParams() {
  return categories.map((c) => ({ categoria: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ categoria: string }>;
}): Promise<Metadata> {
  const { categoria } = await params;
  const category = getCategoryBySlug(categoria);
  if (!category) return {};
  return {
    title: category.name,
    description: `${category.description} Confira o catálogo de ${category.name.toLowerCase()} da Reis Materiais de Construção, com entrega em Cruz das Almas e região.`,
  };
}

export default async function CategoriaPage({
  params,
}: {
  params: Promise<{ categoria: string }>;
}) {
  const { categoria } = await params;
  const category = getCategoryBySlug(categoria);
  if (!category) notFound();

  return (
    <>
      <PageHeader title={category.name}>{category.description}</PageHeader>
      <Suspense>
        <CatalogExplorer products={products} initialCategorySlug={category.slug} />
      </Suspense>
    </>
  );
}
