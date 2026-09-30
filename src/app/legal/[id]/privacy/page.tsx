import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPages } from "@/lib/server/store-pages";
import { privacySections } from "@/lib/store-pages";
import { LegalPage } from "../../LegalPage";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const content = await getPages((await params).id).catch(() => null);
  return { title: content ? `${content.appName} — Privacy policy` : "Privacy policy", robots: { index: false } };
}

export default async function PrivacyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const content = await getPages(id).catch(() => null);
  if (!content) notFound();
  return <LegalPage title="Privacy policy" content={content} sections={privacySections(content)} other={{ href: `/legal/${id}/support`, label: "Support" }} />;
}
