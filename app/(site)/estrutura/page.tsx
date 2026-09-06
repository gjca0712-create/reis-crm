import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import FadeIn from "@/components/FadeIn";
import { TruckIcon, StockIcon, SupportIcon } from "@/components/icons";

export const metadata: Metadata = {
  title: "Estrutura e Diferenciais",
  description:
    "Frota própria para entrega rápida, amplo estoque com pronta entrega e equipe técnica especializada para orientar engenheiros, arquitetos e construtores.",
};

const items = [
  {
    icon: TruckIcon,
    title: "Entrega Rápida com Frota Própria",
    description:
      "Com frota própria, garantimos agilidade incomparável na logística da sua obra, respeitando cronogramas rigorosos. Nossos veículos atendem Cruz das Almas e toda a região, com rotas planejadas para reduzir o tempo entre o pedido e a chegada do material no canteiro.",
  },
  {
    icon: StockIcon,
    title: "Amplo Estoque",
    description:
      "Garantia de pronta entrega dos materiais mais essenciais. O que você precisa, quando você precisa, sem esperas. Trabalhamos com um mix de produtos que cobre desde a fundação até o acabamento, para que sua obra não pare por falta de material.",
  },
  {
    icon: SupportIcon,
    title: "Atendimento Técnico Especializado",
    description:
      "Equipe técnica qualificada para orientar engenheiros, arquitetos e construtores nas melhores escolhas — da especificação de material à quantidade certa para cada etapa da obra.",
  },
];

export default function EstruturaPage() {
  return (
    <>
      <PageHeader title="Estrutura de Alto Padrão">
        Capacidade logística e de estoque para atender desde pequenas reformas até grandes
        empreendimentos corporativos.
      </PageHeader>

      <div className="mx-auto max-w-4xl space-y-10 px-6 py-14">
        {items.map((item, index) => (
          <FadeIn key={item.title} delay={index * 100}>
            <div className="flex gap-5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-surface-container">
                <item.icon className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="font-display text-xl font-semibold text-on-background">
                  {item.title}
                </h2>
                <p className="mt-2 leading-relaxed text-zinc-100/70">{item.description}</p>
              </div>
            </div>
          </FadeIn>
        ))}
      </div>
    </>
  );
}
