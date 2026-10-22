"use client";

import { useActionState } from "react";
import { saveConsultorSettingsAction, type RegrasFormState } from "@/app/admin/(app)/consultor/actions";
import { Button } from "@/components/ui/Button";
import { SOBRE_EMPRESA_MAX_CARACTERES } from "@/lib/consultor/config";

type Regras = { margemMinima: number; descontoMaximo: number; limiteDiario: number; sobreEmpresa: string };

const campo =
  "w-full rounded-lg border border-border-strong bg-page px-3 py-2 text-sm text-ink-primary placeholder:text-ink-muted focus:border-gold-400/60 focus:outline-none disabled:opacity-60";

// Regras que a IA segue ao sugerir oferta. Só o CEO edita; o Gerente vê.
export function RegrasForm({ regras, podeEditar }: { regras: Regras; podeEditar: boolean }) {
  const [estado, salvar, salvando] = useActionState<RegrasFormState, FormData>(saveConsultorSettingsAction, undefined);

  return (
    <form action={salvar} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-ink-muted">Margem mínima (%)</span>
          <input name="margemMinima" defaultValue={regras.margemMinima} inputMode="decimal" className={campo} disabled={!podeEditar} required />
        </label>
        <label className="block">
          <span className="text-xs text-ink-muted">Desconto máximo (%)</span>
          <input name="descontoMaximo" defaultValue={regras.descontoMaximo} inputMode="decimal" className={campo} disabled={!podeEditar} required />
        </label>
      </div>
      <label className="block">
        <span className="text-xs text-ink-muted">Perguntas por pessoa por dia</span>
        <input name="limiteDiario" type="number" min={1} max={500} defaultValue={regras.limiteDiario} className={campo} disabled={!podeEditar} required />
      </label>
      <label className="block">
        <span className="text-xs text-ink-muted">Sobre a loja (o que a IA deve saber)</span>
        <textarea
          name="sobreEmpresa"
          defaultValue={regras.sobreEmpresa}
          rows={5}
          maxLength={SOBRE_EMPRESA_MAX_CARACTERES}
          placeholder="Ex.: entregamos em Cruz das Almas e cidades vizinhas; carro-chefe é cimento e telha; não vendemos fiado acima de R$ 2.000; foco do mês é limpar o estoque de pisos."
          className={campo}
          disabled={!podeEditar}
        />
      </label>
      {podeEditar ? (
        <div className="flex items-center gap-3">
          <Button type="submit" variant="secondary" disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar regras"}
          </Button>
          {estado?.ok && <span className="text-xs text-status-good">Salvo. Vale a partir da próxima pergunta.</span>}
          {estado?.erro && <span className="text-xs text-status-critical">{estado.erro}</span>}
        </div>
      ) : (
        <p className="text-xs text-ink-muted">Só o CEO muda essas regras.</p>
      )}
    </form>
  );
}
