import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { SEO_PAGES, siteUrl } from "@/lib/seo";

/** Every public page: the home page, the landing pages, and the legal pages. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const h = await headers();
  const base = siteUrl() ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost"}`;
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    ...SEO_PAGES.map((p) => ({ url: `${base}${p.path}`, changeFrequency: "monthly" as const, priority: p.template ? 0.8 : 0.9 })),
    ...["/privacy", "/terms", "/accessibility"].map((path) => ({ url: `${base}${path}`, changeFrequency: "yearly" as const, priority: 0.3 })),
  ];
}
