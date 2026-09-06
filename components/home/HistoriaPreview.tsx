import Link from "next/link";
import FadeIn from "@/components/FadeIn";
import { ArrowRightIcon } from "@/components/icons";
import { siteConfig } from "@/lib/site-config";

export default function HistoriaPreview() {
  return (
    <section className="border-y border-outline-variant/20 bg-surface-container-lowest py-16 sm:py-20">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 lg:grid-cols-2 lg:items-center">
        <FadeIn from="left">
          <div className="flex h-48 w-48 items-center justify-center rounded-full border-2 border-primary/30 bg-surface-container sm:h-56 sm:w-56">
            <div className="text-center">
              <p className="font-label-bold text-xs font-semibold uppercase tracking-widest text-primary">
                Fundação
              </p>
              <p className="mt-1 font-display text-5xl font-bold text-on-background">
                {siteConfig.foundedYear}
              </p>
            </div>
          </div>
        </FadeIn>
        <FadeIn from="right">
          <div>
            <p className="font-label-bold text-sm font-semibold uppercase tracking-wide text-primary">
              Tradição que edifica.
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold text-on-background sm:text-4xl">
              Fundada em {siteConfig.foundedYear} pela família Reis
            </h2>
            <p className="mt-4 text-zinc-100/70">
              Nossa história é construída sobre o alicerce mais sólido: a confiança. Em Cruz das
              Almas, evoluímos de uma pequena loja para um dos maiores centros de distribuição da
              região, mantendo sempre o compromisso com a qualidade e o atendimento próximo.
            </p>
            <Link
              href="/nossa-historia"
              className="mt-6 inline-flex items-center gap-2 font-label-bold text-sm font-semibold text-primary hover:underline"
            >
              Conheça nossa história completa
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
