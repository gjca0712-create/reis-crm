import FadeIn from "@/components/FadeIn";
import BlogCard from "@/components/blog/BlogCard";
import { blogPosts } from "@/data/blog-posts";
import Link from "next/link";
import { ArrowRightIcon } from "@/components/icons";

export default function BlogPreview() {
  const latest = [...blogPosts]
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))
    .slice(0, 3);

  return (
    <section className="border-t border-outline-variant/20 bg-surface-container-lowest py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-6">
        <FadeIn>
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div>
              <p className="font-label-bold text-sm font-semibold uppercase tracking-wide text-primary">
                Central de Conteúdo
              </p>
              <h2 className="mt-2 font-display text-3xl font-bold text-on-background sm:text-4xl">
                Dicas para sua obra ou reforma
              </h2>
            </div>
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 font-label-bold text-sm font-semibold text-primary hover:underline"
            >
              Ver todos os artigos
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </FadeIn>

        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {latest.map((post, index) => (
            <FadeIn key={post.slug} delay={index * 100}>
              <BlogCard post={post} />
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
