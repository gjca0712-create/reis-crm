import path from "node:path";
import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import {
  BufferJSON,
  initAuthCreds,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataTypeMap,
} from "@whiskeysockets/baileys";
import type { WhatsAppLineId } from "./lines";

// Credencial e chaves de criptografia de uma linha, um arquivo por chave em
// `.wa-auth/<linha>/` — mesmo formato e mesmos nomes do useMultiFileAuthState
// do Baileys (a pasta que já existe no volume continua valendo, sem ler QR de
// novo). A diferença é a gravação: o do Baileys escreve por cima do arquivo
// (writeFile direto), e um deploy ou restart do Railway no meio da escrita
// deixa o arquivo vazio ou cortado. Ele lê arquivo estragado como "não
// existe" sem avisar nada, e chave de criptografia faltando = mensagem que o
// CRM não consegue abrir ("Invalid PreKey ID", "Bad MAC" no log) e, do lado
// do celular, mensagem do CRM presa em "Aguardando mensagem". Aqui cada
// gravação vai pra um arquivo temporário e só depois troca de nome (rename é
// atômico): quem lê vê a versão antiga inteira ou a nova inteira, nunca meia.

// Uma fila por arquivo, igual ao Baileys (ele usa async-mutex). No globalThis
// porque o instrumentation.ts tem a própria cópia deste módulo (ver
// withPhoneLock em inbound.ts) e um socket de cada cópia pode estar gravando
// na mesma pasta durante uma reconexão.
const globalForAuth = globalThis as unknown as {
  __waAuthFileLocks?: Map<string, Promise<unknown>>;
  __waAuthWarned?: Set<string>;
};
const fileLocks = (globalForAuth.__waAuthFileLocks ??= new Map<string, Promise<unknown>>());
// Arquivo estragado já avisado no log — a mesma chave é lida a cada mensagem.
const warned = (globalForAuth.__waAuthWarned ??= new Set<string>());
let tmpSeq = 0;

function withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const prior = fileLocks.get(filePath) ?? Promise.resolve();
  const result = prior.then(fn, fn);
  const tail = result.then(
    () => undefined,
    () => undefined
  );
  fileLocks.set(filePath, tail);
  void tail.then(() => {
    if (fileLocks.get(filePath) === tail) fileLocks.delete(filePath);
  });
  return result;
}

const fixFileName = (file: string) => file.replace(/\//g, "__").replace(/:/g, "-");

// Tipo da chave pelo nome do arquivo, pro log (o resto do nome tem o telefone
// ou @lid do contato, que não vai pro log). Os mais compridos primeiro:
// "sender-key-memory" também começa com "sender-key".
const KEY_TYPES = ["app-state-sync-version", "app-state-sync-key", "sender-key-memory", "sender-key", "pre-key", "session", "creds"];
function keyTypeOf(file: string): string {
  return KEY_TYPES.find((t) => file.startsWith(t)) ?? "outro";
}

export async function useAtomicMultiFileAuthState(
  folder: string,
  line: WhatsAppLineId
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  await mkdir(folder, { recursive: true });

  const writeData = (data: unknown, file: string) => {
    const filePath = path.join(folder, fixFileName(file));
    return withFileLock(filePath, async () => {
      const tmp = `${filePath}.${process.pid}-${++tmpSeq}.tmp`;
      try {
        await writeFile(tmp, JSON.stringify(data, BufferJSON.replacer));
        await rename(tmp, filePath);
      } catch (err) {
        await unlink(tmp).catch(() => {});
        throw err;
      }
    });
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const readData = (file: string): Promise<any> => {
    const filePath = path.join(folder, fixFileName(file));
    return withFileLock(filePath, async () => {
      let raw: string;
      try {
        raw = await readFile(filePath, { encoding: "utf-8" });
      } catch {
        return null; // não existe (ainda) — normal
      }
      try {
        return JSON.parse(raw, BufferJSON.reviver);
      } catch {
        if (!warned.has(filePath)) {
          warned.add(filePath);
          console.warn(`[wa-chaves] (${line}) arquivo de chave estragado (${keyTypeOf(file)}) — tratado como ausente`);
        }
        return null;
      }
    });
  };

  const removeData = (file: string) => {
    const filePath = path.join(folder, fixFileName(file));
    return withFileLock(filePath, () => unlink(filePath).catch(() => {}));
  };

  void reportDamagedFiles(folder, line);

  const creds: AuthenticationCreds = (await readData("creds.json")) || initAuthCreds();
  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: { [id: string]: SignalDataTypeMap[typeof type] } = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}.json`);
              if (type === "app-state-sync-key" && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks: Promise<unknown>[] = [];
          for (const category in data) {
            const entries = data[category as keyof SignalDataTypeMap] ?? {};
            for (const id in entries) {
              const value = entries[id];
              const file = `${category}-${id}.json`;
              tasks.push(value ? writeData(value, file) : removeData(file));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => writeData(creds, "creds.json"),
  };
}

// Na conexão, confere a pasta inteira e conta os arquivos que já estão
// estragados (de antes desta correção), por tipo de chave. Aparecendo
// alguma coisa, o certo é Desconectar a linha e ler o QR de novo: é o único
// jeito de começar com chaves novas. Só log, não muda nada.
async function reportDamagedFiles(folder: string, line: WhatsAppLineId): Promise<void> {
  try {
    const files = (await readdir(folder)).filter((f) => f.endsWith(".json"));
    const damaged = new Map<string, number>();
    for (const file of files) {
      const raw = await readFile(path.join(folder, file), { encoding: "utf-8" }).catch(() => null);
      if (raw === null) continue;
      try {
        JSON.parse(raw);
      } catch {
        damaged.set(keyTypeOf(file), (damaged.get(keyTypeOf(file)) ?? 0) + 1);
      }
    }
    if (!damaged.size) return;
    const list = [...damaged].map(([type, n]) => `${type}: ${n}`).join(", ");
    console.warn(
      `[wa-chaves] (${line}) ${[...damaged.values()].reduce((a, b) => a + b, 0)} de ${files.length} arquivos de chave estragados (${list}) — Desconecte a linha e leia o QR de novo`
    );
  } catch (err) {
    console.warn(`[wa-chaves] (${line}) não deu pra conferir a pasta de chaves:`, err);
  }
}
