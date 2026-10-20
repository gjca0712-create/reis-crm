// O Órbita grava data e hora da loja sem fuso ("2026-09-26 14:30:00"). O CRM
// quer ISO com fuso ("2026-09-26T14:30:00-03:00"). FUSO no .env (Bahia: -03:00,
// sem horário de verão).

const FORMATO = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/;

// Texto do MySQL -> ISO com fuso, ou null (vazio, "0000-00-00", lixo).
function paraIso(texto, fuso) {
  if (!texto) return null;
  const m = FORMATO.exec(String(texto));
  if (!m) return null;
  const [, ano, mes, dia, h = "00", min = "00", s = "00"] = m;
  if (Number(ano) < 2000 || Number(ano) > 2100 || mes === "00" || dia === "00") return null;
  return `${ano}-${mes}-${dia}T${h}:${min}:${s}${fuso}`;
}

function fusoEmMs(fuso) {
  const sinal = fuso.startsWith("-") ? -1 : 1;
  const [h, m] = fuso.slice(1).split(":").map(Number);
  return sinal * (h * 60 + m) * 60_000;
}

// "Agora menos N dias" no horário da loja, no mesmo formato que o MySQL
// devolve — dá pra comparar texto com texto, sem conta de fuso no banco.
function horarioLojaMenosDias(dias, fuso, agora = Date.now()) {
  const d = new Date(agora + fusoEmMs(fuso) - dias * 86_400_000);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

module.exports = { paraIso, horarioLojaMenosDias };
