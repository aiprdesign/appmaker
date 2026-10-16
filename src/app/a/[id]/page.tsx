import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { databaseConfigured } from "@/lib/server/db";
import { getWebApp } from "@/lib/server/web-apps";
import { vapidKeys } from "@/lib/server/app-alerts";
import { WebAppShell } from "./WebAppShell";

export const dynamic = "force-dynamic";

async function load(id: string) {
  return databaseConfigured() ? getWebApp(id).catch(() => null) : null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const app = await load(id);
  if (!app) return { title: "App not found", robots: { index: false } };
  return {
    title: app.name,
    robots: { index: false, follow: false },
    manifest: `/a/${id}/app.webmanifest`,
    appleWebApp: { capable: true, title: app.name, statusBarStyle: "default" },
    icons: app.icon ? { icon: `/a/${id}/icon`, apple: `/a/${id}/icon` } : undefined,
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#ffffff" };

/** An app published to the web: runs full screen, and installs to the Home Screen from the browser. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const app = await load(id);
  if (!app) notFound();
  const vapidKey = await vapidKeys()
    .then((k) => k.publicKey)
    .catch(() => "");
  return <WebAppShell id={id} name={app.name} files={app.files} vapidKey={vapidKey} />;
}
