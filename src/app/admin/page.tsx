import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/Logo";
import { AdminApp } from "./AdminApp";

export const metadata = { title: "Admin — Appmaker", robots: { index: false, follow: false } };

export default function AdminPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-2">
            <Logo />
            <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-violet-200">Admin</span>
          </div>
          <Link href="/" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-muted hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to site
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <AdminApp />
      </main>
    </div>
  );
}
