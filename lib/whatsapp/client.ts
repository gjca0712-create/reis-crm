import path from "node:path";
import { existsSync } from "node:fs";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  type WASocket,
  type WAMessage,
  type proto,
} from "@whiskeysockets/baileys";
import type { Boom } from "@hapi/boom";
import pino from "pino";
import { onlyDigits } from "@/lib/format";
import { processInboundWhatsAppMessage, processOutboundFromPhone, normalizeIncomingPhone } from "./inbound";
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
};

// globalThis para sobreviver ao hot-reload do Next em dev, igual ao lib/prisma.ts.
const globalForWa = globalThis as unknown as {
  __waRuntimes?: Map<string, WhatsAppRuntime>;
  __waSentMessages?: Map<string, proto.IMessage>;
  __waProcessedPhoneReplies?: Set<string>;
};
const runtimes: Map<string, WhatsAppRuntime> = globalForWa.__waRuntimes ?? (globalForWa.__waRuntimes = new Map());

// Cache do conteúdo das últimas mensagens enviadas, usado pelo `getMessage` do
// socket (ver startWhatsAppConnection). Sem isso, quando o WhatsApp de quem
// recebe pede reenvio por falha de descriptografia, o Baileys não tem o que
// reenviar e a mensagem fica travada como "Aguardando mensagem" pra sempre.
const MAX_SENT_MESSAGES_CACHED = 500;
const sentMessages: Map<string, proto.IMessage> =
  globalForWa.__waSentMessages ?? (globalForWa.__waSentMessages = new Map());

function rememberSentMessage(msg: WAMessage | undefined): void {
  const id = msg?.key?.id;
  if (!id || !msg.message) return;
  sentMessages.delete(id);
  sentMessages.set(id, msg.message);
  if (sentMessages.size > MAX_SENT_MESSAGES_CACHED) {
    const oldest = sentMessages.keys().next().value;
    if (oldest) sentMessages.delete(oldest);
  }
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
    r = { socket: null, status: "disconnected", qr: null, phoneNumber: null, starting: false };
    runtimes.set(line, r);
  }
  return r;
}

function authDir(line: WhatsAppLineId): string {
  return path.join(process.cwd(), ".wa-auth", line);
}

const logger = pino({ level: "warn" });

// A versão do protocolo do WhatsApp Web muda com frequência; usar uma versão
// desatualizada (o padrão embutido no pacote) é uma causa clássica de mensagem
// "presa" no destinatário. Busca uma vez por processo e reaproveita — se a
// busca falhar (rede instável), cai no padrão do pacote em vez de travar a conexão.
let cachedVersion: [number, number, number] | null = null;
async function getBaileysVersion(): Promise<[number, number, number] | undefined> {
  if (cachedVersion) return cachedVersion;
  try {
    const { version } = await fetchLatestBaileysVersion();
    cachedVersion = version;
    return version;
  } catch {
    return undefined;
  }
}

export function getWhatsAppState(line: WhatsAppLineId) {
  const r = runtimeFor(line);
  return { line, status: r.status, qr: r.qr, phoneNumber: r.phoneNumber };
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
  await startWhatsAppConnection(line).catch((err) => {
    console.error(`Falha ao religar o WhatsApp (${line}) automaticamente:`, err);
  });
}

export async function ensureAllWhatsAppStarted(): Promise<void> {
  await Promise.all(WHATSAPP_LINE_IDS.map((line) => ensureWhatsAppStarted(line)));
}

export async function startWhatsAppConnection(line: WhatsAppLineId): Promise<void> {
  const r = runtimeFor(line);
  if (r.starting || r.status === "connected") return;
  r.starting = true;
  r.status = "connecting";

  try {
    const { state, saveCreds } = await useMultiFileAuthState(authDir(line));
    const version = await getBaileysVersion();

    const sock = makeWASocket({
      auth: state,
      logger,
      ...(version ? { version } : {}),
      // Ver comentário acima de `sentMessages` — sem isso, um pedido de
      // reenvio por falha de descriptografia não tem o que reenviar.
      getMessage: async (key) => (key.id ? sentMessages.get(key.id) : undefined),
    });
    r.socket = sock;

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
        r.qr = qr;
        r.status = "qr";
      }

      if (connection === "open") {
        r.status = "connected";
        r.qr = null;
        r.starting = false;
        r.phoneNumber = sock.user?.id?.split(":")[0]?.split("@")[0] ?? null;
      }

      if (connection === "close") {
        r.status = "disconnected";
        r.socket = null;
        r.starting = false;

        const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        // Espera antes de tentar de novo — sem isso, se o WhatsApp ficar
        // derrubando o socket, isso vira um loop apertado de reconexão.
        if (!loggedOut) {
          setTimeout(() => void startWhatsAppConnection(line), 3000);
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (r.socket !== sock) return; // socket antigo — a conexão atual já reprocessa por conta própria
      for (const msg of messages) {
        // Mensagem de cliente de verdade só entra como "notify" (evita
        // reprocessar sincronia de histórico antigo toda vez que reconecta).
        // Resposta mandada direto do celular pareado (fromMe), porém, às
        // vezes chega como "append" em vez de "notify" — o WhatsApp não trata
        // sincronia entre aparelhos do mesmo dono como "notificação" — então
        // essa é liberada mesmo fora do notify (com dedupe por id, ver acima).
        if (type !== "notify" && !msg.key?.fromMe) continue;
        await handleIncomingMessage(line, msg, sock).catch((err) => {
          console.error(`Erro ao processar mensagem recebida do WhatsApp (${line}):`, err);
        });
      }
    });
  } catch (err) {
    r.status = "disconnected";
    r.starting = false;
    throw err;
  }
}

export async function disconnectWhatsApp(line: WhatsAppLineId): Promise<void> {
  const r = runtimeFor(line);
  if (r.socket) {
    try {
      await r.socket.logout();
    } catch {
      // já desconectado — sem problema
    }
  }
  r.socket = null;
  r.status = "disconnected";
  r.qr = null;
  r.phoneNumber = null;
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

export async function sendWhatsAppMessage(line: WhatsAppLineId, phone: string, text: string): Promise<boolean> {
  const r = runtimeFor(line);
  if (!r.socket || r.status !== "connected") return false;

  const jid = jidFor(phone);
  if (!jid) {
    console.error(`Número inválido, não é possível enviar via WhatsApp (${line}):`, phone);
    return false;
  }

  try {
    const sent = await r.socket.sendMessage(jid, { text });
    rememberSentMessage(sent);
    return true;
  } catch (err) {
    console.error(`Erro ao enviar mensagem via WhatsApp (${line}):`, err);
    return false;
  }
}

export type OutboundMedia = {
  buffer: Buffer;
  mimetype: string;
  fileName?: string;
  caption?: string;
};

export async function sendWhatsAppMedia(line: WhatsAppLineId, phone: string, media: OutboundMedia): Promise<boolean> {
  const r = runtimeFor(line);
  if (!r.socket || r.status !== "connected") return false;
  const jid = jidFor(phone);
  if (!jid) {
    console.error(`Número inválido, não é possível enviar mídia via WhatsApp (${line}):`, phone);
    return false;
  }
  const category = mediaCategoryFromMimetype(media.mimetype);

  try {
    if (category === "image") {
      rememberSentMessage(
        await r.socket.sendMessage(jid, { image: media.buffer, mimetype: media.mimetype, caption: media.caption })
      );
    } else if (category === "video") {
      rememberSentMessage(
        await r.socket.sendMessage(jid, { video: media.buffer, mimetype: media.mimetype, caption: media.caption })
      );
    } else if (category === "audio") {
      // WhatsApp não aceita legenda em mensagem de áudio — manda como texto
      // separado logo em seguida, senão o que o atendente digitou some sem
      // avisar (o Message.body fica registrado, mas nunca chegaria no cliente).
      rememberSentMessage(await r.socket.sendMessage(jid, { audio: media.buffer, mimetype: media.mimetype }));
      if (media.caption) {
        rememberSentMessage(await r.socket.sendMessage(jid, { text: media.caption }));
      }
    } else {
      rememberSentMessage(
        await r.socket.sendMessage(jid, {
          document: media.buffer,
          mimetype: media.mimetype,
          fileName: media.fileName ?? "arquivo",
          caption: media.caption,
        })
      );
    }
    return true;
  } catch (err) {
    console.error(`Erro ao enviar mídia via WhatsApp (${line}):`, err);
    return false;
  }
}

// --- Tratamento de mensagens recebidas -----------------------------------------

// remoteJid às vezes vem como "@lid" (identificador anônimo que o WhatsApp
// passou a usar pra alguns contatos) em vez do número de telefone real — nesse
// caso o telefone de verdade vem em key.senderPn. Sem isso, o número salvo é
// lixo (o próprio LID) e a resposta nunca chega a lugar nenhum.
function extractPhoneFromJid(key: { remoteJid?: string | null; senderPn?: string | null } | null | undefined): string | null {
  const jid = key?.senderPn || key?.remoteJid;
  if (!jid || jid.endsWith("@g.us") || jid.endsWith("@lid")) return null;
  return normalizeIncomingPhone(jid.split("@")[0].split(":")[0]);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractText(msg: any): string {
  const m = msg.message;
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

type ExtractedMedia = {
  buffer: Buffer;
  mimetype: string;
  category: MediaCategory;
  fileName?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function extractMedia(msg: any, sock: WASocket): Promise<ExtractedMedia | null> {
  const m = msg.message;
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
      fileName: inner.fileName ?? undefined,
    };
  } catch (err) {
    console.error("Erro ao baixar mídia recebida do WhatsApp:", err);
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleReplyFromPhone(line: WhatsAppLineId, msg: any, sock: WASocket) {
  // Eco da própria mensagem que o CRM mandou (sendSupportReply etc.) — essa já
  // foi registrada na hora pela action; sem essa checagem duplicaria toda
  // resposta enviada pelo CRM.
  const id: string | undefined = msg.key?.id;
  if (id && sentMessages.has(id)) return;
  if (alreadyProcessedPhoneReply(id)) return;

  const phone = extractPhoneFromJid(msg.key);
  if (!phone) return;

  const text = extractText(msg);
  const media = await extractMedia(msg, sock);
  if (!text && !media) return;

  if (!media) {
    await processOutboundFromPhone(line, phone, text);
    return;
  }

  const savedName = await saveMediaBuffer(media.buffer, media.mimetype, media.fileName);
  await processOutboundFromPhone(line, phone, text, {
    url: savedName,
    type: media.category,
    mimeType: media.mimetype,
    fileName: media.fileName,
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

  if (!media) {
    await processInboundWhatsAppMessage(line, phone, text, undefined, pushName);
    return;
  }

  const savedName = await saveMediaBuffer(media.buffer, media.mimetype, media.fileName);
  await processInboundWhatsAppMessage(
    line,
    phone,
    text,
    {
      url: savedName,
      type: media.category,
      mimeType: media.mimetype,
      fileName: media.fileName,
    },
    pushName
  );
}
