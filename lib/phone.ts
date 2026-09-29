// Forma canônica de telefone no banco: só dígitos, DDD + número, SEM o DDI 55.
// É esse formato que lib/whatsapp/inbound.ts usa pra casar a mensagem recebida
// com o cliente — se o cadastro salvar "(75) 99999-8888" e o WhatsApp mandar
// "5575999998888", os dois nunca batem e cada cliente vira um contato duplicado.
// Camada de exibição (lib/format.ts formatPhone) reformata na hora de mostrar.
export function normalizePhone(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  // Tira o DDI 55 só quando o que sobra ainda é um número plausível (10-11
  // dígitos = DDD + fixo/celular). Assim não estraga um DDD 55 (Santa Maria/RS).
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    return digits.slice(2);
  }
  return digits;
}

// O mesmo celular com e sem o nono dígito. O WhatsApp registra boa parte das
// contas sem ele (55 + DDD + 8 dígitos — é o que chega numa mensagem recebida),
// enquanto no cadastro manual quase sempre é digitado com o 9. Sem casar as
// duas formas, o cliente cadastrado à mão que responde uma conversa iniciada
// pelo CRM viraria um contato duplicado. Fixo (10 dígitos começando em 2-5)
// não tem variação.
export function phoneVariants(phone: string): string[] {
  if (phone.length === 11 && phone[2] === "9") return [phone, phone.slice(0, 2) + phone.slice(3)];
  if (phone.length === 10 && /[6-9]/.test(phone[2])) return [phone, `${phone.slice(0, 2)}9${phone.slice(2)}`];
  return [phone];
}
