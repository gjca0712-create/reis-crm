import { SignJWT, jwtVerify } from "jose";
import type { Role } from "./constants";

// jose-only module (Web Crypto) so it stays safe to import from middleware,
// which runs on the Edge runtime. Password hashing (bcryptjs, Node-only) lives in lib/password.ts.

const secret = new TextEncoder().encode(process.env.SESSION_SECRET || "dev-secret-change-me");

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
    .sign(secret);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
