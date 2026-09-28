import { SiteHeader } from "@/components/SiteHeader";
import { StatusPanel } from "./StatusPanel";

export const metadata = { title: "Status — Appmaker" };

export default function StatusPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <StatusPanel />
      </main>
    </div>
  );
}
