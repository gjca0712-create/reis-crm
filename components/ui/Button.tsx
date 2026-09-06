import Link from "next/link";
import type { ReactNode, ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors px-4 py-2.5 text-sm disabled:opacity-50 disabled:pointer-events-none";

const variants = {
  primary: "bg-gold-400 text-page hover:bg-gold-300",
  secondary: "bg-surface-raised text-ink-primary border border-border-strong hover:bg-surface-raised/70",
  ghost: "text-ink-secondary hover:text-ink-primary hover:bg-surface-raised",
  danger: "bg-status-critical/10 text-status-critical border border-status-critical/30 hover:bg-status-critical/20",
};

export type ButtonVariant = keyof typeof variants;

export function Button({
  children,
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button className={cn(base, variants[variant], className)} {...props}>
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
  className?: string;
}) {
  return (
    <Link href={href} className={cn(base, variants[variant], className)}>
      {children}
    </Link>
  );
}
