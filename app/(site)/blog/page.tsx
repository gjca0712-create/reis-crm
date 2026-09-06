import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import BlogCard from "@/components/blog/BlogCard";
import FadeIn from "@/components/FadeIn";
import { blogPosts } from "@/data/blog-posts";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Dicas técnicas de obra e reforma: quanto material comprar, como calcular argamassa e como planejar sua reforma sem desperdício.",
};

export default function BlogPage() {
  const posts = [...blogPosts].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));

  return (
    <>
      <PageHeader title="Central de Conteúdo">
        Guias práticos para calcular material, planejar reforma e evitar desperdício na sua obra.
      </PageHeader>

      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post, index) => (
              <FadeIn key={post.slug} delay={index * 60}>
                <BlogCard post={post} />
              </FadeIn>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
