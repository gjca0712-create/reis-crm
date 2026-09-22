"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { NAV_ITEMS } from "./nav-items";
import { canAccess, type Feature } from "@/lib/permissions";

export function Sidebar({ features }: { features: Feature[] }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => canAccess(features, item.feature));

  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex items-center gap-3 px-5 h-16 border-b border-border">
        <Image
          src="/reis-crown.png"
          alt="Reis Materiais"
          width={600}
          height={222}
          unoptimized
          priority
          className="h-8 w-auto shrink-0"
        />
        <div className="leading-tight">
          <div className="text-sm font-bold text-gold-400 tracking-wide">REIS MATERIAIS</div>
          <div className="text-[11px] text-ink-muted">CRM</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-gold-400/10 text-gold-400"
                  : "text-ink-secondary hover:bg-surface-raised hover:text-ink-primary"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" strokeWidth={2} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
