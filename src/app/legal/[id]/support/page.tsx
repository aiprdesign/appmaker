import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPages } from "@/lib/server/store-pages";
import { supportSections } from "@/lib/store-pages";
import { LegalPage } from "../../LegalPage";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const content = await getPages((await params).id).catch(() => null);
  return { title: content ? `${content.appName} — Support` : "Support", robots: { index: false } };
}

export default async function SupportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const content = await getPages(id).catch(() => null);
  if (!content) notFound();
  return <LegalPage title="Support" content={content} sections={supportSections(content)} other={{ href: `/legal/${id}/privacy`, label: "Privacy policy" }} />;
}
