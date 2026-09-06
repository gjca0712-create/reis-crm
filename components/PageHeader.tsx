import type { ReactNode } from "react";
import FadeIn from "@/components/FadeIn";

export default function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="border-b border-outline-variant/20 bg-surface-container-lowest py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-6">
        <FadeIn>
          <h1 className="max-w-2xl font-display text-4xl font-bold leading-tight text-on-background sm:text-5xl">
            {title}
          </h1>
          {children && <div className="mt-4 max-w-xl text-zinc-100/70">{children}</div>}
        </FadeIn>
      </div>
    </section>
  );
}
