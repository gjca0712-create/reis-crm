import { LogOut } from "lucide-react";
import { logout } from "@/app/login/actions";
import { ROLE_LABELS } from "@/lib/constants";
import { initials } from "@/lib/format";
import type { SessionPayload } from "@/lib/auth";
import { MobileNav } from "./MobileNav";

export function Topbar({ session }: { session: SessionPayload }) {
  return (
    <header className="h-16 border-b border-border bg-surface/60 backdrop-blur flex items-center justify-between px-4 lg:px-6 sticky top-0 z-10">
      <MobileNav role={session.role} />
      <div className="flex items-center gap-4 ml-auto">
        <div className="text-right leading-tight hidden sm:block">
          <div className="text-sm font-medium text-ink-primary">{session.name}</div>
          <div className="text-xs text-ink-muted">{ROLE_LABELS[session.role] ?? session.role}</div>
        </div>
        <div className="w-9 h-9 rounded-full bg-gold-400/15 border border-gold-700/40 flex items-center justify-center text-xs font-semibold text-gold-400 shrink-0">
          {initials(session.name)}
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="w-9 h-9 rounded-lg border border-border-strong text-ink-secondary hover:text-status-critical hover:border-status-critical/40 flex items-center justify-center transition-colors"
            title="Sair"
          >
            <LogOut className="w-4 h-4" strokeWidth={2} />
          </button>
        </form>
      </div>
    </header>
  );
}
