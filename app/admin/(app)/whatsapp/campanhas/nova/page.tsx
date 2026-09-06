import { Card } from "@/components/ui/Card";
import { requireFeature } from "@/lib/session";
import { createCampaign } from "../actions";

const SEGMENTS = [
  { value: "todos", label: "Todos os clientes" },
  { value: "recencia-30", label: "Compraram nos últimos 30 dias" },
  { value: "recencia-60", label: "Compraram nos últimos 60 dias" },
  { value: "recencia-90", label: "Compraram nos últimos 90 dias" },
  { value: "inativos", label: "Inativos (90+ dias sem comprar)" },
  { value: "sem-compra", label: "Nunca compraram (leads)" },
];

const inputClass =
  "w-full rounded-lg bg-page border border-border px-3 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-gold-400/50";

export default async function NovaCampanhaPage() {
  await requireFeature("whatsapp_campanhas");

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Nova campanha</h1>
        <p className="text-sm text-ink-muted mt-0.5">Disparo em massa via API oficial do WhatsApp</p>
      </div>

      <form action={createCampaign} className="space-y-5">
        <Card className="space-y-4">
          <label className="block">
            <span className="block text-sm text-ink-secondary mb-1.5">
              Nome da campanha <span className="text-status-critical">*</span>
            </span>
            <input name="name" required placeholder="Ex: Reativação 90 dias" className={inputClass} />
          </label>

          <label className="block">
            <span className="block text-sm text-ink-secondary mb-1.5">
              Público-alvo <span className="text-status-critical">*</span>
            </span>
            <select name="segmentType" defaultValue="todos" className={inputClass}>
              {SEGMENTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block text-sm text-ink-secondary mb-1.5">
              Mensagem <span className="text-status-critical">*</span>
            </span>
            <textarea
              name="message"
              required
              rows={4}
              placeholder="Ex: Olá! Sentimos sua falta na Reis Materiais. Volte essa semana e ganhe 10% de desconto."
              className={inputClass}
            />
            <p className="text-xs text-ink-muted mt-1.5">
              No envio real, mensagens de disparo precisam seguir um template pré-aprovado pela Meta.
            </p>
          </label>
        </Card>

        <div className="flex justify-end gap-3">
          <button
            type="submit"
            className="rounded-lg bg-gold-400 text-page font-semibold px-5 py-2.5 text-sm hover:bg-gold-300 transition-colors"
          >
            Salvar campanha
          </button>
        </div>
      </form>
    </div>
  );
}
