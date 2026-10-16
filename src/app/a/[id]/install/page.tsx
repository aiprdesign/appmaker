import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { databaseConfigured } from "@/lib/server/db";
import { getWebApp } from "@/lib/server/web-apps";
import { InstallGuide } from "@/components/InstallGuide";

export const dynamic = "force-dynamic";

async function load(id: string) {
  return databaseConfigured() ? getWebApp(id).catch(() => null) : null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const app = await load((await params).id);
  return { title: app ? `Get the ${app.name} app` : "App not found", robots: { index: false, follow: false } };
}

/** A printable poster for the counter: the QR code and how to add the app to a phone. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const app = await load(id);
  if (!app) notFound();
  return (
    <main className="min-h-dvh bg-white p-6 text-black print:p-0">
      <InstallGuide id={id} name={app.name} hasIcon={!!app.icon} poster />
    </main>
  );
}
