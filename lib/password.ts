import bcrypt from "bcryptjs";

// Node-only (bcryptjs). Import from Server Actions / route handlers, never from middleware.

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}
