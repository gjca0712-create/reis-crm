import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { teamUnreadTotal } from "@/lib/team-chat";

// Contador de mensagens não lidas do chat interno, pro aviso no menu lateral
// (components/layout/TeamChatBadge.tsx consulta de tempos em tempos).
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ total: 0 }, { status: 401 });
  return NextResponse.json({ total: await teamUnreadTotal(session.userId) });
}

export const dynamic = "force-dynamic";
