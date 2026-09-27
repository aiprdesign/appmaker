"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ArrowUp, Globe, Loader2, Sparkles } from "lucide-react";
import { createProject } from "@/lib/storage";
import { TEMPLATES } from "@/lib/templates";
import type { SiteSummary } from "@/lib/types";
import { ModelButton } from "./AiSettings";
import { SiteCard } from "./SiteCard";

/** A link typed into the prompt: an explicit URL, a www. host, or a common TLD (not "Node.js"). */
const URL_IN_TEXT =
  /(?:https?:\/\/[^\s]+|\bwww\.[a-z0-9-]+\.[^\s]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|co|app|dev|ai|shop|store|biz|info|me|us|uk|ca|au|de|fr|in|nl|es|it|nz|ie)\b(?:\/[^\s]*)?)/i;

export function PromptBox() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const [url, setUrl] = useState("");
  const [site, setSite] = useState<SiteSummary | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  const detected = !site && !showUrl ? URL_IN_TEXT.exec(value)?.[0] : undefined;

  const importSite = async (address: string) => {
    if (!address.trim() || importing) return;
    setImporting(true);
    setImportError("");
    try {
      const res = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: address }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't read that website.");
      setSite(body.site);
      setShowUrl(false);
      setUrl("");
    } catch (e) {
      setShowUrl(true);
      setUrl(address);
      setImportError((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const start = () => {
    const text = value.trim() || (site ? `Turn ${site.siteName} (${site.url}) into a mobile app for its customers.` : "");
    if (!text || busy || importing) return;
    setBusy(true);
    const project = createProject(text, site ?? undefined);
    router.push(`/build/${project.id}?auto=1`);
  };

  return (
    <div id="start" className="mx-auto w-full max-w-2xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start();
        }}
        className="gradient-border rounded-2xl p-3 shadow-2xl shadow-violet-900/30 focus-within:ring-2 focus-within:ring-violet-400/70"
      >
        {site && (
          <div className="mb-2">
            <SiteCard site={site} onRemove={() => setSite(null)} />
          </div>
        )}
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              start();
            }
          }}
          rows={3}
          placeholder={
            site
              ? `What should the ${site.siteName} app do? (optional — press Enter to let AI decide)`
              : "Describe your app idea — e.g. a habit tracker with streaks and weekly stats…"
          }
          className="w-full resize-none bg-transparent px-2 py-1 text-base text-foreground outline-none placeholder:text-muted/70"
          aria-label="Describe your app"
        />

        {showUrl && !site && (
          <div className="mb-1 mt-1 px-1">
            <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2/60 px-2 py-1.5 focus-within:border-violet-500/60">
              <Globe className="h-4 w-4 shrink-0 text-muted" />
              <input
                autoFocus
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    importSite(url);
                  }
                }}
                placeholder="yourwebsite.com"
                className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted/70"
                aria-label="Website address"
              />
              <button
                type="button"
                onClick={() => importSite(url)}
                disabled={!url.trim() || importing}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-black disabled:opacity-40"
              >
                {importing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {importing ? "Reading site…" : "Import"}
              </button>
            </div>
            {importError && <p className="mt-1.5 px-1 text-xs text-rose-400">{importError}</p>}
          </div>
        )}

        {detected && (
          <button
            type="button"
            onClick={() => importSite(detected)}
            disabled={importing}
            className="mb-1 ml-1 inline-flex items-center gap-1.5 rounded-full border border-violet-500/40 bg-violet-500/10 px-2.5 py-1 text-xs text-violet-200 hover:bg-violet-500/20"
          >
            {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
            {importing ? "Reading site…" : `Use content from ${detected.replace(/^https?:\/\//, "").split("/")[0]}`}
          </button>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1">
            {!site && (
              <button
                type="button"
                onClick={() => setShowUrl((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs ${
                  showUrl ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                <Globe className="h-3.5 w-3.5" /> Import website
              </button>
            )}
            <ModelButton />
            <span className="hidden items-center gap-1.5 px-2 text-xs text-muted md:flex">
              <Sparkles className="h-3.5 w-3.5 text-violet-400" /> iOS + Android
            </span>
          </div>
          <button
            type="submit"
            disabled={(!value.trim() && !site) || busy || importing}
            className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 text-white transition disabled:opacity-40"
            aria-label="Build app"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </form>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {TEMPLATES.slice(0, 5).map((t) => (
          <button
            key={t.title}
            onClick={() => {
              setValue(t.prompt);
              ref.current?.focus();
            }}
            className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-muted transition hover:border-white/20 hover:text-foreground"
          >
            {t.emoji} {t.title}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TemplateButton({ prompt, children, className }: { prompt: string; children: React.ReactNode; className?: string }) {
  const router = useRouter();
  return (
    <button
      className={className}
      onClick={() => {
        const project = createProject(prompt);
        router.push(`/build/${project.id}?auto=1`);
      }}
    >
      {children}
    </button>
  );
}
