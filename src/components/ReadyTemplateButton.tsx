"use client";

import { useRouter } from "next/navigation";
import { readyProject } from "@/lib/ready-app";
import { createProject, uid, withVersion, saveProject } from "@/lib/storage";
import { templateSlug, type Template } from "@/lib/templates";

/** Opens a business template as a ready-made, working app: no AI and no waiting; the owner then fills in their details. */
export function ReadyTemplateButton({ template, children, className }: { template: Template; children: React.ReactNode; className?: string }) {
  const router = useRouter();
  const open = () => {
    const ready = readyProject(templateSlug(template), template);
    const project = createProject(template.prompt, undefined, undefined, {
      ...ready,
      messages: [
        {
          id: uid(),
          role: "assistant",
          content: `Your ${template.title.toLowerCase()} app is ready and works already: customers can browse, send ${ready.ready.info.items.length ? "requests" : "messages"} and follow them.\n\nReplace the example details with yours in **Your details** next to the phone. Want something different? Just ask here, e.g. "add a gallery of our work".`,
          createdAt: Date.now(),
        },
      ],
    });
    saveProject(withVersion(project, "Ready-made app").project);
    router.push(`/build/${project.id}?details=1`);
  };
  return (
    <button className={className} onClick={open}>
      {children}
    </button>
  );
}
