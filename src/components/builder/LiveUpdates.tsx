"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, CircleAlert, Loader2, Power, RefreshCw, Radio } from "lucide-react";
import { useCloud } from "@/lib/cloud";
import { LIVE_FILE, liveModule, type LiveContent } from "@/lib/live";
import type { Project } from "@/lib/types";

type Live = NonNullable<Project["live"]>;

async function call(path: string, method: string, body: unknown = {}) {
  const res = await fetch(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong. Try again.");
  return data;
}

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "not yet");

/**
 * Keeps a website app up to date with the website: Appmaker re-reads the site
 * (at most daily, only when the app asks) and the app picks up new photos,
 * prices, items, hours and offers without a new build.
 */
export function LiveUpdates({ project, onChange }: { project: Project; onChange: (live: Live | undefined, files: Project["files"]) => void }) {
  const cloud = useCloud();
  const [busy, setBusy] = useState<"on" | "refresh" | "off" | null>(null);
  const [error, setError] = useState("");
  const [found, setFound] = useState<LiveContent | null>(null);
  const live = project.live;
  if (!project.source) return null;

  const apply = (next: Live | undefined) => onChange(next, { ...project.files, [LIVE_FILE]: liveModule(next?.feedUrl ?? null) });

  const run = async (kind: "on" | "refresh" | "off") => {
    setBusy(kind);
    setError("");
    try {
      if (kind === "on") {
        const feed = await call("/api/live", "POST", { projectId: project.id, url: project.source!.url });
        setFound(feed.content);
        apply({ id: feed.id, url: feed.url, feedUrl: feed.feedUrl, fetchedAt: feed.fetchedAt, error: feed.error });
      } else if (kind === "refresh" && live) {
        const feed = await call(`/api/live/${live.id}`, "POST");
        setFound(feed.content);
        apply({ ...live, fetchedAt: feed.fetchedAt, error: feed.error });
      } else if (kind === "off" && live) {
        await call(`/api/live/${live.id}`, "DELETE").catch(() => undefined);
        setFound(null);
        apply(undefined);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  const summary = found
    ? [
        found.images.length && `${found.images.length} photos`,
        found.items.length && `${found.items.length} prices`,
        found.hours.length && "opening hours",
        found.offers.length && `${found.offers.length} offers`,
        Object.keys(found.contact).filter((k) => k !== "social").length && "contact details",
      ].filter(Boolean)
    : [];

  return (
    <section className="rounded-2xl border border-line bg-surface p-5" aria-labelledby="live-title">
      <h2 id="live-title" className="flex items-center gap-2 font-semibold">
        <Radio className="h-4 w-4 text-violet-300" /> Live updates from your website
      </h2>
      <p className="mt-1 text-sm text-muted">
        When you change {new URL(project.source.url).hostname.replace(/^www\./, "")} — new photos, prices, dishes, hours or offers — the app shows them within a
        day, with no new build or store review. Photos load straight from your website.
      </p>
      {cloud.enabled === false ? (
        <p className="mt-3 rounded-lg bg-surface-2 p-3 text-xs text-muted">Live updates need accounts on this site.</p>
      ) : !cloud.user ? (
        <p className="mt-3 rounded-lg bg-surface-2 p-3 text-sm text-muted">
          <Link href="/login" className="inline-block py-1 font-medium text-foreground underline underline-offset-2">
            Sign in
          </Link>{" "}
          to turn on live updates.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {live ? (
            <p className="flex items-start gap-1.5 text-sm">
              {live.error ? (
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              )}
              <span>
                On. Last read {when(live.fetchedAt)}
                {live.error ? ` — ${live.error} The app keeps showing the last good content.` : "."}
                {summary.length ? <span className="text-muted"> Found {summary.join(", ")}.</span> : null}
              </span>
            </p>
          ) : (
            <p className="text-sm text-muted">Off. The app shows the content it was built with.</p>
          )}
          {error && (
            <p role="alert" className="text-xs text-rose-300">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {!live ? (
              <button
                onClick={() => run("on")}
                disabled={!!busy}
                className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-white px-3 text-sm font-medium text-black disabled:opacity-60"
              >
                {busy === "on" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />} Turn on live updates
              </button>
            ) : (
              <>
                <button
                  onClick={() => run("refresh")}
                  disabled={!!busy}
                  className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-line px-3 text-sm hover:border-white/20 disabled:opacity-60"
                >
                  {busy === "refresh" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh now
                </button>
                <button
                  onClick={() => run("off")}
                  disabled={!!busy}
                  className="inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-sm text-muted hover:text-foreground disabled:opacity-60"
                >
                  {busy === "off" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />} Turn off
                </button>
              </>
            )}
          </div>
          <p className="text-xs text-muted">Turning it on or off changes the app, so make a new build afterwards for the store version.</p>
        </div>
      )}
    </section>
  );
}
