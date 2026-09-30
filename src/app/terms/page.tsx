import type { Metadata } from "next";
import { getLegal } from "@/lib/server/site-legal";
import { termsSections } from "@/lib/site-legal";
import { SiteLegalPage } from "../SiteLegalPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Terms of service — Appmaker" };

export default async function TermsPage() {
  return <SiteLegalPage title="Terms of service" sections={termsSections()} details={await getLegal()} other={{ href: "/privacy", label: "Privacy policy" }} />;
}
