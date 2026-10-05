"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { GENERAL_CHANNEL, sendTeamMessage } from "@/lib/team-chat";

// Volta pra mesma conversa (redirect remonta a caixa de texto vazia). Dando
// erro, mostra o aviso no topo.
export async function sendTeamChatMessage(target: string, formData: FormData) {
  const session = await requireSession();
  const result = await sendTeamMessage(session.userId, target, String(formData.get("body") || ""));
  revalidatePath("/admin/chat-interno");
  const base = `/admin/chat-interno${target === GENERAL_CHANNEL ? "" : `?c=${target}`}`;
  if ("error" in result) redirect(`${base}${base.includes("?") ? "&" : "?"}erro=${encodeURIComponent(result.error)}`);
  redirect(base);
}
