import Link from "next/link";
import { AccountButton } from "./AccountButton";
import { Logo } from "./Logo";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Logo />
        <nav className="hidden items-center gap-6 text-sm text-muted md:flex">
          <Link href="/#ways" className="hover:text-foreground">Prompt or URL</Link>
          <Link href="/#how" className="hover:text-foreground">How it works</Link>
          <Link href="/#business" className="hover:text-foreground">For business</Link>
          <Link href="/#templates" className="hover:text-foreground">Templates</Link>
          <Link href="/#pricing" className="hover:text-foreground">Pricing</Link>
          <Link href="/#faq" className="hover:text-foreground">FAQ</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/projects" className="hidden whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-muted hover:text-foreground sm:inline-block">
            My apps
          </Link>
          <AccountButton />
          <Link
            href="/#start"
            className="whitespace-nowrap rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-black hover:bg-white/90"
          >
            Start building
          </Link>
        </div>
      </div>
    </header>
  );
}
