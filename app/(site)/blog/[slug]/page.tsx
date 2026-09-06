import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import FadeIn from "@/components/FadeIn";
import JsonLd from "@/components/JsonLd";
import ArticleBody from "@/components/blog/ArticleBody";
import { blogPosts, getBlogPostBySlug } from "@/data/blog-posts";
import { articleJsonLd, breadcrumbJsonLd } from "@/lib/schema";
import { ArrowRightIcon } from "@/components/icons";

export function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.excerpt,
    openGraph: { title: post.title, description: post.excerpt, type: "article" },
  };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) notFound();

  return (
    <article>
      <JsonLd data={articleJsonLd(post)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Início", url: "/" },
          { name: "Blog", url: "/blog" },
          { name: post.title, url: `/blog/${post.slug}` },
        ])}
      />

      <section className="border-b border-outline-variant/20 bg-surface-container-lowest py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-6">
          <FadeIn>
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 font-label-bold text-sm font-semibold text-primary hover:underline"
            >
              <ArrowRightIcon className="h-4 w-4 rotate-180" />
              Voltar para o blog
            </Link>
            <p className="mt-6 font-label-bold text-xs font-semibold uppercase tracking-wide text-primary">
              {post.category}
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold leading-tight text-on-background sm:text-4xl">
              {post.title}
            </h1>
            <p className="mt-4 text-sm text-zinc-100/50">
              {formatDate(post.publishedAt)} · {post.readTimeMinutes} min de leitura
            </p>
          </FadeIn>
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="relative mb-10 aspect-[16/9] overflow-hidden rounded-2xl bg-surface-container">
          <Image src={post.coverImage} alt={post.title} fill className="object-cover" />
        </div>
        <ArticleBody blocks={post.body} />
      </div>
    </article>
  );
}
