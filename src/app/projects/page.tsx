import { SiteHeader } from "@/components/SiteHeader";
import { PageAura } from "@/components/fx/PageAura";
import { ProjectList } from "./ProjectList";

export const metadata = { title: "My apps — Appmaker" };

export default function ProjectsPage() {
  return (
    <div className="relative isolate flex min-h-screen flex-col">
      <PageAura />
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <ProjectList />
      </main>
    </div>
  );
}
