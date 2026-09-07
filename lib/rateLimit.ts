// Limitador simples em memória — suficiente porque o serviço roda numa única
// instância no Railway (numReplicas: 1). Se um dia escalar pra mais de uma
// instância, isso vira "por instância" em vez de global; nesse caso trocar
// por um contador compartilhado (Redis, ou a própria tabela do Postgres).
type Entry = { count: number; firstAttemptAt: number; lockedUntil: number | null };

const attempts = new Map<string, Entry>();

const WINDOW_MS = 15 * 60 * 1000; // 15 min
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000; // 15 min de bloqueio após estourar o limite

export function isLoginLocked(key: string): { locked: boolean; retryAfterSeconds?: number } {
  const entry = attempts.get(key.toLowerCase());
  if (!entry?.lockedUntil) return { locked: false };

  const now = Date.now();
  if (now >= entry.lockedUntil) {
    attempts.delete(key.toLowerCase());
    return { locked: false };
  }

  return { locked: true, retryAfterSeconds: Math.ceil((entry.lockedUntil - now) / 1000) };
}

export function registerFailedLogin(key: string): void {
  const k = key.toLowerCase();
  const now = Date.now();
  const entry = attempts.get(k);

  if (!entry || now - entry.firstAttemptAt > WINDOW_MS) {
    attempts.set(k, { count: 1, firstAttemptAt: now, lockedUntil: null });
    return;
  }

  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOCK_MS;
  }
}

export function clearLoginAttempts(key: string): void {
  attempts.delete(key.toLowerCase());
}
