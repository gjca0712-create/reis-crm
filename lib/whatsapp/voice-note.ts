// Mensagem de voz gravada no navegador (ReplyForm). O WhatsApp só mostra como
// "áudio de voz" (bolinha de play, duração) um Ogg com Opus dentro — e o Chrome
// e o Edge gravam Opus dentro de WebM. Aqui o WebM vira Ogg trocando só a
// "embalagem": os pacotes Opus passam iguais, sem regravar o som (e sem ffmpeg
// no servidor). Sem nada de Node — roda no navegador e no servidor.

export const VOICE_NOTE_MIMETYPE = "audio/ogg; codecs=opus";

const OPUS_RATE = 48000;
const VENDOR = "Reis CRM";

// ---------------------------------------------------------------------------
// WebM (Matroska) → pacotes Opus

const EBML_ID = {
  Segment: 0x18538067,
  Cluster: 0x1f43b675,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  TrackNumber: 0xd7,
  CodecID: 0x86,
  CodecPrivate: 0x63a2,
  CodecDelay: 0x56aa,
  Audio: 0xe1,
  Channels: 0x9f,
  BlockGroup: 0xa0,
  Block: 0xa1,
  SimpleBlock: 0xa3,
} as const;

// Elementos que guardam outros e interessam: a leitura entra neles em vez de
// pular. Segment e Cluster vêm com tamanho "desconhecido" do MediaRecorder (ele
// grava sem saber quando vai parar) — entrando sem pular, o tamanho não importa.
const DESCEND = new Set<number>([
  EBML_ID.Segment,
  EBML_ID.Cluster,
  EBML_ID.Tracks,
  EBML_ID.TrackEntry,
  EBML_ID.Audio,
  EBML_ID.BlockGroup,
]);

type Vint = { value: number; length: number; unknown: boolean };

// Número de tamanho variável do EBML. keepMarker: IDs guardam o bit marcador
// (0x1A45DFA3); tamanhos não. Tamanho com todos os bits 1 = desconhecido.
function readVint(b: Uint8Array, pos: number, keepMarker: boolean): Vint {
  const first = b[pos];
  if (first === undefined || first === 0) throw new Error("WebM inválido");
  let length = 1;
  let mask = 0x80;
  while (!(first & mask)) {
    length++;
    mask >>= 1;
  }
  if (pos + length > b.length) throw new Error("WebM cortado");
  let value = keepMarker ? first : first & (mask - 1);
  let allOnes = (first & (mask - 1)) === mask - 1;
  for (let i = 1; i < length; i++) {
    value = value * 256 + b[pos + i];
    if (b[pos + i] !== 0xff) allOnes = false;
  }
  return { value, length, unknown: !keepMarker && allOnes };
}

function readUint(b: Uint8Array): number {
  let v = 0;
  for (const x of b) v = v * 256 + x;
  return v;
}

function ascii(b: Uint8Array): string {
  return String.fromCharCode(...b);
}

type Track = { number: number; codec: string; head: Uint8Array | null; channels: number; codecDelayNs: number };

// Um Block/SimpleBlock: número da trilha, 2 bytes de tempo, 1 de flags e os
// quadros — normalmente um só; com "lacing", vários juntos (Xiph, fixo ou EBML).
function parseBlock(b: Uint8Array): { track: number; frames: Uint8Array[] } {
  const track = readVint(b, 0, false);
  let pos = track.length + 3;
  const lacing = (b[track.length + 2] >> 1) & 3;
  if (lacing === 0) return { track: track.value, frames: [b.subarray(pos)] };

  const count = b[pos++] + 1;
  const sizes: number[] = [];
  if (lacing === 2) {
    const each = (b.length - pos) / count;
    if (!Number.isInteger(each)) throw new Error("WebM inválido");
    for (let i = 0; i < count; i++) sizes.push(each);
  } else {
    if (lacing === 1) {
      for (let i = 0; i < count - 1; i++) {
        let size = 0;
        let x: number;
        do {
          x = b[pos++];
          size += x;
        } while (x === 255);
        sizes.push(size);
      }
    } else {
      const first = readVint(b, pos, false);
      pos += first.length;
      sizes.push(first.value);
      for (let i = 1; i < count - 1; i++) {
        const diff = readVint(b, pos, false);
        pos += diff.length;
        // Diferença com sinal: o valor sem sinal menos a metade do alcance.
        sizes.push(sizes[i - 1] + diff.value - (2 ** (7 * diff.length - 1) - 1));
      }
    }
    // O último quadro é o que sobra.
    sizes.push(b.length - pos - sizes.reduce((a, s) => a + s, 0));
  }
  const frames: Uint8Array[] = [];
  for (const size of sizes) {
    if (size < 0 || pos + size > b.length) throw new Error("WebM inválido");
    frames.push(b.subarray(pos, pos + size));
    pos += size;
  }
  return { track: track.value, frames };
}

// Lê o WebM do começo ao fim como uma lista plana de elementos: entra nos que
// guardam o que interessa (DESCEND) e pula o resto pelo tamanho.
export function webmOpusPackets(b: Uint8Array): { head: Uint8Array; packets: Uint8Array[] } {
  const tracks: Track[] = [];
  const blocks: { track: number; frames: Uint8Array[] }[] = [];
  let pos = 0;
  while (pos < b.length) {
    const id = readVint(b, pos, true);
    const size = readVint(b, pos + id.length, false);
    pos += id.length + size.length;
    if (DESCEND.has(id.value)) {
      if (id.value === EBML_ID.TrackEntry) {
        tracks.push({ number: 0, codec: "", head: null, channels: 1, codecDelayNs: 0 });
      }
      continue;
    }
    if (size.unknown) throw new Error("WebM inválido");
    const end = pos + size.value;
    // O último pedaço pode vir cortado se a gravação parou no meio dele.
    if (end > b.length) break;
    const data = b.subarray(pos, end);
    const track = tracks[tracks.length - 1];
    switch (id.value) {
      case EBML_ID.TrackNumber:
        if (track) track.number = readUint(data);
        break;
      case EBML_ID.CodecID:
        if (track) track.codec = ascii(data);
        break;
      case EBML_ID.CodecPrivate:
        if (track) track.head = data;
        break;
      case EBML_ID.Channels:
        if (track) track.channels = readUint(data);
        break;
      case EBML_ID.CodecDelay:
        if (track) track.codecDelayNs = readUint(data);
        break;
      case EBML_ID.SimpleBlock:
      case EBML_ID.Block:
        blocks.push(parseBlock(data));
        break;
    }
    pos = end;
  }

  const opus = tracks.find((t) => t.codec === "A_OPUS");
  if (!opus) throw new Error("WebM sem áudio Opus");
  const packets = blocks
    .filter((bl) => bl.track === opus.number)
    .flatMap((bl) => bl.frames)
    .filter((f) => f.length > 0);
  if (packets.length === 0) throw new Error("Gravação vazia");

  const head =
    opus.head && opus.head.length >= 19 && ascii(opus.head.subarray(0, 8)) === "OpusHead"
      ? opus.head
      : opusHead(opus.channels, Math.round((opus.codecDelayNs * OPUS_RATE) / 1e9) || 312);
  return { head, packets };
}

// ---------------------------------------------------------------------------
// Pacotes Opus → Ogg (RFC 7845)

function opusHead(channels: number, preSkip: number): Uint8Array {
  const h = new Uint8Array(19);
  const dv = new DataView(h.buffer);
  h.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64]); // "OpusHead"
  h[8] = 1; // versão
  h[9] = Math.min(Math.max(channels, 1), 2);
  dv.setUint16(10, preSkip, true);
  dv.setUint32(12, OPUS_RATE, true);
  return h; // ganho 0, mapeamento 0 (mono/estéreo)
}

function opusTags(): Uint8Array {
  const vendor = new TextEncoder().encode(VENDOR);
  const t = new Uint8Array(8 + 4 + vendor.length + 4);
  const dv = new DataView(t.buffer);
  t.set([0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73]); // "OpusTags"
  dv.setUint32(8, vendor.length, true);
  t.set(vendor, 12);
  return t; // nenhum comentário
}

// Quantas amostras (a 48 kHz) um pacote Opus tem, pelo byte TOC (RFC 6716 §3.1).
export function opusPacketSamples(p: Uint8Array): number {
  const config = p[0] >> 3;
  const frame =
    config < 12 ? [480, 960, 1920, 2880][config & 3] : config < 16 ? [480, 960][config & 1] : [120, 240, 480, 960][config & 3];
  const code = p[0] & 3;
  const frames = code === 0 ? 1 : code === 3 ? (p[1] ?? 0) & 0x3f : 2;
  return frame * frames;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    t[i] = r >>> 0;
  }
  return t;
})();

function oggCrc(b: Uint8Array): number {
  let c = 0;
  for (const x of b) c = ((c << 8) ^ CRC_TABLE[((c >>> 24) ^ x) & 0xff]) >>> 0;
  return c;
}

const OGG_BOS = 0x02;
const OGG_EOS = 0x04;

function oggPage(packets: Uint8Array[], granule: number, flags: number, serial: number, seq: number): Uint8Array {
  const lacing: number[] = [];
  for (const p of packets) {
    let n = p.length;
    for (; n >= 255; n -= 255) lacing.push(255);
    lacing.push(n);
  }
  const bodyLength = packets.reduce((a, p) => a + p.length, 0);
  const page = new Uint8Array(27 + lacing.length + bodyLength);
  const dv = new DataView(page.buffer);
  page.set([0x4f, 0x67, 0x67, 0x53]); // "OggS", versão 0
  page[5] = flags;
  dv.setUint32(6, granule % 2 ** 32, true);
  dv.setUint32(10, Math.floor(granule / 2 ** 32), true);
  dv.setUint32(14, serial, true);
  dv.setUint32(18, seq, true);
  page[26] = lacing.length;
  page.set(lacing, 27);
  let pos = 27 + lacing.length;
  for (const p of packets) {
    page.set(p, pos);
    pos += p.length;
  }
  dv.setUint32(22, oggCrc(page), true); // calculado com o campo zerado
  return page;
}

export function opusToOgg(head: Uint8Array, packets: Uint8Array[], serial = Math.floor(Math.random() * 2 ** 32)): Uint8Array {
  const pages: Uint8Array[] = [];
  const push = (list: Uint8Array[], granule: number, flags: number) =>
    pages.push(oggPage(list, granule, flags, serial, pages.length));
  push([head], 0, OGG_BOS);
  push([opusTags()], 0, 0);

  // Páginas de até ~1 s (50 pacotes de 20 ms) e no máximo 255 segmentos; cada
  // página diz em "granule" quantas amostras já tocaram até o fim dela.
  let granule = 0;
  let page: Uint8Array[] = [];
  let segments = 0;
  packets.forEach((p, i) => {
    const need = Math.floor(p.length / 255) + 1;
    if (page.length > 0 && (segments + need > 255 || page.length >= 50)) {
      push(page, granule, 0);
      page = [];
      segments = 0;
    }
    page.push(p);
    segments += need;
    granule += opusPacketSamples(p);
    if (i === packets.length - 1) push(page, granule, OGG_EOS);
  });

  const out = new Uint8Array(pages.reduce((a, p) => a + p.length, 0));
  let pos = 0;
  for (const p of pages) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

export function webmOpusToOgg(webm: Uint8Array): Uint8Array {
  const { head, packets } = webmOpusPackets(webm);
  return opusToOgg(head, packets);
}

// ---------------------------------------------------------------------------
// Conferência no servidor

// É mesmo um Ogg com Opus? Então devolve a duração (pela posição da última
// página menos o "pre-skip" do cabeçalho). null = não é áudio de voz válido.
export function oggOpusInfo(b: Uint8Array): { seconds: number } | null {
  if (b.length < 47 || ascii(b.subarray(0, 4)) !== "OggS") return null;
  const headStart = 27 + b[26];
  if (ascii(b.subarray(headStart, headStart + 8)) !== "OpusHead") return null;
  const preSkip = b[headStart + 10] | (b[headStart + 11] << 8);
  for (let i = b.length - 27; i > headStart; i--) {
    if (b[i] !== 0x4f || b[i + 1] !== 0x67 || b[i + 2] !== 0x67 || b[i + 3] !== 0x53 || b[i + 4] !== 0) continue;
    const dv = new DataView(b.buffer, b.byteOffset + i, 27);
    const high = dv.getUint32(10, true);
    if (high > 0xffff) continue; // -1 (página sem fim de pacote) ou lixo
    const granule = high * 2 ** 32 + dv.getUint32(6, true);
    return { seconds: Math.max(1, Math.round((granule - preSkip) / OPUS_RATE)) };
  }
  return null;
}
