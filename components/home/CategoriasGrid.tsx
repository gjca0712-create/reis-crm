import Link from "next/link";
import FadeIn from "@/components/FadeIn";
import { categories } from "@/data/categories";
import { CATEGORY_ICONS } from "@/components/icons";

export default function CategoriasGrid() {
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-6">
        <FadeIn>
          <h2 className="text-center font-display text-3xl font-bold text-on-background sm:text-4xl">
            Compre por Categoria
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-zinc-100/70">
            Navegue pelo catálogo completo, com filtro por marca, preço e disponibilidade em
            estoque.
          </p>
        </FadeIn>

        <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {categories.map((category, index) => {
            const Icon = CATEGORY_ICONS[category.icon];
            return (
              <FadeIn key={category.slug} delay={index * 60}>
                <Link
                  href={`/catalogo/${category.slug}`}
                  className="group flex h-full flex-col items-center gap-3 rounded-2xl border border-outline-variant/10 bg-surface-container p-6 text-center transition-colors hover:border-primary/40"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-bright transition-colors group-hover:bg-primary/15">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <span className="font-label-bold text-sm font-semibold text-on-background">
                    {category.name}
                  </span>
                </Link>
              </FadeIn>
            );
          })}
        </div>
      </div>
    </section>
  );
}
