"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { NAV_ITEMS } from "./nav-items";
import type { Role } from "@/lib/constants";
import { canAccess } from "@/lib/permissions";

export function MobileNav({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => canAccess(role, item.feature));

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-9 h-9 rounded-lg border border-border-strong text-ink-secondary flex items-center justify-center"
        aria-label="Abrir menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="relative w-72 max-w-[80vw] bg-surface border-r border-border h-full flex flex-col">
            <div className="flex items-center justify-between px-5 h-16 border-b border-border">
              <div className="flex items-center gap-3">
                <Image
                  src="/reis-crown.png"
                  alt="Reis Materiais"
                  width={600}
                  height={222}
                  unoptimized
                  priority
                  className="h-8 w-auto shrink-0"
                />
                <span className="text-sm font-bold text-gold-400 tracking-wide">REIS MATERIAIS</span>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Fechar menu">
                <X className="w-5 h-5 text-ink-secondary" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
              {items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
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
          </div>
        </div>
      )}
    </div>
  );
}
