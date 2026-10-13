import type { Metadata } from "next";
import { DataOwnerPage } from "./DataOwnerPage";

export const metadata: Metadata = { title: "App data", robots: { index: false, follow: false } };

/** The business's page for its app's data. Opened with the owner link (the key stays in the URL's #). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <DataOwnerPage id={(await params).id} />;
}
