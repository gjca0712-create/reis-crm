import { prisma } from "@/lib/prisma";
import { storeDayStart } from "./period";
import { lockErpMirror, type ErpTx } from "./lock";

// Dados de DEMONSTRAÇÃO pras telas Financeiro/Produtos, antes da ligação com o
// ERP da loja existir — pra Reis ver as telas funcionando. Tudo gravado com
// `demo = true`, só nas tabelas Erp* (nunca em Sale/Customer: não gera ponto,
// cashback, nem aparece em cliente/campanha). Clientes, vendedores e
// fornecedores são FICTÍCIOS; telefone fica vazio de propósito (um número
// inventado poderia ser de alguém de verdade).
//
// Gerador determinístico (mesma semente = mesmos dados), sempre terminando no
// dia de hoje: ~25 meses de histórico, pra comparação "12 meses vs ano anterior"
// também ter base.

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

type CatalogItem = {
  descricao: string;
  grupo: string;
  marca: string | null;
  unidade: string;
  preco: number; // preço de venda de hoje
  margem: number; // fração do preço que é lucro (custo = preço × (1 - margem))
  pop: number; // peso de popularidade
  qMin: number;
  qMax: number;
  semCusto?: boolean; // comprado de fornecedor informal, sem custo no ERP
  parado?: boolean; // parou de vender há meses (vai pra "produtos parados")
};

const C = (
  descricao: string,
  grupo: string,
  marca: string | null,
  unidade: string,
  preco: number,
  margem: number,
  pop: number,
  qMin: number,
  qMax: number,
  extra: Partial<CatalogItem> = {}
): CatalogItem => ({ descricao, grupo, marca, unidade, preco, margem, pop, qMin, qMax, ...extra });

const CIMENTO = "Cimento e argamassa";
const AGREGADOS = "Areia, brita e pedra";
const BLOCOS = "Blocos e tijolos";
const ACO = "Aço e ferragens";
const HIDRAULICA = "Hidráulica";
const ELETRICA = "Elétrica";
const TINTAS = "Tintas";
const PISOS = "Pisos e revestimentos";
const TELHAS = "Telhas e coberturas";
const MADEIRA = "Madeira";
const FERRAMENTAS = "Ferramentas e EPI";
const LOUCAS = "Louças e esquadrias";

const CATALOG: CatalogItem[] = [
  C("Cimento CP II-F-32 50kg", CIMENTO, "Votoran", "SC", 38.9, 0.14, 100, 1, 40),
  C("Cimento CP IV-32 50kg", CIMENTO, "Poty", "SC", 36.5, 0.13, 40, 1, 30),
  C("Argamassa AC-I 20kg", CIMENTO, "Quartzolit", "SC", 14.9, 0.32, 45, 1, 20),
  C("Argamassa AC-III 20kg", CIMENTO, "Quartzolit", "SC", 34.9, 0.3, 18, 1, 15),
  C("Cal hidratada CH-III 20kg", CIMENTO, "Itaú", "SC", 16.5, 0.28, 30, 1, 10),
  C("Rejunte flexível 1kg", CIMENTO, "Quartzolit", "UN", 12.9, 0.4, 25, 1, 10),
  C("Areia média lavada", AGREGADOS, null, "M3", 145, 0.3, 60, 1, 6),
  C("Areia fina", AGREGADOS, null, "M3", 150, 0.3, 25, 1, 4),
  C("Brita 1", AGREGADOS, null, "M3", 165, 0.28, 35, 1, 5),
  C("Brita 0 (pedrisco)", AGREGADOS, null, "M3", 170, 0.28, 15, 1, 3),
  C("Pedra rachão", AGREGADOS, null, "M3", 120, 0.3, 8, 1, 6),
  C("Bloco cerâmico 9x19x19", BLOCOS, "Cerâmica Recôncavo", "UN", 1.15, 0.3, 55, 100, 2500),
  C("Bloco cerâmico 14x19x29", BLOCOS, "Cerâmica Recôncavo", "UN", 2.3, 0.3, 25, 100, 1500),
  C("Bloco de concreto 14x19x39", BLOCOS, null, "UN", 4.2, 0.25, 15, 50, 600),
  C("Tijolo maciço", BLOCOS, null, "UN", 0.95, 0.3, 10, 200, 2000),
  C("Vergalhão CA-50 8mm 12m", ACO, "Gerdau", "BR", 39.9, 0.18, 30, 1, 40),
  C("Vergalhão CA-50 10mm 12m", ACO, "Gerdau", "BR", 58.9, 0.18, 28, 1, 40),
  C("Vergalhão CA-60 5mm 12m", ACO, "Gerdau", "BR", 17.5, 0.2, 22, 1, 40),
  C("Treliça H8 6m", ACO, "Gerdau", "UN", 39, 0.22, 10, 1, 30),
  C("Coluna armada 9x14 6m", ACO, "Gerdau", "UN", 69.9, 0.2, 8, 1, 10),
  C("Arame recozido nº 18", ACO, null, "KG", 21.9, 0.35, 25, 1, 10),
  C("Prego 17x27", ACO, "Gerdau", "KG", 19.9, 0.35, 22, 1, 5),
  C("Tubo PVC soldável 25mm 6m", HIDRAULICA, "Tigre", "BR", 27.9, 0.35, 30, 1, 15),
  C("Tubo PVC soldável 32mm 6m", HIDRAULICA, "Tigre", "BR", 44.9, 0.35, 12, 1, 10),
  C("Tubo esgoto 100mm 6m", HIDRAULICA, "Tigre", "BR", 69.9, 0.33, 18, 1, 8),
  C("Tubo esgoto 40mm 6m", HIDRAULICA, "Tigre", "BR", 24.9, 0.35, 16, 1, 8),
  C("Joelho 90° soldável 25mm", HIDRAULICA, "Tigre", "UN", 1.9, 0.5, 30, 2, 20),
  C("Cola para PVC 175g", HIDRAULICA, "Tigre", "UN", 15.9, 0.4, 18, 1, 3),
  C("Registro de gaveta 3/4", HIDRAULICA, "Deca", "UN", 64.9, 0.35, 10, 1, 4),
  C("Caixa d'água 500L", HIDRAULICA, "Fortlev", "UN", 389, 0.22, 6, 1, 2),
  C("Caixa d'água 1000L", HIDRAULICA, "Fortlev", "UN", 569, 0.22, 5, 1, 1),
  C("Torneira de jardim 1/2", HIDRAULICA, "Herc", "UN", 12.9, 0.45, 12, 1, 4),
  C("Cabo flexível 2,5mm 100m", ELETRICA, "Sil", "RL", 289, 0.25, 12, 1, 4),
  C("Cabo flexível 1,5mm 100m", ELETRICA, "Sil", "RL", 189, 0.25, 9, 1, 3),
  C("Cabo flexível 4mm 100m", ELETRICA, "Sil", "RL", 459, 0.24, 5, 1, 2),
  C("Disjuntor DIN 20A", ELETRICA, "Steck", "UN", 17.9, 0.45, 14, 1, 8),
  C("Tomada 10A com placa", ELETRICA, "Tramontina", "UN", 13.9, 0.45, 15, 1, 12),
  C("Eletroduto corrugado 25mm 50m", ELETRICA, "Tigre", "RL", 79.9, 0.35, 8, 1, 3),
  C("Lâmpada LED 12W", ELETRICA, "Elgin", "UN", 9.9, 0.45, 20, 1, 10),
  C("Tinta acrílica fosca 18L branco", TINTAS, "Suvinil", "LT", 429, 0.28, 12, 1, 3),
  C("Tinta acrílica 3,6L", TINTAS, "Suvinil", "GL", 119, 0.3, 10, 1, 4),
  C("Tinta látex PVA 18L", TINTAS, "Coral", "LT", 229, 0.3, 10, 1, 3),
  C("Massa corrida 25kg", TINTAS, "Coral", "BD", 89.9, 0.32, 10, 1, 4),
  C("Selador acrílico 18L", TINTAS, "Coral", "LT", 169, 0.32, 7, 1, 2),
  C("Impermeabilizante 18kg", TINTAS, "Vedacit", "BD", 259, 0.3, 6, 1, 2),
  C("Rolo de lã 23cm", TINTAS, "Tigre", "UN", 24.9, 0.45, 10, 1, 3),
  C("Porcelanato 60x60 acetinado", PISOS, "Eliane", "M2", 64.9, 0.3, 14, 10, 60),
  C("Piso cerâmico 45x45", PISOS, "Elizabeth", "M2", 32.9, 0.3, 18, 10, 80),
  C("Revestimento parede 32x57", PISOS, "Elizabeth", "M2", 38.9, 0.3, 10, 8, 40),
  C("Telha fibrocimento 2,44x1,10 6mm", TELHAS, "Brasilit", "UN", 59.9, 0.22, 14, 2, 30),
  C("Telha cerâmica colonial", TELHAS, null, "UN", 1.85, 0.3, 10, 100, 1500),
  C("Cumeeira fibrocimento", TELHAS, "Brasilit", "UN", 32.9, 0.25, 6, 1, 10),
  C("Tábua de pinus 30cm 3m", MADEIRA, null, "UN", 34.9, 0.3, 8, 2, 20),
  C("Caibro 5x6 3m", MADEIRA, null, "UN", 21.9, 0.3, 8, 2, 30, { semCusto: true }),
  C("Ripa 2,5x5 3m", MADEIRA, null, "UN", 8.9, 0.35, 8, 5, 60, { semCusto: true }),
  C("Compensado 10mm", MADEIRA, null, "UN", 89.9, 0.25, 4, 1, 6),
  C("Carrinho de mão com câmara", FERRAMENTAS, "Tramontina", "UN", 279, 0.28, 4, 1, 1),
  C("Pá de bico", FERRAMENTAS, "Tramontina", "UN", 49.9, 0.35, 5, 1, 2),
  C("Colher de pedreiro 8pol", FERRAMENTAS, "Tramontina", "UN", 29.9, 0.4, 6, 1, 2),
  C("Nível de alumínio 40cm", FERRAMENTAS, "Tramontina", "UN", 39.9, 0.4, 3, 1, 1),
  C("Trena 5m", FERRAMENTAS, "Starrett", "UN", 29.9, 0.4, 4, 1, 1),
  C("Luva de proteção", FERRAMENTAS, null, "PR", 9.9, 0.5, 8, 1, 5, { semCusto: true }),
  C("Balde de pedreiro 12L", FERRAMENTAS, null, "UN", 12.9, 0.45, 8, 1, 4),
  // Linhas antigas: tinham saída, pararam de vender e ficaram no estoque.
  C("Telha translúcida 2,44m", TELHAS, "Brasilit", "UN", 89.9, 0.25, 3, 1, 4, { parado: true }),
  C("Caixa d'água 310L (linha antiga)", HIDRAULICA, "Fortlev", "UN", 279, 0.22, 2, 1, 1, { parado: true }),
  C("Tinta esmalte 3,6L tabaco", TINTAS, "Coral", "GL", 139, 0.3, 3, 1, 2, { parado: true }),
  C("Piso 33x33 bege (descontinuado)", PISOS, "Elizabeth", "M2", 24.9, 0.3, 3, 10, 40, { parado: true }),
  C("Porta de madeira 80cm", LOUCAS, null, "UN", 329, 0.3, 2, 1, 1, { parado: true }),
  C("Janela de alumínio 1,00x1,00", LOUCAS, null, "UN", 489, 0.28, 2, 1, 1, { parado: true }),
  C("Vaso sanitário bege", LOUCAS, "Celite", "UN", 259, 0.3, 2, 1, 1, { parado: true }),
];

// Produtos populares que vão aparecer "em ruptura" (vendem, mas zeraram).
const RUPTURA = new Set([
  "Argamassa AC-III 20kg",
  "Vergalhão CA-50 10mm 12m",
  "Tubo esgoto 100mm 6m",
  "Cabo flexível 2,5mm 100m",
  "Porcelanato 60x60 acetinado",
]);

const VENDEDORES: [string, number][] = [
  ["Carlos (balcão)", 34],
  ["Juliana", 24],
  ["Marcos", 20],
  ["Patrícia", 14],
  ["Rafael", 8],
];

const FORMAS: [string, number][] = [
  ["PIX", 38],
  ["Cartão de crédito", 20],
  ["Cartão de débito", 16],
  ["Dinheiro", 14],
  ["Crediário", 8],
  ["Boleto", 4],
];

const PRIMEIROS = ["José", "Maria", "Antônio", "Ana", "Carlos", "Francisca", "João", "Adriana", "Paulo", "Juliana",
  "Pedro", "Márcia", "Lucas", "Fernanda", "Raimundo", "Patrícia", "Manoel", "Aline", "Edson", "Cláudia"];
const SOBRENOMES = ["Santos", "Silva", "Oliveira", "Souza", "Conceição", "Jesus", "Pereira", "Almeida", "Nascimento",
  "Lima", "Ribeiro", "Barbosa", "Cardoso", "Rocha"];
const EMPRESAS = ["Construtora Boa Obra", "JM Reformas", "Alvenaria Sol Nascente", "Engenharia Vale Verde",
  "Reformas Santo Antônio", "Construções Três Irmãos"];

// Contas fixas e fornecedores (contas a pagar): [fornecedor, categoria, contas por mês, valor mín, valor máx].
const CONTAS_A_PAGAR: [string, string, number, number, number][] = [
  ["Votorantim Cimentos", "Mercadorias", 3, 20000, 35000],
  ["Gerdau Aços", "Mercadorias", 2, 10000, 18000],
  ["Tigre Tubos e Conexões", "Mercadorias", 2, 4000, 8000],
  ["Areal Recôncavo", "Mercadorias", 4, 4000, 7000],
  ["Cerâmica Recôncavo", "Mercadorias", 3, 5000, 9000],
  ["Distribuidora de Tintas Bahia", "Mercadorias", 2, 4500, 8500],
  ["Eliane Revestimentos", "Mercadorias", 2, 3000, 6500],
  ["Brasilit", "Mercadorias", 1, 3000, 6000],
  ["Sil Fios e Cabos", "Mercadorias", 1, 4000, 8000],
  ["Fortlev", "Mercadorias", 1, 2000, 5000],
  ["Madeireira São Félix", "Mercadorias", 1, 2000, 4000],
  ["Folha de pagamento", "Pessoal", 1, 38000, 42000],
  ["Simples Nacional (DAS)", "Impostos", 1, 14000, 19000],
  ["Energia elétrica", "Despesas fixas", 1, 1200, 1800],
  ["Água e esgoto", "Despesas fixas", 1, 180, 260],
  ["Internet e telefone", "Despesas fixas", 1, 320, 320],
  ["Sistema ERP", "Despesas fixas", 1, 390, 390],
  ["Combustível e frete", "Logística", 2, 1500, 3200],
  ["Manutenção de veículos", "Logística", 1, 800, 2500],
];

// ---------------------------------------------------------------------------
// Aleatoriedade determinística (mulberry32)
// ---------------------------------------------------------------------------

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Geração
// ---------------------------------------------------------------------------

const HISTORY_DAYS = 760; // ~25 meses
const DAY_MS = 86_400_000;
const WEEKDAY_FACTOR = [0, 1.1, 1.0, 1.0, 1.0, 1.15, 0.75]; // dom (fechado) .. sáb
// Sazonalidade: obra cai na chuva (abr–jul no Recôncavo) e sobe no fim do ano.
const MONTH_FACTOR = [0.95, 0.95, 1.0, 0.9, 0.85, 0.8, 0.85, 0.95, 1.05, 1.1, 1.1, 0.9];

export type DemoResult =
  | { vendas: number; produtos: number }
  // ERP real já começou a mandar dados, ou a demo já existe (clique duplo / duas abas).
  | { skipped: "erp-conectado" | "ja-carregada" };

export async function generateDemoData(): Promise<DemoResult> {
  const random = rng(20260926);
  const pick = <T,>(items: [T, number][]): T => {
    const total = items.reduce((s, [, w]) => s + w, 0);
    let r = random() * total;
    for (const [item, w] of items) {
      r -= w;
      if (r <= 0) return item;
    }
    return items[items.length - 1][0];
  };
  const between = (min: number, max: number) => min + random() * (max - min);

  // Clientes identificados (fictícios). Poucos compram muito (pedreiro/construtora).
  const clientes: [{ codigo: number; nome: string }, number][] = [];
  let codigoCliente = 1;
  for (const empresa of EMPRESAS) clientes.push([{ codigo: codigoCliente++, nome: empresa }, 12]);
  for (let i = 0; i < 180; i++) {
    const nome = `${PRIMEIROS[i % PRIMEIROS.length]} ${SOBRENOMES[(i * 7) % SOBRENOMES.length]}${
      i >= PRIMEIROS.length * 3 ? ` ${SOBRENOMES[(i * 3) % SOBRENOMES.length]}` : ""
    }`;
    clientes.push([{ codigo: codigoCliente++, nome }, i < 25 ? 4 : 1]);
  }

  const produtos = CATALOG.map((c, i) => ({ ...c, codigo: 1001 + i, custo: round2(c.preco * (1 - c.margem)) }));
  type Produto = (typeof produtos)[number];
  const vendaveis = produtos.filter((p) => !p.parado);
  const paradosAntigos = produtos.filter((p) => p.parado);

  const now = Date.now();
  const todayStart = storeDayStart(0).getTime();

  const sales: {
    id: string;
    erpId: number;
    data: Date;
    total: number;
    bruto: number;
    desconto: number;
    frete: number;
    modelo: string;
    vendedor: string;
    clienteCodigo: number | null;
    clienteNome: string | null;
    demo: true;
  }[] = [];
  const items: {
    saleId: string;
    produtoCodigo: number;
    descricao: string;
    quantidade: number;
    valorTotal: number;
    custoUnitario: number | null;
  }[] = [];
  const payments: { saleId: string; forma: string; valor: number }[] = [];
  const receivables: {
    erpId: number;
    clienteCodigo: number;
    clienteNome: string;
    documento: string;
    vencimento: Date;
    valor: number;
    valorPago: number;
    pagoEm: Date | null;
    demo: true;
  }[] = [];
  const soldLast30 = new Map<number, number>();

  let saleSeq = 0;
  let receivableSeq = 0;

  for (let daysAgo = HISTORY_DAYS; daysAgo >= 0; daysAgo--) {
    const dayStart = storeDayStart(daysAgo);
    // Dia da semana/mês NA LOJA (dayStart é 00:00 local = 03:00 UTC).
    const local = new Date(dayStart.getTime() - 3 * 3_600_000);
    const weekday = local.getUTCDay();
    if (weekday === 0) continue;

    const yearsAgo = daysAgo / 365;
    const growth = 1 / (1 + 0.12 * yearsAgo); // loja crescendo ~12% ao ano
    const inflation = 1 / (1 + 0.06 * yearsAgo); // preço/custo subindo ~6% ao ano
    const expected = 20 * WEEKDAY_FACTOR[weekday] * MONTH_FACTOR[local.getUTCMonth()] * growth;
    const count = Math.max(0, Math.round(expected * between(0.75, 1.25)));
    const closingMinutes = weekday === 6 ? 12.5 * 60 : 17.5 * 60;

    for (let n = 0; n < count; n++) {
      const minutes = between(7.5 * 60, closingMinutes);
      const data = new Date(dayStart.getTime() + minutes * 60_000);
      if (data.getTime() > now) continue; // hoje: só até agora

      saleSeq++;
      const id = `demo-sale-${saleSeq}`;
      const isEmpresa = random() < 0.12;
      const cliente = isEmpresa || random() < 0.3 ? pick(clientes) : null;

      // Produtos parados só vendiam antes de ~4 meses atrás.
      const pool = (daysAgo > 120 ? [...vendaveis, ...paradosAntigos] : vendaveis).map(
        (p): [Produto, number] => [p, p.pop]
      );
      const itemCount = pick<number>([[1, 35], [2, 28], [3, 18], [4, 10], [5, 6], [7, 3]]);
      const chosen = new Set<Produto>();
      for (let k = 0; k < itemCount; k++) chosen.add(pick(pool));

      let bruto = 0;
      let desconto = 0;
      for (const p of chosen) {
        const scale = isEmpresa ? 2.5 : 1;
        // Concentrado nas quantidades pequenas (a maioria compra pouco).
        const qty = Math.max(p.qMin, Math.round((p.qMin + (p.qMax - p.qMin) * random() ** 3) * scale));
        const unitPrice = round2(p.preco * inflation);
        const gross = round2(qty * unitPrice);
        const disc = random() < (isEmpresa ? 0.6 : 0.15) ? round2(gross * between(0.02, 0.07)) : 0;
        bruto += gross;
        desconto += disc;
        items.push({
          saleId: id,
          produtoCodigo: p.codigo,
          descricao: p.descricao,
          quantidade: qty,
          valorTotal: round2(gross - disc),
          custoUnitario: p.semCusto ? null : round2(p.custo * inflation * between(0.97, 1.03)),
        });
        if (daysAgo < 30) soldLast30.set(p.codigo, (soldLast30.get(p.codigo) ?? 0) + qty);
      }

      const frete = random() < (isEmpresa ? 0.5 : 0.12) ? round2(between(30, 90)) : 0;
      const total = round2(bruto - desconto + frete);

      // Forma de pagamento — crediário/boleto só pra cliente identificado.
      let forma = pick(FORMAS);
      if ((forma === "Crediário" || forma === "Boleto") && !cliente) forma = "PIX";
      if (random() < 0.08 && forma !== "Crediário" && forma !== "Boleto") {
        const first = round2(total * between(0.3, 0.7));
        payments.push({ saleId: id, forma, valor: first });
        payments.push({ saleId: id, forma: forma === "Dinheiro" ? "PIX" : "Dinheiro", valor: round2(total - first) });
      } else {
        payments.push({ saleId: id, forma, valor: total });
      }

      if (cliente && (forma === "Crediário" || forma === "Boleto")) {
        const parcelas = forma === "Boleto" ? pick<number>([[1, 60], [2, 40]]) : pick<number>([[1, 25], [2, 35], [3, 25], [4, 15]]);
        for (let k = 1; k <= parcelas; k++) {
          const vencimento = new Date(dayStart.getTime() + (forma === "Boleto" ? 28 : 30) * k * DAY_MS);
          const valor = round2(total / parcelas);
          let pagoEm: Date | null = null;
          if (vencimento.getTime() < todayStart) {
            // Venceu: a maioria paga perto do vencimento. Atraso é mais comum no
            // que venceu há pouco (ainda vai pagar) e raro no antigo — senão, com
            // 2 anos de histórico, a lista de devedores viraria só dívida velha.
            const diasVencida = (todayStart - vencimento.getTime()) / DAY_MS;
            const chanceAtraso = diasVencida <= 30 ? 0.14 : diasVencida <= 90 ? 0.06 : 0.008;
            if (random() >= chanceAtraso) {
              const paid = vencimento.getTime() + Math.round(between(-5, 10)) * DAY_MS;
              pagoEm = new Date(Math.min(paid, now));
            }
          } else if (random() < 0.05) {
            pagoEm = new Date(Math.min(vencimento.getTime() - Math.round(between(1, 10)) * DAY_MS, now));
          }
          receivables.push({
            erpId: ++receivableSeq,
            clienteCodigo: cliente.codigo,
            clienteNome: cliente.nome,
            documento: forma,
            vencimento,
            valor,
            valorPago: pagoEm ? valor : 0,
            pagoEm,
            demo: true,
          });
        }
      }

      sales.push({
        id,
        erpId: saleSeq,
        data,
        total,
        bruto: round2(bruto),
        desconto: round2(desconto),
        frete,
        modelo: total > 3000 || isEmpresa ? "55" : "65",
        vendedor: pick(VENDEDORES),
        clienteCodigo: cliente?.codigo ?? null,
        clienteNome: cliente?.nome ?? null,
        demo: true,
      });
    }
  }

  // Contas a pagar: passado quitado (algumas poucas em atraso), próximos 45 dias em aberto.
  const payables: {
    erpId: number;
    fornecedor: string;
    categoria: string;
    vencimento: Date;
    valor: number;
    valorPago: number;
    pagoEm: Date | null;
    demo: true;
  }[] = [];
  let payableSeq = 0;
  for (let daysAgo = HISTORY_DAYS; daysAgo >= -45; daysAgo -= 30) {
    for (const [fornecedor, categoria, perMonth, min, max] of CONTAS_A_PAGAR) {
      for (let k = 0; k < perMonth; k++) {
        const vencimento = storeDayStart(daysAgo - Math.floor(between(0, 29)));
        const valor = round2(between(min, max) / (1 + 0.1 * Math.max(0, daysAgo) / 365));
        const vencida = vencimento.getTime() < todayStart;
        const emAtraso = vencida && todayStart - vencimento.getTime() < 20 * DAY_MS && random() < 0.12;
        const pagoEm = vencida && !emAtraso ? new Date(vencimento.getTime() - Math.round(between(0, 2)) * DAY_MS) : null;
        payables.push({
          erpId: ++payableSeq,
          fornecedor,
          categoria,
          vencimento,
          valor,
          valorPago: pagoEm ? valor : 0,
          pagoEm,
          demo: true,
        });
      }
    }
  }

  const productRows = produtos.map((p) => {
    const vendidoMes = soldLast30.get(p.codigo) ?? 0;
    let estoque: number;
    if (RUPTURA.has(p.descricao)) estoque = p.descricao.startsWith("Vergalhão") ? -3 : 0;
    else if (p.parado) estoque = Math.round(between(4, 30));
    else estoque = Math.max(p.qMax, Math.round(vendidoMes * between(0.6, 1.8)));
    return {
      codigo: p.codigo,
      descricao: p.descricao,
      grupo: p.grupo,
      marca: p.marca,
      unidade: p.unidade,
      precoVarejo: p.preco,
      custo: p.semCusto ? null : p.custo,
      estoque,
      estoqueMinimo: p.parado ? null : Math.max(p.qMin, Math.round(vendidoMes * 0.3)),
      ativo: true,
      demo: true,
    };
  });

  // Lotes de 2000 linhas: cada linha vira ~12 parâmetros no INSERT, e o
  // Postgres aceita no máximo 65535 por comando.
  const CHUNK = 2000;
  // Checagem DENTRO da trava (lib/erp/lock.ts), não antes: é o que garante que
  // a demo nunca é gravada depois do ERP real ter começado a sincronizar.
  return prisma.$transaction(
    async (tx): Promise<DemoResult> => {
      await lockErpMirror(tx);
      if (await hasRealErpData(tx)) return { skipped: "erp-conectado" };
      if (await tx.erpSale.findFirst({ where: { demo: true }, select: { id: true } })) return { skipped: "ja-carregada" };

      await clearDemo(tx);
      await tx.erpProduct.createMany({ data: productRows });
      for (let i = 0; i < sales.length; i += CHUNK) await tx.erpSale.createMany({ data: sales.slice(i, i + CHUNK) });
      for (let i = 0; i < items.length; i += CHUNK) await tx.erpSaleItem.createMany({ data: items.slice(i, i + CHUNK) });
      for (let i = 0; i < payments.length; i += CHUNK)
        await tx.erpSalePayment.createMany({ data: payments.slice(i, i + CHUNK) });
      for (let i = 0; i < receivables.length; i += CHUNK)
        await tx.erpReceivable.createMany({ data: receivables.slice(i, i + CHUNK) });
      await tx.erpPayable.createMany({ data: payables });
      return { vendas: sales.length, produtos: productRows.length };
    },
    { timeout: 180_000, maxWait: 30_000 }
  );
}

// ERP real = já houve uma sincronização (ErpSyncState existe) ou há qualquer
// linha que não é de demonstração.
async function hasRealErpData(tx: ErpTx) {
  const [state, sale, product, receivable, payable] = await Promise.all([
    tx.erpSyncState.findUnique({ where: { id: "erp" }, select: { id: true } }),
    tx.erpSale.findFirst({ where: { demo: false }, select: { id: true } }),
    tx.erpProduct.findFirst({ where: { demo: false }, select: { id: true } }),
    tx.erpReceivable.findFirst({ where: { demo: false }, select: { id: true } }),
    tx.erpPayable.findFirst({ where: { demo: false }, select: { id: true } }),
  ]);
  return Boolean(state || sale || product || receivable || payable);
}

// Itens e pagamentos saem junto com a venda (onDelete: Cascade). Chamar só
// com a trava do espelho já pega (lockErpMirror).
export async function clearDemo(tx: ErpTx) {
  await tx.erpSale.deleteMany({ where: { demo: true } });
  await tx.erpProduct.deleteMany({ where: { demo: true } });
  await tx.erpReceivable.deleteMany({ where: { demo: true } });
  await tx.erpPayable.deleteMany({ where: { demo: true } });
}

export async function clearDemoData(): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await lockErpMirror(tx);
      await clearDemo(tx);
    },
    { timeout: 120_000, maxWait: 30_000 }
  );
}
