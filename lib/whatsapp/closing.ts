// Mensagem de despedida do cliente ("ok", "obrigado", "valeu 👍"...): a conversa
// já acabou e não tem nada pra responder. Sem isso, o "obrigado" que chega
// depois do Resolvido abria uma conversa nova em Em espera, e o que chega no
// fim do atendimento deixava a conversa vermelha (Sem resposta).
//
// "thanks" = agradecimento ou só emoji (👍🙏) — sempre encerra.
// "ack"    = só confirmação ("ok", "certo", "blz") — encerra DEPOIS do Resolvido,
//            mas no meio do atendimento pode ser resposta a uma pergunta nossa
//            ("posso fechar o pedido?" → "ok"), então ali continua vermelho.
export type ClosingKind = "thanks" | "ack";

// Tudo sem acento e com letra repetida colapsada ("okkk" → "ok", "valeuuu" → "valeu").
const THANKS = new Set(
  [
    "obrigado", "obrigada", "obrigadao", "obrigadisimo", "obrigadisima", "obg", "obgd", "obgda", "obgdo",
    "brigado", "brigada", "grato", "grata", "agradeco", "agradecido", "agradecida",
    "valeu", "vlw", "vlew", "tmj", "amem", "deus", "abencoe",
  ].map(collapse)
);
const ACK = new Set(
  [
    "ok", "okay", "okey", "oki", "blz", "beleza", "certo", "certinho", "ta", "bom", "entendi", "entendido",
    "combinado", "perfeito", "otimo", "show", "top", "joia", "massa", "maravilha", "fechado",
    // Ligam as palavras acima: "muito obrigado", "de nada", "pra você também"...
    "muito", "mt", "mto", "de", "nada", "pra", "para", "voce", "vc", "tambem", "tb", "tbm", "igualmente",
    "e", "o", "a", "te", "ai", "entao", "sim", "senhor", "senhora", "sr", "sra",
  ].map(collapse)
);
// Palavras de ligação que, sozinhas, não querem dizer nada ("e", "sim", "de"...):
// a mensagem precisa ter pelo menos uma palavra de encerramento de verdade.
const FILLER = new Set(
  ["muito", "mt", "mto", "de", "nada", "pra", "para", "voce", "vc", "tambem", "tb", "tbm", "e", "o", "a", "te", "ai", "entao", "sim", "senhor", "senhora", "sr", "sra"].map(collapse)
);
// "de nada" sozinho é encerramento.
const DE_NADA = "de nada";

function collapse(word: string): string {
  return word.replace(/(\p{L})\1+/gu, "$1");
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function closingKind(body: string | null | undefined, mediaType?: string | null): ClosingKind | null {
  if (mediaType || !body) return null;
  const text = normalize(body).trim();
  if (!text || text.length > 60 || text.includes("?")) return null;

  const words = text
    .split(/[^\p{L}]+/u)
    .filter(Boolean)
    .map(collapse);

  // Só emoji (👍, 🙏, ❤️...), sem letra nem número.
  if (!words.length) return /\p{Extended_Pictographic}/u.test(text) && !/\p{N}/u.test(text) ? "thanks" : null;
  if (/\p{N}/u.test(text)) return null;

  if (!words.every((w) => THANKS.has(w) || ACK.has(w))) return null;
  if (words.some((w) => THANKS.has(w))) return "thanks";
  if (words.join(" ") === DE_NADA) return "thanks";
  if (words.every((w) => FILLER.has(w))) return null;
  return "ack";
}

// Conversa esperando resposta nossa: o cliente falou por último, e não foi só
// um agradecimento. Mesma regra da faixa vermelha da lista e da aba +4h.
export function needsReply(last: { direction: string; body: string | null; mediaType?: string | null } | undefined): boolean {
  return last?.direction === "IN" && closingKind(last.body, last.mediaType) !== "thanks";
}
