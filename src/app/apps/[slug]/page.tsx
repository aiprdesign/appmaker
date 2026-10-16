import { notFound } from "next/navigation";
import { SeoLanding, seoMetadata } from "@/components/SeoLanding";
import { SEO_PAGES, seoPage } from "@/lib/seo";

// Only the business templates' pages exist; anything else is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return SEO_PAGES.filter((p) => p.path.startsWith("/apps/")).map((p) => ({ slug: p.path.slice("/apps/".length) }));
}

export async function generateMetadata({ params }: PageProps<"/apps/[slug]">) {
  const page = seoPage(`/apps/${(await params).slug}`);
  return page ? seoMetadata(page) : {};
}

export default async function AppLandingPage({ params }: PageProps<"/apps/[slug]">) {
  const page = seoPage(`/apps/${(await params).slug}`);
  if (!page) notFound();
  return <SeoLanding page={page} />;
}
