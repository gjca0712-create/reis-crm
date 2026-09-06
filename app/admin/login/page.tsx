import Image from "next/image";
import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const next = params.next || "";
  const hasError = params.error === "1";

  return (
    <main className="min-h-screen flex items-center justify-center bg-page px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <Image
            src="/reis-logo.png"
            alt="Reis Materiais de Construção"
            width={900}
            height={570}
            priority
            unoptimized
            className="w-full max-w-[260px] h-auto rounded-xl shadow-lg shadow-black/40"
          />
          <p className="text-ink-muted text-sm mt-3">CRM · Painel interno</p>
        </div>

        <form action={login} className="bg-surface border border-border rounded-2xl p-6 space-y-4">
          <input type="hidden" name="next" value={next} />

          {hasError && (
            <div className="text-sm text-status-critical bg-status-critical/10 border border-status-critical/30 rounded-lg px-3 py-2">
              E-mail ou senha inválidos.
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm text-ink-secondary mb-1.5">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoFocus
              placeholder="voce@reismateriais.com.br"
              className="w-full rounded-lg bg-page border border-border px-3 py-2.5 text-ink-primary placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-gold-400/50 focus:border-gold-400/50"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm text-ink-secondary mb-1.5">
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              placeholder="••••••••"
              className="w-full rounded-lg bg-page border border-border px-3 py-2.5 text-ink-primary placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-gold-400/50 focus:border-gold-400/50"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-gold-400 text-page font-semibold py-2.5 hover:bg-gold-300 transition-colors"
          >
            Entrar
          </button>
        </form>

        <p className="text-center text-xs text-ink-muted mt-6">
          © {new Date().getFullYear()} Reis Materiais de Construção
        </p>
      </div>
    </main>
  );
}
