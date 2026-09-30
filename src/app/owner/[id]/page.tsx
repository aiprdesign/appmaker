import type { Metadata } from "next";
import { OwnerPage } from "./OwnerPage";

export const metadata: Metadata = { title: "Bookings", robots: { index: false, follow: false } };

/** The business's bookings page. Opened with the owner link (the key stays in the URL's #, never sent to the server in the address). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <OwnerPage id={(await params).id} />;
}
