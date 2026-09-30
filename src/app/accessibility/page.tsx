import type { Metadata } from "next";
import { getLegal } from "@/lib/server/site-legal";
import { accessibilitySections } from "@/lib/site-legal";
import { SiteLegalPage } from "../SiteLegalPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Accessibility statement — Appmaker" };

export default async function AccessibilityPage() {
  return (
    <SiteLegalPage
      title="Accessibility statement"
      sections={accessibilitySections()}
      details={await getLegal()}
      other={{ href: "/privacy", label: "Privacy policy" }}
    />
  );
}
