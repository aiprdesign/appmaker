import { SiteHeader } from "@/components/SiteHeader";
import { PageAura } from "@/components/fx/PageAura";
import { CreditsPage } from "./CreditsPage";

export const metadata = { title: "Credits — Appmaker" };

export default function Credits() {
  return (
    <div className="relative isolate flex min-h-screen flex-col">
      <PageAura />
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
        <CreditsPage />
      </main>
    </div>
  );
}
