import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import FadeIn from "@/components/FadeIn";
import WhatsAppButton from "@/components/WhatsAppButton";

export const metadata: Metadata = {
  title: "Trabalhe Conosco",
  description: "Faça parte da equipe da Reis Materiais de Construção em Cruz das Almas - BA.",
};

export default function TrabalheConoscoPage() {
  return (
    <>
      <PageHeader title="Trabalhe Conosco">
        Faça parte de uma equipe com tradição de mais de duas décadas em Cruz das Almas.
      </PageHeader>

      <div className="mx-auto max-w-2xl px-6 py-14 text-center">
        <FadeIn>
          <p className="text-lg leading-relaxed text-zinc-100/80">
            Ainda não temos vagas abertas publicadas no site, mas estamos sempre de olho em quem
            tem interesse em fazer parte da família Reis. Envie seu contato e currículo pelo
            WhatsApp — quando surgir uma oportunidade compatível, nossa equipe entra em contato.
          </p>
        </FadeIn>
        <FadeIn delay={100}>
          <div className="mt-8 flex justify-center">
            <WhatsAppButton
              trackLabel="trabalhe-conosco"
              label="Enviar Currículo pelo WhatsApp"
              message="Olá! Gostaria de enviar meu currículo para trabalhar na Reis Materiais de Construção."
            />
          </div>
        </FadeIn>
      </div>
    </>
  );
}
