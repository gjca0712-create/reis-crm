import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { OCCURRENCE_TYPE_LABELS } from "@/lib/constants";
import { formatDate, formatCurrency } from "@/lib/format";

const inputClass =
  "w-full rounded-lg bg-page border border-border px-3 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-gold-400/50";

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm text-ink-secondary mb-1.5">
        {label} {required && <span className="text-status-critical">*</span>}
      </span>
      {children}
    </label>
  );
}

type CustomerOption = { id: string; name: string };
type SaleOption = { id: string; date: Date; total: number; customer: { name: string } };

export function OccurrenceForm({
  action,
  customers,
  sales,
  defaultCustomerId,
  submitLabel = "Registrar ocorrência",
}: {
  action: (formData: FormData) => void | Promise<void>;
  customers: CustomerOption[];
  sales: SaleOption[];
  defaultCustomerId?: string;
  submitLabel?: string;
}) {
  return (
    <form action={action} className="space-y-5">
      <Card className="space-y-4">
        <Field label="Tipo de ocorrência" required>
          <select name="type" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              Selecione
            </option>
            {Object.entries(OCCURRENCE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Cliente">
            <select name="customerId" defaultValue={defaultCustomerId ?? ""} className={inputClass}>
              <option value="">Nenhum</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Venda relacionada">
            <select name="saleId" defaultValue="" className={inputClass}>
              <option value="">Nenhuma</option>
              {sales.map((s) => (
                <option key={s.id} value={s.id}>
                  {formatDate(s.date)} · {s.customer.name} · {formatCurrency(s.total)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Descrição">
          <textarea name="description" rows={3} className={inputClass} placeholder="Detalhes do que aconteceu" />
        </Field>
      </Card>

      <div className="flex justify-end gap-3">
        <button type="submit" className="rounded-lg bg-gold-400 text-page font-semibold px-5 py-2.5 text-sm hover:bg-gold-300 transition-colors">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
