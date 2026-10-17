import type { Metadata, Viewport } from "next";
import { DataOwnerPage } from "./DataOwnerPage";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const base = `/owner/data/${(await params).id}`;
  return {
    title: "App data",
    robots: { index: false, follow: false },
    // Add to Home Screen: its own app icon, full screen (on iPhone this is what allows alerts).
    manifest: `${base}/app.webmanifest`,
    appleWebApp: { capable: true, title: "Orders", statusBarStyle: "black-translucent" },
    icons: { apple: `${base}/app-icon?size=180` },
  };
}

export const viewport: Viewport = { themeColor: "#0a0a09" };

/** The business's page for its app's data. Opened with the owner link (the key stays in the URL's #). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <DataOwnerPage id={(await params).id} />;
}
