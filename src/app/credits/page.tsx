import { SiteHeader } from "@/components/SiteHeader";
import { CreditsPage } from "./CreditsPage";

export const metadata = { title: "Credits — Appmaker" };

export default function Credits() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
        <CreditsPage />
      </main>
    </div>
  );
}
