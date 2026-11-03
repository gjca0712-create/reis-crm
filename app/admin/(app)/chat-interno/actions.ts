"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { GENERAL_CHANNEL, sendTeamMessage } from "@/lib/team-chat";

// Dando erro, volta pra mesma conversa com o aviso no topo. Deu certo: não
// redireciona (redirect remonta a tela e a caixa de texto perde o foco), a
// não ser pra tirar o aviso de uma tentativa anterior.
export async function sendTeamChatMessage(target: string, formData: FormData) {
  const session = await requireSession();
  const result = await sendTeamMessage(session.userId, target, String(formData.get("body") || ""));
  revalidatePath("/admin/chat-interno");
  const base = `/admin/chat-interno${target === GENERAL_CHANNEL ? "" : `?c=${target}`}`;
  if ("error" in result) redirect(`${base}${base.includes("?") ? "&" : "?"}erro=${encodeURIComponent(result.error)}`);
  const referer = (await headers()).get("referer");
  if (referer?.includes("erro=")) redirect(base);
}
