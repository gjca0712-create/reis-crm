// Resposta a uma mensagem específica (o "responder" do WhatsApp). Sem
// dependência de servidor: usado pelo client.ts (citação que chega do
// WhatsApp), pela action de envio e pelos balões da conversa.

// A mensagem citada, como fica gravada em Message.quoted*.
export type QuoteInfo = {
  waMessageId: string;
  body: string;
  // null = não deu pra saber de quem é (o WhatsApp não mandou o autor).
  fromMe: boolean | null;
};

// Texto guardado da citada: o bastante pra reconhecer qual é.
export const MAX_QUOTE_CHARS = 500;

const MEDIA_SNIPPETS: Record<string, string> = {
  image: "📷 Foto",
  video: "🎥 Vídeo",
  audio: "🎤 Áudio",
  document: "📄 Documento",
  sticker: "Figurinha",
};

// Uma linha que representa a mensagem citada: o texto, ou o tipo do arquivo
// (com a legenda, se tiver).
export function quoteSnippet(m: { body?: string | null; mediaType?: string | null; mediaFileName?: string | null }): string {
  const body = m.body?.trim() ?? "";
  const media = m.mediaType ? (MEDIA_SNIPPETS[m.mediaType] ?? "📎 Arquivo") : "";
  const label = media && m.mediaType === "document" && m.mediaFileName ? `📄 ${m.mediaFileName}` : media;
  const text = label && body ? `${label}: ${body}` : label || body || "Mensagem";
  return text.length > MAX_QUOTE_CHARS ? `${text.slice(0, MAX_QUOTE_CHARS - 1)}…` : text;
}
