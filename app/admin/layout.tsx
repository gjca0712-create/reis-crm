import type { Metadata } from "next";
import type { ReactNode } from "react";

// Tema do CRM (fundo escuro + texto claro) — antes era `body { bg-page
// text-ink-primary }` no layout raiz de quando o CRM era um app Next.js à
// parte; agora que divide o <body> com o site institucional, cada zona
// aplica seu próprio tema numa div em vez do body. app/admin/(app)/layout.tsx
// aninha mais um nível pra acrescentar Sidebar/Topbar só nas páginas internas
// (login fica de fora do sidebar, mas dentro desse tema escuro).
export const metadata: Metadata = {
  title: {
    default: "Reis Materiais | CRM",
    template: "%s | CRM Reis Materiais",
  },
  description: "CRM interno da Reis Materiais de Construção",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen font-sans bg-page text-ink-primary">{children}</div>;
}
