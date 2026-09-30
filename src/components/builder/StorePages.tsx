"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, ExternalLink, FileText, Loader2, RefreshCw } from "lucide-react";
import { useCloud } from "@/lib/cloud";
import { pageContentFor, type StorePageContent } from "@/lib/store-pages";
import type { Project, StoreListing, StorePagesState } from "@/lib/types";

const input = "w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-violet-500/60";

/** What the pages say, minus the date, to tell when they're out of date. */
function fingerprint(c: StorePageContent): string {
  return JSON.stringify({ ...c, updated: "" });
}

/**
 * Creates the support page and privacy policy the stores ask for, hosted by
 * Appmaker, and fills in both links in the store listing.
 */
export function StorePages({ project, onChange }: { project: Project; onChange: (next: { listing: StoreListing; storePages: StorePagesState }) => void }) {
  const cloud = useCloud();
  const saved = project.storePages;
  const site = project.source;
  const [developer, setDeveloper] = useState(saved?.developer ?? site?.siteName ?? project.listing.name ?? "");
  const [email, setEmail] = useState(saved?.email ?? site?.contact?.emails[0] ?? cloud.user?.email ?? "");
  const [website, setWebsite] = useState(saved?.website ?? (site?.url.startsWith("https://") ? site.url : ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const content = pageContentFor(project, { developer: developer.trim(), email: email.trim(), website: website.trim() || undefined });
  const upToDate = !!saved && saved.fingerprint === fingerprint(content);
  const f = content.facts;
  const covers = [
    f.onDevice && "data saved on the device",
    f.notifications && "notifications",
    (f.camera || f.photos) && "camera and photos",
    f.services.length && `${f.services.length} web service${f.services.length === 1 ? "" : "s"}`,
    f.opensLinks && "call, maps and other links",
  ].filter(Boolean) as string[];

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/pages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: project.id, content }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't create the pages. Try again.");
      onChange({
        listing: { ...project.listing, supportUrl: data.supportUrl, privacyPolicyUrl: data.privacyUrl },
        storePages: {
          id: data.id,
          developer: content.developer,
          email: content.email,
          ...(content.website ? { website: content.website } : {}),
          fingerprint: fingerprint(content),
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the pages.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-line bg-surface p-5" aria-labelledby="store-pages-title">
      <h2 id="store-pages-title" className="flex items-center gap-2 font-semibold">
        <FileText className="h-4 w-4 text-violet-300" /> Support page &amp; privacy policy
      </h2>
      <p className="mt-1 text-sm text-muted">
        Apple requires a support page, and both stores require a privacy policy. Appmaker writes and hosts both for this app, based on what its code does, and
        fills in the links below.
      </p>

      {cloud.enabled === false ? (
        <p className="mt-3 rounded-lg bg-surface-2 p-3 text-xs text-muted">
          Hosted pages need accounts on this site. Add your own links in the listing instead.
        </p>
      ) : !cloud.user ? (
        <p className="mt-3 rounded-lg bg-surface-2 p-3 text-sm text-muted">
          <Link href="/login" className="inline-block py-1 font-medium text-foreground underline underline-offset-2">
            Sign in
          </Link>{" "}
          to create them for free. They stay linked to your account.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs text-muted">
              Business or developer name
              <input className={`${input} mt-1`} value={developer} onChange={(e) => setDeveloper(e.target.value)} />
            </label>
            <label className="text-xs text-muted">
              Contact email for customers
              <input className={`${input} mt-1`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="text-xs text-muted">
              Website (optional)
              <input className={`${input} mt-1`} type="url" placeholder="https://" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </label>
          </div>
          <p className="text-xs text-muted">
            The privacy policy covers {covers.length ? covers.join(", ") : "an app that doesn't collect or store personal information"}. It&apos;s a starting
            point, not legal advice: read it before you publish.
          </p>
          {error && (
            <p role="alert" className="text-xs text-rose-300">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {!upToDate && (
              <button
                onClick={create}
                disabled={busy}
                className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-white px-3 text-sm font-medium text-black disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <RefreshCw className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                {saved ? "Update the pages" : "Create support & privacy pages"}
              </button>
            )}
            {saved && upToDate && (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300">
                <CheckCircle2 className="h-4 w-4" /> Up to date, and linked in the listing
              </span>
            )}
            {saved && !upToDate && <span className="text-xs text-amber-200">The app or these details changed since the pages were made.</span>}
            {saved && project.listing.supportUrl && (
              <a
                href={project.listing.supportUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
              >
                Support page <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {saved && project.listing.privacyPolicyUrl && (
              <a
                href={project.listing.privacyPolicyUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
              >
                Privacy policy <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
