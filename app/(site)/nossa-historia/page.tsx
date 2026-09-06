import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import FadeIn from "@/components/FadeIn";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Nossa História",
  description:
    "Fundada em 1996 pela família Reis, a Reis Materiais de Construção é hoje um dos maiores centros de distribuição de materiais de construção de Cruz das Almas - BA.",
};

export default function NossaHistoriaPage() {
  return (
    <>
      <PageHeader title="Nossa História">Tradição que edifica.</PageHeader>

      <div className="mx-auto max-w-3xl px-6 py-14">
        <FadeIn>
          <p className="text-lg leading-relaxed text-zinc-100/80">
            Fundada em {siteConfig.foundedYear} pela família Reis, nossa história é construída
            sobre o alicerce mais sólido: a confiança. Em Cruz das Almas, evoluímos de uma
            pequena loja para um dos maiores centros de distribuição da região, mantendo sempre o
            compromisso com a qualidade e o atendimento próximo.
          </p>
          <p className="mt-6 text-lg leading-relaxed text-zinc-100/80">
            Nossa trajetória é marcada pela busca incessante por oferecer não apenas materiais,
            mas soluções completas para quem constrói e reforma. Crescemos acompanhando o
            desenvolvimento da nossa cidade, sempre investindo em estrutura e pessoas para
            garantir que a sua obra nunca pare.
          </p>
        </FadeIn>

        <FadeIn delay={100}>
          <div className="mt-12 grid grid-cols-2 gap-4 sm:max-w-md">
            <div className="flex flex-col items-center rounded-xl border border-outline-variant/20 py-6">
              <p className="font-display text-3xl font-bold text-primary">
                +{siteConfig.yearsOfTradition}
              </p>
              <p className="mt-1 text-sm text-zinc-100/70">Anos de Mercado</p>
            </div>
            <div className="flex flex-col items-center rounded-xl border border-outline-variant/20 py-6">
              <p className="font-display text-3xl font-bold text-primary">Milhares</p>
              <p className="mt-1 text-sm text-zinc-100/70">Obras Entregues</p>
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={200}>
          <p className="mt-12 text-lg leading-relaxed text-zinc-100/80">
            Hoje, a Reis Materiais de Construção segue como um negócio da família Reis: a mesma
            equipe que atendia os primeiros clientes em {siteConfig.foundedYear} agora também
            atende pelo site, mas sem abrir mão da conversa direta e do suporte técnico que sempre
            foram a marca da casa.
          </p>
        </FadeIn>
      </div>
    </>
  );
}
