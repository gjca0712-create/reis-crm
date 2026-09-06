import Link from "next/link";
import Image from "next/image";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-page">
      <div className="max-w-sm text-center">
        <Image
          src="/reis-crown.png"
          alt="Reis Materiais"
          width={600}
          height={222}
          unoptimized
          priority
          className="h-12 w-auto mx-auto mb-4"
        />
        <h1 className="text-lg font-semibold text-ink-primary mb-2">Página não encontrada</h1>
        <p className="text-sm text-ink-muted mb-6">O conteúdo que você procura não existe ou foi removido.</p>
        <Link
          href="/admin/dashboard"
          className="inline-block rounded-lg bg-gold-400 text-page font-semibold px-5 py-2.5 text-sm hover:bg-gold-300 transition-colors"
        >
          Voltar ao dashboard
        </Link>
      </div>
    </div>
  );
}
