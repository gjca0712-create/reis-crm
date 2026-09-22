import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";

// Todo tipo de evento que vira registro de auditoria. Cobre login (sucesso e
// falha) e toda mudança feita por um CEO na conta de outro usuário — o pedido
// original foi justamente "poder controlar as informações dos usuários... e
// quero logs de auditoria", então o foco é rastrear quem mexeu em quem.
export type AuditAction =
  | "login.success"
  | "login.failure"
  | "user.create"
  | "user.update"
  | "user.password_reset"
  | "user.permissions_update"
  | "user.permissions_reset"
  | "campaign.send";

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  "login.success": "Login realizado",
  "login.failure": "Tentativa de login falhou",
  "user.create": "Usuário criado",
  "user.update": "Dados do usuário alterados",
  "user.password_reset": "Senha redefinida",
  "user.permissions_update": "Permissões personalizadas",
  "user.permissions_reset": "Permissões restauradas pro padrão",
  "campaign.send": "Campanha disparada",
};

type AuditActor = { userId?: string; name: string; email?: string } | null;

// actor null = ninguém autenticado no momento (ex: tentativa de login que falhou).
export async function logAudit(params: {
  actor: AuditActor;
  action: AuditAction;
  targetId?: string;
  targetLabel?: string;
  details?: Record<string, unknown>;
}) {
  const { actor, action, targetId, targetLabel, details } = params;
  await prisma.auditLog.create({
    data: {
      actorId: actor?.userId,
      actorName: actor?.name ?? "Anônimo",
      actorEmail: actor?.email,
      action,
      targetId,
      targetLabel,
      details: details as Prisma.InputJsonValue | undefined,
    },
  });
}
