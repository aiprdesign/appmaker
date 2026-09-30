import Link from "next/link";
import { Compass, Home, LayoutGrid } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata = { title: "Page not found — Appmaker" };

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-20 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-pink-500 text-white shadow-2xl shadow-violet-600/40">
          <Compass className="h-8 w-8" />
        </span>
        <p className="mt-6 text-sm font-medium text-violet-300">404</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">This page doesn&apos;t exist</h1>
        <p className="mt-2 text-muted">The link may be old, or the app was deleted. Your apps are safe in My apps.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-black">
            <Home className="h-4 w-4" /> Home
          </Link>
          <Link href="/projects" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line px-4 text-sm hover:border-white/20">
            <LayoutGrid className="h-4 w-4" /> My apps
          </Link>
        </div>
      </main>
    </div>
  );
}
