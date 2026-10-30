import path from "node:path";
import { promises as fs } from "node:fs";
import { prisma } from "@/lib/prisma";
import { MEDIA_DIR } from "./media";
import { AVATAR_DIR } from "./avatar";

// O volume do Railway (.wa-auth) tem tamanho fixo e guarda, junto com os
// arquivos das conversas, as chaves do WhatsApp das linhas: volume cheio =
// chave que não grava = mensagem que o CRM não consegue abrir. Por isso
// arquivo de conversa (foto, áudio, vídeo, documento, recebido ou enviado)
// fica 20 dias no CRM e depois é apagado. A mensagem continua, com o aviso no
// lugar do arquivo (mediaUrl null e mediaType preenchido — ver ChatTimeline).
// Foto de perfil guardada também sai: volta sozinha quando o cliente aparecer
// de novo. A pasta das chaves (.wa-auth/<linha>) nunca é mexida.
export const MEDIA_RETENTION_DAYS = 20;
const RETENTION_MS = MEDIA_RETENTION_DAYS * 24 * 60 * 60_000;
// Primeira passada uns minutos depois do boot (não disputa com a reconexão
// das linhas), depois uma vez por dia.
const FIRST_RUN_DELAY_MS = 5 * 60_000;
const INTERVAL_MS = 24 * 60 * 60_000;
const DB_BATCH = 500;
const VOLUME_DIR = path.join(process.cwd(), ".wa-auth");

export type CleanupDeps = { mediaDir: string; avatarDir: string; now: number };
type Freed = { files: number; bytes: number; failed: number };
export type CleanupResult = { media: Freed; avatars: Freed };

const defaultDeps = (): CleanupDeps => ({ mediaDir: MEDIA_DIR, avatarDir: AVATAR_DIR, now: Date.now() });

// Arquivos da pasta mais velhos que o prazo (pela data em que foram gravados).
async function oldFiles(dir: string, now: number): Promise<{ name: string; size: number }[]> {
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return []; // pasta ainda não existe
  }
  const old: { name: string; size: number }[] = [];
  for (const name of names) {
    const stat = await fs.lstat(path.join(dir, name)).catch(() => null);
    if (stat?.isFile() && now - stat.mtimeMs > RETENTION_MS) old.push({ name, size: stat.size });
  }
  return old;
}

async function removeAll(dir: string, files: { name: string; size: number }[], freed: Freed): Promise<void> {
  for (const file of files) {
    try {
      await fs.unlink(path.join(dir, file.name));
      freed.files++;
      freed.bytes += file.size;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") freed.failed++;
    }
  }
}

export async function cleanupOldMedia(deps: CleanupDeps = defaultDeps()): Promise<CleanupResult> {
  const media: Freed = { files: 0, bytes: 0, failed: 0 };
  const old = await oldFiles(deps.mediaDir, deps.now);
  for (let i = 0; i < old.length; i += DB_BATCH) {
    const batch = old.slice(i, i + DB_BATCH);
    // Banco primeiro: se o arquivo não sair agora, sai na próxima passada (a
    // data dele continua velha). Ao contrário, a mensagem ficaria apontando
    // pra um arquivo que não existe mais.
    await prisma.message.updateMany({
      where: { mediaUrl: { in: batch.map((f) => f.name) } },
      data: { mediaUrl: null },
    });
    await removeAll(deps.mediaDir, batch, media);
  }

  const avatars: Freed = { files: 0, bytes: 0, failed: 0 };
  await removeAll(deps.avatarDir, await oldFiles(deps.avatarDir, deps.now), avatars);
  return { media, avatars };
}

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);

async function volumeUsage(): Promise<string> {
  try {
    const s = await fs.statfs(VOLUME_DIR);
    const gb = (blocks: number) => ((blocks * s.bsize) / 1024 ** 3).toFixed(2);
    return `volume com ${gb(s.blocks - s.bfree)} GB usados de ${gb(s.blocks)} GB`;
  } catch {
    return "uso do volume indisponível";
  }
}

async function runCleanup(): Promise<void> {
  try {
    const { media, avatars } = await cleanupOldMedia();
    const failed = media.failed + avatars.failed;
    console.log(
      `[limpeza-arquivos] apagados ${media.files} arquivos de conversa (${mb(media.bytes)} MB) e ${avatars.files} fotos de perfil (${mb(avatars.bytes)} MB) com mais de ${MEDIA_RETENTION_DAYS} dias` +
        `${failed ? ` — ${failed} não saíram, tenta de novo amanhã` : ""}; ${await volumeUsage()}`
    );
  } catch (err) {
    console.error("[limpeza-arquivos] falhou:", err);
  }
}

// Só onde existe o volume do Railway (a variável vem dele): rodando o CRM no
// computador, não apaga nada.
const globalForCleanup = globalThis as unknown as { __waMediaCleanup?: boolean };
export function startMediaCleanup(): void {
  if (!process.env.RAILWAY_VOLUME_MOUNT_PATH || globalForCleanup.__waMediaCleanup) return;
  globalForCleanup.__waMediaCleanup = true;
  setTimeout(() => void runCleanup(), FIRST_RUN_DELAY_MS).unref();
  setInterval(() => void runCleanup(), INTERVAL_MS).unref();
}
