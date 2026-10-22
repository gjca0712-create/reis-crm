import { STORE_TIMEZONE, storeDateStart, storeDayKey, storeDayStart } from "@/lib/erp/period";

// Períodos das ferramentas do Consultor: a IA manda "AAAA-MM-DD" (dias inteiros,
// no fuso da loja, fim incluído) e aqui vira o intervalo [inicio, fim) em UTC
// que as consultas usam. Erro de data volta como mensagem pra IA corrigir.

const DIA_MS = 86_400_000;
const MAX_DIAS = 400;

export class ErroDeEntrada extends Error {}

export type Periodo = {
  inicio: Date;
  fim: Date; // exclusivo: meia-noite do dia seguinte ao último dia
  dias: number;
  rotulo: string; // "01/10/2026 a 21/10/2026"
};

const dataBr = new Intl.DateTimeFormat("pt-BR", { timeZone: STORE_TIMEZONE, day: "2-digit", month: "2-digit", year: "numeric" });

export function dataLoja(date: Date | string | null | undefined): string | null {
  return date ? dataBr.format(new Date(date)) : null;
}

export function hojeNaLoja(): string {
  return storeDayKey(new Date());
}

export function resolverPeriodo(inicio: string | undefined, fim: string | undefined, padraoDias = 30): Periodo {
  const fimStr = fim ?? hojeNaLoja();
  const fimDia = storeDateStart(fimStr);
  if (!fimDia) throw new ErroDeEntrada(`Data final inválida: "${fimStr}". Use AAAA-MM-DD.`);

  const inicioDia = inicio ? storeDateStart(inicio) : new Date(fimDia.getTime() - (padraoDias - 1) * DIA_MS);
  if (!inicioDia) throw new ErroDeEntrada(`Data inicial inválida: "${inicio}". Use AAAA-MM-DD.`);
  if (inicioDia > fimDia) throw new ErroDeEntrada("A data inicial é depois da final.");

  const fimExclusivo = new Date(fimDia.getTime() + DIA_MS);
  const dias = Math.round((fimExclusivo.getTime() - inicioDia.getTime()) / DIA_MS);
  if (dias > MAX_DIAS) throw new ErroDeEntrada(`Período de ${dias} dias: o máximo é ${MAX_DIAS}. Divida em partes.`);

  return { inicio: inicioDia, fim: fimExclusivo, dias, rotulo: `${dataLoja(inicioDia)} a ${dataLoja(fimDia)}` };
}

// Mesmo tamanho, logo antes. Se o período vai até hoje, o anterior é cortado no
// mesmo ponto (hoje ainda está pela metade — comparar com dias fechados daria
// queda falsa), igual a resolvePeriod de lib/erp/period.ts.
export function periodoAnterior(p: Periodo): Periodo {
  const duracao = p.fim.getTime() - p.inicio.getTime();
  const decorrido = Math.min(p.fim.getTime(), Date.now()) - p.inicio.getTime();
  const inicio = new Date(p.inicio.getTime() - duracao);
  const fim = new Date(inicio.getTime() + Math.max(decorrido, 0));
  return { inicio, fim, dias: p.dias, rotulo: `${dataLoja(inicio)} a ${dataLoja(new Date(p.inicio.getTime() - DIA_MS))}` };
}

// Início de hoje e o primeiro dia do mês, no fuso da loja.
export function inicioDeHoje(): Date {
  return storeDayStart(0);
}

export function inicioDoMes(): Date {
  const [y, m] = hojeNaLoja().split("-");
  return storeDateStart(`${y}-${m}-01`)!;
}
