import { redirect } from "next/navigation";
import { PageAura } from "@/components/fx/PageAura";
import { safeNext, siteLocked } from "@/lib/server/site-access";
import { AccessForm } from "./AccessForm";

export const metadata = {
  title: "Enter PIN — Appmaker",
  robots: { index: false },
};

export default async function AccessPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (!siteLocked()) redirect(next);
  return (
    <div className="relative isolate flex min-h-screen items-center justify-center px-4 py-12">
      <PageAura />
      <main className="w-full max-w-sm rounded-3xl border border-line bg-surface/80 p-6 shadow-[0_30px_80px_-40px_rgba(139,92,246,0.5)] backdrop-blur md:p-8">
        <AccessForm next={next} />
      </main>
    </div>
  );
}
