import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// SQLite has no native enum type, so this mirrors the Profissao union in lib/constants.ts
// (kept local rather than imported, since tsx doesn't resolve the "@/" path alias here).
type Profissao = "PEDREIRO" | "ELETRICISTA" | "ENCANADOR" | "PINTOR" | "MARCENEIRO" | "ARQUITETO" | "ENGENHEIRO" | "OUTRO";

const prisma = new PrismaClient();

const CASHBACK_RATE = 0.03;
const POINTS_PER_REAL = 0.1;

const BAIRROS: { nome: string; peso: number }[] = [
  { nome: "Setor Bueno", peso: 5 },
  { nome: "Setor Marista", peso: 3 },
  { nome: "Jardim América", peso: 4 },
  { nome: "Vila Nova", peso: 6 },
  { nome: "Campinas", peso: 5 },
  { nome: "Setor Sul", peso: 3 },
  { nome: "Jardim Goiás", peso: 2 },
  { nome: "Parque Amazônia", peso: 4 },
  { nome: "Setor Coimbra", peso: 2 },
  { nome: "Residencial Eldorado", peso: 3 },
];

const bairroPool: string[] = [];
for (const b of BAIRROS) for (let i = 0; i < b.peso; i++) bairroPool.push(b.nome);

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function main() {
  console.log("Limpando dados existentes...");
  await prisma.lead.deleteMany();
  await prisma.occurrence.deleteMany();
  await prisma.rating.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.cashbackTransaction.deleteMany();
  await prisma.loyaltyTransaction.deleteMany();
  await prisma.saleItem.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.partner.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.user.deleteMany();

  console.log("Criando usuários...");
  const passwordHash = await bcrypt.hash("reis2026", 10);
  await prisma.user.createMany({
    data: [
      { name: "Thiago Reis", email: "ceo@reismateriais.com.br", passwordHash, role: "CEO" },
      { name: "Camila Reis", email: "gerente@reismateriais.com.br", passwordHash, role: "GERENTE" },
      { name: "Bruna Salgado", email: "vendas@reismateriais.com.br", passwordHash, role: "VENDEDOR" },
      { name: "Diego Farias", email: "suporte@reismateriais.com.br", passwordHash, role: "ATENDENTE" },
      { name: "Larissa Prado", email: "larissa@reismateriais.com.br", passwordHash, role: "ATENDENTE" },
      { name: "Vinicius Teixeira", email: "vinicius@reismateriais.com.br", passwordHash, role: "ATENDENTE" },
    ],
  });
  const agents = await prisma.user.findMany({ where: { role: "ATENDENTE" } });
  const allStaff = await prisma.user.findMany();

  console.log("Criando indicadores (pedreiros, eletricistas, etc.)...");
  const partnersData: { name: string; phone: string; profissao: Profissao }[] = [
    { name: "Carlos Alberto Souza", phone: "75987650001", profissao: "PEDREIRO" },
    { name: "José Ricardo Lima", phone: "75987650002", profissao: "PEDREIRO" },
    { name: "Rogério Batista Nunes", phone: "75987650003", profissao: "PEDREIRO" },
    { name: "Marcos Vinícius Alves", phone: "75987650004", profissao: "ELETRICISTA" },
    { name: "Antônio Ferreira Dias", phone: "75987650005", profissao: "ELETRICISTA" },
    { name: "Paulo Roberto Santos", phone: "75987650006", profissao: "ENCANADOR" },
    { name: "Eduardo Henrique Costa", phone: "75987650007", profissao: "PINTOR" },
    { name: "Fábio Augusto Ramos", phone: "75987650008", profissao: "MARCENEIRO" },
    { name: "Juliana Mendes Prado", phone: "75987650009", profissao: "ARQUITETO" },
    { name: "Renato César Oliveira", phone: "75987650010", profissao: "ENGENHEIRO" },
    { name: "Fernanda Lopes Cardoso", phone: "75987650011", profissao: "PINTOR" },
    { name: "Patrícia Nogueira Reis", phone: "75987650012", profissao: "ELETRICISTA" },
  ];

  const partners: Awaited<ReturnType<typeof prisma.partner.create>>[] = [];
  for (const p of partnersData) {
    const created = await prisma.partner.create({ data: { ...p, pixKey: p.phone } });
    partners.push(created);
  }

  console.log("Criando clientes...");
  const firstNames = [
    "João", "Maria", "Pedro", "Ana", "Lucas", "Juliana", "Marcos", "Fernanda", "Rafael", "Camila",
    "Bruno", "Larissa", "Diego", "Patrícia", "Thiago", "Aline", "Rodrigo", "Vanessa", "Gustavo", "Débora",
    "Felipe", "Priscila", "André", "Bianca", "Leandro", "Carla", "Vinícius", "Tatiane", "Alexandre", "Simone",
    "Daniel", "Cristina", "Marcelo", "Renata", "Fábio", "Elaine", "Igor", "Sandra", "Otávio",
  ];
  const lastNames = [
    "Silva", "Souza", "Oliveira", "Santos", "Pereira", "Costa", "Rodrigues", "Almeida", "Nascimento", "Lima",
    "Araújo", "Fernandes", "Carvalho", "Gomes", "Martins", "Barbosa", "Ribeiro", "Alves", "Monteiro", "Cardoso",
  ];

  const FASES_OBRA = ["INICIO", "MEIO", "FIM"];

  function randomBirthday(daysFromToday?: number) {
    const d = daysFromToday !== undefined ? daysAgo(-daysFromToday) : new Date(randInt(1965, 2000), randInt(0, 11), randInt(1, 28));
    d.setFullYear(randInt(1965, 2000));
    return d;
  }

  const customers: Awaited<ReturnType<typeof prisma.customer.create>>[] = [];
  const totalCustomers = 38;
  for (let i = 0; i < totalCustomers; i++) {
    const name = `${pick(firstNames)} ${pick(lastNames)}`;
    const bairro = pick(bairroPool);
    const referredBy = Math.random() < 0.62 ? pick(partners) : null;
    const phone = `759${randInt(1000, 9999)}${randInt(1000, 9999)}`;
    const emailSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, ".");
    // Os dois primeiros clientes ganham aniversário propositalmente próximo,
    // só pra dar pra ver o indicador 🎂 funcionando logo de cara.
    const birthday =
      Math.random() < 0.7 ? randomBirthday(i === 0 ? 0 : i === 1 ? 3 : undefined) : null;
    const faseObra = Math.random() < 0.75 ? pick(FASES_OBRA) : null;

    const customer = await prisma.customer.create({
      data: {
        name,
        phone,
        email: Math.random() < 0.5 ? `${emailSlug}@email.com` : null,
        address: `Rua ${randInt(1, 300)}, nº ${randInt(10, 999)}`,
        bairro,
        city: "Cruz das Almas",
        referredById: referredBy?.id,
        birthday,
        faseObra,
      },
    });
    customers.push(customer);
  }

  console.log("Criando vendas, pontos de fidelidade e cashback...");
  const buckets: { min: number; max: number }[] = [
    { min: 0, max: 30 },
    { min: 31, max: 60 },
    { min: 61, max: 90 },
    { min: 91, max: 160 },
  ];

  const PRODUCT_CATALOG: { name: string; unitPrice: number }[] = [
    { name: "Cimento CP II 50kg", unitPrice: 38.9 },
    { name: "Tijolo baiano (milheiro)", unitPrice: 890 },
    { name: "Areia média (m³)", unitPrice: 120 },
    { name: "Tinta acrílica 18L", unitPrice: 245 },
    { name: "Vergalhão CA-50 (barra)", unitPrice: 42 },
    { name: "Telha cerâmica (unidade)", unitPrice: 2.8 },
    { name: "Argamassa AC-II 20kg", unitPrice: 32 },
    { name: "Porcelanato 60x60 (m²)", unitPrice: 68 },
    { name: "Tubo PVC esgoto 100mm (barra)", unitPrice: 55 },
    { name: "Fio elétrico 2,5mm (rolo 100m)", unitPrice: 210 },
    { name: "Bloco de concreto (unidade)", unitPrice: 3.5 },
    { name: "Cal hidratada 20kg", unitPrice: 18 },
    { name: "Rejunte 1kg", unitPrice: 22 },
    { name: "Kit hidráulico básico", unitPrice: 180 },
    { name: "Disjuntor 32A", unitPrice: 24 },
  ];

  // Vendas recentes ainda estão em separação/rota; vendas mais antigas já foram
  // entregues — só pra dar uma distribuição realista pro filtro de entrega.
  function pickDeliveryStatus(daysAgoVal: number) {
    if (daysAgoVal <= 1) return pick(["SEPARACAO", "SEPARACAO", "EM_ROTA", "ENTREGUE"]);
    if (daysAgoVal <= 4) return pick(["EM_ROTA", "ENTREGUE", "ENTREGUE"]);
    return "ENTREGUE";
  }

  function pickSaleItems() {
    const count = randInt(1, 3);
    const pool = [...PRODUCT_CATALOG];
    const chosen: typeof PRODUCT_CATALOG = [];
    for (let i = 0; i < count && pool.length > 0; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      chosen.push(pool[idx]);
      pool.splice(idx, 1);
    }
    return chosen.map((p) => ({ productName: p.name, quantity: randInt(1, 5), unitPrice: p.unitPrice }));
  }

  const customerPointsAcc = new Map<string, number>();
  const partnerCashbackAcc = new Map<string, number>();
  const allSales: Awaited<ReturnType<typeof prisma.sale.create>>[] = [];

  for (let ci = 0; ci < customers.length; ci++) {
    const customer = customers[ci];
    if (Math.random() < 0.08) continue; // lead novo, ainda sem compra

    const bucket = buckets[ci % buckets.length];
    const lastPurchaseDaysAgo = randInt(bucket.min, bucket.max);
    const numSales = randInt(1, 4);
    const saleDaysAgos = [lastPurchaseDaysAgo];
    for (let s = 1; s < numSales; s++) {
      saleDaysAgos.push(lastPurchaseDaysAgo + randInt(10, 40) * s);
    }

    const partner = customer.referredById ? partners.find((p) => p.id === customer.referredById) ?? null : null;

    for (const daysAgoVal of saleDaysAgos) {
      const items = pickSaleItems();
      const total = Math.round(items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0) * 100) / 100;
      const pointsEarned = Math.floor(total * POINTS_PER_REAL);
      const cashbackAmount = partner ? Math.round(total * CASHBACK_RATE * 100) / 100 : 0;

      const sale = await prisma.sale.create({
        data: {
          customerId: customer.id,
          partnerId: partner?.id,
          total,
          pointsEarned,
          cashbackAmount,
          deliveryStatus: pickDeliveryStatus(daysAgoVal),
          date: daysAgo(daysAgoVal),
        },
      });
      allSales.push(sale);

      await prisma.saleItem.createMany({
        data: items.map((it) => ({
          saleId: sale.id,
          productName: it.productName,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          subtotal: Math.round(it.quantity * it.unitPrice * 100) / 100,
        })),
      });

      await prisma.loyaltyTransaction.create({
        data: {
          customerId: customer.id,
          points: pointsEarned,
          type: "EARNED",
          reference: `Compra #${sale.id.slice(-6)}`,
        },
      });
      customerPointsAcc.set(customer.id, (customerPointsAcc.get(customer.id) ?? 0) + pointsEarned);

      if (partner && cashbackAmount > 0) {
        await prisma.cashbackTransaction.create({
          data: { partnerId: partner.id, amount: cashbackAmount, type: "EARNED", saleId: sale.id },
        });
        partnerCashbackAcc.set(partner.id, (partnerCashbackAcc.get(partner.id) ?? 0) + cashbackAmount);
      }
    }
  }

  console.log("Atualizando saldos de pontos e cashback...");
  for (const [customerId, points] of customerPointsAcc) {
    await prisma.customer.update({ where: { id: customerId }, data: { loyaltyPoints: points } });
  }
  for (const [partnerId, amount] of partnerCashbackAcc) {
    await prisma.partner.update({
      where: { id: partnerId },
      data: { cashbackBalance: Math.round(amount * 100) / 100 },
    });
  }

  console.log("Criando conversas de WhatsApp Suporte...");
  const supportSamples = [
    { in: "Oi, vocês têm cimento CP III disponível?", out: "Bom dia! Temos sim, saco de 50kg por R$ 38,90. Quantos você precisa?" },
    { in: "Preciso de um orçamento para 500 tijolos", out: "Claro! Vou preparar o orçamento e te envio em instantes." },
    { in: "O material que comprei ainda não chegou", out: "Peço desculpas pelo atraso! Vou verificar com a logística agora mesmo." },
    { in: "Vocês entregam no Setor Bueno?", out: "Entregamos sim! Frete grátis para compras acima de R$ 500." },
    { in: "Qual o prazo de entrega da tinta?", out: "Para tinta o prazo é de 1 dia útil na região." },
    { in: "Consigo parcelar no cartão?", out: "Consegue sim, em até 6x sem juros acima de R$ 300." },
    { in: "Vocês têm nota fiscal?", out: "Emitimos nota fiscal em todas as compras, sem custo adicional." },
    { in: "Qual o horário de funcionamento?", out: "Funcionamos de segunda a sábado, das 7h às 18h." },
  ];

  for (let i = 0; i < Math.min(8, customers.length); i++) {
    const customer = customers[i];
    const sample = supportSamples[i % supportSamples.length];
    const agent = pick(agents);
    const isResolved = i % 4 === 0;

    const conversation = await prisma.conversation.create({
      data: {
        customerId: customer.id,
        status: isResolved ? "RESOLVED" : "OPEN",
        lastMessageAt: daysAgo(randInt(0, 5)),
        resolvedById: isResolved ? agent.id : undefined,
        ratingRequested: isResolved,
      },
    });
    await prisma.message.create({
      data: { conversationId: conversation.id, direction: "IN", body: sample.in, createdAt: daysAgo(randInt(1, 6)) },
    });
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: "OUT",
        body: sample.out,
        senderId: agent.id,
        createdAt: daysAgo(randInt(0, 1)),
      },
    });

    // Parte dos atendimentos resolvidos já tem avaliação; o resto fica "aguardando resposta".
    if (isResolved && Math.random() < 0.6) {
      const score = Math.random() < 0.85 ? randInt(4, 5) : randInt(1, 3);
      await prisma.rating.create({
        data: { conversationId: conversation.id, customerId: customer.id, agentId: agent.id, score },
      });
      await prisma.conversation.update({ where: { id: conversation.id }, data: { ratingRequested: false } });
    }
  }

  console.log("Criando campanhas de disparo (WhatsApp API oficial)...");
  await prisma.campaign.createMany({
    data: [
      {
        name: "Reativação 90 dias",
        message: "Sentimos sua falta! Volte à Reis Materiais e ganhe 10% de desconto na próxima compra.",
        segment: "Clientes sem comprar há mais de 90 dias",
        status: "ENVIADA",
        audienceSize: 14,
        sentAt: daysAgo(6),
      },
      {
        name: "Promoção Setor Bueno",
        message: "Oferta especial em cimento e areia essa semana, só para o Setor Bueno!",
        segment: "Bairro: Setor Bueno",
        status: "RASCUNHO",
        audienceSize: 9,
      },
    ],
  });

  console.log("Criando ocorrências de exemplo...");
  const OCCURRENCE_TYPES = [
    "SEM_ESTOQUE",
    "SEPARACAO_ERRADA",
    "ENTREGA_ERRADA",
    "ENDERECO_INCOMPLETO",
    "PRODUTO_DANIFICADO",
    "DEVOLUCAO",
    "CANCELAMENTO",
    "RECLAMACAO_CLIENTE",
  ];
  const OCCURRENCE_DESCRIPTIONS: Record<string, string> = {
    SEM_ESTOQUE: "Cliente comprou cimento CP II mas não tinha no estoque no momento da separação.",
    SEPARACAO_ERRADA: "Separado tijolo comum ao invés de tijolo baiano.",
    ENTREGA_ERRADA: "Entrega foi feita em endereço errado no mesmo bairro.",
    ENDERECO_INCOMPLETO: "Cliente não informou o número da casa, entrega atrasou 1 dia.",
    PRODUTO_DANIFICADO: "Saco de argamassa rasgado durante o transporte.",
    DEVOLUCAO: "Cliente devolveu parte do material por excesso de compra.",
    CANCELAMENTO: "Pedido cancelado pelo cliente antes da separação.",
    RECLAMACAO_CLIENTE: "Cliente reclamou da demora na entrega.",
  };

  for (let i = 0; i < 16; i++) {
    const type = pick(OCCURRENCE_TYPES);
    const sale = Math.random() < 0.65 && allSales.length > 0 ? pick(allSales) : null;
    const customer = sale
      ? customers.find((c) => c.id === sale.customerId) ?? null
      : Math.random() < 0.85
        ? pick(customers)
        : null;
    const reporter = pick(allStaff);

    await prisma.occurrence.create({
      data: {
        type,
        description: OCCURRENCE_DESCRIPTIONS[type],
        saleId: sale?.id,
        customerId: customer?.id,
        reportedById: reporter.id,
        createdAt: daysAgo(randInt(0, 50)),
      },
    });
  }

  console.log("Criando leads de exemplo (orçamentos pedidos no site)...");
  const LEAD_SAMPLES: { name: string; phone: string; email: string | null; message: string; status: string }[] = [
    {
      name: "Marina Teixeira",
      phone: "75988810001",
      email: "marina.teixeira@email.com",
      message: "Preciso de orçamento pra 200 tijolos e 10 sacos de cimento.",
      status: "NOVO",
    },
    {
      name: "Kleber Andrade",
      phone: "75988810002",
      email: null,
      message: "Quanto fica o m² de porcelanato 60x60?",
      status: "NOVO",
    },
    {
      name: "Otávio Barros",
      phone: "75988810003",
      email: "otavio.barros@email.com",
      message: "Reforma de banheiro, preciso de tubo PVC e argamassa.",
      status: "CONTATADO",
    },
    {
      name: "Simone Rezende",
      phone: "75988810004",
      email: null,
      message: "Vocês entregam material elétrico no Setor Sul?",
      status: "CONTATADO",
    },
    {
      name: "Anderson Melo",
      phone: "75988810005",
      email: "anderson.melo@email.com",
      message: "Orçamento pra laje de 80m², começando obra mês que vem.",
      status: "PERDIDO",
    },
  ];

  for (const lead of LEAD_SAMPLES) {
    await prisma.lead.create({
      data: { ...lead, createdAt: daysAgo(randInt(0, 20)) },
    });
  }

  // Um lead já convertido em cliente, pra mostrar o vínculo na aba Leads.
  const convertedSourceCustomer = pick(customers);
  await prisma.lead.create({
    data: {
      name: convertedSourceCustomer.name,
      phone: convertedSourceCustomer.phone,
      email: null,
      message: "Pedido de orçamento que virou cliente.",
      status: "CONVERTIDO",
      convertedCustomerId: convertedSourceCustomer.id,
      createdAt: daysAgo(randInt(20, 40)),
    },
  });

  console.log("Seed concluído com sucesso.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
