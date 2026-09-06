import path from "node:path";
import makeWASocket, { useMultiFileAuthState, DisconnectReason, type WASocket } from "@whiskeysockets/baileys";
import type { Boom } from "@hapi/boom";
import pino from "pino";
import { onlyDigits } from "@/lib/format";
import { processInboundWhatsAppMessage, normalizeIncomingPhone } from "./inbound";

// Conexão "estilo WhatsApp Web" via Baileys (protocolo não-oficial). Isso NÃO é a
// API oficial da Meta usada em /whatsapp/campanhas — aqui a gente pareia com um
// número real via QR code, como o WhatsApp Web faz. Uso não-oficial viola os
// termos de uso do WhatsApp e pode levar o número a ser bloqueado; é uma prática
// comum entre pequenos negócios, mas o risco é real e do número conectado.

export type WhatsAppStatus = "disconnected" | "connecting" | "qr" | "connected";

type WhatsAppRuntime = {
  socket: WASocket | null;
  status: WhatsAppStatus;
  qr: string | null;
  phoneNumber: string | null;
  starting: boolean;
};

// globalThis para sobreviver ao hot-reload do Next em dev, igual ao lib/prisma.ts.
const globalForWa = globalThis as unknown as { __waRuntime?: WhatsAppRuntime };

const runtime: WhatsAppRuntime =
  globalForWa.__waRuntime ??
  (globalForWa.__waRuntime = {
    socket: null,
    status: "disconnected",
    qr: null,
    phoneNumber: null,
    starting: false,
  });

const AUTH_DIR = path.join(process.cwd(), ".wa-auth");
const logger = pino({ level: "warn" });

export function getWhatsAppState() {
  return { status: runtime.status, qr: runtime.qr, phoneNumber: runtime.phoneNumber };
}

export async function startWhatsAppConnection(): Promise<void> {
  if (runtime.starting || runtime.status === "connected") return;
  runtime.starting = true;
  runtime.status = "connecting";

  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    const sock = makeWASocket({
      auth: state,
      logger,
    });
    runtime.socket = sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        runtime.qr = qr;
        runtime.status = "qr";
      }

      if (connection === "open") {
        runtime.status = "connected";
        runtime.qr = null;
        runtime.starting = false;
        runtime.phoneNumber = sock.user?.id?.split(":")[0]?.split("@")[0] ?? null;
      }

      if (connection === "close") {
        runtime.status = "disconnected";
        runtime.socket = null;
        runtime.starting = false;

        const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        if (!loggedOut) {
          void startWhatsAppConnection();
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const msg of messages) {
        await handleIncomingMessage(msg).catch((err) => {
          console.error("Erro ao processar mensagem recebida do WhatsApp:", err);
        });
      }
    });
  } catch (err) {
    runtime.status = "disconnected";
    runtime.starting = false;
    throw err;
  }
}

export async function disconnectWhatsApp(): Promise<void> {
  if (runtime.socket) {
    try {
      await runtime.socket.logout();
    } catch {
      // já desconectado — sem problema
    }
  }
  runtime.socket = null;
  runtime.status = "disconnected";
  runtime.qr = null;
  runtime.phoneNumber = null;
}

export async function sendWhatsAppMessage(phone: string, text: string): Promise<boolean> {
  if (!runtime.socket || runtime.status !== "connected") return false;
  const digits = onlyDigits(phone);
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  const jid = `${withCountry}@s.whatsapp.net`;

  try {
    await runtime.socket.sendMessage(jid, { text });
    return true;
  } catch (err) {
    console.error("Erro ao enviar mensagem via WhatsApp:", err);
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
async function handleIncomingMessage(msg: any) {
  if (msg.key?.fromMe) return;
  const phone = extractPhoneFromJid(msg.key?.remoteJid);
  if (!phone) return;
  const text = extractText(msg);
  if (!text) return;

  await processInboundWhatsAppMessage(phone, text);
}
