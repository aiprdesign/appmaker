import { SiteHeader } from "@/components/SiteHeader";
import { AdminApp } from "./AdminApp";

export const metadata = { title: "Admin — Appmaker", robots: { index: false, follow: false } };

export default function AdminPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <AdminApp />
      </main>
    </div>
  );
}
