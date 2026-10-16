import Link from "next/link";
import { SEO_PAGES } from "@/lib/seo";

/** The site's footer: short links to every landing page (for people and search engines), then the legal links. */
export function SiteFooter() {
  const apps = SEO_PAGES.filter((p) => p.template);
  const guides = SEO_PAGES.filter((p) => !p.template);
  const link = "inline-block py-1 hover:text-foreground";
  return (
    <footer className="border-t border-line px-4 py-10 text-xs text-muted">
      <nav aria-label="App makers" className="mx-auto max-w-6xl">
        <div className="grid gap-6 sm:grid-cols-[1fr_3fr]">
          <div>
            <h2 className="font-semibold text-foreground">Appmaker</h2>
            <ul className="mt-2 space-y-0.5">
              {guides.map((p) => (
                <li key={p.path}>
                  <Link href={p.path} className={link}>
                    {p.h1}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Apps for your business</h2>
            <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3 lg:grid-cols-4">
              {apps.map((p) => (
                <li key={p.path}>
                  <Link href={p.path} className={link}>
                    {p.h1}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </nav>
      <p className="mx-auto mt-8 max-w-6xl text-center">
        © {new Date().getFullYear()} Appmaker. Apple and App Store are trademarks of Apple Inc. Google Play is a trademark of Google LLC.{" "}
        <Link href="/terms" className="inline-block py-1 underline underline-offset-2 hover:text-foreground">
          Terms
        </Link>{" "}
        ·{" "}
        <Link href="/privacy" className="inline-block py-1 underline underline-offset-2 hover:text-foreground">
          Privacy
        </Link>{" "}
        ·{" "}
        <Link href="/accessibility" className="inline-block py-1 underline underline-offset-2 hover:text-foreground">
          Accessibility
        </Link>{" "}
        ·{" "}
        <Link href="/status" className="inline-block py-1 underline underline-offset-2 hover:text-foreground">
          Status
        </Link>
      </p>
    </footer>
  );
}
