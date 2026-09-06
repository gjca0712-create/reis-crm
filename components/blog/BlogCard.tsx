import Image from "next/image";
import Link from "next/link";
import type { BlogPost } from "@/lib/types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default function BlogCard({ post }: { post: BlogPost }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-outline-variant/10 bg-surface-container transition-transform duration-200 hover:-translate-y-1"
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-surface-container-lowest">
        <Image
          src={post.coverImage}
          alt={post.title}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <span className="font-label-bold text-xs font-semibold uppercase tracking-wide text-primary">
          {post.category}
        </span>
        <h3 className="font-display text-lg font-semibold leading-snug text-on-background">
          {post.title}
        </h3>
        <p className="line-clamp-2 text-sm text-on-background/60">{post.excerpt}</p>
        <p className="mt-auto pt-3 text-xs text-on-background/40">
          {formatDate(post.publishedAt)} · {post.readTimeMinutes} min de leitura
        </p>
      </div>
    </Link>
  );
}
