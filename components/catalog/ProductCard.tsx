import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/lib/types";
import { formatBRL } from "@/lib/cart";
import StockBadge from "@/components/product/StockBadge";

export default function ProductCard({ product }: { product: Product }) {
  return (
    <Link
      href={`/produto/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-outline-variant/10 bg-surface-container transition-transform duration-200 hover:-translate-y-1"
    >
      <div className="relative aspect-square overflow-hidden bg-surface-container-lowest">
        <Image
          src={product.images[0]}
          alt={product.name}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <StockBadge status={product.stock} />
        <h3 className="font-display text-base font-semibold leading-snug text-on-background">
          {product.name}
        </h3>
        <p className="line-clamp-2 text-sm text-on-background/60">{product.shortDescription}</p>
        <div className="mt-auto flex items-end justify-between pt-2">
          <div>
            <p className="font-display text-lg font-bold text-primary">
              {formatBRL(product.price)}
            </p>
            <p className="text-xs text-on-background/50">{product.unit}</p>
          </div>
        </div>
      </div>
    </Link>
  );
}
