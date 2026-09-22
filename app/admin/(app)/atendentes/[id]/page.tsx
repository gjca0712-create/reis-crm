import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireCeo } from "@/lib/session";
import { ROLE_LABELS, type Role } from "@/lib/constants";
import { CUSTOMIZABLE_FEATURES, FEATURE_LABELS, defaultFeaturesFor, resolveFeatures } from "@/lib/permissions";
import { Card } from "@/components/ui/Card";
import { updatePermissions, resetPermissions, updateUserInfo, resetUserPassword } from "../actions";

const inputClass =
  "w-full rounded-lg bg-page border border-border px-3 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-gold-400/50";

export default async function EditarUsuarioPage({ params }: { params: Promise<{ id: string }> }) {
  const ceo = await requireCeo();
  const { id } = await params;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) notFound();

  const isSelf = user.id === ceo.userId;
  const isCeo = user.role === "CEO";
  const role = user.role as Role;
  const activeFeatures = resolveFeatures(role, user.featureOverrides);
  const isCustom = user.featureOverrides != null;
  const roleDefaults = defaultFeaturesFor(role);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/atendentes"
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink-primary mb-3"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>
        <h1 className="text-xl font-semibold text-ink-primary">{user.name}</h1>
        <p className="text-sm text-ink-muted mt-0.5">
          {user.email} · {ROLE_LABELS[user.role] ?? user.role}
        </p>
      </div>

      <Card title="Dados do usuário" className="p-5">
        <form action={updateUserInfo} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input type="hidden" name="userId" value={user.id} />
          <label className="block">
            <span className="block text-sm text-ink-secondary mb-1.5">Nome completo</span>
            <input name="name" required defaultValue={user.name} className={inputClass} />
          </label>
          <label className="block">
            <span className="block text-sm text-ink-secondary mb-1.5">E-mail</span>
            <input name="email" type="email" required defaultValue={user.email} className={inputClass} />
          </label>
          <label className="block">
            <span className="block text-sm text-ink-secondary mb-1.5">Perfil</span>
            {isSelf ? (
              <>
                <input
                  type="text"
                  disabled
                  value={ROLE_LABELS[user.role] ?? user.role}
                  className={`${inputClass} opacity-60 cursor-not-allowed`}
                />
                <input type="hidden" name="role" value={user.role} />
                <span className="block text-[11px] text-ink-muted mt-1">
                  Você não pode alterar seu próprio perfil (evita se trancar fora do CEO).
                </span>
              </>
            ) : (
              <select name="role" defaultValue={user.role} className={inputClass}>
                <option value="ATENDENTE">Atendente</option>
                <option value="VENDEDOR">Vendedor</option>
                <option value="GERENTE">Gerente</option>
                <option value="CEO">CEO</option>
              </select>
            )}
          </label>
          <div className="sm:col-span-2 flex justify-end">
            <button
              type="submit"
              className="rounded-lg bg-gold-400 text-page font-semibold px-5 py-2.5 text-sm hover:bg-gold-300 transition-colors"
            >
              Salvar dados
            </button>
          </div>
        </form>
      </Card>

      <Card title="Redefinir senha" className="p-5">
        <form action={resetUserPassword} className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
          <input type="hidden" name="userId" value={user.id} />
          <label className="block">
            <span className="block text-sm text-ink-secondary mb-1.5">Nova senha</span>
            <input
              name="password"
              type="password"
              required
              minLength={6}
              placeholder="Mínimo 6 caracteres"
              className={inputClass}
            />
          </label>
          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-lg border border-border-strong text-ink-secondary px-4 py-2.5 text-sm hover:text-ink-primary hover:border-ink-primary/40 transition-colors"
            >
              Redefinir senha
            </button>
          </div>
        </form>
      </Card>

      {isCeo ? (
        <Card className="p-5">
          <p className="text-sm text-ink-secondary">
            Este usuário é CEO e sempre tem acesso a todas as telas — permissões de CEO não são personalizáveis.
          </p>
        </Card>
      ) : isSelf ? (
        <Card className="p-5">
          <p className="text-sm text-ink-secondary">
            Você não pode editar suas próprias permissões por aqui (evita se trancar fora de alguma tela sem querer).
            Peça a outro CEO, se houver.
          </p>
        </Card>
      ) : (
        <Card title="O que esse usuário pode ver" className="p-5 space-y-5">
          <p className="text-sm text-ink-muted">
            Desmarque uma tela pra tirar o acesso, ou marque pra liberar mesmo que não seja padrão do perfil{" "}
            <strong>{ROLE_LABELS[user.role] ?? user.role}</strong>. Status atual:{" "}
            <span className={isCustom ? "text-gold-400" : "text-ink-secondary"}>
              {isCustom ? "personalizado" : "padrão do perfil"}
            </span>
            .
          </p>

          <form action={updatePermissions} className="space-y-4">
            <input type="hidden" name="userId" value={user.id} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              {CUSTOMIZABLE_FEATURES.map((feature) => (
                <label key={feature} className="flex items-center gap-2.5 text-sm text-ink-secondary">
                  <input
                    type="checkbox"
                    name={feature}
                    defaultChecked={activeFeatures.includes(feature)}
                    className="w-4 h-4 rounded border-border-strong accent-gold-400"
                  />
                  <span>{FEATURE_LABELS[feature]}</span>
                  {!roleDefaults.includes(feature) && (
                    <span className="text-[10px] text-ink-muted">(fora do padrão do perfil)</span>
                  )}
                </label>
              ))}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="submit"
                className="rounded-lg bg-gold-400 text-page font-semibold px-5 py-2.5 text-sm hover:bg-gold-300 transition-colors"
              >
                Salvar permissões
              </button>
            </div>
          </form>

          {isCustom && (
            <form action={resetPermissions} className="pt-2 border-t border-border">
              <input type="hidden" name="userId" value={user.id} />
              <p className="text-xs text-ink-muted mt-3 mb-2">
                Isso apaga a personalização e volta a usar o que o perfil {ROLE_LABELS[user.role] ?? user.role} vê por padrão.
              </p>
              <button
                type="submit"
                className="rounded-lg border border-border-strong text-ink-secondary px-4 py-2 text-sm hover:text-ink-primary hover:border-ink-primary/40 transition-colors"
              >
                Restaurar padrão do perfil
              </button>
            </form>
          )}
        </Card>
      )}
    </div>
  );
}
