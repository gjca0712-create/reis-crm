import { SignJWT, jwtVerify } from "jose";
import type { Role } from "./constants";

// jose-only module (Web Crypto) so it stays safe to import from middleware,
// which runs on the Edge runtime. Password hashing (bcryptjs, Node-only) lives in lib/password.ts.

// Chave de assinatura do JWT de sessão. Em produção é OBRIGATÓRIA e precisa ser
// longa — sem isso, um segredo público ("dev-secret") assinaria tokens de admin
// válidos pra qualquer um. Falha fechada: se faltar em produção, nenhuma sessão
// é criada nem validada (todo mundo cai no login), em vez de aceitar tokens forjados.
function sessionSecret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return new TextEncoder().encode(s);
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET ausente ou curta demais (mínimo 16 caracteres) — obrigatória em produção.");
  }
  return new TextEncoder().encode("dev-secret-change-me-em-producao");
}

export const SESSION_COOKIE_NAME = "reis_session";

export type SessionPayload = {
  userId: string;
  name: string;
  email: string;
  role: Role;
};

export async function createSessionToken(payload: SessionPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(sessionSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, sessionSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
