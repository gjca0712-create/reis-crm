// Cliente da API do AlphaDashboard (o painel da Alpha que recebe os dados do
// Órbita das lojas pelo agente AlphaSync). O CRM só CONSULTA: login com o
// usuário da Reis e GETs em /api/v1/dashboard/*. As rotas /api/v1/sync/* gravam
// dados e nunca são usadas daqui.
//
// Variáveis (Railway, serviço do CRM):
//   ALPHA_DASHBOARD_CNPJ    CNPJ da Reis (com ou sem pontuação)
//   ALPHA_DASHBOARD_LOGIN   login (ou e-mail) de um usuário da Reis no AlphaDashboard
//   ALPHA_DASHBOARD_SENHA   senha desse usuário
//   ALPHA_DASHBOARD_URL     opcional; padrão = endereço de produção abaixo
//
// Limites da API (por IP): login 20 a cada 15 min, consultas 500 a cada 15 min.
// Por isso: o token (vale 24 h) fica guardado e é reaproveitado, login de novo
// só com 401, login recusado espera 15 min antes de tentar de novo, e as
// consultas saem no máximo uma a cada 2 s (450 por 15 min, com folga).

import { createHash } from "node:crypto";

const PADRAO_URL = "https://alpha-dashboard-production-90af0f45.up.railway.app";
const INTERVALO_MINIMO_MS = 2_000;
const TEMPO_LIMITE_MS = 30_000;
const ESPERA_LOGIN_RECUSADO_MS = 15 * 60_000;

export type AlphaConfig = { url: string; cnpj: string; login: string; senha: string };

export function alphaConfig(env: NodeJS.ProcessEnv = process.env): AlphaConfig | null {
  const cnpj = (env.ALPHA_DASHBOARD_CNPJ ?? "").replace(/\D/g, "");
  const login = (env.ALPHA_DASHBOARD_LOGIN ?? "").trim();
  const senha = env.ALPHA_DASHBOARD_SENHA ?? "";
  if (cnpj.length !== 14 || !login || !senha) return null;
  const url = (env.ALPHA_DASHBOARD_URL?.trim() || PADRAO_URL).replace(/\/+$/, "");
  // Senha e dados da loja só por HTTPS (http só pra teste no próprio computador).
  if (!/^https:\/\//.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) return null;
  return { url, cnpj, login, senha };
}

export class AlphaError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    // 429 / login recusado: por quanto tempo (ms) não adianta tentar de novo.
    readonly esperarMs?: number
  ) {
    super(message);
    this.name = "AlphaError";
  }
}

type Fetch = typeof fetch;
type Params = Record<string, string | number | undefined>;

// Token e trava de login sobrevivem entre rodadas (e ao recarregar módulo no dev).
type Memoria = { token: string | null; dono: string; loginRecusadoAte: number; ultimaChamada: number };
const globalAlpha = globalThis as unknown as { __alphaMemoria?: Memoria };

export type AlphaClient = {
  get<T = unknown>(path: string, params?: Params): Promise<T>;
  post<T = unknown>(path: string): Promise<T>;
};

export function createAlphaClient(
  config: AlphaConfig,
  { fetchImpl = fetch, intervaloMinimoMs = INTERVALO_MINIMO_MS }: { fetchImpl?: Fetch; intervaloMinimoMs?: number } = {}
): AlphaClient {
  // Trocou usuário ou senha: memória nova (token e espera do login recusado não valem mais).
  const dono = createHash("sha256").update(`${config.url}|${config.cnpj}|${config.login}|${config.senha}`).digest("hex");
  if (!globalAlpha.__alphaMemoria || globalAlpha.__alphaMemoria.dono !== dono) {
    globalAlpha.__alphaMemoria = { token: null, dono, loginRecusadoAte: 0, ultimaChamada: 0 };
  }
  const mem = globalAlpha.__alphaMemoria;

  async function aguardarVez() {
    const espera = mem.ultimaChamada + intervaloMinimoMs - Date.now();
    if (espera > 0) await new Promise((r) => setTimeout(r, espera));
    mem.ultimaChamada = Date.now();
  }

  async function chamar(path: string, init: RequestInit): Promise<Response> {
    await aguardarVez();
    try {
      return await fetchImpl(`${config.url}${path}`, { ...init, signal: AbortSignal.timeout(TEMPO_LIMITE_MS), cache: "no-store" });
    } catch (err) {
      throw new AlphaError(`AlphaDashboard não respondeu (${(err as Error).name === "TimeoutError" ? "demorou demais" : "sem conexão"}).`);
    }
  }

  async function erroDe(res: Response): Promise<AlphaError> {
    let msg = "";
    try {
      msg = String(((await res.json()) as { error?: unknown }).error ?? "");
    } catch {}
    if (res.status === 429) {
      const segundos = Number(res.headers.get("retry-after"));
      const esperar = Number.isFinite(segundos) && segundos > 0 ? segundos * 1000 : 15 * 60_000;
      return new AlphaError("AlphaDashboard pediu pra esperar (limite de consultas).", 429, esperar);
    }
    return new AlphaError(`AlphaDashboard respondeu ${res.status}${msg ? `: ${msg}` : ""}.`, res.status);
  }

  async function login(): Promise<string> {
    if (Date.now() < mem.loginRecusadoAte) {
      throw new AlphaError("Login no AlphaDashboard recusado há pouco; esperando antes de tentar de novo.", 401, mem.loginRecusadoAte - Date.now());
    }
    const res = await chamar("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cnpj: config.cnpj, emailOrLogin: config.login, password: config.senha }),
    });
    if (!res.ok) {
      const erro = await erroDe(res);
      if (res.status === 401 || res.status === 403 || res.status === 400) {
        mem.loginRecusadoAte = Date.now() + ESPERA_LOGIN_RECUSADO_MS;
        throw new AlphaError(
          res.status === 403
            ? "AlphaDashboard: acesso da empresa bloqueado no painel admin."
            : "AlphaDashboard recusou o login (confira ALPHA_DASHBOARD_CNPJ, _LOGIN e _SENHA).",
          res.status,
          ESPERA_LOGIN_RECUSADO_MS
        );
      }
      throw erro;
    }
    const corpo = (await res.json()) as { token?: unknown };
    if (typeof corpo.token !== "string" || !corpo.token) throw new AlphaError("AlphaDashboard: login sem token na resposta.");
    mem.token = corpo.token;
    return corpo.token;
  }

  async function autenticado(path: string, init: RequestInit): Promise<Response> {
    const token = mem.token ?? (await login());
    let res = await chamar(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
    if (res.status === 401) {
      // Token venceu (24 h) ou foi encerrado: um login novo, uma tentativa.
      mem.token = null;
      const novo = await login();
      res = await chamar(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${novo}` } });
    }
    if (!res.ok) throw await erroDe(res);
    return res;
  }

  return {
    async get<T>(path: string, params: Params = {}): Promise<T> {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
      const sufixo = qs.size ? `?${qs}` : "";
      const res = await autenticado(`/api/v1/dashboard${path}${sufixo}`, { method: "GET" });
      return (await res.json()) as T;
    },
    async post<T>(path: string): Promise<T> {
      const res = await autenticado(`/api/v1/dashboard${path}`, { method: "POST" });
      return (await res.json().catch(() => ({}))) as T;
    },
  };
}
