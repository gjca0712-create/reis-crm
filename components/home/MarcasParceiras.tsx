import FadeIn from "@/components/FadeIn";
import { brands } from "@/data/brands";

// Marcas exibidas como wordmark tipográfico — sem logo real disponível localmente ainda
// (ver checklist no README). Evita usar uma imagem de logo de terceiro sem autorização.
export default function MarcasParceiras() {
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-6 text-center">
        <FadeIn>
          <p className="font-label-bold text-sm font-semibold uppercase tracking-wide text-primary">
            Marcas Premium
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold text-on-background sm:text-4xl">
            As marcas mais vendidas
          </h2>
        </FadeIn>
        <FadeIn delay={100}>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
            {brands.map((brand) => (
              <span
                key={brand.slug}
                className="font-display text-2xl font-bold tracking-wide text-zinc-100/50 transition-colors hover:text-primary sm:text-3xl"
              >
                {brand.name.toUpperCase()}
              </span>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
