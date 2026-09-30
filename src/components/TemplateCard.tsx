import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { templateImage, type Template } from "@/lib/templates";
import { TemplateButton } from "./PromptBox";

/** A phone-shaped frame around an app screenshot (390×844). */
export function PhoneShot({
  src,
  alt,
  width,
  className = "",
  eager = false,
}: {
  src: string;
  alt: string;
  width: number;
  className?: string;
  eager?: boolean;
}) {
  return (
    <div
      className={`relative shrink-0 rounded-[1.7rem] border-[5px] border-neutral-900 bg-neutral-900 shadow-2xl shadow-black/50 ${className}`}
      style={{ maxWidth: width }}
    >
      <Image src={src} alt={alt} width={390} height={844} sizes={`${width}px`} loading={eager ? "eager" : "lazy"} className="h-auto w-full rounded-[1.35rem]" />
    </div>
  );
}

/** A template: its app's home screen, name and category; picking it fills in the prompt. */
export function TemplateCard({ template: t }: { template: Template }) {
  return (
    <TemplateButton
      prompt={t.prompt}
      className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface text-left transition hover:-translate-y-0.5 hover:border-white/20"
    >
      <div
        className="relative flex h-56 justify-center overflow-hidden px-3 pt-5 sm:h-64 md:h-72"
        style={{ background: `linear-gradient(160deg, ${t.color}66, ${t.color}14 70%)` }}
      >
        <div className="w-[80%] max-w-[176px] transition duration-300 group-hover:-translate-y-2">
          <PhoneShot src={templateImage(t)} alt={`${t.title} app home screen`} width={176} className="w-full" />
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-line p-4">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            <span aria-hidden="true">{t.emoji}</span> {t.title}
          </div>
          <div className="text-xs text-muted">{t.category}</div>
        </div>
        <span className="hidden shrink-0 items-center gap-1 text-xs text-violet-300 opacity-80 transition group-hover:opacity-100 sm:inline-flex">
          Use <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </TemplateButton>
  );
}
