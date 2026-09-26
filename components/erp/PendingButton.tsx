"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

// Botão de formulário que mostra que está trabalhando — gerar a demonstração
// leva alguns segundos, e sem isso parece que o clique não pegou.
export function PendingButton({
  children,
  pendingText,
  className,
}: {
  children: ReactNode;
  pendingText: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${className ?? ""} disabled:opacity-60 disabled:cursor-wait`}>
      {pending ? pendingText : children}
    </button>
  );
}
