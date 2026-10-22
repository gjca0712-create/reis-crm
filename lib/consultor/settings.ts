import { prisma } from "@/lib/prisma";

export type ConsultorRegras = {
  margemMinima: number;
  descontoMaximo: number;
  limiteDiario: number;
  sobreEmpresa: string;
  updatedAt: Date | null;
  updatedBy: string | null;
};

// Valores de partida enquanto o CEO não salvou nada na tela (mesmos defaults do
// schema). Margem de 15% sobre o preço de venda é um piso conservador pra
// oferta em material de construção; o CEO ajusta pro número real da Reis.
export const REGRAS_PADRAO: ConsultorRegras = {
  margemMinima: 15,
  descontoMaximo: 10,
  limiteDiario: 30,
  sobreEmpresa: "",
  updatedAt: null,
  updatedBy: null,
};

export async function getConsultorRegras(): Promise<ConsultorRegras> {
  const row = await prisma.consultorSettings.findUnique({ where: { id: "consultor" } });
  if (!row) return REGRAS_PADRAO;
  return {
    margemMinima: Number(row.margemMinima),
    descontoMaximo: Number(row.descontoMaximo),
    limiteDiario: row.limiteDiario,
    sobreEmpresa: row.sobreEmpresa,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  };
}
