import Link from "next/link";
import FadeIn from "@/components/FadeIn";
import WhatsAppButton from "@/components/WhatsAppButton";
import { ArrowRightIcon } from "@/components/icons";

export default function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-outline-variant/20 bg-background py-20 sm:py-28">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 h-[120%] w-[120%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-3xl"
      />
      <div className="relative mx-auto max-w-5xl px-6 text-center">
        <FadeIn>
          <span className="inline-block rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 font-label-bold text-xs font-semibold uppercase tracking-wide text-primary">
            Desde 1996 em Cruz das Almas
          </span>
        </FadeIn>
        <FadeIn delay={80}>
          <h1 className="mt-6 text-balance font-display text-4xl font-bold leading-tight tracking-tight text-on-background sm:text-6xl">
            O Maior Estoque de Materiais de Construção em Cruz das Almas e Região
          </h1>
        </FadeIn>
        <FadeIn delay={160}>
          <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-zinc-100/80">
            Padrão premium de atendimento com preços justos e acessíveis. A força, agilidade e
            estrutura que sua obra precisa.
          </p>
        </FadeIn>
        <FadeIn delay={240}>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/catalogo"
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-primary-container px-8 py-3.5 font-label-bold text-base font-semibold text-on-primary-container transition-transform hover:scale-[1.02] sm:w-auto"
            >
              Ver Catálogo
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
            <Link
              href="/orcamento"
              className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full border-2 border-on-background/20 px-8 py-3.5 font-label-bold text-base font-semibold text-on-background transition-colors hover:border-primary hover:text-primary sm:w-auto"
            >
              Solicitar Orçamento
            </Link>
          </div>
        </FadeIn>
        <FadeIn delay={320}>
          <div className="mt-4">
            <WhatsAppButton
              trackLabel="hero"
              label="Falar com um Especialista"
              variant="dark"
              className="text-sm"
            />
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
