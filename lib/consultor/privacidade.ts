// Texto escrito por cliente (mensagens do WhatsApp) passa por aqui antes de ir
// pra IA: o Consultor precisa saber DO QUE os clientes falam, não de quem é o
// telefone, o CPF ou a chave Pix. Ordem importa — CNPJ antes de CPF (o CPF
// casaria com um pedaço do CNPJ) e telefone antes da sequência genérica.
const REGRAS: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[e-mail]"],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[chave]"],
  [/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[CNPJ]"],
  [/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF]"],
  [/(\+?55[\s-]?)?\(?\b\d{2}\)?[\s-]?9?\d{4}[\s.-]?\d{4}\b/g, "[telefone]"],
  // Cartão, conta, código de barras: qualquer sequência longa de dígitos.
  [/\b\d[\d\s.-]{7,}\d\b/g, "[número]"],
];

export function mascararDadosPessoais(texto: string): string {
  return REGRAS.reduce((t, [re, troca]) => t.replace(re, troca), texto);
}
