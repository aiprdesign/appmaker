import { SiteHeader } from "@/components/SiteHeader";
import { ProjectList } from "./ProjectList";

export const metadata = { title: "My apps — Appmaker" };

export default function ProjectsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <ProjectList />
      </main>
    </div>
  );
}
