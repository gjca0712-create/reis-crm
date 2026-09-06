import FadeIn from "@/components/FadeIn";
import { TruckIcon, StockIcon, SupportIcon } from "@/components/icons";
import { siteConfig } from "@/lib/site-config";

const items = [
  {
    icon: TruckIcon,
    title: "Entrega Rápida",
    description:
      "Com frota própria, garantimos agilidade incomparável na logística da sua obra, respeitando cronogramas rigorosos.",
  },
  {
    icon: StockIcon,
    title: "Amplo Estoque",
    description:
      "Garantia de pronta entrega dos materiais mais essenciais. O que você precisa, quando você precisa, sem esperas.",
  },
  {
    icon: SupportIcon,
    title: "Atendimento Especial",
    description:
      "Equipe técnica qualificada para orientar engenheiros, arquitetos e construtores nas melhores escolhas.",
  },
];

export default function Diferenciais() {
  return (
    <section className="border-y border-outline-variant/20 bg-surface-container-lowest py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-6">
        <FadeIn>
          <p className="text-center font-label-bold text-sm font-semibold uppercase tracking-wide text-primary">
            A força da nossa operação
          </p>
          <h2 className="mt-2 text-center font-display text-3xl font-bold text-on-background sm:text-4xl">
            Estrutura de Alto Padrão
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-zinc-100/70">
            Capacidade logística e de estoque para atender desde pequenas reformas até grandes
            empreendimentos corporativos.
          </p>
        </FadeIn>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {items.map((item, index) => (
            <FadeIn key={item.title} delay={index * 100}>
              <div className="flex h-full flex-col items-center rounded-2xl bg-surface-container p-6 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-bright">
                  <item.icon className="h-7 w-7 text-primary" />
                </div>
                <h3 className="mt-5 font-display text-lg font-semibold text-on-background">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm text-zinc-100/70">{item.description}</p>
              </div>
            </FadeIn>
          ))}
        </div>

        <FadeIn delay={300}>
          <div className="mt-12 grid grid-cols-2 gap-4 sm:mx-auto sm:max-w-md">
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
      </div>
    </section>
  );
}
