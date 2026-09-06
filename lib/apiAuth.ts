// Autenticação simples pra API pública (app/api/site/*) que o site externo chama.
// Não é uma sessão de usuário — é uma chave compartilhada fixa no .env, enviada
// pelo site no header x-api-key. Suficiente pra barrar bots aleatórios; como o
// HTML do site é público, a chave fica visível no código-fonte pra quem olhar.
export function verifyApiKey(request: Request): boolean {
  const key = request.headers.get("x-api-key");
  const expected = process.env.SITE_API_KEY;
  return Boolean(expected) && key === expected;
}

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key",
};
