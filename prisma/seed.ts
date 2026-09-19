import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Garante que os logins reais da equipe existem — nenhum dado fictício de
// cliente, venda, conversa, campanha, ocorrência ou indicador. Usa upsert (não
// deleteMany + createMany) de propósito: rodar de novo não apaga nem reseta a
// senha de quem já existe, e não esbarra em FK de Message/Conversation/
// Occurrence que já referenciam esses usuários.
const STAFF = [
  { name: "Thiago Reis", email: "ceo@reismateriais.com.br", role: "CEO" },
  { name: "Camila Reis", email: "gerente@reismateriais.com.br", role: "GERENTE" },
  { name: "Bruna Salgado", email: "vendas@reismateriais.com.br", role: "VENDEDOR" },
  { name: "Diego Farias", email: "suporte@reismateriais.com.br", role: "ATENDENTE" },
  { name: "Larissa Prado", email: "larissa@reismateriais.com.br", role: "ATENDENTE" },
  { name: "Vinicius Teixeira", email: "vinicius@reismateriais.com.br", role: "ATENDENTE" },
];

async function main() {
  console.log("Garantindo usuários da equipe...");
  const passwordHash = await bcrypt.hash("reis2026", 10);

  for (const staff of STAFF) {
    await prisma.user.upsert({
      where: { email: staff.email },
      update: {},
      create: { ...staff, passwordHash },
    });
  }

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
