import path from "node:path";
import { promises as fs } from "node:fs";
import crypto from "node:crypto";

// Reaproveita o mesmo volume persistente do Railway que já guarda a credencial
// do WhatsApp (.wa-auth) — o serviço só tem um volume montado, em /app/.wa-auth.
const MEDIA_DIR = path.join(process.cwd(), ".wa-auth", "media");

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "application/pdf": "pdf",
};

export const MIME_BY_EXT: Record<string, string> = Object.fromEntries(
  Object.entries(EXT_BY_MIME).map(([mime, ext]) => [ext, mime])
);

export type MediaCategory = "image" | "video" | "audio" | "document";

export function mediaCategoryFromMimetype(mimetype: string): MediaCategory {
  if (mimetype.startsWith("image/")) return "image";
  if (mimetype.startsWith("video/")) return "video";
  if (mimetype.startsWith("audio/")) return "audio";
  return "document";
}

function extensionFor(mimetype: string, fileName?: string): string {
  const fromName = fileName?.includes(".") ? fileName.split(".").pop()?.toLowerCase() : undefined;
  return fromName || EXT_BY_MIME[mimetype] || "bin";
}

// Salva o arquivo em disco com nome aleatório (nunca o nome original — evita
// colisão e um cliente/atendente escolher o path de outra mensagem) e devolve
// só o nome salvo, pra guardar em Message.mediaUrl.
export async function saveMediaBuffer(buffer: Buffer, mimetype: string, fileName?: string): Promise<string> {
  await fs.mkdir(MEDIA_DIR, { recursive: true });
  const diskName = `${crypto.randomUUID()}.${extensionFor(mimetype, fileName)}`;
  await fs.writeFile(path.join(MEDIA_DIR, diskName), buffer);
  return diskName;
}

// path.basename corta qualquer "../" — só deixa ler arquivo que está
// realmente dentro de MEDIA_DIR, mesmo que o nome recebido seja adulterado.
export async function readMediaFile(diskName: string): Promise<Buffer> {
  const safe = path.basename(diskName);
  return fs.readFile(path.join(MEDIA_DIR, safe));
}
