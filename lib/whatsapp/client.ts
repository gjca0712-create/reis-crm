import path from "node:path";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,
  normalizeMessageContent,
  proto,
  toNumber,
  WAMessageStubType,
  type AnyMessageContent,
  type BinaryNode,
  type WASocket,
  type WAMessage,
  type WAMessageUpdate,
} from "@whiskeysockets/baileys";
import type { Boom } from "@hapi/boom";
import pino from "pino";
import { onlyDigits } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import {
  processInboundWhatsAppMessage,
  processOutboundFromPhone,
  normalizeIncomingPhone,
  findPhoneByWhatsAppLid,
  applyWhatsAppRevoke,
  applyWhatsAppEdit,
} from "./inbound";
import { WHATSAPP_LINE_IDS, type WhatsAppLineId } from "./lines";
import { saveMediaBuffer, mediaCategoryFromMimetype, type MediaCategory } from "./media";

// Conexão "estilo WhatsApp Web" via Baileys (protocolo não-oficial). Isso NÃO é a
// API oficial da Meta — aqui a gente pareia com um número real via QR code, como
// o WhatsApp Web faz. Uso não-oficial viola os termos do WhatsApp e pode levar o
// número a ser bloqueado; é comum entre pequenos negócios, mas o risco é real e
// do número conectado. A loja usa DUAS linhas (lib/whatsapp/lines.ts): cada uma
// tem seu próprio socket, sua pasta de credencial (.wa-auth/<linha>/) e seu QR.

export type WhatsAppStatus = "disconnected" | "connecting" | "qr" | "connected";

type WhatsAppRuntime = {
  socket: WASocket | null;
  status: WhatsAppStatus;
  qr: string | null;
  phoneNumber: string | null;
  starting: boolean;
  // Incrementa a cada tentativa (e no cancelamento) — uma tentativa antiga que
  // termine depois (ex.: busca de versão lenta) vê que não é mais a atual e desiste.
  attempt: number;
  // Quedas seguidas sem nunca chegar a QR/conectado — pra parar o loop de
  // reconexão em vez de ficar em "Conectando..." pra sempre.
  failuresBeforeReady: number;
  // Motivo da última falha, mostrado na tela (sem acesso fácil aos logs).
  lastError: string | null;
};

// globalThis para sobreviver ao hot-reload do Next em dev, igual ao lib/prisma.ts.
const globalForWa = globalThis as unknown as {
  __waRuntimes?: Map<string, WhatsAppRuntime>;
  __waSentMessages?: Map<string, proto.IMessage>;
  __waProcessedPhoneReplies?: Set<string>;
};
const runtimes: Map<string, WhatsAppRuntime> = globalForWa.__waRuntimes ?? (globalForWa.__waRuntimes = new Map());

// Conteúdo das mensagens enviadas, usado pelo `getMessage` do socket (ver
// startWhatsAppConnection). Sem isso, quando o WhatsApp de quem recebe pede
// reenvio por falha de descriptografia, o Baileys não tem o que reenviar e a
// mensagem fica travada como "Aguardando mensagem" pra sempre. Em memória (as
// últimas 500, pro pedido que chega na hora) e no banco (WaSentPayload, pro que
// chega depois de um deploy/restart — cliente estava sem internet, por ex.).
const MAX_SENT_MESSAGES_CACHED = 500;
const SENT_PAYLOAD_KEEP_MS = 14 * 24 * 60 * 60_000;
const sentMessages: Map<string, proto.IMessage> =
  globalForWa.__waSentMessages ?? (globalForWa.__waSentMessages = new Map());

function cacheSentContent(id: string, message: proto.IMessage): void {
  sentMessages.delete(id);
  sentMessages.set(id, message);
  if (sentMessages.size > MAX_SENT_MESSAGES_CACHED) {
    const oldest = sentMessages.keys().next().value;
    if (oldest) sentMessages.delete(oldest);
  }
}

// Grava no banco em segundo plano: o envio não espera, e o cache em memória
// cobre o pedido de reenvio que chegue logo em seguida.
function persistSentContent(line: WhatsAppLineId, id: string, message: proto.IMessage): void {
  let payload: Buffer;
  try {
    payload = Buffer.from(proto.Message.encode(message).finish());
  } catch (err) {
    console.error(`Erro ao preparar cópia da mensagem enviada ${id} (${line}):`, err);
    return;
  }
  void prisma.waSentPayload
    .upsert({ where: { id }, create: { id, line, payload }, update: { payload } })
    .catch((err) => console.error(`Erro ao guardar cópia da mensagem enviada ${id} (${line}):`, err));
}

function rememberSentMessage(line: WhatsAppLineId, msg: WAMessage | undefined): void {
  const id = msg?.key?.id;
  if (!id || !msg.message) return;
  cacheSentContent(id, msg.message);
  persistSentContent(line, id, msg.message);
}

// Depois de editar/apagar, um pedido de reenvio atrasado da mensagem original
// não pode mandar o texto antigo de novo (nem "desapagar" a mensagem).
function replaceSentContent(line: WhatsAppLineId, id: string, message: proto.IMessage): void {
  cacheSentContent(id, message);
  persistSentContent(line, id, message);
}

// Ids apagados neste processo: cobre o intervalo entre apagar no WhatsApp e
// marcar deletedAt no Message, e um deleteMany que falhe.
const revokedSentIds = new Set<string>();

function forgetSentMessage(id: string): void {
  sentMessages.delete(id);
  revokedSentIds.add(id);
  if (revokedSentIds.size > MAX_SENT_MESSAGES_CACHED) {
    const oldest = revokedSentIds.values().next().value;
    if (oldest) revokedSentIds.delete(oldest);
  }
  void prisma.waSentPayload
    .deleteMany({ where: { id } })
    .catch((err) => console.error(`Erro ao descartar cópia da mensagem ${id}:`, err));
}

// getMessage do socket. Loga cada pedido de reenvio com o resultado — é o
// que mostra nos logs do Railway ([wa-reenvio]) por que uma mensagem ficou em
// "Aguardando mensagem" (o Baileys só loga isso em nível debug).
async function findSentMessage(line: WhatsAppLineId, key: proto.IMessageKey): Promise<proto.IMessage | undefined> {
  const id = key.id;
  if (!id) return undefined;
  const what = `(${line}) mensagem ${id} pedida por ${key.participant || key.remoteJid}`;

  if (revokedSentIds.has(id)) {
    console.warn(`[wa-reenvio] ${what}: mensagem apagada — não reenvia`);
    return undefined;
  }
  const cached = sentMessages.get(id);
  if (cached) {
    console.warn(`[wa-reenvio] ${what}: reenviando (memória)`);
    return cached;
  }
  // Separado da busca no Message abaixo: um erro aqui (tabela ainda não
  // criada, banco instável) não pode impedir o reenvio pelo texto do histórico.
  try {
    const row = await prisma.waSentPayload.findUnique({ where: { id }, select: { payload: true } });
    if (row) {
      const deleted = await prisma.message.findFirst({
        where: { direction: "OUT", waMessageId: id, deletedAt: { not: null } },
        select: { id: true },
      });
      if (deleted) {
        console.warn(`[wa-reenvio] ${what}: mensagem apagada — não reenvia`);
        return undefined;
      }
      console.warn(`[wa-reenvio] ${what}: reenviando (banco)`);
      return proto.Message.decode(row.payload);
    }
  } catch (err) {
    console.error(`[wa-reenvio] ${what}: erro ao buscar a cópia guardada:`, err);
  }
  try {
    // Mandada antes dessa cópia existir: texto puro dá pra refazer pelo Message.
    const message = await prisma.message.findFirst({
      where: { direction: "OUT", deletedAt: null, OR: [{ waMessageId: id, mediaType: null }, { waCaptionMessageId: id }] },
      select: { body: true },
    });
    if (message?.body) {
      console.warn(`[wa-reenvio] ${what}: reenviando (texto do histórico)`);
      return { conversation: message.body };
    }
  } catch (err) {
    console.error(`[wa-reenvio] ${what}: erro ao buscar a mensagem:`, err);
  }
  console.warn(`[wa-reenvio] ${what}: mensagem não encontrada — fica em "Aguardando mensagem" pra quem pediu`);
  return undefined;
}

// Uma vez por processo: descarta as cópias com mais de 14 dias.
let prunedSentPayloads = false;
function pruneOldSentPayloads(): void {
  if (prunedSentPayloads) return;
  prunedSentPayloads = true;
  void prisma.waSentPayload
    .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - SENT_PAYLOAD_KEEP_MS) } } })
    .catch((err) => console.error("Erro ao limpar cópias antigas de mensagens enviadas:", err));
}

// Registra resposta mandada direto do celular pareado (fora do notify normal
// — ver comentário no listener de messages.upsert). Guarda o id de quem já
// foi processado pra não duplicar: uma reconexão pode reenviar a mesma
// mensagem de sincronia de novo, e sem isso ela entraria de novo no CRM.
const MAX_PROCESSED_PHONE_REPLIES = 500;
const processedPhoneReplyIds: Set<string> =
  globalForWa.__waProcessedPhoneReplies ?? (globalForWa.__waProcessedPhoneReplies = new Set());

function alreadyProcessedPhoneReply(id: string | undefined): boolean {
  if (!id) return false;
  if (processedPhoneReplyIds.has(id)) return true;
  processedPhoneReplyIds.add(id);
  if (processedPhoneReplyIds.size > MAX_PROCESSED_PHONE_REPLIES) {
    const oldest = processedPhoneReplyIds.values().next().value;
    if (oldest) processedPhoneReplyIds.delete(oldest);
  }
  return false;
}

function runtimeFor(line: WhatsAppLineId): WhatsAppRuntime {
  let r = runtimes.get(line);
  if (!r) {
    r = {
      socket: null,
      status: "disconnected",
      qr: null,
      phoneNumber: null,
      starting: false,
      attempt: 0,
      failuresBeforeReady: 0,
      lastError: null,
    };
    runtimes.set(line, r);
  }
  // Em dev o Map sobrevive ao hot-reload com objetos de antes desses campos existirem.
  r.attempt ??= 0;
  r.failuresBeforeReady ??= 0;
  r.lastError ??= null;
  return r;
}

function authDir(line: WhatsAppLineId): string {
  return path.join(process.cwd(), ".wa-auth", line);
}

// WA_LOG_LEVEL=info (ou debug) no Railway mostra os logs internos do Baileys
// quando precisar investigar entrega de mensagem. Valor que o pino não conhece
// (ex.: "warning") derrubaria o módulo inteiro ao carregar — cai no "warn".
const logger = pino({ level: waLogLevel(process.env.WA_LOG_LEVEL) });

function waLogLevel(value: string | undefined): string {
  const level = value?.trim().toLowerCase();
  if (!level) return "warn";
  if (level in pino.levels.values || level === "silent") return level;
  console.warn(`WA_LOG_LEVEL="${value}" não existe — usando "warn".`);
  return "warn";
}

// A versão do protocolo do WhatsApp Web muda com frequência; usar uma versão
// desatualizada (o padrão embutido no pacote) é uma causa clássica de mensagem
// "presa" no destinatário. Busca uma vez por processo e reaproveita — se a
// busca falhar (rede instável), cai no padrão do pacote em vez de travar a conexão.
// Timeout obrigatório: sem ele (o padrão do axios é esperar pra sempre), uma
// busca que pendura deixava a linha presa em "Conectando..." sem botão nenhum.
let cachedVersion: [number, number, number] | null = null;
async function getBaileysVersion(): Promise<[number, number, number] | undefined> {
  if (cachedVersion) return cachedVersion;
  try {
    const { version, isLatest } = await fetchLatestBaileysVersion({ timeout: 5000 });
    // Só guarda se veio mesmo da internet — o fallback do pacote não pode
    // ficar fixo o processo inteiro, a próxima tentativa busca de novo.
    if (isLatest) cachedVersion = version;
    return version;
  } catch {
    return undefined;
  }
}

// Quantas quedas seguidas antes de chegar a QR/conectado a gente tolera antes
// de desistir e mostrar o motivo na tela (evita "Conectando..." infinito).
const MAX_FAILURES_BEFORE_READY = 5;
// Rede de segurança: se uma tentativa ficar em "Conectando..." mais que isso
// sem QR nem conexão, é abandonada (o próprio Baileys já desiste do socket em 20s).
const CONNECT_WATCHDOG_MS = 60_000;

export function getWhatsAppState(line: WhatsAppLineId) {
  const r = runtimeFor(line);
  return { line, status: r.status, qr: r.qr, phoneNumber: r.phoneNumber, lastError: r.lastError };
}

export type WhatsAppLineState = ReturnType<typeof getWhatsAppState>;

export function getAllWhatsAppStates(): WhatsAppLineState[] {
  return WHATSAPP_LINE_IDS.map((line) => getWhatsAppState(line));
}

// true quando a linha já foi pareada alguma vez (credencial salva no volume).
export function hasPairedCredentials(line: WhatsAppLineId): boolean {
  return existsSync(path.join(authDir(line), "creds.json"));
}

// Chamado ao carregar a página de suporte: se a linha já foi pareada antes mas o
// socket caiu num deploy/restart do Railway (só vive em memória), religa sozinho.
export async function ensureWhatsAppStarted(line: WhatsAppLineId): Promise<void> {
  const r = runtimeFor(line);
  if (r.starting || r.status !== "disconnected") return;
  if (!hasPairedCredentials(line)) return;
  // Já desistiu depois de várias falhas seguidas — não fica religando a cada
  // atualização da página; volta a tentar quando alguém clicar em Conectar.
  if (r.failuresBeforeReady >= MAX_FAILURES_BEFORE_READY) return;
  await startWhatsAppConnection(line).catch((err) => {
    console.error(`Falha ao religar o WhatsApp (${line}) automaticamente:`, err);
  });
}

export async function ensureAllWhatsAppStarted(): Promise<void> {
  await Promise.all(WHATSAPP_LINE_IDS.map((line) => ensureWhatsAppStarted(line)));
}

// Abandona a tentativa atual (socket, QR, reconexão agendada) sem deslogar —
// credencial salva continua valendo. Com `reason`, é desistência por falha e o
// motivo aparece na tela; sem, é o atendente cancelando.
function abandonAttempt(line: WhatsAppLineId, reason: string | null): void {
  const r = runtimeFor(line);
  r.attempt += 1; // invalida timers/awaits pendentes da tentativa que está saindo
  const sock = r.socket;
  r.socket = null; // antes do end(): o "close" desse socket passa a ser ignorado
  r.status = "disconnected";
  r.qr = null;
  r.starting = false;
  r.lastError = reason;
  if (reason) console.warn(`WhatsApp (${line}): ${reason}`);
  try {
    sock?.end(undefined);
  } catch {
    // já fechado
  }
}

export function cancelWhatsAppConnection(line: WhatsAppLineId): void {
  const r = runtimeFor(line);
  if (r.status === "connected") return;
  abandonAttempt(line, null);
}

// `manual` = alguém clicou em Conectar: zera o contador de falhas, dando uma
// nova rodada de tentativas mesmo depois de ter desistido.
export async function startWhatsAppConnection(line: WhatsAppLineId, opts?: { manual?: boolean }): Promise<void> {
  const r = runtimeFor(line);
  if (r.starting || r.status === "connected") return;
  if (opts?.manual) {
    r.failuresBeforeReady = 0;
    r.lastError = null;
  }
  r.attempt += 1;
  const attempt = r.attempt;
  const isCurrent = () => r.attempt === attempt;
  r.starting = true;
  r.status = "connecting";
  r.qr = null;

  setTimeout(() => {
    if (isCurrent() && r.status === "connecting") {
      abandonAttempt(line, "Tempo esgotado tentando conectar ao WhatsApp. Clique em Conectar pra tentar de novo.");
    }
  }, CONNECT_WATCHDOG_MS);

  try {
    const { state, saveCreds } = await useMultiFileAuthState(authDir(line));
    const version = await getBaileysVersion();
    if (!isCurrent()) return; // cancelada/abandonada enquanto preparava

    // Chegou a mostrar QR ou conectar nesta tentativa — uma queda depois disso
    // é normal (ex.: o WhatsApp reinicia a conexão logo após ler o QR) e não
    // conta como falha.
    let reachedReady = false;

    pruneOldSentPayloads();
    const sock = makeWASocket({
      // Cache em memória das chaves de criptografia na frente dos arquivos —
      // configuração recomendada pelo Baileys.
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      logger,
      ...(version ? { version } : {}),
      // Ver comentário acima de `sentMessages` — sem isso, um pedido de
      // reenvio por falha de descriptografia não tem o que reenviar.
      getMessage: (key) => findSentMessage(line, key),
      // Sem o "eco" do que o próprio CRM manda (resposta, edição, apagar): quem
      // envia já grava na hora. Ligado (padrão do Baileys), o eco fica retido
      // no buffer de eventos até o próximo pacote do WhatsApp e sai junto com
      // ele num lote marcado "append" — e uma mensagem de cliente que caia
      // nesse mesmo lote seria descartada (só "notify" de cliente entra, ver
      // messages.upsert abaixo). Mensagem mandada pelo celular pareado chega
      // normal, não depende disso.
      emitOwnEvents: false,
    });
    r.socket = sock;

    // O celular de quem recebeu não conseguiu abrir uma mensagem nossa e pediu
    // reenvio. Só loga (quem reenvia é o próprio Baileys, via getMessage) — junto
    // com o [wa-reenvio] de findSentMessage, mostra de onde veio o pedido
    // (telefone ou @lid) e se deu pra reenviar.
    sock.ws.on("CB:receipt", (node: BinaryNode) => {
      if (node.attrs?.type === "retry") {
        console.warn(`[wa-reenvio] (${line}) pedido de reenvio recebido:`, JSON.stringify(node.attrs));
      }
    });

    sock.ev.on("creds.update", () => {
      if (r.socket === sock) void saveCreds();
    });

    sock.ev.on("connection.update", (update) => {
      // Socket antigo ainda fechando em segundo plano (ex.: logout seguido de
      // reconexão rápida) — sem isso, o "close" dele chega depois e sobrescreve
      // o estado de uma conexão nova já aberta, parecendo uma queda sozinha.
      if (r.socket !== sock) return;

      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        reachedReady = true;
        r.failuresBeforeReady = 0;
        r.lastError = null;
        r.qr = qr;
        r.status = "qr";
      }

      if (connection === "open") {
        reachedReady = true;
        r.failuresBeforeReady = 0;
        r.lastError = null;
        r.status = "connected";
        r.qr = null;
        r.starting = false;
        r.phoneNumber = sock.user?.id?.split(":")[0]?.split("@")[0] ?? null;
      }

      if (connection === "close") {
        r.status = "disconnected";
        r.socket = null;
        r.starting = false;
        r.qr = null;

        const error = lastDisconnect?.error as Boom | undefined;
        const statusCode = error?.output?.statusCode;
        console.warn(
          `WhatsApp (${line}) fechou a conexão: código ${statusCode ?? "?"} — ${error?.message ?? "sem detalhe"}`
        );

        // Aparelho removido pelo celular: a credencial salva não serve mais, e
        // mantê-la faria o próximo "Conectar" tentar logar com ela (e cair de
        // novo) em vez de mostrar um QR novo.
        if (statusCode === DisconnectReason.loggedOut) {
          r.lastError = "Este aparelho foi desconectado pelo celular. Clique em Conectar e leia o QR de novo.";
          void rm(authDir(line), { recursive: true, force: true }).catch(() => {});
          return;
        }

        if (!reachedReady) r.failuresBeforeReady += 1;
        if (r.failuresBeforeReady >= MAX_FAILURES_BEFORE_READY) {
          r.lastError = `O WhatsApp recusou a conexão ${r.failuresBeforeReady} vezes seguidas (código ${
            statusCode ?? "desconhecido"
          }). Clique em Conectar pra tentar de novo.`;
          return;
        }

        // Espera antes de tentar de novo — sem isso, se o WhatsApp ficar
        // derrubando o socket, isso vira um loop apertado de reconexão. Só
        // religa se ninguém cancelou/reiniciou nesse meio-tempo.
        const scheduledFrom = r.attempt;
        setTimeout(() => {
          if (r.attempt === scheduledFrom && r.status === "disconnected") void startWhatsAppConnection(line);
        }, 3000);
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (r.socket !== sock) return; // socket antigo — a conexão atual já reprocessa por conta própria
      // Mensagem de cliente de verdade só entra como "notify" (evita
      // reprocessar sincronia de histórico antigo toda vez que reconecta).
      // Resposta mandada direto do celular pareado (fromMe), porém, às
      // vezes chega como "append" em vez de "notify" — o WhatsApp não trata
      // sincronia entre aparelhos do mesmo dono como "notificação" — então
      // essa é liberada mesmo fora do notify (com dedupe por id, ver acima).
      const batch = messages.filter((msg) => type === "notify" || msg.key?.fromMe);
      // Marca o lote inteiro como "gravando" antes do primeiro await — ver inFlight.
      const finish = batch.map((msg) => markInFlight(line, msg.key?.id));
      for (const [i, msg] of batch.entries()) {
        await handleIncomingMessage(line, msg, sock)
          .catch((err) => {
            console.error(`Erro ao processar mensagem recebida do WhatsApp (${line}):`, err);
          })
          .finally(finish[i]);
      }
    });

    // Alguém apagou pra todos ou editou uma mensagem — o cliente (as dele) ou o
    // celular pareado (as nossas). O Baileys transforma o aviso do WhatsApp
    // nesse evento; o mesmo evento também traz recibo de entrega/leitura, que
    // é ignorado (ver handleMessageUpdate).
    sock.ev.on("messages.update", async (updates) => {
      if (r.socket !== sock) return;
      for (const u of updates) {
        await handleMessageUpdate(line, u).catch((err) => {
          console.error(`Erro ao aplicar mensagem apagada/editada no WhatsApp (${line}):`, err);
        });
      }
    });
  } catch (err) {
    console.error(`Falha ao iniciar a conexão do WhatsApp (${line}):`, err);
    if (isCurrent()) {
      abandonAttempt(
        line,
        `Não foi possível iniciar a conexão (${err instanceof Error ? err.message : String(err)}).`
      );
    }
  }
}

// "Desconectar" = desparear de vez: desloga no WhatsApp e apaga a credencial
// salva no volume, senão o próximo "Conectar" tentaria usar a credencial já
// invalidada em vez de mostrar um QR novo.
export async function disconnectWhatsApp(line: WhatsAppLineId): Promise<void> {
  const r = runtimeFor(line);
  const sock = r.socket;
  // Solta antes do logout: o "close" (loggedOut) que o próprio logout dispara
  // é ignorado, em vez de aparecer como "desconectado pelo celular".
  r.attempt += 1;
  r.socket = null;
  r.status = "disconnected";
  r.qr = null;
  r.phoneNumber = null;
  r.starting = false;
  r.lastError = null;
  r.failuresBeforeReady = 0;
  if (sock) {
    try {
      await sock.logout();
    } catch {
      // já desconectado — sem problema
    }
  }
  await rm(authDir(line), { recursive: true, force: true }).catch(() => {});
}

function jidFor(phone: string): string | null {
  // phone chega sempre no formato canônico de lib/phone.ts (DDD + número, SEM
  // DDI) — prefixar sempre, sem checar "já começa com 55", porque um cliente
  // de DDD 55 (Santa Maria/RS) teria o DDI adicionado errado se checássemos.
  const digits = onlyDigits(phone);
  // DDD (2) + fixo (8) ou celular (9) = 10 ou 11 dígitos. Fora disso é lixo
  // (ex.: um LID do WhatsApp salvo por engano antes da correção) — o Baileys
  // não valida o JID na hora de mandar, então sem essa checagem a mensagem
  // "sai" com sucesso e nunca chega em lugar nenhum, sem nenhum aviso.
  if (digits.length !== 10 && digits.length !== 11) return null;
  return `55${digits}@s.whatsapp.net`;
}

// Usado pela camada de UI pra distinguir, quando um envio falha, se foi por
// causa da linha desconectada ou de um número salvo inválido (ex.: lixo de
// LID de antes da correção) — os dois merecem avisos diferentes ao atendente.
export function isSendablePhone(phone: string): boolean {
  return jidFor(phone) !== null;
}

// Onde uma mensagem enviada ficou no WhatsApp — o que precisa pra apagar pra
// todos/editar depois (ver Message.waMessageId). captionId: a mensagem de texto
// separada que leva a legenda de um áudio.
export type WaMessageRef = { id: string; remoteJid: string; captionId?: string };
// ref pode faltar mesmo com sent=true (Baileys não devolveu a mensagem) — aí a
// mensagem só não poderá ser apagada/editada pelo CRM.
export type WaSendResult = { sent: boolean; ref: WaMessageRef | null };

const NOT_SENT: WaSendResult = { sent: false, ref: null };

function refOf(msg: WAMessage | undefined, jid: string): WaMessageRef | null {
  const id = msg?.key?.id;
  return id ? { id, remoteJid: msg?.key?.remoteJid || jid } : null;
}

// Limites do próprio WhatsApp: fora deles o aparelho do cliente simplesmente
// ignora o pedido, sem erro nenhum pra gente — então quem chama confere antes.
export const WHATSAPP_EDIT_WINDOW_MS = 15 * 60_000;
export const WHATSAPP_DELETE_WINDOW_MS = 2 * 24 * 60 * 60_000;

// Pra onde mandar uma mensagem nova pro cliente, em ordem de preferência.
// Cliente que já escreveu pra gente por @lid (identificador novo do WhatsApp,
// guardado em Customer.whatsappLid) recebe pelo @lid: o Baileys 6.7 guarda a
// criptografia de quem fala por @lid separada da do telefone, e responder pelo
// telefone fazia parte das mensagens ficar em "Aguardando mensagem" no celular
// do cliente (problema conhecido do Baileys — issues #1739/#1767). O telefone
// fica de reserva se o envio pelo @lid der erro. WHATSAPP_SEND_TO_LID=0 (variável
// no Railway) volta a mandar só pelo telefone.
function recipientJids(phone: string, lid?: string | null): string[] {
  const byLid = lid?.endsWith("@lid") && process.env.WHATSAPP_SEND_TO_LID !== "0" ? lid : null;
  return [byLid, jidFor(phone)].filter((jid): jid is string => Boolean(jid));
}

async function sendToFirstWorking(
  line: WhatsAppLineId,
  sock: WASocket,
  jids: string[],
  content: AnyMessageContent
): Promise<{ jid: string; sent: WAMessage | undefined } | null> {
  for (const [i, jid] of jids.entries()) {
    try {
      return { jid, sent: await sock.sendMessage(jid, content) };
    } catch (err) {
      const next = i < jids.length - 1 ? " — tentando pelo telefone" : "";
      console.error(`Erro ao enviar via WhatsApp (${line}) para ${jid}${next}:`, err);
    }
  }
  return null;
}

export async function sendWhatsAppText(
  line: WhatsAppLineId,
  phone: string,
  text: string,
  lid?: string | null
): Promise<WaSendResult> {
  const r = runtimeFor(line);
  if (!r.socket || r.status !== "connected") return NOT_SENT;

  const jids = recipientJids(phone, lid);
  if (!jids.length) {
    console.error(`Número inválido, não é possível enviar via WhatsApp (${line}):`, phone);
    return NOT_SENT;
  }

  const result = await sendToFirstWorking(line, r.socket, jids, { text });
  if (!result) return NOT_SENT;
  rememberSentMessage(line, result.sent);
  return { sent: true, ref: refOf(result.sent, result.jid) };
}

// Versão só "saiu ou não" (campanhas não guardam a mensagem).
export async function sendWhatsAppMessage(
  line: WhatsAppLineId,
  phone: string,
  text: string,
  lid?: string | null
): Promise<boolean> {
  return (await sendWhatsAppText(line, phone, text, lid)).sent;
}

export type OutboundMedia = {
  buffer: Buffer;
  mimetype: string;
  fileName?: string;
  caption?: string;
};

export async function sendWhatsAppMedia(
  line: WhatsAppLineId,
  phone: string,
  media: OutboundMedia,
  lid?: string | null
): Promise<WaSendResult> {
  const r = runtimeFor(line);
  if (!r.socket || r.status !== "connected") return NOT_SENT;
  const sock = r.socket;
  const jids = recipientJids(phone, lid);
  if (!jids.length) {
    console.error(`Número inválido, não é possível enviar mídia via WhatsApp (${line}):`, phone);
    return NOT_SENT;
  }
  const category = mediaCategoryFromMimetype(media.mimetype);
  // WhatsApp não aceita legenda em mensagem de áudio — vai como texto separado
  // logo em seguida (abaixo), senão o que o atendente digitou some sem avisar
  // (o Message.body fica registrado, mas nunca chegaria no cliente).
  const content: AnyMessageContent =
    category === "image"
      ? { image: media.buffer, mimetype: media.mimetype, caption: media.caption }
      : category === "video"
        ? { video: media.buffer, mimetype: media.mimetype, caption: media.caption }
        : category === "audio"
          ? { audio: media.buffer, mimetype: media.mimetype }
          : { document: media.buffer, mimetype: media.mimetype, fileName: media.fileName ?? "arquivo", caption: media.caption };

  try {
    const result = await sendToFirstWorking(line, sock, jids, content);
    if (!result) return NOT_SENT;
    rememberSentMessage(line, result.sent); // já saiu, mesmo que a legenda falhe logo abaixo

    let caption: WAMessage | undefined;
    if (category === "audio" && media.caption) {
      caption = await sock.sendMessage(result.jid, { text: media.caption });
      rememberSentMessage(line, caption);
    }

    const ref = refOf(result.sent, result.jid);
    const captionId = caption?.key?.id;
    return { sent: true, ref: ref && captionId ? { ...ref, captionId } : ref };
  } catch (err) {
    console.error(`Erro ao enviar mídia via WhatsApp (${line}):`, err);
    return NOT_SENT;
  }
}

// Chave de uma mensagem NOSSA naquela conversa, no formato que o WhatsApp
// espera num pedido de apagar/editar.
function ownKey(id: string, remoteJid: string): proto.IMessageKey {
  return { remoteJid, fromMe: true, id };
}

// "Apagar para todos". Some do celular do cliente também (dentro do prazo do
// WhatsApp — ver WHATSAPP_DELETE_WINDOW_MS).
export async function deleteWhatsAppMessageForEveryone(
  line: WhatsAppLineId,
  id: string,
  remoteJid: string
): Promise<boolean> {
  const r = runtimeFor(line);
  if (!r.socket || r.status !== "connected") return false;
  try {
    rememberSentMessage(line, await r.socket.sendMessage(remoteJid, { delete: ownKey(id, remoteJid) }));
    forgetSentMessage(id);
    return true;
  } catch (err) {
    console.error(`Erro ao apagar mensagem no WhatsApp (${line}):`, err);
    return false;
  }
}

// Troca o texto de uma mensagem de texto já enviada (aparece "Editada" pro
// cliente, igual no app). Só texto puro — ver quem chama.
export async function editWhatsAppMessage(
  line: WhatsAppLineId,
  id: string,
  remoteJid: string,
  text: string
): Promise<boolean> {
  const r = runtimeFor(line);
  if (!r.socket || r.status !== "connected") return false;
  try {
    rememberSentMessage(line, await r.socket.sendMessage(remoteJid, { text, edit: ownKey(id, remoteJid) }));
    replaceSentContent(line, id, { conversation: text });
    return true;
  } catch (err) {
    console.error(`Erro ao editar mensagem no WhatsApp (${line}):`, err);
    return false;
  }
}

// --- Tratamento de mensagens recebidas -----------------------------------------

// remoteJid às vezes vem como "@lid" (identificador anônimo que o WhatsApp
// passou a usar pra alguns contatos) em vez do número de telefone real — nesse
// caso o telefone de verdade vem em key.senderPn. Sem isso, o número salvo é
// lixo (o próprio LID) e a resposta nunca chega a lugar nenhum.
//
// Só serve pra mensagem de VERDADE do cliente (sender = cliente). Numa
// resposta mandada pelo celular pareado (fromMe), sender somos NÓS — usar essa
// função ali pegaria nosso próprio número (ou nada), nunca o do cliente. Ver
// resolvePhoneForOutboundReply, que trata esse outro caso.
function extractPhoneFromJid(key: { remoteJid?: string | null; senderPn?: string | null } | null | undefined): string | null {
  const jid = key?.senderPn || key?.remoteJid;
  if (!jid || jid.endsWith("@g.us") || jid.endsWith("@lid")) return null;
  return normalizeIncomingPhone(jid.split("@")[0].split(":")[0]);
}

// Telefone do CLIENTE numa resposta mandada direto do celular pareado
// (fromMe). Aqui o que importa é remoteJid (a conversa em si), nunca
// senderPn/senderLid (que descrevem quem mandou a mensagem — no caso, nós
// mesmos). Quando remoteJid é um @lid, só dá pra resolver o telefone de
// verdade se esse par lid<->cliente já foi visto antes numa mensagem recebida
// (ver processInboundWhatsAppMessage) — por isso praticamente toda resposta
// só funciona depois que o cliente já mandou pelo menos uma mensagem antes.
async function resolvePhoneForOutboundReply(remoteJid: string | null | undefined): Promise<string | null> {
  if (!remoteJid || remoteJid.endsWith("@g.us")) return null;
  if (remoteJid.endsWith("@lid")) return findPhoneByWhatsAppLid(remoteJid);
  return normalizeIncomingPhone(remoteJid.split("@")[0].split(":")[0]);
}

// Mensagens que ainda estão sendo gravadas (baixando mídia, esperando a fila
// do telefone em inbound.ts). Um "apagar pra todos"/"editar" que chegue nesse
// meio-tempo — cliente manda um vídeo grande e apaga logo em seguida — espera
// a gravação terminar; senão não acha a mensagem no banco e se perde, e o CRM
// mostraria pra sempre uma mensagem que o cliente apagou.
const inFlight = new Map<string, Promise<void>>();

function markInFlight(line: WhatsAppLineId, id: string | null | undefined): () => void {
  if (!id) return () => {};
  const key = `${line}:${id}`;
  let done!: () => void;
  const pending = new Promise<void>((resolve) => (done = resolve));
  inFlight.set(key, pending);
  return () => {
    done();
    if (inFlight.get(key) === pending) inFlight.delete(key);
  };
}

// Horário em que a mensagem saiu no WhatsApp (ver Message.waSentAt).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function whatsappSentAt(msg: any): Date | null {
  const seconds = toNumber(msg.messageTimestamp);
  return seconds > 0 ? new Date(Math.min(seconds * 1000, Date.now())) : null;
}

function textFromContent(m: proto.IMessage | null | undefined): string {
  if (!m) return "";
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    ""
  );
}

// normalizeMessageContent tira os invólucros (mensagem temporária, visualização
// única, mensagem editada enquanto o CRM estava fora do ar...) — sem isso o
// texto/mídia de dentro não é encontrado e a mensagem é ignorada.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractText(msg: any): string {
  return textFromContent(normalizeMessageContent(msg.message));
}

// Mensagem apagada pra todos (REVOKE) ou editada, já no formato que o Baileys
// emite (Utils/process-message.js): key.id é o da mensagem ORIGINAL e
// key.fromMe diz quem fez — true = nós (pelo celular pareado; o que o CRM faz
// ele mesmo grava, sem eco — ver emitOwnEvents), false = o cliente.
async function handleMessageUpdate(line: WhatsAppLineId, { key, update }: WAMessageUpdate) {
  const id = key?.id;
  if (!id) return;
  const fromMe = Boolean(key.fromMe);
  if (update.status === proto.WebMessageInfo.Status.ERROR) {
    console.warn(`[wa-envio] (${line}) o WhatsApp recusou a mensagem ${id} para ${key.remoteJid}`);
    return;
  }
  await inFlight.get(`${line}:${id}`);

  // Apagada/editada pelo celular pareado: a cópia guardada pro reenvio
  // acompanha, igual quando o CRM apaga/edita (ver replaceSentContent).
  if (update.messageStubType === WAMessageStubType.REVOKE) {
    if (fromMe) forgetSentMessage(id);
    await applyWhatsAppRevoke(line, id, fromMe);
    return;
  }

  const edited = update.message?.editedMessage?.message;
  if (edited) {
    const content = normalizeMessageContent(edited);
    const text = textFromContent(content);
    if (!text) return;
    // Só texto puro: numa legenda editada a cópia é a mídia inteira.
    if (fromMe && (content?.conversation || content?.extendedTextMessage)) {
      replaceSentContent(line, id, { conversation: text });
    }
    await applyWhatsAppEdit(line, id, fromMe, text);
  }
}

type ExtractedMedia = {
  buffer: Buffer;
  mimetype: string;
  category: MediaCategory;
  fileName?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function extractMedia(msg: any, sock: WASocket): Promise<ExtractedMedia | null> {
  const m = normalizeMessageContent(msg.message);
  const inner = m?.imageMessage || m?.videoMessage || m?.documentMessage || m?.audioMessage;
  if (!inner) return null;

  const mimetype = inner.mimetype || "application/octet-stream";
  // Classifica pelo mimetype, igual ao envio (mediaCategoryFromMimetype) —
  // um cliente pode mandar um áudio como "documento" em vez de nota de voz
  // (m.documentMessage preenchido, mas mimetype "audio/..."); classificar
  // pelo campo do Baileys faria isso virar link de download em vez de player.
  const kind: MediaCategory = mediaCategoryFromMimetype(mimetype);

  try {
    const buffer = await downloadMediaMessage(msg as WAMessage, "buffer", {}, {
      logger,
      reuploadRequest: sock.updateMediaMessage,
    });
    return {
      buffer,
      mimetype,
      category: kind,
      fileName: m?.documentMessage?.fileName ?? undefined,
    };
  } catch (err) {
    console.error("Erro ao baixar mídia recebida do WhatsApp:", err);
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleReplyFromPhone(line: WhatsAppLineId, msg: any, sock: WASocket) {
  // Eco da própria mensagem que o CRM mandou (sendSupportReply etc.) — essa já
  // foi registrada na hora pela action. Com emitOwnEvents desligado não deve
  // chegar, fica como garantia (a action grava sem conferir duplicata).
  const id: string | undefined = msg.key?.id;
  if (id && sentMessages.has(id)) return;
  if (alreadyProcessedPhoneReply(id)) return;

  const phone = await resolvePhoneForOutboundReply(msg.key?.remoteJid);
  if (!phone) return;

  const text = extractText(msg);
  const media = await extractMedia(msg, sock);
  if (!text && !media) return;

  const wa = { waMessageId: id ?? null, waRemoteJid: msg.key?.remoteJid ?? null, waSentAt: whatsappSentAt(msg) };
  if (!media) {
    await processOutboundFromPhone(line, phone, text, wa);
    return;
  }

  const savedName = await saveMediaBuffer(media.buffer, media.mimetype, media.fileName);
  await processOutboundFromPhone(line, phone, text, {
    ...wa,
    media: {
      url: savedName,
      type: media.category,
      mimeType: media.mimetype,
      fileName: media.fileName,
    },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleIncomingMessage(line: WhatsAppLineId, msg: any, sock: WASocket) {
  if (msg.key?.fromMe) {
    await handleReplyFromPhone(line, msg, sock);
    return;
  }
  const phone = extractPhoneFromJid(msg.key);
  if (!phone) return;

  const text = extractText(msg);
  const media = await extractMedia(msg, sock);
  if (!text && !media) return;

  // pushName: nome que a própria pessoa colocou no perfil do WhatsApp dela —
  // é isso que o WhatsApp Web mostra pra contato ainda não salvo na agenda.
  const pushName: string | null = msg.pushName || null;
  // Guarda o par lid<->telefone (quando essa conversa usa @lid) pra permitir
  // reconhecer depois uma resposta mandada direto do celular pareado — ver
  // resolvePhoneForOutboundReply — e pra mandar as próximas pelo @lid (ver
  // recipientJids). Numa conversa pelo telefone o WhatsApp às vezes manda o
  // @lid junto (sender_lid); sem nenhum, lid = null apaga o guardado: o
  // cliente passou a escrever pelo telefone (ou o número mudou de dono).
  const remoteJid: string | undefined = msg.key?.remoteJid;
  const senderLid: string | undefined = msg.key?.senderLid;
  const lid = remoteJid?.endsWith("@lid")
    ? remoteJid
    : senderLid?.endsWith("@lid")
      ? jidNormalizedUser(senderLid)
      : null;
  const extras = {
    pushName,
    lid,
    waMessageId: msg.key?.id ?? null,
    waRemoteJid: remoteJid ?? null,
    waSentAt: whatsappSentAt(msg),
  };

  if (!media) {
    await processInboundWhatsAppMessage(line, phone, text, extras);
    return;
  }

  const savedName = await saveMediaBuffer(media.buffer, media.mimetype, media.fileName);
  await processInboundWhatsAppMessage(line, phone, text, {
    ...extras,
    media: {
      url: savedName,
      type: media.category,
      mimeType: media.mimetype,
      fileName: media.fileName,
    },
  });
}
