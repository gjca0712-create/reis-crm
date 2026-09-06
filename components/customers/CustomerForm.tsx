import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { PROFISSAO_LABELS, BAIRROS_PADRAO, FASE_OBRA_LABELS } from "@/lib/constants";
import { dayKey } from "@/lib/dates";

type PartnerOption = { id: string; name: string; profissao: string };

function toDateInputValue(date?: Date | string | null) {
  if (!date) return "";
  return dayKey(new Date(date));
}

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

export function CustomerForm({
  action,
  partners,
  defaultValues,
  submitLabel = "Salvar cliente",
}: {
  action: (formData: FormData) => void | Promise<void>;
  partners: PartnerOption[];
  defaultValues?: {
    name?: string;
    phone?: string;
    email?: string | null;
    document?: string | null;
    address?: string | null;
    bairro?: string;
    city?: string;
    notes?: string | null;
    referredById?: string | null;
    birthday?: Date | string | null;
    faseObra?: string | null;
  };
  submitLabel?: string;
}) {
  const dv = defaultValues ?? {};

  return (
    <form action={action} className="space-y-5">
      <Card className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nome completo" required>
            <input name="name" required defaultValue={dv.name} className={inputClass} placeholder="Nome do cliente" />
          </Field>
          <Field label="WhatsApp / telefone" required>
            <input name="phone" required defaultValue={dv.phone} className={inputClass} placeholder="11987654321" />
          </Field>
          <Field label="E-mail">
            <input name="email" type="email" defaultValue={dv.email ?? ""} className={inputClass} placeholder="cliente@email.com" />
          </Field>
          <Field label="CPF/CNPJ">
            <input name="document" defaultValue={dv.document ?? ""} className={inputClass} placeholder="000.000.000-00" />
          </Field>
          <Field label="Bairro" required>
            <input
              name="bairro"
              required
              defaultValue={dv.bairro}
              list="bairros-sugeridos"
              className={inputClass}
              placeholder="Ex: Setor Bueno"
            />
            <datalist id="bairros-sugeridos">
              {BAIRROS_PADRAO.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </Field>
          <Field label="Cidade">
            <input name="city" defaultValue={dv.city ?? ""} className={inputClass} placeholder="Cruz das Almas" />
          </Field>
          <Field label="Aniversário">
            <input name="birthday" type="date" defaultValue={toDateInputValue(dv.birthday)} className={inputClass} />
          </Field>
          <Field label="Fase da obra">
            <select name="faseObra" defaultValue={dv.faseObra ?? ""} className={inputClass}>
              <option value="">Não informado</option>
              {Object.entries(FASE_OBRA_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Endereço">
          <input name="address" defaultValue={dv.address ?? ""} className={inputClass} placeholder="Rua, número" />
        </Field>

        <Field label="Indicado por (opcional)">
          <select name="referredById" defaultValue={dv.referredById ?? ""} className={inputClass}>
            <option value="">Nenhum indicador (cliente direto)</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {PROFISSAO_LABELS[p.profissao] ?? p.profissao}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Observações">
          <textarea name="notes" defaultValue={dv.notes ?? ""} rows={3} className={inputClass} placeholder="Anotações internas sobre o cliente" />
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
