// Contato do WhatsApp x cliente cadastrado (Customer.isContact). Puro, sem
// banco: usado nas actions e nas telas.

// Bairro dos cadastros criados sozinhos pelo WhatsApp (Customer.bairro é
// obrigatório no banco).
export const BAIRRO_NAO_INFORMADO = "Não informado";

const digits = (value: string) => value.replace(/\D/g, "");

export function hasBairro(bairro: string | null | undefined): boolean {
  const value = bairro?.trim();
  return Boolean(value) && value !== BAIRRO_NAO_INFORMADO;
}

// O nome automático é o telefone formatado quando o perfil do WhatsApp não
// tem nome — não é um nome de verdade.
export function isPhoneName(name: string, phone: string): boolean {
  const nameDigits = digits(name);
  return nameDigits.length >= 8 && nameDigits === digits(phone);
}

// Falta o básico do cadastro: bairro, ou um nome de verdade.
export function needsSignup(customer: { name: string; phone: string; bairro: string }): boolean {
  return !hasBairro(customer.bairro) || !customer.name.trim() || isPhoneName(customer.name, customer.phone);
}
