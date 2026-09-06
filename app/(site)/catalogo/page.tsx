import type { Metadata } from "next";
import { Suspense } from "react";
import PageHeader from "@/components/PageHeader";
import CatalogExplorer from "@/components/catalog/CatalogExplorer";
import { products } from "@/data/products";

export const metadata: Metadata = {
  title: "Catálogo",
  description:
    "Catálogo completo de materiais de construção da Reis: básico, acabamento, elétrica, hidráulica, ferramentas, fundação e tintas. Filtre por marca, preço e estoque.",
};

export default function CatalogoPage() {
  return (
    <>
      <PageHeader title="Catálogo Completo">
        Filtre por categoria, marca, preço e disponibilidade em estoque.
      </PageHeader>
      <Suspense>
        <CatalogExplorer products={products} />
      </Suspense>
    </>
  );
}
