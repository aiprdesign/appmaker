import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { PhoneShot } from "@/components/TemplateCard";
import { ReadyTemplateButton } from "@/components/ReadyTemplateButton";
import { SEO_PAGES, siteUrl, type SeoPage } from "@/lib/seo";

/** Title, description, canonical link and share previews for a landing page. */
export function seoMetadata(page: SeoPage): Metadata {
  const base = siteUrl();
  return {
    title: page.title,
    description: page.description,
    ...(base ? { metadataBase: new URL(base) } : {}),
    alternates: { canonical: page.path },
    openGraph: { title: page.title, description: page.description, url: page.path, type: "website", siteName: "Appmaker", ...(page.image ? { images: [{ url: page.image, width: 390, height: 844 }] } : {}) },
    twitter: { card: page.image ? "summary_large_image" : "summary", title: page.title, description: page.description },
  };
}

/** Structured data for rich results: the app, its questions and answers, and where the page sits. */
function jsonLd(page: SeoPage) {
  const base = siteUrl() ?? "";
  return [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: page.h1,
      applicationCategory: "BusinessApplication",
      operatingSystem: "iOS, Android",
      description: page.description,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      ...(page.image ? { image: `${base}${page.image}` } : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: page.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Appmaker", item: `${base}/` },
        { "@type": "ListItem", position: 2, name: page.h1, item: `${base}${page.path}` },
      ],
    },
  ];
}

/** A short landing page: heading, one line, the app, three benefits, two questions, and the way in. */
export function SeoLanding({ page }: { page: SeoPage }) {
  const related = SEO_PAGES.filter((p) => p.template && p.path !== page.path).slice(0, 6);
  const cta = "inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-5 font-semibold text-black hover:bg-white/90";
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-14">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(page)).replace(/</g, "\\u003c") }} />
        <div className="grid items-center gap-10 md:grid-cols-[1fr_auto]">
          <div>
            <nav aria-label="Breadcrumb" className="text-xs text-muted">
              <Link href="/" className="hover:text-foreground">
                Appmaker
              </Link>{" "}
              / {page.h1}
            </nav>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">{page.h1}</h1>
            <p className="mt-4 max-w-xl text-lg text-muted">{page.description}</p>
            <ul className="mt-6 space-y-2">
              {page.benefits.map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" aria-hidden /> {b}
                </li>
              ))}
            </ul>
            <div className="mt-8">
              {page.template ? (
                <ReadyTemplateButton template={page.template} className={cta}>
                  Open the {page.h1.toLowerCase()} <ArrowRight className="h-4 w-4" aria-hidden />
                </ReadyTemplateButton>
              ) : (
                <Link href={page.path === "/website-to-app" ? "/?mode=url#start" : "/#start"} className={cta}>
                  Start free <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              )}
            </div>
          </div>
          {page.image && <PhoneShot src={page.image} alt={`${page.h1} home screen`} width={260} className="mx-auto w-[260px]" eager />}
        </div>

        <section aria-labelledby="faq" className="mt-16 max-w-2xl">
          <h2 id="faq" className="text-xl font-semibold">
            Questions
          </h2>
          <dl className="mt-4 space-y-4">
            {page.faq.map((f) => (
              <div key={f.q}>
                <dt className="font-medium">{f.q}</dt>
                <dd className="mt-1 text-muted">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        {related.length > 0 && (
          <section aria-labelledby="more" className="mt-14">
            <h2 id="more" className="text-xl font-semibold">
              More apps
            </h2>
            <ul className="mt-4 flex flex-wrap gap-2">
              {related.map((p) => (
                <li key={p.path}>
                  <Link href={p.path} className="inline-flex min-h-9 items-center rounded-full border border-line px-4 text-sm hover:border-white/30">
                    {p.h1}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
