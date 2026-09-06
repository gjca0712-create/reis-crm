import ProductCard from "@/components/catalog/ProductCard";
import type { Product } from "@/lib/types";

export default function RelatedProducts({ products }: { products: Product[] }) {
  if (products.length === 0) return null;
  return (
    <section className="mt-16">
      <h2 className="font-display text-2xl font-bold text-on-background">
        Produtos Relacionados
      </h2>
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
