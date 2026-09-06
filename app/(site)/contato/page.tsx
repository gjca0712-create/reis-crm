import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import FadeIn from "@/components/FadeIn";
import ContatoForm from "@/components/ContatoForm";
import { siteConfig } from "@/lib/site-config";
import { MapPinIcon, PhoneIcon, WhatsAppIcon, ClockIcon } from "@/components/icons";

export const metadata: Metadata = {
  title: "Contato",
  description:
    "Fale com a Reis Materiais de Construção: endereço, telefone, WhatsApp, horário de funcionamento e formulário de contato.",
};

export default function ContatoPage() {
  return (
    <>
      <PageHeader title="Fale Conosco">
        Estamos em Cruz das Almas - BA, prontos para atender sua obra ou reforma.
      </PageHeader>

      <div className="mx-auto grid max-w-5xl gap-10 px-6 py-14 lg:grid-cols-2">
        <FadeIn from="left">
          <div className="space-y-6">
            <div className="flex items-start gap-3">
              <MapPinIcon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="font-semibold text-on-background">Endereço</p>
                <p className="text-zinc-100/70">{siteConfig.address.full}</p>
                <p className="text-zinc-100/70">CEP {siteConfig.address.postalCode}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <PhoneIcon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="font-semibold text-on-background">Telefone</p>
                <p className="text-zinc-100/70">{siteConfig.phone.display}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <WhatsAppIcon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="font-semibold text-on-background">WhatsApp</p>
                <p className="text-zinc-100/70">{siteConfig.whatsapp.display}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <ClockIcon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="font-semibold text-on-background">Horário</p>
                <p className="text-zinc-100/70">{siteConfig.hours.weekdays}</p>
                <p className="text-zinc-100/70">{siteConfig.hours.saturday}</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-outline-variant/20">
              <iframe
                title="Mapa - Reis Materiais de Construção"
                src={siteConfig.mapsEmbedSrc}
                width="100%"
                height="260"
                loading="lazy"
                className="grayscale-[20%]"
              />
            </div>
          </div>
        </FadeIn>

        <FadeIn from="right">
          <div className="rounded-2xl bg-surface-container p-6">
            <h2 className="font-display text-lg font-semibold text-on-background">
              Envie uma mensagem
            </h2>
            <p className="mt-1 text-sm text-zinc-100/60">
              Sua mensagem abre uma conversa no WhatsApp já com os dados preenchidos.
            </p>
            <div className="mt-5">
              <ContatoForm />
            </div>
          </div>
        </FadeIn>
      </div>
    </>
  );
}
