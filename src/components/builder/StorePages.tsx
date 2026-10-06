"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, CheckCircle2, Copy, Download, ExternalLink, FileText, Globe, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { useCloud } from "@/lib/cloud";
import { downloadBlob } from "@/lib/export";
import { pageAsHtml, pageAsText, pageContentFor, type OwnPage, type StorePageContent } from "@/lib/store-pages";
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
export function StorePages({
  project,
  onChange,
  onListing,
}: {
  project: Project;
  onChange: (next: { listing: StoreListing; storePages: StorePagesState }) => void;
  /** Saves links the person typed in (pages hosted on their own site). */
  onListing: (listing: StoreListing) => void;
}) {
  const cloud = useCloud();
  const saved = project.storePages;
  const site = project.source;
  const [developer, setDeveloper] = useState(saved?.developer ?? site?.siteName ?? project.listing.name ?? "");
  const [email, setEmail] = useState(saved?.email ?? site?.contact?.emails[0] ?? cloud.user?.email ?? "");
  const [website, setWebsite] = useState(saved?.website ?? (site?.url.startsWith("https://") ? site.url : ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<OwnPage | null>(null);

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

  const copy = async (page: OwnPage) => {
    try {
      await navigator.clipboard.writeText(pageAsText(page, content));
      setCopied(page);
      setTimeout(() => setCopied((c) => (c === page ? null : c)), 2500);
    } catch {
      setError("Couldn't copy here. Use Download instead.");
    }
  };
  const download = (page: OwnPage) =>
    downloadBlob(new Blob([pageAsHtml(page, content)], { type: "text/html" }), page === "privacy" ? "privacy-policy.html" : "support.html");
  const isLink = (v?: string) => !!v && /^https:\/\/[^\s/]+\.[^\s]+/.test(v);

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
        <FileText className="h-4 w-4 text-violet-300" /> Support page, privacy policy &amp; terms
      </h2>
      <p className="mt-1 text-sm text-muted">
        Apple requires a support page, and both stores require a privacy policy. Appmaker writes them for this app, based on what its code does. Let Appmaker
        host them, or put them on your own website: either way, the links go in your listing.
      </p>

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
          The privacy policy covers {covers.length ? covers.join(", ") : "an app that doesn't collect or store personal information"}. The support page includes
          an accessibility section with your email.
        </p>
      </div>
      <div
        role="note"
        aria-label="You're responsible for these pages"
        className="mt-4 flex gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-relaxed text-amber-100/90"
      >
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        <div>
          <p className="font-medium text-amber-100">You&apos;re responsible for what these pages say</p>
          <p className="mt-1">
            Appmaker drafts them from what your app&apos;s code does, but it can&apos;t see everything: services, tools or data you add outside Appmaker, how
            your business handles information, or the laws where you publish. Before you publish, read every page, correct anything that isn&apos;t true for
            your app, fill in any [placeholders], and update them whenever your app changes. This is a starting point, not legal advice: if you&apos;re unsure,
            have a lawyer check them. Whether you use Appmaker&apos;s pages or host your own, what they say is your responsibility.
          </p>
        </div>
      </div>
      <h3 className="mt-5 text-sm font-semibold">Option 1: Appmaker hosts them (quickest)</h3>
      {cloud.enabled === false ? (
        <p className="mt-3 rounded-lg bg-surface-2 p-3 text-xs text-muted">Hosted pages need accounts on this site. Use option 2 below instead.</p>
      ) : !cloud.user ? (
        <p className="mt-3 rounded-lg bg-surface-2 p-3 text-sm text-muted">
          <Link href="/login" className="inline-block py-1 font-medium text-foreground underline underline-offset-2">
            Sign in
          </Link>{" "}
          to create them for free. They stay linked to your account.
        </p>
      ) : (
        <div className="mt-2 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {!upToDate && (
              <button
                onClick={create}
                disabled={busy}
                className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-white px-3 text-sm font-medium text-black disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <RefreshCw className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                {saved ? "Update the pages" : "Create support, privacy & terms pages"}
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
            {saved && project.storePages && (
              <a
                href={`/legal/${project.storePages.id}/terms`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
              >
                Terms of use <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-rose-300">
          {error}
        </p>
      )}

      <h3 className="mt-6 text-sm font-semibold">Option 2: host them on your own site</h3>
      <p className="mt-1 text-xs text-muted">
        Prefer your own website? Copy the pages (or download them as web pages), publish them on your site, then paste the links below. Missing details show as
        [placeholders] to fill in.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {(["privacy", "support"] as const).map((page) => (
          <div key={page} className="flex flex-wrap gap-2">
            <button
              onClick={() => copy(page)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-xs hover:border-white/20"
            >
              {copied === page ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
              {copied === page ? "Copied" : page === "privacy" ? "Copy privacy policy" : "Copy support page"}
            </button>
            <button
              onClick={() => download(page)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-xs hover:border-white/20"
            >
              <Download className="h-3.5 w-3.5" /> {page === "privacy" ? "Download privacy-policy.html" : "Download support.html"}
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-3 text-xs text-muted sm:grid-cols-2">
        <div className="rounded-lg bg-surface-2 p-3">
          <p className="flex items-center gap-1.5 font-medium text-foreground">
            <Globe className="h-3.5 w-3.5" /> Free with Google Sites (about 5 minutes)
          </p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-4">
            <li>
              Open{" "}
              <a
                href="https://sites.google.com/new"
                target="_blank"
                rel="noreferrer"
                className="inline-block py-1 underline underline-offset-2 hover:text-foreground"
              >
                sites.google.com
              </a>{" "}
              and start a blank site.
            </li>
            <li>Name it after your app, add a text box and paste the privacy policy.</li>
            <li>Add a second page called Support and paste the support page.</li>
            <li>Press Publish, choose a web address, then copy each page&apos;s link.</li>
          </ol>
        </div>
        <div className="rounded-lg bg-surface-2 p-3">
          <p className="flex items-center gap-1.5 font-medium text-foreground">
            <Globe className="h-3.5 w-3.5" /> Your own website (Hostinger, WordPress, Wix, Squarespace…)
          </p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-4">
            <li>
              Add a new page called Privacy policy and paste the policy, or upload privacy-policy.html to your hosting (e.g. Hostinger&apos;s File Manager).
            </li>
            <li>Do the same for a Support page.</li>
            <li>Publish, open each page and copy its address (it must start with https://).</li>
          </ol>
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted">
          Your privacy policy link
          <input
            className={`${input} mt-1`}
            type="url"
            placeholder="https://yoursite.com/privacy"
            value={project.listing.privacyPolicyUrl ?? ""}
            onChange={(e) => onListing({ ...project.listing, privacyPolicyUrl: e.target.value.trim() })}
          />
        </label>
        <label className="text-xs text-muted">
          Your support page link
          <input
            className={`${input} mt-1`}
            type="url"
            placeholder="https://yoursite.com/support"
            value={project.listing.supportUrl ?? ""}
            onChange={(e) => onListing({ ...project.listing, supportUrl: e.target.value.trim() })}
          />
        </label>
      </div>
      {(project.listing.privacyPolicyUrl || project.listing.supportUrl) &&
        !(isLink(project.listing.privacyPolicyUrl) && isLink(project.listing.supportUrl)) && (
          <p className="mt-2 text-xs text-amber-200">Both links need to be full web addresses starting with https:// so the stores can open them.</p>
        )}
    </section>
  );
}
