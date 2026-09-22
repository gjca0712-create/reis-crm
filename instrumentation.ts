// Roda uma vez quando o processo do Next sobe (todo deploy novo ou restart do
// container no Railway). Sem isso, uma linha de WhatsApp já pareada antes só
// reconectava quando alguém abria a tela de WhatsApp Suporte manualmente — e
// mensagens que chegassem antes disso eram perdidas, já que o socket só existe
// depois que a página carrega (ver ensureAllWhatsAppStarted em lib/whatsapp/client.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureAllWhatsAppStarted } = await import("@/lib/whatsapp/client");
    console.log("Reconectando linhas de WhatsApp já pareadas (boot do servidor)...");
    await ensureAllWhatsAppStarted().catch((err) => {
      console.error("Falha ao reconectar WhatsApp no boot:", err);
    });
  }
}
