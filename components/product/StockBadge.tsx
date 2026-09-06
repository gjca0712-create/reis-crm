import type { StockStatus } from "@/lib/types";
import { CheckIcon, CloseIcon } from "@/components/icons";

const STOCK_LABEL: Record<StockStatus, string> = {
  "em-estoque": "Em estoque",
  "sob-encomenda": "Sob encomenda",
  indisponivel: "Indisponível",
};

// Sem cor "semáforo" (verde/vermelho) inventada: a paleta confirmada da Reis não tem esses
// tokens. Em-estoque usa o dourado (já é a cor de destaque/CTA da marca); os demais usam
// tons neutros da própria paleta. Validar com o cliente se preferem um sistema de cores
// diferente — ver checklist no README.
const STOCK_STYLE: Record<StockStatus, string> = {
  "em-estoque": "bg-primary/15 text-primary border border-primary/30",
  "sob-encomenda": "bg-surface-bright text-on-background border border-outline-variant/20",
  indisponivel: "bg-surface-container-lowest text-on-background/50 border border-outline-variant/10",
};

export default function StockBadge({ status }: { status: StockStatus }) {
  const Icon = status === "indisponivel" ? CloseIcon : CheckIcon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${STOCK_STYLE[status]}`}
    >
      <Icon className="h-3 w-3" />
      {STOCK_LABEL[status]}
    </span>
  );
}
