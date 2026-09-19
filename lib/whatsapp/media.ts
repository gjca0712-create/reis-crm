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
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/webm": "weba",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

export const MIME_BY_EXT: Record<string, string> = {
  ...Object.fromEntries(Object.entries(EXT_BY_MIME).map(([mime, ext]) => [ext, mime])),
  // Alias que não é a extensão canônica escolhida acima (jpg), mas aparece
  // sozinho no nome do arquivo com frequência (ex.: anexo do atendente).
  jpeg: "image/jpeg",
};

export type MediaCategory = "image" | "video" | "audio" | "document";

export function mediaCategoryFromMimetype(mimetype: string): MediaCategory {
  if (mimetype.startsWith("image/")) return "image";
  if (mimetype.startsWith("video/")) return "video";
  if (mimetype.startsWith("audio/")) return "audio";
  return "document";
}

// O WhatsApp manda áudio de voz como "audio/ogg; codecs=opus" — sem cortar o
// "; codecs=..." a comparação exata contra EXT_BY_MIME nunca bate e todo áudio
// vira ".bin" (sem Content-Type de áudio, o player não toca).
function baseMimetype(mimetype: string): string {
  return mimetype.split(";")[0].trim().toLowerCase();
}

function extensionFor(mimetype: string, fileName?: string): string {
  const fromName = fileName?.includes(".") ? fileName.split(".").pop()?.toLowerCase() : undefined;
  return fromName || EXT_BY_MIME[baseMimetype(mimetype)] || "bin";
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
