"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import CartIcon from "@/components/cart/CartIcon";
import { SearchIcon, MenuIcon, CloseIcon } from "@/components/icons";

const links = [
  { href: "/catalogo", label: "Catálogo" },
  { href: "/nossa-historia", label: "Nossa História" },
  { href: "/estrutura", label: "Estrutura" },
  { href: "/blog", label: "Blog" },
  { href: "/contato", label: "Contato" },
];

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    setOpen(false);
    router.push(`/catalogo${query.trim() ? `?busca=${encodeURIComponent(query.trim())}` : ""}`);
  }

  return (
    <header className="sticky top-0 z-50 border-b border-outline-variant/20 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link
          href="/"
          onClick={() => setOpen(false)}
          className="shrink-0 font-display text-lg font-bold tracking-tight text-on-background sm:text-xl"
        >
          REIS <span className="text-primary">MATERIAIS</span>
        </Link>

        <nav className="hidden items-center gap-6 lg:flex">
          {links.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`font-label-bold text-sm font-semibold transition-colors duration-200 hover:text-primary ${
                  active ? "text-primary" : "text-zinc-100"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <form
          onSubmit={handleSearch}
          className="ml-auto hidden max-w-xs flex-1 items-center gap-2 rounded-full border border-outline-variant/30 bg-surface-container px-4 py-2 lg:flex"
        >
          <SearchIcon className="h-4 w-4 shrink-0 text-on-background/50" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar produto..."
            className="w-full bg-transparent text-sm text-on-background placeholder:text-on-background/40 focus:outline-none"
          />
        </form>

        <div className="ml-auto flex items-center gap-1 lg:ml-0">
          <CartIcon />
          <button
            type="button"
            aria-label={open ? "Fechar menu" : "Abrir menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-on-background lg:hidden"
          >
            {open ? <CloseIcon className="h-6 w-6" /> : <MenuIcon className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-outline-variant/20 bg-background px-4 py-4 lg:hidden">
          <form
            onSubmit={handleSearch}
            className="mb-4 flex items-center gap-2 rounded-full border border-outline-variant/30 bg-surface-container px-4 py-2.5"
          >
            <SearchIcon className="h-4 w-4 shrink-0 text-on-background/50" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar produto..."
              className="w-full bg-transparent text-sm text-on-background placeholder:text-on-background/40 focus:outline-none"
            />
          </form>
          <ul className="flex flex-col gap-1">
            {links.map((link) => {
              const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className={`block min-h-[44px] rounded-lg px-3 py-2.5 text-base font-semibold transition-colors duration-200 ${
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-zinc-100 hover:bg-surface-container"
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </header>
  );
}
