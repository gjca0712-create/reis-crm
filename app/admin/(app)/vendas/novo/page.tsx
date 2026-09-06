import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/Card";
import { SaleForm } from "@/components/sales/SaleForm";
import { requireFeature } from "@/lib/session";
import { createSale } from "../actions";

export default async function NovaVendaPage() {
  await requireFeature("vendas");

  const [customers, partners] = await Promise.all([
    prisma.customer.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, bairro: true, referredById: true },
    }),
    prisma.partner.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, profissao: true } }),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Registrar venda</h1>
        <p className="text-sm text-ink-muted mt-0.5">Pontos de fidelidade e cashback são calculados automaticamente</p>
      </div>
      {customers.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-muted">
            Cadastre um cliente antes de registrar uma venda.{" "}
            <Link href="/admin/clientes/novo" className="text-gold-400 hover:text-gold-300">
              Cadastrar cliente
            </Link>
          </p>
        </Card>
      ) : (
        <SaleForm action={createSale} customers={customers} partners={partners} />
      )}
    </div>
  );
}
