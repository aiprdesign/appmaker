import type { Metadata } from "next";
import { getLegal } from "@/lib/server/site-legal";
import { privacySections } from "@/lib/site-legal";
import { SiteLegalPage } from "../SiteLegalPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Privacy policy — Appmaker" };

export default async function PrivacyPage() {
  return <SiteLegalPage title="Privacy policy" sections={privacySections()} details={await getLegal()} other={{ href: "/terms", label: "Terms of service" }} />;
}
