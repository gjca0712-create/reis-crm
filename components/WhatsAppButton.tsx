"use client";

import { whatsappUrl, DEFAULT_MESSAGE } from "@/lib/whatsapp";
import { trackWhatsAppClick } from "@/lib/analytics";
import { WhatsAppIcon } from "@/components/icons";

type Variant = "primary" | "outline" | "dark";

const styles: Record<Variant, string> = {
  // Verde WhatsApp: máxima affordance de "isso abre uma conversa".
  primary: "bg-[#25D366] text-white hover:bg-[#1EBE5A] shadow-lg shadow-[#25D366]/25",
  outline:
    "border-2 border-on-background/30 text-on-background hover:border-primary hover:text-primary",
  dark: "bg-surface-container text-on-background hover:bg-surface-bright",
};

export default function WhatsAppButton({
  message = DEFAULT_MESSAGE,
  label = "Falar no WhatsApp",
  trackLabel,
  variant = "primary",
  showIcon = true,
  className = "",
}: {
  message?: string;
  label?: string;
  trackLabel: string;
  variant?: Variant;
  showIcon?: boolean;
  className?: string;
}) {
  return (
    <a
      href={whatsappUrl(message)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackWhatsAppClick(trackLabel)}
      className={`inline-flex min-h-[48px] cursor-pointer items-center justify-center gap-2.5 rounded-full px-7 py-3.5 text-base font-semibold transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${styles[variant]} ${className}`}
    >
      {showIcon && <WhatsAppIcon className="h-5 w-5 shrink-0" />}
      {label}
    </a>
  );
}
