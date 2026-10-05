"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/cn";
import { NAV_ITEMS, SIDEBAR_COOKIE } from "./nav-items";
import { canAccess, type Feature } from "@/lib/permissions";
import { TeamChatBadge } from "./TeamChatBadge";

export function Sidebar({ features, collapsed: initialCollapsed }: { features: Feature[]; collapsed: boolean }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const items = NAV_ITEMS.filter((item) => !item.feature || canAccess(features, item.feature));

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  }

  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <aside
      className={cn(
        "hidden lg:flex shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div className={cn("flex items-center h-16 border-b border-border", collapsed ? "justify-center" : "gap-3 pl-5 pr-3")}>
        {!collapsed && (
          <>
            <Image
              src="/reis-crown.png"
              alt="Reis Materiais"
              width={600}
              height={222}
              unoptimized
              priority
              className="h-8 w-auto shrink-0"
            />
            <div className="leading-tight min-w-0">
              <div className="text-sm font-bold text-gold-400 tracking-wide">REIS MATERIAIS</div>
              <div className="text-[11px] text-ink-muted">CRM</div>
            </div>
          </>
        )}
        <button
          type="button"
          onClick={toggle}
          title={collapsed ? "Mostrar menu" : "Recolher menu"}
          aria-label={collapsed ? "Mostrar menu" : "Recolher menu"}
          aria-expanded={!collapsed}
          className={cn(
            "w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink-primary hover:bg-surface-raised transition-colors",
            !collapsed && "ml-auto"
          )}
        >
          <ToggleIcon className="w-4 h-4" strokeWidth={2} />
        </button>
      </div>

      <nav className={cn("flex-1 overflow-y-auto py-4 space-y-1", collapsed ? "px-2" : "px-3")}>
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              aria-label={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center rounded-lg py-2.5 text-sm font-medium transition-colors",
                collapsed ? "justify-center px-0" : "gap-3 px-3",
                active
                  ? "bg-gold-400/10 text-gold-400"
                  : "text-ink-secondary hover:bg-surface-raised hover:text-ink-primary"
              )}
            >
              <span className="relative shrink-0">
                <Icon className="w-4 h-4" strokeWidth={2} />
                {collapsed && item.badge === "team-chat" && <TeamChatBadge compact />}
              </span>
              {!collapsed && item.label}
              {!collapsed && item.badge === "team-chat" && <TeamChatBadge />}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
