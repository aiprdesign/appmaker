"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Loader2, Play, Search, ShieldAlert, Trash2, X } from "lucide-react";
import { checkCodeSafety } from "@/lib/code-safety";
import { PhoneFrame } from "@/components/PhoneFrame";
import { Preview } from "@/components/Preview";
import { AppIcon } from "@/components/builder/PublishPanel";
import { emptyListing } from "@/lib/storage";
import type { Project } from "@/lib/types";

interface AppSummary {
  id: string;
  userId: string;
  owner: string;
  name: string;
  iconEmoji: string;
  primaryColor: string;
  prompt: string;
  files: number;
  createdAt: number | null;
  updatedAt: number;
}

const input = "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-violet-500/60";

function when(ts: number | null): string {
  if (!ts) return "—";
  const d = Math.floor((Date.now() - ts) / 86400_000);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d} days ago`;
  return new Date(ts).toLocaleDateString();
}

async function get<T>(path: string): Promise<{ status: number; data: T & { error?: string } }> {
  const res = await fetch(path, { credentials: "same-origin" });
  return { status: res.status, data: await res.json().catch(() => ({}) as T & { error?: string }) };
}

/** Every app saved in an account, with a read-only live view. */
export function AppsTab({ member, clearMember }: { member: { id: string; email: string } | null; clearMember: () => void }) {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [list, setList] = useState<AppSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [viewing, setViewing] = useState<AppSummary | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(
    async (search: string, offset = 0) => {
      const params = new URLSearchParams({ q: search, offset: String(offset), ...(member ? { user: member.id } : {}) });
      const { status, data } = await get<{ apps: AppSummary[]; total: number }>(`/api/admin/apps?${params}`);
      if (status !== 200) return;
      setTotal(data.total);
      setList((prev) => (offset && prev ? [...prev, ...data.apps] : data.apps));
    },
    [member],
  );
  useEffect(() => {
    const t = setTimeout(() => void load(query), 250);
    return () => clearTimeout(t);
  }, [query, load]);

  const remove = async (app: AppSummary) => {
    if (!confirm(`Delete “${app.name}” from ${app.owner}'s account? It disappears from their devices too. This can't be undone.`)) return;
    const res = await fetch(`/api/admin/apps/${app.userId}/${app.id}`, { method: "DELETE", credentials: "same-origin" });
    setNote(res.ok ? `Deleted “${app.name}”.` : "Couldn't delete that app.");
    if (res.ok) {
      setViewing(null);
      void load(query);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search apps by name, owner or idea</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            className={`${input} pl-9`}
            placeholder="Search by app name, owner or idea"
            value={q}
            onChange={(e) => (setQ(e.target.value), setQuery(e.target.value.trim()))}
          />
        </label>
        {member && (
          <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 py-1 pl-3 pr-1 text-xs">
            {member.email}
            <button onClick={clearMember} aria-label="Show everyone's apps" className="grid h-6 w-6 place-items-center rounded-full hover:bg-white/10">
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
        <span className="text-sm text-muted tabular-nums" role="status">
          {total.toLocaleString()} app{total === 1 ? "" : "s"}
        </span>
      </div>
      {note && (
        <p role="status" className="mt-3 text-sm text-emerald-300">
          {note}
        </p>
      )}
      {!list ? (
        <Loader2 className="mt-6 h-5 w-5 animate-spin text-muted" aria-label="Loading" />
      ) : list.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted">{query || member ? "No apps match." : "No apps saved in accounts yet."}</p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Apps">
          {list.map((a) => (
            <li key={`${a.userId}/${a.id}`} className="flex flex-col rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-center gap-3">
                <AppIcon listing={{ ...emptyListing(a.name), iconEmoji: a.iconEmoji, primaryColor: a.primaryColor }} size={44} />
                <div className="min-w-0">
                  <div className="truncate font-medium">{a.name}</div>
                  <div className="truncate text-xs text-muted">{a.owner}</div>
                </div>
              </div>
              {a.prompt && <p className="mt-3 line-clamp-2 text-xs text-muted">“{a.prompt}”</p>}
              <div className="mt-3 flex items-center justify-between gap-2 pt-1 text-[11px] text-muted">
                <span>
                  {a.files} file{a.files === 1 ? "" : "s"} · edited {when(a.updatedAt)}
                </span>
                <span className="flex gap-1">
                  <button
                    onClick={() => setViewing(a)}
                    className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-line px-2.5 text-xs text-foreground hover:border-white/20"
                    aria-label={`View ${a.name}`}
                  >
                    <Eye className="h-3.5 w-3.5" /> View
                  </button>
                  <button
                    onClick={() => remove(a)}
                    className="grid h-8 w-8 place-items-center rounded-lg text-rose-300 hover:bg-rose-500/10"
                    aria-label={`Delete ${a.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {list && list.length < total && (
        <button onClick={() => load(query, list.length)} className="mt-4 min-h-9 rounded-lg border border-line px-4 text-sm hover:border-white/20">
          Show more
        </button>
      )}
      {viewing && <AppViewer app={viewing} onClose={() => setViewing(null)} onDelete={() => remove(viewing)} />}
    </div>
  );
}

/** Read-only view of one app: live preview, store listing, code and the conversation. */
function AppViewer({ app, onClose, onDelete }: { app: AppSummary; onClose: () => void; onDelete: () => void }) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"listing" | "code" | "chat">("listing");
  const [file, setFile] = useState<string | null>(null);
  useEffect(() => {
    get<{ project: Project }>(`/api/admin/apps/${app.userId}/${app.id}`).then(({ status, data }) => {
      if (status === 200) {
        setProject(data.project);
        setFile(data.project.files["App.js"] != null ? "App.js" : (Object.keys(data.project.files)[0] ?? null));
      } else setError(data.error || "Couldn't open that app.");
    });
  }, [app]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const listing = project?.listing ?? emptyListing(app.name);
  const unsafe = useMemo(() => (project ? checkCodeSafety(project.files) : []), [project]);
  const [runAnyway, setRunAnyway] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`App: ${app.name}`}
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-line bg-background shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <AppIcon listing={{ ...listing, iconEmoji: listing.iconEmoji || app.iconEmoji }} icon={project?.icon} size={36} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{app.name}</div>
            <div className="truncate text-xs text-muted">
              {app.owner} · edited {when(app.updatedAt)} · read-only
            </div>
          </div>
          <button onClick={onDelete} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs text-rose-300 hover:bg-rose-500/10">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
          <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-white/5 hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        {error ? (
          <p role="alert" className="p-6 text-sm text-rose-300">
            {error}
          </p>
        ) : !project ? (
          <Loader2 className="m-10 h-5 w-5 animate-spin text-muted" aria-label="Loading" />
        ) : (
          <>
            {unsafe.length > 0 && (
              <div role="alert" className="border-b border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-100">
                <p className="flex items-center gap-1.5 font-medium">
                  <ShieldAlert className="h-4 w-4 shrink-0" /> The safety check found code that hides what it does or reaches outside the app. Builds of this
                  app are blocked.
                </p>
                <ul className="mt-1 list-disc pl-5 text-rose-100/80">
                  {unsafe.slice(0, 6).map((f, n) => (
                    <li key={n}>
                      <code className="font-mono">{f.file}</code> {f.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="grid min-h-0 flex-1 gap-0 md:grid-cols-[340px_1fr]">
              <div className="h-[520px] border-b border-line p-4 md:h-auto md:min-h-[560px] md:border-b-0 md:border-r">
                <PhoneFrame platform="ios">
                  {Object.keys(project.files).length && unsafe.length && !runAnyway ? (
                    <div className="grid h-full place-items-center p-6 text-center text-sm text-neutral-600">
                      <div>
                        <p>Preview paused because of the safety check.</p>
                        <button
                          onClick={() => setRunAnyway(true)}
                          className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-neutral-300 px-3 text-xs text-neutral-800"
                        >
                          <Play className="h-3.5 w-3.5" /> Run it in the sandbox anyway
                        </button>
                      </div>
                    </div>
                  ) : Object.keys(project.files).length ? (
                    <Preview files={project.files} platform="ios" reloadKey={0} />
                  ) : (
                    <div className="grid h-full place-items-center p-6 text-center text-sm text-neutral-500">No code yet</div>
                  )}
                </PhoneFrame>
              </div>
              <div className="flex min-h-0 flex-col">
                <div role="tablist" aria-label="App details" className="flex gap-1 border-b border-line px-3">
                  {(["listing", "code", "chat"] as const).map((t) => (
                    <button
                      key={t}
                      role="tab"
                      aria-selected={tab === t}
                      onClick={() => setTab(t)}
                      className={`min-h-10 border-b-2 px-3 text-sm ${tab === t ? "border-violet-400 font-medium" : "border-transparent text-muted hover:text-foreground"}`}
                    >
                      {t === "listing"
                        ? "Store listing"
                        : t === "code"
                          ? `Code (${Object.keys(project.files).length})`
                          : `Conversation (${project.messages?.length ?? 0})`}
                    </button>
                  ))}
                </div>
                <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4 text-sm">
                  {tab === "listing" && (
                    <dl className="grid gap-3">
                      {project.prompt && (
                        <div>
                          <dt className="text-xs text-muted">Original idea</dt>
                          <dd className="mt-0.5 whitespace-pre-wrap">{project.prompt}</dd>
                        </div>
                      )}
                      {(
                        [
                          ["Name", listing.name],
                          ["Subtitle", listing.subtitle],
                          ["Category", listing.category],
                          ["Bundle ID", listing.bundleId],
                          ["Keywords", listing.keywords],
                          ["Description", listing.description],
                          ["Privacy", listing.privacyNotes],
                          ["Wording", project.wording === "standard" ? "Standard" : "Claim-safe"],
                        ] as const
                      ).map(([k, v]) =>
                        v ? (
                          <div key={k}>
                            <dt className="text-xs text-muted">{k}</dt>
                            <dd className="mt-0.5 whitespace-pre-wrap break-words">{v}</dd>
                          </div>
                        ) : null,
                      )}
                    </dl>
                  )}
                  {tab === "code" && (
                    <div>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.keys(project.files).map((f) => (
                          <button
                            key={f}
                            onClick={() => setFile(f)}
                            aria-pressed={file === f}
                            className={`min-h-7 rounded-md border px-2 font-mono text-[11px] ${file === f ? "border-violet-500/60 bg-violet-500/10" : "border-line text-muted hover:text-foreground"}`}
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                      {file && (
                        <pre className="mt-3 overflow-x-auto rounded-lg border border-line bg-[#0b0b10] p-3 font-mono text-[12px] leading-relaxed text-[#d8d6e6]">
                          {project.files[file]}
                        </pre>
                      )}
                    </div>
                  )}
                  {tab === "chat" && (
                    <ol className="space-y-3">
                      {(project.messages ?? []).map((m) => (
                        <li key={m.id} className={m.role === "user" ? "ml-8 rounded-xl bg-surface-2 px-3 py-2" : "text-foreground/90"}>
                          <div className="mb-0.5 text-[11px] text-muted">
                            {m.role === "user" ? (m.kind === "auto-fix" ? "Automatic check" : "Member") : "Appmaker"}
                          </div>
                          <div className="whitespace-pre-wrap break-words text-sm">{m.content}</div>
                        </li>
                      ))}
                      {!project.messages?.length && <li className="text-muted">No conversation saved.</li>}
                    </ol>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
