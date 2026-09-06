// Toda a conversão do site passa por aqui: link direto wa.me com mensagem pré-preenchida.
// Autocontido de propósito (não depende de site-config.ts) para casar exatamente com o
// contrato já usado em pousada-manha-dourada/lib/whatsapp.ts — outros arquivos (cart.ts,
// site-config.ts) chamam whatsappUrl(), nunca o inverso.
export const WHATSAPP_NUMBER = "5575988055098"; // (75) 98805-5098

export const DEFAULT_MESSAGE =
  "Olá! Vim pelo site da Reis Materiais de Construção e gostaria de mais informações.";

export function whatsappUrl(message: string = DEFAULT_MESSAGE): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
