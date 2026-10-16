import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { siteUrl } from "@/lib/seo";

/** Search engines: the public pages, not the builder, accounts, admin or API. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers();
  const base = siteUrl() ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost"}`;
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/build/", "/admin", "/owner/", "/projects", "/login", "/credits", "/access"] },
    sitemap: `${base}/sitemap.xml`,
  };
}
