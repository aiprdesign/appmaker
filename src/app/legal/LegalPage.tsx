import type { PageSection, StorePageContent } from "@/lib/store-pages";

/** A plain, readable page for app store links: light and dark, no site chrome. */
export function LegalPage({
  title,
  content,
  sections,
  other,
}: {
  title: string;
  content: StorePageContent;
  sections: PageSection[];
  other: { href: string; label: string };
}) {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12 text-[15px] leading-relaxed">
      <p className="text-sm text-muted">{content.developer}</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">
        {content.appName} — {title}
      </h1>
      {content.description && <p className="mt-2 text-muted">{content.description}</p>}
      {sections.map((s) => (
        <section key={s.heading} className="mt-8">
          <h2 className="text-lg font-semibold">{s.heading}</h2>
          {s.paragraphs.map((p) => (
            <p key={p} className="mt-2 text-foreground/90">
              {p}
            </p>
          ))}
          {s.bullets && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/90">
              {s.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <div className="mt-10 flex flex-wrap gap-3">
        <a href={`mailto:${content.email}`} className="inline-flex min-h-10 items-center rounded-lg bg-white px-4 text-sm font-medium text-black">
          Email {content.email}
        </a>
        {content.website && (
          <a href={content.website} className="inline-flex min-h-10 items-center rounded-lg border border-line px-4 text-sm" rel="noopener">
            Visit our website
          </a>
        )}
        <a href={other.href} className="inline-flex min-h-10 items-center rounded-lg border border-line px-4 text-sm">
          {other.label}
        </a>
      </div>
      <p className="mt-10 text-xs text-muted">Last updated {content.updated}.</p>
    </main>
  );
}
