import path from "node:path";
import fs from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { fetchWhatsAppAbout, fetchWhatsAppProfilePictureUrl } from "./client";
import { toWhatsAppLineId } from "./lines";

// Foto de perfil do WhatsApp do cliente, guardada no volume (.wa-auth/avatars)
// pra não perguntar ao WhatsApp a cada vez que a lista aparece: a lista tem
// centenas de conversas, e consulta em excesso é o tipo de coisa que chama
// atenção do WhatsApp. O link que o WhatsApp devolve expira, por isso baixa a
// imagem em vez de guardar o link.
const AVATAR_DIR = path.join(process.cwd(), ".wa-auth", "avatars");
// Foto guardada vale 3 dias; "não tem foto" vale 1 dia (a pessoa pode colocar).
const PHOTO_FRESH_MS = 3 * 24 * 60 * 60_000;
const NO_PHOTO_FRESH_MS = 24 * 60 * 60_000;
// No máximo 3 consultas ao WhatsApp ao mesmo tempo, o resto espera a vez.
const MAX_PARALLEL_LOOKUPS = 3;

export type AvatarSize = "preview" | "image";

export type AvatarDeps = {
  fetchUrl: typeof fetchWhatsAppProfilePictureUrl;
  download: (url: string) => Promise<Buffer | null>;
  dir: string;
};

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok || !res.headers.get("content-type")?.startsWith("image/")) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

const defaultDeps: AvatarDeps = { fetchUrl: fetchWhatsAppProfilePictureUrl, download: downloadImage, dir: AVATAR_DIR };

let running = 0;
const waiting: (() => void)[] = [];
async function throttled<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL_LOOKUPS) await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

async function ageOf(file: string): Promise<number | null> {
  try {
    return Date.now() - (await fs.stat(file)).mtimeMs;
  } catch {
    return null;
  }
}

const inFlight = new Map<string, Promise<Buffer | null>>();

// Imagem da foto, ou null se o cliente não tem foto (ou esconde, ou a linha
// está caída e nunca foi buscada).
export async function loadCustomerAvatar(
  customerId: string,
  size: AvatarSize,
  deps: AvatarDeps = defaultDeps
): Promise<Buffer | null> {
  // Id vira nome de arquivo: só letras e números (cuid), nada de "../".
  if (!/^[a-z0-9]+$/i.test(customerId)) return null;
  const photo = path.join(deps.dir, `${customerId}-${size}.jpg`);
  const none = path.join(deps.dir, `${customerId}-${size}.none`);

  const photoAge = await ageOf(photo);
  if (photoAge !== null && photoAge < PHOTO_FRESH_MS) return fs.readFile(photo);
  const noneAge = await ageOf(none);
  if (noneAge !== null && noneAge < NO_PHOTO_FRESH_MS) return null;

  const pending = inFlight.get(photo);
  if (pending) return pending;
  const job = refresh(customerId, size, photo, none, photoAge !== null, deps).finally(() => inFlight.delete(photo));
  inFlight.set(photo, job);
  return job;
}

async function refresh(
  customerId: string,
  size: AvatarSize,
  photo: string,
  none: string,
  hasStale: boolean,
  deps: AvatarDeps
): Promise<Buffer | null> {
  const stale = () => (hasStale ? fs.readFile(photo).catch(() => null) : Promise.resolve(null));
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      phone: true,
      whatsappLid: true,
      conversations: { select: { line: true }, orderBy: { lastMessageAt: "desc" }, take: 1 },
    },
  });
  if (!customer) return null;

  const line = customer.conversations[0] ? toWhatsAppLineId(customer.conversations[0].line) : undefined;
  const url = await throttled(() => deps.fetchUrl(customer.phone, customer.whatsappLid, size, line));
  // Não deu pra perguntar: mostra a antiga (se tiver) e tenta de novo depois.
  if (url === undefined) return stale();

  await fs.mkdir(deps.dir, { recursive: true });
  if (url === null) {
    await fs.writeFile(none, "");
    await fs.rm(photo, { force: true });
    return null;
  }

  const image = await deps.download(url);
  if (!image) return stale();
  const tmp = `${photo}.${process.pid}.tmp`;
  await fs.writeFile(tmp, image);
  await fs.rename(tmp, photo);
  await fs.rm(none, { force: true });
  return image;
}

// Recado ("Disponível", "Hey there! I am using WhatsApp"...), guardado em
// memória por 6 horas.
const ABOUT_FRESH_MS = 6 * 60 * 60_000;
const aboutCache = new Map<string, { about: string | null; at: number }>();

export async function loadCustomerAbout(customerId: string): Promise<string | null> {
  const cached = aboutCache.get(customerId);
  if (cached && Date.now() - cached.at < ABOUT_FRESH_MS) return cached.about;
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      phone: true,
      whatsappLid: true,
      conversations: { select: { line: true }, orderBy: { lastMessageAt: "desc" }, take: 1 },
    },
  });
  if (!customer) return null;
  const line = customer.conversations[0] ? toWhatsAppLineId(customer.conversations[0].line) : undefined;
  const about = await throttled(() => fetchWhatsAppAbout(customer.phone, customer.whatsappLid, line));
  if (about === undefined) return cached?.about ?? null;
  if (aboutCache.size > 5000) aboutCache.delete(aboutCache.keys().next().value!);
  aboutCache.set(customerId, { about, at: Date.now() });
  return about;
}
