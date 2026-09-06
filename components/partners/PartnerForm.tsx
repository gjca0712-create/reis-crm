import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { PROFISSAO_LABELS } from "@/lib/constants";

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

export function PartnerForm({
  action,
  defaultValues,
  submitLabel = "Salvar indicador",
}: {
  action: (formData: FormData) => void | Promise<void>;
  defaultValues?: { name?: string; phone?: string; profissao?: string; pixKey?: string | null; notes?: string | null };
  submitLabel?: string;
}) {
  const dv = defaultValues ?? {};

  return (
    <form action={action} className="space-y-5">
      <Card className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nome completo" required>
            <input name="name" required defaultValue={dv.name} className={inputClass} placeholder="Nome do indicador" />
          </Field>
          <Field label="WhatsApp / telefone" required>
            <input name="phone" required defaultValue={dv.phone} className={inputClass} placeholder="11987654321" />
          </Field>
          <Field label="Profissão" required>
            <select name="profissao" required defaultValue={dv.profissao ?? ""} className={inputClass}>
              <option value="" disabled>
                Selecione
              </option>
              {Object.entries(PROFISSAO_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Chave Pix (para pagar o cashback)">
            <input name="pixKey" defaultValue={dv.pixKey ?? ""} className={inputClass} placeholder="Telefone, e-mail ou CPF" />
          </Field>
        </div>
        <Field label="Observações">
          <textarea name="notes" defaultValue={dv.notes ?? ""} rows={3} className={inputClass} placeholder="Anotações internas" />
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
