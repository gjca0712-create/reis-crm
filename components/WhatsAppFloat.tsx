"use client";

import { whatsappUrl } from "@/lib/whatsapp";
import { trackWhatsAppClick } from "@/lib/analytics";
import { WhatsAppIcon } from "@/components/icons";

// Botão flutuante fixo — canal de suporte complementar, presente em todo o scroll.
// O caminho principal de conversão é o carrinho/orçamento; este botão continua existindo
// para quem prefere falar direto, igual ao comportamento do site atual.
export default function WhatsAppFloat() {
  return (
    <a
      href={whatsappUrl()}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackWhatsAppClick("float")}
      aria-label="Falar com a Reis Materiais no WhatsApp"
      className="fixed bottom-5 right-5 z-50 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-[#25D366] text-white shadow-xl shadow-[#25D366]/30 transition-transform duration-200 hover:bg-[#1EBE5A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:hover:scale-105"
    >
      <WhatsAppIcon className="h-7 w-7" />
      <span
        aria-hidden="true"
        className="absolute inset-0 -z-10 rounded-full bg-[#25D366] motion-safe:animate-ping motion-safe:[animation-duration:2.5s] opacity-20"
      />
    </a>
  );
}
