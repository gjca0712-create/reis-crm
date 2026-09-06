"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PROFISSAO_LABELS, DELIVERY_STATUS_LABELS } from "@/lib/constants";
import { dayKey } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";

type CustomerOption = { id: string; name: string; bairro: string; referredById: string | null };
type PartnerOption = { id: string; name: string; profissao: string };
type ItemRow = { productName: string; quantity: number; unitPrice: number };

const inputClass =
  "w-full rounded-lg bg-page border border-border px-3 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-gold-400/50";

const EMPTY_ITEM: ItemRow = { productName: "", quantity: 1, unitPrice: 0 };

export function SaleForm({
  action,
  customers,
  partners,
}: {
  action: (formData: FormData) => void | Promise<void>;
  customers: CustomerOption[];
  partners: PartnerOption[];
}) {
  const [customerId, setCustomerId] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [touchedPartner, setTouchedPartner] = useState(false);
  const [items, setItems] = useState<ItemRow[]>([{ ...EMPTY_ITEM }]);

  const selectedCustomer = useMemo(() => customers.find((c) => c.id === customerId) ?? null, [customerId, customers]);
  const total = items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);

  function updateItem(index: number, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }
  function addItem() {
    setItems((prev) => [...prev, { ...EMPTY_ITEM }]);
  }
  function removeItem(index: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  function handleCustomerChange(id: string) {
    setCustomerId(id);
    if (!touchedPartner) {
      const customer = customers.find((c) => c.id === id);
      setPartnerId(customer?.referredById ?? "");
    }
  }

  // Local calendar day, not toISOString() (UTC) — for a Brazil user (UTC-3) at
  // night, the UTC date can already be tomorrow.
  const today = dayKey(new Date());

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="itemsJson" value={JSON.stringify(items)} />

      <Card className="space-y-4">
        <label className="block">
          <span className="block text-sm text-ink-secondary mb-1.5">
            Cliente <span className="text-status-critical">*</span>
          </span>
          <select
            name="customerId"
            required
            value={customerId}
            onChange={(e) => handleCustomerChange(e.target.value)}
            className={inputClass}
          >
            <option value="" disabled>
              Selecione o cliente
            </option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.bairro}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap gap-4">
          <label className="block">
            <span className="block text-sm text-ink-secondary mb-1.5">Data</span>
            <input name="date" type="date" defaultValue={today} className={`${inputClass} sm:max-w-[200px]`} />
          </label>

          <label className="block">
            <span className="block text-sm text-ink-secondary mb-1.5">Status da entrega</span>
            <select name="deliveryStatus" defaultValue="SEPARACAO" className={`${inputClass} sm:max-w-[220px]`}>
              {Object.entries(DELIVERY_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <span className="block text-sm text-ink-secondary mb-1.5">
            Itens da compra <span className="text-status-critical">*</span>
          </span>
          <div className="overflow-x-auto">
            <div className="min-w-[560px] space-y-2">
              <div className="grid grid-cols-12 gap-2 text-xs text-ink-muted px-1">
                <span className="col-span-5">Produto</span>
                <span className="col-span-2">Qtd.</span>
                <span className="col-span-2">Preço unit.</span>
                <span className="col-span-2 text-right">Subtotal</span>
                <span className="col-span-1" />
              </div>
              {items.map((item, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    value={item.productName}
                    onChange={(e) => updateItem(index, { productName: e.target.value })}
                    placeholder="Ex: Cimento CP II 50kg"
                    className={`${inputClass} col-span-5`}
                  />
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })}
                    className={`${inputClass} col-span-2`}
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(index, { unitPrice: Number(e.target.value) })}
                    placeholder="0,00"
                    className={`${inputClass} col-span-2`}
                  />
                  <span className="col-span-2 text-sm text-ink-primary tabular-nums text-right pr-1">
                    {formatCurrency((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0))}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    disabled={items.length === 1}
                    className="col-span-1 flex justify-center text-ink-muted hover:text-status-critical disabled:opacity-30 disabled:pointer-events-none"
                    title="Remover item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={addItem}
            className="mt-2.5 inline-flex items-center gap-1.5 text-sm text-gold-400 hover:text-gold-300"
          >
            <Plus className="w-3.5 h-3.5" /> Adicionar item
          </button>
        </div>

        <div className="flex justify-end items-center gap-2 pt-3 border-t border-border">
          <span className="text-sm text-ink-secondary">Total da venda</span>
          <span className="text-lg font-semibold text-gold-400 tabular-nums">{formatCurrency(total)}</span>
        </div>

        <label className="block">
          <span className="block text-sm text-ink-secondary mb-1.5">Observações</span>
          <input name="notes" placeholder="Ex: entrega urgente, pagamento em 2x..." className={inputClass} />
        </label>

        <label className="block">
          <span className="block text-sm text-ink-secondary mb-1.5">Indicador (recebe o cashback desta venda)</span>
          <select
            name="partnerId"
            value={partnerId}
            onChange={(e) => {
              setTouchedPartner(true);
              setPartnerId(e.target.value);
            }}
            className={inputClass}
          >
            <option value="">Nenhum (venda direta, sem cashback)</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {PROFISSAO_LABELS[p.profissao] ?? p.profissao}
              </option>
            ))}
          </select>
          {selectedCustomer?.referredById && selectedCustomer.referredById === partnerId && (
            <p className="text-xs text-ink-muted mt-1.5">
              Preenchido automaticamente com quem indicou este cliente. O cashback vai para o indicador, não para o
              cliente.
            </p>
          )}
        </label>
      </Card>

      <div className="flex justify-end gap-3">
        <button
          type="submit"
          className="rounded-lg bg-gold-400 text-page font-semibold px-5 py-2.5 text-sm hover:bg-gold-300 transition-colors"
        >
          Registrar venda
        </button>
      </div>
    </form>
  );
}
