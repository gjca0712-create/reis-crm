import path from "node:path";
import { existsSync } from "node:fs";
import makeWASocket, { useMultiFileAuthState, DisconnectReason, type WASocket } from "@whiskeysockets/baileys";
import type { Boom } from "@hapi/boom";
import pino from "pino";
import { onlyDigits } from "@/lib/format";
import { processInboundWhatsAppMessage, normalizeIncomingPhone } from "./inbound";
import { WHATSAPP_LINE_IDS, type WhatsAppLineId } from "./lines";

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
const globalForWa = globalThis as unknown as { __waRuntimes?: Map<string, WhatsAppRuntime> };
const runtimes: Map<string, WhatsAppRuntime> = globalForWa.__waRuntimes ?? (globalForWa.__waRuntimes = new Map());

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

    const sock = makeWASocket({ auth: state, logger });
    r.socket = sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
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
      if (type !== "notify") return;
      for (const msg of messages) {
        await handleIncomingMessage(line, msg).catch((err) => {
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

export async function sendWhatsAppMessage(line: WhatsAppLineId, phone: string, text: string): Promise<boolean> {
  const r = runtimeFor(line);
  if (!r.socket || r.status !== "connected") return false;
  const digits = onlyDigits(phone);
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  const jid = `${withCountry}@s.whatsapp.net`;

  try {
    await r.socket.sendMessage(jid, { text });
    return true;
  } catch (err) {
    console.error(`Erro ao enviar mensagem via WhatsApp (${line}):`, err);
    return false;
  }
}

// --- Tratamento de mensagens recebidas -----------------------------------------

function extractPhoneFromJid(jid: string | null | undefined): string | null {
  if (!jid || jid.endsWith("@g.us")) return null; // ignora mensagens de grupo
  return normalizeIncomingPhone(jid.split("@")[0].split(":")[0]);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractText(msg: any): string | null {
  const m = msg.message;
  if (!m) return null;
  return m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleIncomingMessage(line: WhatsAppLineId, msg: any) {
  if (msg.key?.fromMe) return;
  const phone = extractPhoneFromJid(msg.key?.remoteJid);
  if (!phone) return;
  const text = extractText(msg);
  if (!text) return;

  await processInboundWhatsAppMessage(line, phone, text);
}
