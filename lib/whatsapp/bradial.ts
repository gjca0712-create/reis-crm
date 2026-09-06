// Cliente para a API oficial do WhatsApp via Bradial (o BSP que a Reis já usa).
// Ainda não temos o token/endpoint reais — a doc pública (docs.bradial.com.br)
// exige login. O formato abaixo segue o padrão mais comum entre BSPs, que
// espelham a Cloud API da Meta (POST /messages com {to, type, text}) — CONFERIR
// e ajustar assim que a Reis passar o acesso ao painel do Bradial.

const BRADIAL_API_URL = process.env.BRADIAL_API_URL;
const BRADIAL_API_TOKEN = process.env.BRADIAL_API_TOKEN;

export function isBradialConfigured(): boolean {
  return Boolean(BRADIAL_API_URL && BRADIAL_API_TOKEN);
}

export async function sendViaBradial(phone: string, text: string): Promise<boolean> {
  if (!BRADIAL_API_URL || !BRADIAL_API_TOKEN) return false;

  const digits = phone.replace(/\D/g, "");
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;

  try {
    // TODO: confirmar endpoint e formato do payload com a doc/suporte do Bradial.
    const res = await fetch(`${BRADIAL_API_URL}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${BRADIAL_API_TOKEN}`,
      },
      body: JSON.stringify({
        to: withCountry,
        type: "text",
        text: { body: text },
      }),
    });

    if (!res.ok) {
      console.error("Bradial: falha ao enviar mensagem", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (err) {
    console.error("Bradial: erro ao enviar mensagem", err);
    return false;
  }
}
